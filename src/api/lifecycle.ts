import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { memberInScope, openDesk, type DeskContext } from "@/api/desk";
import { allocateNumber } from "@/api/numbering";
import { buildAuditEvent } from "@/domain/audit";
import { amountDuePaise, invoiceTotals, paidPaise, placeOfSupplyFor } from "@/domain/billing";
import { addDays } from "@/domain/dates";
import { applyFreeze, applyUnfreeze, cancelProblem, effectiveStatus, freezeProblem, LIFECYCLE_DEFAULTS, quoteChange, refundEligibility, type LifecycleRules } from "@/domain/lifecycle";
import { currentMembership } from "@/domain/membership";
import { renewalQuote, planOnOffer } from "@/domain/renewal";
import type { CreditNote, GymPolicies, Invoice, Membership, Payment, RefundRequest } from "@/domain/types";
import { formatDate, formatRupees } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Membership lifecycle at the desk (M02): freeze and unfreeze, renew, change plan (an upgrade with proration and a GST credit note, or a cheaper
 * plan at the period end), cancel with an effective date, and ask finance for a refund. Each is checked by `domain/lifecycle.ts` first, runs in one
 * transaction, and is audited. Nothing here pays or refunds money: payments are `api/payments.ts`, and a refund needs finance (`api/refunds.ts`).
 */

const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
const rulesOf = (p: GymPolicies | undefined): LifecycleRules => ({
  freezeMinDays: p?.freezeMinDays ?? LIFECYCLE_DEFAULTS.freezeMinDays, freezeMaxDays: p?.freezeMaxDays ?? LIFECYCLE_DEFAULTS.freezeMaxDays,
  maxFreezesPerMembership: p?.maxFreezesPerMembership ?? LIFECYCLE_DEFAULTS.maxFreezesPerMembership, cancellationFeePaise: p?.cancellationFeePaise ?? LIFECYCLE_DEFAULTS.cancellationFeePaise,
});
const parse = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError("invalid", r.error.issues[0]?.message ?? "Check what you entered and try again.");
  return r.data;
};

/** The membership an action is about: the member’s current one (or the one that is waiting), settled for today. */
async function load(c: DeskContext, memberId: string) {
  const member = await memberInScope(c, "membership.manage", memberId);
  const [memberships, policy] = await Promise.all([db.memberships.where("memberId").equals(memberId).toArray(), db.gymPolicies.where("tenantId").equals(c.tenantId).first()]);
  const current = currentMembership(memberships);
  return { member, memberships, current, rules: rulesOf(policy), policy };
}

/** The price paid before tax for a membership: its invoice’s subtotal less any discount, or the plan price when there is no invoice. */
async function paidPretax(m: Membership): Promise<{ pretaxPaise: number; invoice?: Invoice; paidPaise: number }> {
  const invoices = await db.invoices.where("memberId").equals(m.memberId).toArray();
  const inv = invoices.find((i) => i.id === m.invoiceId) ?? invoices.find((i) => i.membershipId === m.id) ?? invoices.filter((i) => i.status === "paid" || i.status === "partially_paid").sort((a, b) => b.issuedOn.localeCompare(a.issuedOn))[0];
  const payments = inv ? await db.payments.where("invoiceId").equals(inv.id).toArray() : [];
  return { pretaxPaise: inv ? inv.subtotalPaise - inv.discountPaise : m.terms.pricePaise, invoice: inv, paidPaise: paidPaise(payments.filter((p) => p.method !== "credit_note")) };
}

const FreezeInput = z.object({ memberId: z.string().min(1), from: z.string(), to: z.string(), reason: z.string().trim().min(3, "Say why it is being frozen."), key: z.string().min(8) });
export type FreezeInput = z.input<typeof FreezeInput>;

