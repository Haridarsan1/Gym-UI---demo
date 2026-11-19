import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { assertInBranch, openDesk, type DeskContext } from "@/api/desk";
import { nextReceiptNumber } from "@/api/receipts";
import { buildAuditEvent } from "@/domain/audit";
import { amountDuePaise } from "@/domain/billing";
import { addDays } from "@/domain/dates";
import { currentMembership } from "@/domain/membership";
import { renewalQuote, SESSION_EXPIRY_DAYS } from "@/domain/renewal";
import type { CreditLedgerEntry, EmailLogEntry, Invoice, Membership, Payment } from "@/domain/types";
import { formatDate, formatRupees } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Collecting a payment at the desk (M03): cash, UPI, card or bank transfer against an open invoice, in full or (when the gym allows it) in part,
 * with a receipt number and a receipt emailed to the member. A payment that settles the invoice does what the invoice bought, once: starts the first
 * membership, starts a renewal or an upgrade, or adds training sessions. One key makes one payment however many times it is sent.
 */

const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

export type DeskMethod = "cash" | "upi" | "card" | "transfer";

export interface Effects {
  kind: "invoice" | "membership" | "renewal" | "upgrade" | "sessions";
  membership?: { planName: string; status: Membership["status"]; startsOn: string; endsOn?: string };
  sessionsAdded?: number;
}

/**
 * What a fully paid invoice does, exactly once. Run inside the transaction that records the payment.
 *  - the first invoice for a pending membership starts it (scheduled if its start date is ahead) and adds its training credits;
 *  - an upgrade does the same and ends the membership it replaces the day before;
 *  - a renewal starts the next membership after the current one;
 *  - a sessions invoice adds training credits.
 */
export async function applyPaid(c: Pick<DeskContext, "tenantId" | "today" | "nowIso" | "principal">, invoice: Invoice): Promise<Effects> {
  const [memberships, plans, ledger] = await Promise.all([db.memberships.where("memberId").equals(invoice.memberId).toArray(), db.membershipPlans.where("tenantId").equals(c.tenantId).toArray(), db.creditLedger.where("memberId").equals(invoice.memberId).toArray()]);
  const effects: Effects = { kind: "invoice" };

  if (invoice.purpose?.kind === "renewal") {
    const plan = plans.find((p) => p.id === invoice.purpose?.planId);
    if (plan && !memberships.some((m) => m.invoiceId === invoice.id)) {
      const current = currentMembership(memberships);
      const q = renewalQuote(plan, current, c.today);
      const next: Membership = {
        id: `ms_${invoice.memberId}_${invoice.id}`, tenantId: c.tenantId, memberId: invoice.memberId, planId: plan.id,
        terms: { name: plan.name, kind: plan.kind, pricePaise: invoice.lines[0]?.unitPaise ?? plan.pricePaise, taxRateBp: plan.taxRateBp, durationDays: plan.durationDays, visits: plan.visits, branchIds: plan.branchIds, classEntitlements: plan.classEntitlements, ptCredits: plan.ptCredits },
        status: q.status, startsOn: q.startsOn, endsOn: q.endsOn, visitsRemaining: plan.visits ?? null, freezes: [], autoRenew: current?.autoRenew ?? false, autoRenewMethod: current?.autoRenewMethod, renewsMembershipId: current?.id, invoiceId: invoice.id, createdAt: c.nowIso,
      };
      await db.memberships.add(next);
      if (q.status === "active" && current && current.status === "active") await db.memberships.update(current.id, { status: "expired" });
      if (plan.ptCredits) await db.creditLedger.add({ id: `cr_${invoice.memberId}_renew_${invoice.id}`, tenantId: c.tenantId, memberId: invoice.memberId, membershipId: next.id, kind: "purchase", credits: plan.ptCredits, expiresOn: q.endsOn, createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `renew:${invoice.id}` });
      await db.auditEvents.add(buildAuditEvent(c.principal, { action: q.upgrade ? "membership.upgrade" : "membership.renew", reason: "Paid at the front desk", entityType: "membership", entityId: next.id, memberId: invoice.memberId, details: { invoice: invoice.number, plan: plan.name, startsOn: q.startsOn, endsOn: q.endsOn } }, rid("ae"), new Date(c.nowIso)));
      effects.kind = "renewal";
      effects.membership = { planName: plan.name, status: q.status, startsOn: q.startsOn, endsOn: q.endsOn };
    }
  } else if (invoice.purpose?.kind === "sessions" && invoice.purpose.sessions) {
    const key = `sessions:${invoice.id}`;
    if (!ledger.some((e) => e.idempotencyKey === key)) {
      const entry: CreditLedgerEntry = { id: `cr_${invoice.memberId}_buy_${invoice.id}`, tenantId: c.tenantId, memberId: invoice.memberId, membershipId: currentMembership(memberships)?.id, kind: "purchase", credits: invoice.purpose.sessions, expiresOn: addDays(c.today, SESSION_EXPIRY_DAYS), createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: key };
      await db.creditLedger.add(entry);
      effects.kind = "sessions";
      effects.sessionsAdded = invoice.purpose.sessions;
    }
  } else if (invoice.membershipId) {
    const m = memberships.find((x) => x.id === invoice.membershipId);
    if (m?.status === "pending") {
      const status: Membership["status"] = m.startsOn > c.today ? "scheduled" : "active";
      await db.memberships.update(m.id, { status });
      if (m.terms.ptCredits && !ledger.some((e) => e.idempotencyKey === `join:${m.id}`)) await db.creditLedger.add({ id: `cr_${m.memberId}_buy_${m.id}`, tenantId: c.tenantId, memberId: m.memberId, membershipId: m.id, kind: "purchase", credits: m.terms.ptCredits, expiresOn: m.endsOn, createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `join:${m.id}` });
      if (m.upgradeOf) {
        // An upgrade replaces the membership it came from: that one ends the day before this one starts.
        await db.memberships.update(m.upgradeOf, { status: "expired", endsOn: addDays(m.startsOn, -1) });
        await db.auditEvents.add(buildAuditEvent(c.principal, { action: "membership.upgrade", reason: "Upgrade paid at the front desk", entityType: "membership", entityId: m.id, memberId: m.memberId, details: { from: m.upgradeOf, invoice: invoice.number } }, rid("ae"), new Date(c.nowIso)));
        effects.kind = "upgrade";
      } else effects.kind = "membership";
      effects.membership = { planName: m.terms.name, status, startsOn: m.startsOn, endsOn: m.endsOn };
    }
  }
  return effects;
}

