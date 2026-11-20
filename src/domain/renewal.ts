import { invoiceTotals, type InvoiceTotals } from "@/domain/billing";
import { addDays } from "@/domain/dates";
import type { Membership, MembershipPlan } from "@/domain/types";

/**
 * Renewing, upgrading and buying sessions (M01, M02, M04). Pure rules; the money and the records are in `api/membership.ts`.
 *
 * - A membership that is still running is renewed from the day after it ends, so no paid days are lost. One that has ended, or was
 *   canceled, starts today.
 * - The new membership takes the plan’s current price and terms (the old one keeps what was agreed when it was sold, M01).
 * - An upgrade is a renewal onto a dearer plan. It takes effect when the current period ends; changing plan mid-period, with
 *   proration, is the front desk’s job (M3).
 * - A period runs from its start date for the plan’s length in days, the way the gym’s memberships have always been dated.
 */

export interface RenewalQuote extends InvoiceTotals {
  planId: string;
  planName: string;
  kind: MembershipPlan["kind"];
  startsOn: string;
  endsOn: string;
  /** Scheduled when it follows a membership that is still running; active when it starts today. */
  status: "active" | "scheduled";
  /** A dearer plan than the current one. */
  upgrade: boolean;
  /** The current plan again. */
  samePlan: boolean;
  durationDays: number;
  visits?: number;
  ptCredits?: number;
}

type Current = Pick<Membership, "status" | "endsOn" | "planId"> & { terms: Pick<Membership["terms"], "pricePaise"> };

export function renewalStart(current: Pick<Membership, "status" | "endsOn"> | undefined, today: string): string {
  if (current?.status === "active" && current.endsOn && current.endsOn >= today) return addDays(current.endsOn, 1);
  return today;
}

/** A plan can be bought again when it is on sale, is not a free trial, and the member’s branch is covered. */
export const planOnOffer = (plan: MembershipPlan, homeBranchId: string, today: string): boolean =>
  plan.active && plan.kind !== "trial" && plan.pricePaise > 0 && plan.branchIds.includes(homeBranchId) && plan.effectiveFrom <= today && (plan.effectiveTo === undefined || plan.effectiveTo >= today);

export function renewalQuote(plan: MembershipPlan, current: Current | undefined, today: string): RenewalQuote {
  const startsOn = renewalStart(current, today);
  const durationDays = plan.durationDays ?? 30;
  const totals = invoiceTotals([{ quantity: 1, unitPaise: plan.pricePaise, taxRateBp: plan.taxRateBp }]);
  return {
    planId: plan.id, planName: plan.name, kind: plan.kind, startsOn, endsOn: addDays(startsOn, durationDays), status: startsOn > today ? "scheduled" : "active",
    upgrade: current !== undefined && plan.pricePaise > current.terms.pricePaise, samePlan: current?.planId === plan.id, durationDays,
    visits: plan.visits, ptCredits: plan.ptCredits, ...totals,
  };
}

/** Why renewing is closed right now, in words for the member, or undefined when it is open. */
export function renewalBlockedReason(status: Membership["status"] | undefined, openInvoiceNumber: string | undefined, hasNext = false): string | undefined {
  if (hasNext) return "Your next membership is already booked to start. There is nothing to renew yet.";
  if (status === "frozen") return "Your membership is frozen. You can renew once the freeze ends.";
  if (status === "pending") return "Your membership is waiting for its first payment. Pay the open invoice and it starts.";
  if (status === "scheduled") return "Your next membership is already booked to start. There is nothing to renew yet.";
  if (openInvoiceNumber) return `Pay invoice ${openInvoiceNumber} first. It already renews your membership.`;
  return undefined;
}

/** Training sessions are sold in packs. The price, packs and how long they last are the gym’s: the owner sets them in Plans and pricing, and these are what a gym has until then. */
export interface PtPricing { sessionPricePaise: number; taxRateBp: number; packs: number[]; expiryDays: number }
export const SESSION_PRICE_PAISE = 80_000;
export const SESSION_PACKS: readonly number[] = [4, 8, 12];
/** Credits bought online are good for this many days. */
export const SESSION_EXPIRY_DAYS = 150;
export const SESSION_TAX_RATE_BP = 1800;
export const DEFAULT_PT_PRICING: PtPricing = { sessionPricePaise: SESSION_PRICE_PAISE, taxRateBp: SESSION_TAX_RATE_BP, packs: [...SESSION_PACKS], expiryDays: SESSION_EXPIRY_DAYS };

export function sessionPackQuote(count: number, pricing: PtPricing = DEFAULT_PT_PRICING): (InvoiceTotals & { sessions: number }) | undefined {
  if (!pricing.packs.includes(count)) return undefined;
  return { sessions: count, ...invoiceTotals([{ quantity: count, unitPaise: pricing.sessionPricePaise, taxRateBp: pricing.taxRateBp }]) };
}

/**
 * Auto-renew (M04), opt-in. The saved payment method is charged once, on the last day of the membership, for the plan’s price
 * at that time. The member is emailed three days before; switching it off before the charge day means nothing is charged.
 */
export const AUTO_RENEW_NOTICE_DAYS = 3;
export function autoRenewTerms(current: Pick<Membership, "endsOn" | "status">, plan: MembershipPlan | undefined): { chargeOn: string; reminderOn: string; amountPaise: number; newEndsOn: string } | undefined {
  if (!current.endsOn || !plan || current.status !== "active") return undefined;
  const q = renewalQuote(plan, { status: current.status, endsOn: current.endsOn, planId: plan.id, terms: { pricePaise: plan.pricePaise } }, current.endsOn);
  return { chargeOn: current.endsOn, reminderOn: addDays(current.endsOn, -AUTO_RENEW_NOTICE_DAYS), amountPaise: q.totalPaise, newEndsOn: q.endsOn };
}

// ── The simulated gateway’s messages ──────────────────────────────────────────────────────────────

export type PayMethod = "upi" | "card" | "netbanking";
export const PAY_METHOD_LABEL: Record<PayMethod | "cash" | "transfer" | "online" | "credit_note", string> = { credit_note: "Credit note", upi: "UPI", card: "Card", netbanking: "Net banking", cash: "Cash", transfer: "Bank transfer", online: "Online" };

/** What the member is told when the bank said no. Says what happened, that nothing was taken, and what to do. */
export const PAYMENT_DECLINED = "The payment didn’t go through, and no money was taken. Try again, or choose another way to pay.";