/** Freezes the member’s active membership from today to a date: access is paused and the end date moves back by the days frozen. */
export async function freezeMembership(session: Session | null, raw: FreezeInput): Promise<{ membershipId: string; frozenDays: number; endsOn?: string; repeated: boolean }> {
  const input = parse(FreezeInput, raw);
  const c = await openDesk(session, "membership.manage");
  return db.transaction("rw", db.tables, async () => {
    const { member, current, rules } = await load(c, input.memberId);
    if (!current) throw new ApiError("conflict", "This member has no membership to freeze.");
    // The same key again: this freeze is already there.
    const done = current.freezes.find((f) => f.from === input.from && f.to === input.to && f.reason === input.reason) && current.status === "frozen";
    if (done) return { membershipId: current.id, frozenDays: current.freezes.at(-1)!.to ? Math.round((Date.parse(`${input.to}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / 86_400_000) + 1 : 0, endsOn: current.endsOn, repeated: true };
    const problem = freezeProblem(current, { from: input.from, to: input.to }, c.today, rules);
    if (problem) throw new ApiError("conflict", problem);
    const next = applyFreeze(current, { from: input.from, to: input.to, reason: input.reason });
    await db.memberships.update(current.id, { status: next.status, freezes: next.freezes, endsOn: next.endsOn });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "membership.freeze", reason: input.reason, entityType: "membership", entityId: current.id, memberId: member.id, details: { from: input.from, to: input.to, endsOn: next.endsOn } }, rid("ae"), now()));
    return { membershipId: current.id, frozenDays: Math.round((Date.parse(`${input.to}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / 86_400_000) + 1, endsOn: next.endsOn, repeated: false };
  });
}

/** Ends a freeze early: access returns today, and the days not used come off the end date again. */
export async function unfreezeMembership(session: Session | null, input: { memberId: string }): Promise<{ membershipId: string; endsOn?: string; unusedDays: number }> {
  const c = await openDesk(session, "membership.manage");
  return db.transaction("rw", db.tables, async () => {
    const { member, current } = await load(c, input.memberId);
    if (!current || effectiveStatus(current, c.today) !== "frozen") throw new ApiError("conflict", "This membership isn’t frozen.");
    const r = applyUnfreeze(current, c.today);
    await db.memberships.update(current.id, { status: "active", freezes: r.freezes, endsOn: r.endsOn });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "membership.unfreeze", reason: "Unfrozen at the front desk", entityType: "membership", entityId: current.id, memberId: member.id, details: { unusedDays: r.unusedDays, endsOn: r.endsOn } }, rid("ae"), now()));
    return { membershipId: current.id, endsOn: r.endsOn, unusedDays: r.unusedDays };
  });
}

export interface PlanChoice {
  planId: string;
  name: string;
  kind: Membership["terms"]["kind"];
  /** What happens if this plan is chosen. */
  change: { kind: "upgrade" | "at_period_end" | "renewal"; startsOn: string; totalPaise: number; credit?: { totalPaise: number; unusedDays: number; totalDays: number; pretaxPaise: number; taxPaise: number }; duePaise: number; reason?: string };
}

/** The plans this member may move to or renew onto, with what each would do and cost, so the desk reads the money before choosing. */
export async function getPlanChoices(session: Session | null, memberId: string): Promise<{ current?: { planName: string; endsOn?: string; status: string }; choices: PlanChoice[]; blocked?: string }> {
  const c = await openDesk(session, "membership.manage");
  const { member, current } = await load(c, memberId);
  const plans = (await db.membershipPlans.where("tenantId").equals(c.tenantId).toArray()).filter((p) => planOnOffer(p, member.homeBranchId, c.today));
  const [invs, mss] = await Promise.all([db.invoices.where("memberId").equals(memberId).toArray(), db.memberships.where("memberId").equals(memberId).toArray()]);
  const open = invs.find((i) => (i.status === "open" || i.status === "partially_paid") && (i.purpose?.kind === "renewal" || mss.some((m) => m.id === i.membershipId && m.status === "pending")));
  if (!current) return { choices: plans.map((p) => ({ planId: p.id, name: p.name, kind: p.kind, change: { kind: "renewal" as const, startsOn: c.today, totalPaise: invoiceTotals([{ quantity: 1, unitPaise: p.pricePaise, taxRateBp: p.taxRateBp }]).totalPaise, duePaise: invoiceTotals([{ quantity: 1, unitPaise: p.pricePaise, taxRateBp: p.taxRateBp }]).totalPaise } })) };
  const status = effectiveStatus(current, c.today);
  const base = { current: { planName: current.terms.name, endsOn: current.endsOn, status } };
  if (status === "frozen") return { ...base, choices: [], blocked: "This membership is frozen. Change the plan once the freeze ends." };
  if (open) return { ...base, choices: [], blocked: `Invoice ${open.number} already renews this membership. Collect it first.` };
  if (current.canceledEffectiveOn) return { ...base, choices: [], blocked: "This membership is being canceled." };
  const { pretaxPaise } = await paidPretax(current);
  const choices = plans.map((p): PlanChoice => {
    if (status !== "active" && status !== "scheduled") {
      const q = renewalQuote(p, current, c.today);
      return { planId: p.id, name: p.name, kind: p.kind, change: { kind: "renewal", startsOn: q.startsOn, totalPaise: q.totalPaise, duePaise: q.totalPaise } };
    }
    if (p.id === current.planId) {
      const q = renewalQuote(p, current, c.today);
      return { planId: p.id, name: p.name, kind: p.kind, change: { kind: "renewal", startsOn: q.startsOn, totalPaise: q.totalPaise, duePaise: q.totalPaise, reason: "Renews the same plan from the day after this one ends." } };
    }
    const q = quoteChange(current, pretaxPaise, p, c.today);
    return { planId: p.id, name: p.name, kind: p.kind, change: { kind: q.kind, startsOn: q.startsOn, totalPaise: q.newPlan.totalPaise, duePaise: q.duePaise, reason: q.reason, credit: q.credit && { totalPaise: q.credit.totalPaise, unusedDays: q.credit.unusedDays, totalDays: q.credit.totalDays, pretaxPaise: q.credit.subtotalPaise, taxPaise: q.credit.taxPaise } } };
  });
  return { ...base, choices };
}

