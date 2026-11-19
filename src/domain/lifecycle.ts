import { addDays, daysBetween } from "@/domain/dates";
import { invoiceTotals, type InvoiceTotals } from "@/domain/billing";
import type { Membership } from "@/domain/types";

/**
 * The membership lifecycle at the desk (M02): freeze and unfreeze, upgrade with proration, and cancel with an effective date. Pure rules; the
 * API writes around them. The numbers (freeze limits, the cancellation fee) are `GymPolicies`, edited by the owner in M4.
 *
 * Proration and credit-note treatment is “to be confirmed with the gym’s accountant” (docs/PLAN.md, Decisions).
 */

export interface LifecycleRules {
  freezeMinDays: number;
  freezeMaxDays: number;
  maxFreezesPerMembership: number;
  cancellationFeePaise: number;
}

export const LIFECYCLE_DEFAULTS: LifecycleRules = { freezeMinDays: 7, freezeMaxDays: 30, maxFreezesPerMembership: 2, cancellationFeePaise: 50_000 };

type Facts = Pick<Membership, "status" | "startsOn" | "endsOn" | "freezes" | "canceledEffectiveOn"> & { terms: Pick<Membership["terms"], "kind" | "durationDays" | "pricePaise" | "taxRateBp"> };

/**
 * What a membership is today, which can differ from what is stored: a freeze whose last day has passed has ended, and a cancellation whose effective
 * date has come has taken effect. Access follows this, not the stored status.
 */
export function effectiveStatus(m: Pick<Membership, "status" | "freezes" | "canceledEffectiveOn" | "endsOn">, today: string): Membership["status"] {
  if (m.status === "canceled") return "canceled";
  if (m.canceledEffectiveOn && m.canceledEffectiveOn <= today && m.status !== "pending" && m.status !== "scheduled") return "canceled";
  if (m.status === "frozen") {
    const last = m.freezes.at(-1);
    if (last?.to !== undefined && last.to < today) return m.endsOn !== undefined && m.endsOn < today ? "expired" : "active";
  }
  return m.status;
}

// ── Freeze ──────────────────────────────────────────────────────────────────────────────────────

/** Days a freeze covers, first and last day both counted. */
export const freezeDays = (from: string, to: string): number => daysBetween(from, to) + 1;

/** Why a freeze can’t be made, in words for the desk, or nothing. A freeze starts today (or later) and ends on a date. */
export function freezeProblem(m: Facts, f: { from: string; to: string }, today: string, rules: LifecycleRules): string | undefined {
  const status = effectiveStatus(m, today);
  if (status === "frozen") return "This membership is already frozen. Unfreeze it first, or wait for it to end.";
  if (status !== "active") return `Only an active membership can be frozen. This one is ${status}.`;
  if (m.canceledEffectiveOn) return "This membership is being canceled, so it can’t be frozen.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.from) || !/^\d{4}-\d{2}-\d{2}$/.test(f.to)) return "Choose the first and last day of the freeze.";
  if (f.from !== today) return "A freeze starts today. To freeze later, come back on that day.";
  if (f.to < f.from) return "The last day can’t be before the first day.";
  const n = freezeDays(f.from, f.to);
  if (n < rules.freezeMinDays) return `A freeze is at least ${rules.freezeMinDays} days.`;
  if (n > rules.freezeMaxDays) return `A freeze is at most ${rules.freezeMaxDays} days.`;
  if (m.freezes.length >= rules.maxFreezesPerMembership) return `This membership has used its ${rules.maxFreezesPerMembership} ${rules.maxFreezesPerMembership === 1 ? "freeze" : "freezes"}.`;
  return undefined;
}

/** The membership after the freeze: frozen from today, and its end date pushed back by the days frozen, so the member loses nothing. */
export function applyFreeze(m: Pick<Membership, "freezes" | "endsOn">, f: { from: string; to: string; reason: string }): { status: "frozen"; freezes: Membership["freezes"]; endsOn: string | undefined } {
  return { status: "frozen", freezes: [...m.freezes, { from: f.from, to: f.to, reason: f.reason }], endsOn: m.endsOn ? addDays(m.endsOn, freezeDays(f.from, f.to)) : undefined };
}

/** Ending a freeze early: it ends yesterday, and the end date comes back by the days that were not used. */
export function applyUnfreeze(m: Pick<Membership, "freezes" | "endsOn">, today: string): { status: "active"; freezes: Membership["freezes"]; endsOn: string | undefined; unusedDays: number } {
  const last = m.freezes.at(-1);
  if (!last?.to) return { status: "active", freezes: m.freezes, endsOn: m.endsOn, unusedDays: 0 };
  const newTo = addDays(today, -1);
  const unused = Math.max(0, daysBetween(newTo, last.to));
  return { status: "active", freezes: [...m.freezes.slice(0, -1), { ...last, to: newTo < last.from ? last.from : newTo }], endsOn: m.endsOn ? addDays(m.endsOn, -unused) : undefined, unusedDays: unused };
}

// ── Proration and upgrade ───────────────────────────────────────────────────────────────────────

export interface Credit extends InvoiceTotals {
  unusedDays: number;
  totalDays: number;
}

/**
 * The credit for the days left on a time-based plan: the unused days pro rata on the pre-tax price actually paid, with GST on that credit at the
 * plan’s rate. `paidPretaxPaise` is the price after any discount, from the membership’s invoice.
 */
