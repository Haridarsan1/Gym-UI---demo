import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { assertInBranch, openDesk, type DeskContext } from "@/api/desk";
import { assertDayOpen } from "@/api/dayClose";
import { buildAuditEvent } from "@/domain/audit";
import { paidPaise } from "@/domain/billing";
import { creditBalance } from "@/domain/credits";
import { canRefund } from "@/domain/permissions";
import type { CreditLedgerEntry, Payment, Refund, RefundRequest } from "@/domain/types";
import { formatRupees } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Refunds (M04, M06). The front desk asks (`requestRefund`); finance, a branch manager or the owner approves or rejects here, and both steps are audited.
 * Approving pays the money back against a real payment, never more than that payment still holds, within the person’s own refund limit, and takes back
 * the unused training credits the refunded money bought, in proportion, as ledger reversals. A rejection needs a note. Money moves only on approval.
 */

const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
const mine = (c: DeskContext, branchId: string) => c.branchIds.includes(branchId);

export interface RefundCard {
  id: string;
  memberId: string;
  name: string;
  branchName: string;
  invoiceNumber: string;
  invoiceId: string;
  amountPaise: number;
  reason: string;
  source: RefundRequest["source"];
  status: RefundRequest["status"];
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  /** For a request waiting for a decision: what approving would do. */
  preview?: RefundPreview;
}

export interface RefundPreview {
  /** The payment the money goes back against, and how it was paid. */
  paymentId?: string;
  method?: string;
  receiptNumber?: string;
  /** What that payment still holds after earlier refunds. */
  refundablePaise: number;
  /** Unused training credits that would be taken back. */
  creditsReversed: number;
  /** In words, why this person can’t approve it, or nothing. */
  blocked?: string;
}

export interface RefundsData {
  today: string;
  /** This person’s own refund limit, in paise, or null for none. */
  limitPaise: number | null;
  pending: RefundCard[];
  decided: RefundCard[];
}

/** The payment to refund against and the credits to take back, worked out the same way for the preview and for the approval. */
async function plan(_c: DeskContext, req: Pick<RefundRequest, "invoiceId" | "amountPaise" | "memberId">) {
  const [invoice, payments, refunds, ledger] = await Promise.all([
    db.invoices.get(req.invoiceId), db.payments.where("invoiceId").equals(req.invoiceId).toArray(), db.refunds.toArray().then((r) => r.filter((x) => x.invoiceId === req.invoiceId && x.status !== "failed")),
    db.creditLedger.where("memberId").equals(req.memberId).toArray(),
  ]);
  const held = (p: Payment) => p.amountPaise - refunds.filter((r) => r.paymentId === p.id).reduce((n, r) => n + r.amountPaise, 0);
  const real = payments.filter((p) => p.status === "succeeded" && p.method !== "credit_note").sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const target = real.find((p) => held(p) >= req.amountPaise) ?? real.sort((a, b) => held(b) - held(a))[0];
  const refundable = target ? held(target) : 0;
  // The credits this invoice bought: a sessions pack, or the plan’s credits when it bought a membership. A refund takes back its share that is still unused.
  const bought = ledger.filter((e) => e.kind === "purchase" && (e.idempotencyKey === `sessions:${req.invoiceId}` || e.idempotencyKey === `join:${invoice?.membershipId}` || e.idempotencyKey === `renew:${req.invoiceId}`));
  const boughtCredits = bought.reduce((n, e) => n + e.credits, 0);
  const totalPaid = paidPaise(real);
  const share = totalPaid > 0 ? Math.round((boughtCredits * req.amountPaise) / totalPaid) : 0;
  const reverse = Math.min(share, creditBalance(ledger).available);
  return { invoice, target, refundable, bought, reverse };
}

const card = (r: RefundRequest, names: { member: Map<string, string>; branch: Map<string, string>; invoice: Map<string, string>; user: Map<string, string> }): RefundCard => ({
  id: r.id, memberId: r.memberId, name: names.member.get(r.memberId) ?? "Member", branchName: names.branch.get(r.branchId) ?? "", invoiceNumber: names.invoice.get(r.invoiceId) ?? "", invoiceId: r.invoiceId, amountPaise: r.amountPaise, reason: r.reason, source: r.source,
  status: r.status, requestedBy: names.user.get(r.requestedBy) ?? "Staff", requestedAt: r.requestedAt, decidedBy: r.decidedBy ? names.user.get(r.decidedBy) : undefined, decidedAt: r.decidedAt, decisionNote: r.decisionNote,
});