const ChangeInput = z.object({ memberId: z.string().min(1), planId: z.string().min(1), key: z.string().min(8) });
export type ChangeInput = z.input<typeof ChangeInput>;

export interface ChangeResult {
  kind: "upgrade" | "at_period_end" | "renewal";
  invoice: { id: string; number: string; totalPaise: number; duePaise: number; status: Invoice["status"] };
  creditNote?: { id: string; number: string; totalPaise: number; invoiceNumber: string };
  startsOn: string;
  repeated: boolean;
}

/**
 * Renews, upgrades or moves to a cheaper plan. An upgrade makes the new membership (waiting for payment), its invoice at the full price, and a GST credit
 * note for the unused days of the old plan, linked to the original invoice and applied to the new invoice as a credit-note payment: the credit is a document of its
 * own, never netted silently. The difference is then collected like any invoice, and paying it starts the new plan and ends the old one. A cheaper plan, or a
 * renewal, makes an invoice for the plan starting when this period ends.
 */
export async function changePlan(session: Session | null, raw: ChangeInput): Promise<ChangeResult> {
  const input = parse(ChangeInput, raw);
  const c = await openDesk(session, "membership.manage");
  return db.transaction("rw", db.tables, async () => {
    const again = await db.invoices.get(`inv_chg_${input.key}`);
    const { member, current, memberships } = await load(c, input.memberId);
    if (again) return changeResult(again, "upgrade", true);
    const plan = await db.membershipPlans.get(input.planId);
    if (!plan || plan.tenantId !== c.tenantId || !planOnOffer(plan, member.homeBranchId, c.today)) throw new ApiError("invalid", "That plan isn’t on sale at this member’s branch.");
    const branch = (await db.branches.get(member.homeBranchId))!;
    const invoices = await db.invoices.where("memberId").equals(member.id).toArray();
    const open = invoices.find((i) => (i.status === "open" || i.status === "partially_paid") && (i.purpose?.kind === "renewal" || memberships.some((m) => m.id === i.membershipId && m.status === "pending")));
    if (open && current) throw new ApiError("conflict", `Invoice ${open.number} already renews this membership. Collect it first.`);
    const status = current ? effectiveStatus(current, c.today) : undefined;
    if (status === "frozen") throw new ApiError("conflict", "This membership is frozen. Change the plan once the freeze ends.");
    if (current?.canceledEffectiveOn) throw new ApiError("conflict", "This membership is being canceled.");
    const totals = invoiceTotals([{ quantity: 1, unitPaise: plan.pricePaise, taxRateBp: plan.taxRateBp }]);
    const base = { tenantId: c.tenantId, memberId: member.id, branchId: member.homeBranchId, placeOfSupply: placeOfSupplyFor(branch.stateCode), issuedOn: c.today, dueOn: c.today, createdAt: c.nowIso };

    // A renewal, or a plan that starts when this one ends: an invoice for the plan, which starts the next membership when it is paid.
    const live = current && (status === "active" || status === "scheduled");
    const q = live && current && current.planId !== plan.id ? quoteChange(current, (await paidPretax(current)).pretaxPaise, plan, c.today) : undefined;
    if (!live || !q || q.kind === "at_period_end") {
      const rq = renewalQuote(plan, current && live ? current : undefined, c.today);
      const inv: Invoice = { id: `inv_chg_${input.key}`, number: await allocateNumber(c.tenantId, "invoice", branch, c.today), ...base, lines: [{ description: `${plan.name} membership, ${formatDate(rq.startsOn)} to ${formatDate(rq.endsOn)}`, quantity: 1, unitPaise: plan.pricePaise, taxRateBp: plan.taxRateBp }], ...totals, status: "open", purpose: { kind: "renewal", planId: plan.id } };
      await db.invoices.add(inv);
      await db.auditEvents.add(buildAuditEvent(c.principal, { action: current && live && current.planId !== plan.id ? "membership.upgrade" : "membership.renew", reason: q?.reason ?? "Renewal invoice made at the front desk", entityType: "invoice", entityId: inv.id, memberId: member.id, details: { plan: plan.name, startsOn: rq.startsOn, invoice: inv.number, atPeriodEnd: q?.kind === "at_period_end" } }, rid("ae"), now()));
      return changeResult(inv, q ? "at_period_end" : "renewal", false, rq.startsOn);
    }

    // An upgrade now.
    const cur = current!;
    const { pretaxPaise, invoice: original } = await paidPretax(cur);
    if (!original) throw new ApiError("conflict", "There is no invoice for the current plan to credit. Ask finance.");
    const credit = q.credit!;
    const newId = `ms_${member.id}_up_${input.key.replace(/\W/g, "").slice(0, 12)}`;
    const next: Membership = {
      id: newId, tenantId: c.tenantId, memberId: member.id, planId: plan.id,
      terms: { name: plan.name, kind: plan.kind, pricePaise: plan.pricePaise, taxRateBp: plan.taxRateBp, durationDays: plan.durationDays, visits: plan.visits, branchIds: plan.branchIds, classEntitlements: plan.classEntitlements, ptCredits: plan.ptCredits },
      status: "pending", startsOn: c.today, endsOn: addDays(c.today, plan.durationDays ?? 30), visitsRemaining: plan.visits ?? null, freezes: [], autoRenew: cur.autoRenew, autoRenewMethod: cur.autoRenewMethod, renewsMembershipId: cur.id, upgradeOf: cur.id, createdAt: c.nowIso,
    };
    const inv: Invoice = { id: `inv_chg_${input.key}`, number: await allocateNumber(c.tenantId, "invoice", branch, c.today), ...base, membershipId: next.id, lines: [{ description: `${plan.name} membership, ${formatDate(next.startsOn)} to ${formatDate(next.endsOn!)}`, quantity: 1, unitPaise: plan.pricePaise, taxRateBp: plan.taxRateBp }], ...totals, status: "open" };
    next.invoiceId = inv.id;
    const cn: CreditNote = {
      id: rid("cn"), tenantId: c.tenantId, number: await allocateNumber(c.tenantId, "credit_note", branch, c.today), memberId: member.id, branchId: member.homeBranchId, invoiceId: original.id, appliedToInvoiceId: inv.id,
      placeOfSupply: original.placeOfSupply, issuedOn: c.today, reason: `Upgrade from ${cur.terms.name} to ${plan.name}`,
      lines: [{ description: `Unused ${credit.unusedDays} of ${credit.totalDays} days of ${cur.terms.name} (invoice ${original.number}), credited on an upgrade`, quantity: 1, unitPaise: credit.subtotalPaise, taxRateBp: cur.terms.taxRateBp }],
      subtotalPaise: credit.subtotalPaise, taxPaise: credit.taxPaise, totalPaise: credit.totalPaise, createdBy: c.principal.userId, createdAt: c.nowIso,
    };
    const applied: Payment = { id: rid("pay"), tenantId: c.tenantId, invoiceId: inv.id, memberId: member.id, branchId: member.homeBranchId, method: "credit_note", amountPaise: cn.totalPaise, status: "succeeded", receivedAt: c.nowIso, receivedBy: c.principal.userId, reference: cn.number, idempotencyKey: `cn:${cn.id}`, reconciliation: { status: "matched", note: `Credit note ${cn.number} applied` } };
    inv.status = amountDuePaise(inv, [applied]) <= 0 ? "paid" : "partially_paid";
    await db.memberships.add(next);
    await db.invoices.add(inv);
    await db.creditNotes.add(cn);
    await db.payments.add(applied);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "creditnote.issue", reason: cn.reason, entityType: "credit_note", entityId: cn.id, memberId: member.id, details: { number: cn.number, invoice: original.number, totalPaise: cn.totalPaise, appliedTo: inv.number, pretaxPaise } }, rid("ae"), now()));
    return { kind: "upgrade", invoice: { id: inv.id, number: inv.number, totalPaise: inv.totalPaise, duePaise: amountDuePaise(inv, [applied]), status: inv.status }, creditNote: { id: cn.id, number: cn.number, totalPaise: cn.totalPaise, invoiceNumber: original.number }, startsOn: next.startsOn, repeated: false };
  });
}