export function unusedCredit(m: Facts, paidPretaxPaise: number, today: string): Credit {
  const totalDays = m.terms.durationDays ?? Math.max(1, daysBetween(m.startsOn, m.endsOn ?? m.startsOn));
  const unusedDays = Math.max(0, Math.min(totalDays, m.endsOn ? daysBetween(today, m.endsOn) : 0));
  const pre = Math.floor((paidPretaxPaise * unusedDays) / totalDays);
  return { unusedDays, totalDays, ...invoiceTotals([{ quantity: 1, unitPaise: pre, taxRateBp: m.terms.taxRateBp }]) };
}

export interface ChangeQuote {
  /** “upgrade”: starts now, with a credit note. “at_period_end”: a cheaper plan, or a credit that covers the new price, starts when this one ends. */
  kind: "upgrade" | "at_period_end";
  startsOn: string;
  newPlan: InvoiceTotals;
  credit?: Credit;
  /** What is left to pay for an upgrade: the new plan’s total less the credit. */
  duePaise: number;
  /** In words, why it is not an upgrade now. */
  reason?: string;
}

/**
 * Changing to another plan. A dearer time-based plan starts today: its price is invoiced in full, the unused days of the old one come back as a GST
 * credit note, and the difference is what is paid. A cheaper plan, or one the credit would cover entirely, is not refunded or credited in cash: it starts
 * when the current period ends.
 */
export function quoteChange(m: Facts, paidPretaxPaise: number, plan: { pricePaise: number; taxRateBp: number; kind: Membership["terms"]["kind"] }, today: string): ChangeQuote {
  const newPlan = invoiceTotals([{ quantity: 1, unitPaise: plan.pricePaise, taxRateBp: plan.taxRateBp }]);
  const periodEnd = m.endsOn ?? today;
  const atEnd = (reason: string): ChangeQuote => ({ kind: "at_period_end", startsOn: periodEnd >= today ? addDays(periodEnd, 1) : today, newPlan, duePaise: newPlan.totalPaise, reason });
  if (m.terms.kind !== "time") return atEnd("A visit pass or trial has no days to credit, so the new plan starts when this one ends.");
  if (plan.pricePaise <= m.terms.pricePaise) return atEnd("A cheaper plan starts when this period ends. Nothing is credited or refunded.");
  const credit = unusedCredit(m, paidPretaxPaise, today);
  if (credit.totalPaise >= newPlan.totalPaise) return atEnd("The credit for the unused days covers the new plan, so it starts when this period ends. Nothing is refunded.");
  return { kind: "upgrade", startsOn: today, newPlan, credit, duePaise: newPlan.totalPaise - credit.totalPaise };
}

// ── Cancellation ────────────────────────────────────────────────────────────────────────────────

export interface RefundEligibility {
  /** What the member may be owed under the gym’s policy, including GST. Not paid automatically: the desk requests it and finance approves. */
  amountPaise: number;
  unusedDays: number;
  totalDays: number;
  /** The share of what was paid that the unused days are worth, before the fee. */
  gross: number;
  fee: number;
  explanation: string;
}

/**
 * The most a cancellation may refund: the unused days after the effective date, pro rata on what was actually paid for the membership (tax included),
 * less the gym’s cancellation fee, never below zero. The amount is a ceiling to request, not a payment.
 */
export function refundEligibility(m: Pick<Membership, "startsOn" | "endsOn" | "terms">, paidPaise: number, effectiveOn: string, rules: Pick<LifecycleRules, "cancellationFeePaise">): RefundEligibility {
  const totalDays = m.terms.durationDays ?? Math.max(1, daysBetween(m.startsOn, m.endsOn ?? m.startsOn));
  const unusedDays = m.terms.kind === "time" && m.endsOn ? Math.max(0, Math.min(totalDays, daysBetween(effectiveOn, m.endsOn))) : 0;
  const gross = paidPaise > 0 ? Math.floor((paidPaise * unusedDays) / totalDays) : 0;
  const fee = gross > 0 ? Math.min(gross, rules.cancellationFeePaise) : 0;
  const amountPaise = Math.max(0, gross - fee);
  const explanation = paidPaise <= 0 ? "Nothing was paid for this membership, so there is nothing to refund." : unusedDays === 0 ? "The membership has been used up, so nothing is eligible." : m.terms.kind !== "time" ? "A visit pass is not refunded for unused visits under the gym’s policy." : `${unusedDays} of ${totalDays} days unused, less the cancellation fee.`;
  return { amountPaise, unusedDays, totalDays, gross, fee, explanation };
}

/** Why a cancellation date can’t be used, in words, or nothing. It can be today, or a later day while the membership still runs. */
export function cancelProblem(m: Pick<Membership, "status" | "endsOn" | "canceledEffectiveOn" | "freezes">, effectiveOn: string, today: string, reason: string): string | undefined {
  const status = effectiveStatus(m, today);
  if (status === "canceled") return "This membership is already canceled.";
  if (status === "expired") return "This membership has already ended.";
  if (reason.trim().length < 3) return "Say why it is being canceled. The reason is kept and audited.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) return "Choose the day the cancellation takes effect.";
  if (effectiveOn < today) return "A cancellation can’t take effect in the past.";
  if (m.endsOn && effectiveOn > m.endsOn) return "The effective date is after the membership ends, so there is nothing to cancel.";
  return undefined;
}