/** The refund queue (requests waiting for a decision, with what approving would do) and the decided ones, for the branches this person works in. */
export async function getRefunds(session: Session | null): Promise<RefundsData> {
  const c = await openDesk(session, "refund.create");
  const [requests, members, branches, invoices, users] = await Promise.all([db.refundRequests.where("tenantId").equals(c.tenantId).toArray(), db.members.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.invoices.where("tenantId").equals(c.tenantId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray()]);
  const names = { member: new Map(members.map((m) => [m.id, m.name])), branch: new Map(branches.map((b) => [b.id, b.name])), invoice: new Map(invoices.map((i) => [i.id, i.number])), user: new Map(users.map((u) => [u.id, u.name])) };
  const visible = requests.filter((r) => mine(c, r.branchId));
  const limit = c.principal.limits?.refundLimitPaise ?? null;
  const pending: RefundCard[] = [];
  for (const r of visible.filter((x) => x.status === "pending").sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))) {
    const p = await plan(c, r);
    const blocked = !p.target ? "There is no payment to refund against." : r.amountPaise > p.refundable ? `Only ${formatRupees(p.refundable)} of that payment is left to refund.` : !canRefund(c.principal, { tenantId: c.tenantId, branchId: r.branchId }, r.amountPaise) ? (limit !== null && r.amountPaise > limit ? `Above your refund limit of ${formatRupees(limit)}. Ask the owner.` : "You can’t approve refunds.") : undefined;
    pending.push({ ...card(r, names), preview: { paymentId: p.target?.id, method: p.target?.method, receiptNumber: p.target?.receiptNumber, refundablePaise: p.refundable, creditsReversed: p.reverse, blocked } });
  }
  const decided = visible.filter((x) => x.status !== "pending").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "")).map((r) => card(r, names));
  return { today: c.today, limitPaise: limit, pending, decided };
}

const Decide = z.object({ requestId: z.string().min(1), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(300).optional(), key: z.string().min(8) });
export type DecideInput = z.input<typeof Decide>;

export interface DecideResult {
  status: "approved" | "rejected";
  refundId?: string;
  amountPaise: number;
  creditsReversed: number;
  repeated: boolean;
}