async function changeResult(inv: Invoice, kind: ChangeResult["kind"], repeated: boolean, startsOn?: string): Promise<ChangeResult> {
  const pays = await db.payments.where("invoiceId").equals(inv.id).toArray();
  const cn = (await db.creditNotes.where("memberId").equals(inv.memberId).toArray()).find((x) => x.appliedToInvoiceId === inv.id);
  const orig = cn ? await db.invoices.get(cn.invoiceId) : undefined;
  const ms = inv.membershipId ? await db.memberships.get(inv.membershipId) : undefined;
  return {
    kind: cn ? "upgrade" : kind, invoice: { id: inv.id, number: inv.number, totalPaise: inv.totalPaise, duePaise: amountDuePaise(inv, pays), status: inv.status }, creditNote: cn && { id: cn.id, number: cn.number, totalPaise: cn.totalPaise, invoiceNumber: orig?.number ?? "" },
    startsOn: ms?.startsOn ?? startsOn ?? inv.issuedOn, repeated,
  };
}

const CancelInput = z.object({ memberId: z.string().min(1), effectiveOn: z.string(), reason: z.string() });
export type CancelInput = z.input<typeof CancelInput>;

export interface CancelResult {
  membershipId: string;
  effectiveOn: string;
  /** Access continues until this date. */
  takesEffectNow: boolean;
  /** What the member may be eligible for under the gym’s policy. Not paid: the desk can request it. */
  eligible: { amountPaise: number; explanation: string; invoiceId?: string; invoiceNumber?: string };
}