const Input = z.object({
  invoiceId: z.string().min(1),
  method: z.enum(["cash", "upi", "card", "transfer"]),
  amountPaise: z.number().int().positive("Enter the amount received."),
  reference: z.string().max(60).optional(),
  key: z.string().min(8),
});
export type CollectInput = z.input<typeof Input>;

export interface CollectResult {
  paymentId: string;
  receiptNumber: string;
  amountPaise: number;
  invoice: { id: string; number: string; status: Invoice["status"]; totalPaise: number; duePaise: number };
  effects: Effects;
  emailedTo?: string;
  repeated: boolean;
}

/** Records a payment against an invoice. Refuses a payment bigger than the amount due, and a part payment unless the gym allows it. */
export async function collectPayment(session: Session | null, raw: CollectInput): Promise<CollectResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the payment and try again.");
  const input = parsed.data;
  const c = await openDesk(session, "payment.record");
  return db.transaction("rw", db.tables, async () => {
    const invoice = await db.invoices.get(input.invoiceId);
    if (!invoice || invoice.tenantId !== c.tenantId) throw new ApiError("not_found", "We couldn’t find that invoice.");
    assertInBranch(c, "payment.record", invoice.branchId, { memberId: invoice.memberId });
    if (!c.branchIds.includes(invoice.branchId)) throw new ApiError("forbidden", "That invoice belongs to another branch.");
    const key = `desk:${input.key}`;
    const earlier = (await db.payments.where("invoiceId").equals(invoice.id).toArray()).find((p) => p.idempotencyKey === key);
    const [member, tenant, policy] = await Promise.all([db.members.get(invoice.memberId), db.tenants.get(c.tenantId), db.gymPolicies.where("tenantId").equals(c.tenantId).first()]);
    const result = async (p: Payment, effects: Effects, repeated: boolean): Promise<CollectResult> => {
      const inv = (await db.invoices.get(invoice.id))!;
      const all = await db.payments.where("invoiceId").equals(invoice.id).toArray();
      return { paymentId: p.id, receiptNumber: p.receiptNumber!, amountPaise: p.amountPaise, invoice: { id: inv.id, number: inv.number, status: inv.status, totalPaise: inv.totalPaise, duePaise: amountDuePaise(inv, all) }, effects, emailedTo: member?.email, repeated };
    };
    if (earlier) return result(earlier, { kind: "invoice" }, true);
    if (invoice.status === "paid") throw new ApiError("conflict", "This invoice is already paid.");
    if (invoice.status === "void") throw new ApiError("conflict", "This invoice was voided, so it can’t be paid.");
    const paid = await db.payments.where("invoiceId").equals(invoice.id).toArray();
    const due = amountDuePaise(invoice, paid);
    if (due <= 0) throw new ApiError("conflict", "There is nothing left to pay on this invoice.");
    if (input.amountPaise > due) throw new ApiError("invalid", `That is more than the ${formatRupees(due)} due. Enter ${formatRupees(due)} or less.`);
    if (input.amountPaise < due && !(policy?.partialPaymentsEnabled ?? false)) throw new ApiError("invalid", `This gym takes the full ${formatRupees(due)} at once. Enter the full amount.`);
    const payment: Payment = {
      id: rid("pay"), tenantId: c.tenantId, invoiceId: invoice.id, memberId: invoice.memberId, branchId: invoice.branchId, method: input.method, amountPaise: input.amountPaise, status: "succeeded", receivedAt: c.nowIso, receivedBy: c.principal.userId,
      receiptNumber: await nextReceiptNumber(c.tenantId, c.today), reference: input.reference?.trim() || undefined, idempotencyKey: key, reconciliation: { status: "unmatched" },
    };
    await db.payments.add(payment);
    const still = amountDuePaise(invoice, [...paid, payment]);
    const status: Invoice["status"] = still <= 0 ? "paid" : "partially_paid";
    await db.invoices.update(invoice.id, { status });
    const effects = status === "paid" ? await applyPaid(c, { ...invoice, status }) : { kind: "invoice" as const };
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "payment.record", entityType: "payment", entityId: payment.id, memberId: invoice.memberId, details: { invoice: invoice.number, method: input.method, amountPaise: input.amountPaise, receipt: payment.receiptNumber, partial: status !== "paid" } }, rid("ae"), now()));
    const first = member?.name.split(" ")[0] ?? "there";
    const log: EmailLogEntry = { id: rid("em"), tenantId: c.tenantId, memberId: invoice.memberId, invoiceId: invoice.id, template: "payment_receipt", to: member?.email, subject: `Payment received: ${formatRupees(input.amountPaise)}`, body: [`Hi ${first},`, "", `We received ${formatRupees(input.amountPaise)} for invoice ${invoice.number} on ${formatDate(c.today)}.`, `Receipt number ${payment.receiptNumber}.`, status === "paid" ? "The invoice is paid in full." : `${formatRupees(still)} is still due.`, "", tenant?.name ?? "Your gym"].join("\n"), status: member?.email ? "sent" : "skipped", detail: member?.email ? undefined : "No email address on file for this member.", sentAt: c.nowIso };
    await db.emailLog.add(log);
    return result(payment, effects, false);
  });
}


/** The tax receipt for an invoice, for the desk to show or print. Same document the member gets (`api/receiptData.ts`). */
export async function getDeskReceipt(session: Session | null, invoiceId: string): Promise<import("@/api/receiptData").ReceiptData> {
  const c = await openDesk(session, "invoice.read");
  const invoice = await db.invoices.get(invoiceId);
  if (!invoice || invoice.tenantId !== c.tenantId || !c.branchIds.includes(invoice.branchId) || invoice.status === "draft") throw new ApiError("not_found", "We couldn’t find that invoice. It may belong to another branch.");
  const { buildReceipt } = await import("@/api/receiptData");
  return buildReceipt(invoice, c.today);
}