/** Approves or rejects a refund request. Approving writes the refund against a payment and reverses unused credits, in one transaction. */
export async function decideRefund(session: Session | null, raw: DecideInput): Promise<DecideResult> {
  const parsed = Decide.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "We couldn’t read that decision. Reload and try again.");
  const input = parsed.data;
  const c = await openDesk(session, "refund.create");
  return db.transaction("rw", db.tables, async () => {
    const req = await db.refundRequests.get(input.requestId);
    if (!req || req.tenantId !== c.tenantId || !mine(c, req.branchId)) throw new ApiError("not_found", "We couldn’t find that refund request.");
    assertInBranch(c, "refund.create", req.branchId, { memberId: req.memberId });
    if (req.status !== "pending") {
      if (req.status === (input.decision === "approve" ? "approved" : "rejected")) return { status: req.status, refundId: req.refundId, amountPaise: req.amountPaise, creditsReversed: (req.refundId ? (await db.refunds.get(req.refundId))?.creditsReversed : 0) ?? 0, repeated: true };
      throw new ApiError("conflict", `This request was already ${req.status}.`);
    }
    if (input.decision === "reject") {
      const note = input.note?.trim() ?? "";
      if (note.length < 3) throw new ApiError("invalid", "Say why it is rejected. The desk sees the reason.");
      await db.refundRequests.update(req.id, { status: "rejected", decidedBy: c.principal.userId, decidedAt: c.nowIso, decisionNote: note });
      await db.auditEvents.add(buildAuditEvent(c.principal, { action: "refund.reject", reason: note, entityType: "refund_request", entityId: req.id, memberId: req.memberId, details: { amountPaise: req.amountPaise, invoiceId: req.invoiceId } }, rid("ae"), now()));
      return { status: "rejected", amountPaise: req.amountPaise, creditsReversed: 0, repeated: false };
    }
    if (!canRefund(c.principal, { tenantId: c.tenantId, branchId: req.branchId }, req.amountPaise)) throw new ApiError("forbidden", c.principal.limits?.refundLimitPaise != null && req.amountPaise > c.principal.limits.refundLimitPaise ? `This is above your refund limit of ${formatRupees(c.principal.limits.refundLimitPaise)}. Ask the owner to approve it.` : "You can’t approve refunds.");
    const p = await plan(c, req);
    if (!p.target) throw new ApiError("conflict", "There is no payment on this invoice to refund against.");
    if (req.amountPaise > p.refundable) throw new ApiError("conflict", `Only ${formatRupees(p.refundable)} of that payment is left to refund. Reject this request, or ask the desk for a smaller amount.`);
    const refund: Refund = { id: rid("rf"), tenantId: c.tenantId, paymentId: p.target.id, invoiceId: req.invoiceId, amountPaise: req.amountPaise, reason: req.reason, status: "completed", requestedBy: req.requestedBy, approvedBy: c.principal.userId, creditsReversed: p.reverse, createdAt: c.nowIso, idempotencyKey: `rq:${req.id}` };
    if (p.target.method === "cash") await assertDayOpen(p.target.branchId, c.today);
    await db.refunds.add(refund);
    if (p.reverse > 0 && p.bought[0]) {
      const entry: CreditLedgerEntry = { id: `cr_${req.memberId}_rev_${refund.id}`, tenantId: c.tenantId, memberId: req.memberId, kind: "reversal", credits: p.reverse, refEntryId: p.bought[0].id, reason: `Refund of ${formatRupees(req.amountPaise)} on invoice ${p.invoice?.number ?? ""}`, createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `refund:${refund.id}` };
      await db.creditLedger.add(entry);
    }
    await db.refundRequests.update(req.id, { status: "approved", decidedBy: c.principal.userId, decidedAt: c.nowIso, refundId: refund.id, decisionNote: input.note?.trim() || undefined });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "refund.approve", reason: req.reason, entityType: "refund", entityId: refund.id, memberId: req.memberId, details: { requestId: req.id, amountPaise: req.amountPaise, paymentId: p.target.id, creditsReversed: p.reverse, invoice: p.invoice?.number ?? null } }, rid("ae"), now()));
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "refund.create", reason: req.reason, entityType: "refund", entityId: refund.id, memberId: req.memberId, details: { amountPaise: req.amountPaise } }, rid("ae"), now()));
    const member = await db.members.get(req.memberId);
    const tenant = await db.tenants.get(c.tenantId);
    await db.emailLog.add({ id: rid("em"), tenantId: c.tenantId, memberId: req.memberId, invoiceId: req.invoiceId, template: "refund_issued", to: member?.email, subject: `Refund of ${formatRupees(req.amountPaise)}`, body: [`Hi ${member?.name.split(" ")[0] ?? "there"},`, "", `We have refunded ${formatRupees(req.amountPaise)} against invoice ${p.invoice?.number ?? ""}. It goes back by the way you paid and can take a few days to show.`, p.reverse ? `${p.reverse} unused training ${p.reverse === 1 ? "session was" : "sessions were"} taken back with it.` : "", "", tenant?.name ?? "Your gym"].filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n"), status: member?.email ? "sent" : "skipped", detail: member?.email ? undefined : "No email address on file for this member.", sentAt: c.nowIso });
    return { status: "approved", refundId: refund.id, amountPaise: req.amountPaise, creditsReversed: p.reverse, repeated: false };
  });
}

const Direct = z.object({ invoiceId: z.string().min(1), amountPaise: z.number().int().positive("Enter the amount to refund."), reason: z.string().trim().min(3, "Say why the refund is being made."), key: z.string().min(8) });
export type DirectRefundInput = z.input<typeof Direct>;

/** Finance, a branch manager or the owner refunds without a request from the desk: the same checks, recorded as a request that is approved at once. */
export async function issueRefund(session: Session | null, raw: DirectRefundInput): Promise<DecideResult> {
  const parsed = Direct.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the refund and try again.");
  const input = parsed.data;
  const c = await openDesk(session, "refund.create");
  const inv = await db.invoices.get(input.invoiceId);
  if (!inv || inv.tenantId !== c.tenantId || !mine(c, inv.branchId)) throw new ApiError("not_found", "We couldn’t find that invoice.");
  const id = `rq_${input.key}`;
  const existing = await db.refundRequests.get(id);
  if (!existing) {
    const payments = await db.payments.where("invoiceId").equals(inv.id).toArray();
    const paid = paidPaise(payments.filter((p) => p.method !== "credit_note"));
    if (input.amountPaise > paid) throw new ApiError("invalid", `At most ${formatRupees(paid)} can be refunded on this invoice (it was paid ${formatRupees(paid)}).`);
    await db.refundRequests.add({ id, tenantId: c.tenantId, memberId: inv.memberId, branchId: inv.branchId, invoiceId: inv.id, amountPaise: input.amountPaise, reason: input.reason, source: "manual", status: "pending", requestedBy: c.principal.userId, requestedAt: c.nowIso, idempotencyKey: input.key });
  }
  return decideRefund(session, { requestId: id, decision: "approve", key: `${input.key}-ok` });
}