/** What cancelling on a date would leave the member eligible for, before anything is written. */
export async function previewCancel(session: Session | null, input: { memberId: string; effectiveOn: string }): Promise<CancelResult["eligible"] & { problem?: string }> {
  const c = await openDesk(session, "membership.manage");
  const { current, rules } = await load(c, input.memberId);
  if (!current) return { amountPaise: 0, explanation: "This member has no membership.", problem: "This member has no membership." };
  const { invoice, paidPaise: paid } = await paidPretax(current);
  const e = refundEligibility(current, invoice ? paid : 0, input.effectiveOn, rules);
  return { amountPaise: e.amountPaise, explanation: e.explanation, invoiceId: invoice?.id, invoiceNumber: invoice?.number, problem: cancelProblem(current, input.effectiveOn, c.today, "placeholder reason") };
}

/**
 * Cancels the membership from a date. Access continues until that date (the stored status changes when it arrives, and access follows the date), and nothing
 * is refunded automatically: the answer says what the member may be eligible for, and the desk can request it from finance.
 */
export async function cancelMembership(session: Session | null, raw: CancelInput): Promise<CancelResult> {
  const input = parse(CancelInput, raw);
  const c = await openDesk(session, "membership.manage");
  return db.transaction("rw", db.tables, async () => {
    const { member, current, rules } = await load(c, input.memberId);
    if (!current) throw new ApiError("conflict", "This member has no membership to cancel.");
    const problem = cancelProblem(current, input.effectiveOn, c.today, input.reason);
    if (problem) throw new ApiError("conflict", problem);
    const takesEffectNow = input.effectiveOn <= c.today;
    await db.memberships.update(current.id, { canceledEffectiveOn: input.effectiveOn, cancelReason: input.reason.trim(), autoRenew: false, ...(takesEffectNow ? { status: "canceled" as const } : {}) });
    // A membership waiting to start after this one is canceled with it.
    for (const next of (await db.memberships.where("memberId").equals(member.id).toArray()).filter((m) => m.renewsMembershipId === current.id && (m.status === "scheduled" || m.status === "pending"))) await db.memberships.update(next.id, { status: "canceled", canceledEffectiveOn: c.today, cancelReason: "The membership before it was canceled" });
    const { invoice, paidPaise: paid } = await paidPretax(current);
    const e = refundEligibility(current, invoice ? paid : 0, input.effectiveOn, rules);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "membership.cancel", reason: input.reason, entityType: "membership", entityId: current.id, memberId: member.id, details: { effectiveOn: input.effectiveOn, eligiblePaise: e.amountPaise, invoice: invoice?.number ?? null } }, rid("ae"), now()));
    return { membershipId: current.id, effectiveOn: input.effectiveOn, takesEffectNow, eligible: { amountPaise: e.amountPaise, explanation: e.explanation, invoiceId: invoice?.id, invoiceNumber: invoice?.number } };
  });
}

/** Takes a cancellation back before its effective date. */
export async function keepMembership(session: Session | null, input: { memberId: string }): Promise<void> {
  const c = await openDesk(session, "membership.manage");
  await db.transaction("rw", db.tables, async () => {
    const { member, current } = await load(c, input.memberId);
    if (!current?.canceledEffectiveOn || current.status === "canceled" || current.canceledEffectiveOn <= c.today) throw new ApiError("conflict", "There is no pending cancellation to take back.");
    await db.memberships.update(current.id, { canceledEffectiveOn: undefined, cancelReason: undefined });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "membership.cancel.undo", reason: "Cancellation taken back before it took effect", entityType: "membership", entityId: current.id, memberId: member.id }, rid("ae"), now()));
  });
}

const RequestInput = z.object({ memberId: z.string().min(1), invoiceId: z.string().min(1), amountPaise: z.number().int().positive("Enter the amount to refund."), reason: z.string().trim().min(3, "Say why the refund is being asked for."), source: z.enum(["cancellation", "manual"]), key: z.string().min(8) });
export type RefundRequestInput = z.input<typeof RequestInput>;

/**
 * The desk can’t approve a refund, but it can ask: a request with the member, invoice, amount and reason goes to the finance queue, where finance or
 * the owner approves or rejects it. The amount can’t be more than what was paid and is not already refunded or asked for.
 */
export async function requestRefund(session: Session | null, raw: RefundRequestInput): Promise<{ requestId: string; repeated: boolean }> {
  const input = parse(RequestInput, raw);
  const c = await openDesk(session, "refund.request");
  return db.transaction("rw", db.tables, async () => {
    const id = `rq_${input.key}`;
    if (await db.refundRequests.get(id)) return { requestId: id, repeated: true };
    const member = await memberInScope(c, "refund.request", input.memberId);
    const invoice = await db.invoices.get(input.invoiceId);
    if (!invoice || invoice.memberId !== member.id) throw new ApiError("not_found", "We couldn’t find that invoice for this member.");
    const [payments, refunds, pending] = await Promise.all([db.payments.where("invoiceId").equals(invoice.id).toArray(), db.refunds.toArray().then((all) => all.filter((r) => r.invoiceId === invoice.id)), db.refundRequests.where("invoiceId").equals(invoice.id).toArray()]);
    const paid = paidPaise(payments.filter((p) => p.method !== "credit_note"));
    const taken = refunds.filter((r) => r.status !== "failed").reduce((n, r) => n + r.amountPaise, 0) + pending.filter((r) => r.status === "pending").reduce((n, r) => n + r.amountPaise, 0);
    const left = paid - taken;
    if (input.amountPaise > left) throw new ApiError("invalid", left <= 0 ? "Everything paid on this invoice is already refunded or waiting for approval." : `At most ${formatRupees(left)} can be refunded on this invoice (it was paid ${formatRupees(paid)}).`);
    const row: RefundRequest = { id, tenantId: c.tenantId, memberId: member.id, branchId: member.homeBranchId, invoiceId: invoice.id, amountPaise: input.amountPaise, reason: input.reason, source: input.source, status: "pending", requestedBy: c.principal.userId, requestedAt: c.nowIso, idempotencyKey: input.key };
    await db.refundRequests.add(row);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "refund.request", reason: input.reason, entityType: "refund_request", entityId: id, memberId: member.id, details: { invoice: invoice.number, amountPaise: input.amountPaise, source: input.source } }, rid("ae"), now()));
    return { requestId: id, repeated: false };
  });
}

