import { invoiceTotals, taxBreakup } from "@/domain/billing";
import { addDays, isIsoDate } from "@/domain/dates";
import { formatDate, formatRupees } from "@/lib/when";
import type { MembershipPlan } from "@/domain/types";

/**
 * The plan catalogue’s rules (M01, M03), pure. A plan is what the gym sells; a sale copies its terms into the membership, so editing a plan never changes anyone who already bought it.
 * `validatePlan` says what is wrong in the words the owner reads, `planState` says whether it is on sale, and `planPreview` works out exactly what a member pays and gets, with the same
 * `invoiceTotals` an invoice uses, so the owner sees the real bill before saving.
 */

/** GST rates a plan may carry, in basis points. Fitness services are 18% (to be confirmed by the gym’s accountant). */
export const GST_RATES_BP: readonly number[] = [0, 500, 1200, 1800, 2800];
export const MAX_PRICE_PAISE = 100_000_000;

export interface PlanDraft {
  name: string;
  kind: MembershipPlan["kind"];
  pricePaise: number | null;
  taxRateBp: number;
  durationDays?: number | null;
  visits?: number | null;
  branchIds: string[];
  classEntitlements?: number | null;
  ptCredits?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  maxDiscountBp?: number | null;
  graceDays?: number | null;
}
export type PlanErrors = Partial<Record<"name" | "pricePaise" | "taxRateBp" | "durationDays" | "visits" | "branchIds" | "classEntitlements" | "ptCredits" | "effectiveFrom" | "effectiveTo" | "maxDiscountBp" | "graceDays", string>>;

const whole = (n: number | null | undefined) => n !== null && n !== undefined && Number.isInteger(n);

export function validatePlan(d: PlanDraft, ctx: { branchIds: string[]; otherNames: string[] }): PlanErrors {
  const e: PlanErrors = {};
  const name = d.name.trim().replace(/\s+/g, " ");
  if (!name) e.name = "Give the plan a name.";
  else if (name.length > 60) e.name = "Use 60 characters or fewer.";
  else if (ctx.otherNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) e.name = "Another plan already has this name. Choose a different one.";

  if (d.pricePaise === null || !whole(d.pricePaise) || d.pricePaise < 0) e.pricePaise = "Enter the price in rupees before GST, for example 2,500.";
  else if (d.pricePaise > MAX_PRICE_PAISE) e.pricePaise = "The price can be at most ₹10,00,000.";
  else if (d.kind !== "trial" && d.pricePaise === 0) e.pricePaise = "A paid plan needs a price above ₹0. Choose Trial for a free plan.";

  if (!GST_RATES_BP.includes(d.taxRateBp)) e.taxRateBp = "Choose a GST rate from the list.";

  if (d.kind === "trial") {
    if (!whole(d.durationDays) || d.durationDays! < 1 || d.durationDays! > 14) e.durationDays = "A trial runs 1 to 14 days.";
  } else if (d.kind === "time") {
    if (!whole(d.durationDays) || d.durationDays! < 1 || d.durationDays! > 730) e.durationDays = "Enter how many days the plan lasts, from 1 to 730.";
  } else {
    if (!whole(d.visits) || d.visits! < 1 || d.visits! > 200) e.visits = "Enter how many visits the pass includes, from 1 to 200.";
    if (!whole(d.durationDays) || d.durationDays! < 7 || d.durationDays! > 730) e.durationDays = "Enter how many days the visits can be used in, from 7 to 730.";
  }
  if (d.classEntitlements !== null && d.classEntitlements !== undefined && (!whole(d.classEntitlements) || d.classEntitlements < 0 || d.classEntitlements > 999)) e.classEntitlements = "Enter a whole number of class bookings, 0 to 999.";
  if (d.ptCredits !== null && d.ptCredits !== undefined && (!whole(d.ptCredits) || d.ptCredits < 0 || d.ptCredits > 100)) e.ptCredits = "Enter a whole number of training sessions, 0 to 100.";

  if (d.branchIds.length === 0) e.branchIds = "Choose at least one branch.";
  else if (d.branchIds.some((b) => !ctx.branchIds.includes(b))) e.branchIds = "Choose branches from the list.";

  if (!isIsoDate(d.effectiveFrom)) e.effectiveFrom = "Choose the first day the plan is on sale.";
  if (d.effectiveTo) {
    if (!isIsoDate(d.effectiveTo)) e.effectiveTo = "Choose a valid last day, or leave it empty.";
    else if (isIsoDate(d.effectiveFrom) && d.effectiveTo < d.effectiveFrom) e.effectiveTo = "The last day can’t be before the first day.";
  }
  if (d.maxDiscountBp !== null && d.maxDiscountBp !== undefined && (!whole(d.maxDiscountBp) || d.maxDiscountBp < 0 || d.maxDiscountBp > 10_000)) e.maxDiscountBp = "Enter a percentage from 0 to 100.";
  if (d.graceDays !== null && d.graceDays !== undefined && (!whole(d.graceDays) || d.graceDays < 0 || d.graceDays > 30)) e.graceDays = "Enter 0 to 30 days.";
  return e;
}

export type PlanState = "on_sale" | "scheduled" | "ended" | "off";
export const PLAN_STATE_LABEL: Record<PlanState, string> = { on_sale: "On sale", scheduled: "Starts later", ended: "Ended", off: "Not on sale" };

/** Whether a plan can be sold today: switched on, started, and not past its last day. */
export function planState(p: Pick<MembershipPlan, "active" | "effectiveFrom" | "effectiveTo">, today: string): PlanState {
  if (!p.active) return "off";
  if (p.effectiveFrom > today) return "scheduled";
  if (p.effectiveTo !== undefined && p.effectiveTo < today) return "ended";
  return "on_sale";
}

const pct = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;
export const gstLabel = (bp: number) => (bp === 0 ? "No GST" : `GST ${pct(bp)}`);

export interface PlanPreview {
  /** What the member pays, line by line: the price, the discount if any, the tax and the total. */
  priceLabel: string;
  pricePaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  /** “CGST 9% and SGST 9%”, or empty when there is no GST. */
  taxSplit: string;
  /** What the plan covers if the member joins on `startsOn`. */
  covers: string;
  includes: string[];
  /** What the member would pay at this discount, when the owner asks (a plan’s cap or someone’s limit). */
  atDiscount?: { bp: number; discountPaise: number; totalPaise: number };
}

/** What a member pays and gets on this plan, as the invoice would show it. `discountBp` is the discount to show beside the full price. */
export function planPreview(d: Pick<PlanDraft, "kind" | "pricePaise" | "taxRateBp" | "durationDays" | "visits" | "classEntitlements" | "ptCredits">, opts: { startsOn: string; stateCode: string; discountBp?: number }): PlanPreview {
  const price = d.pricePaise ?? 0;
  const lines = [{ quantity: 1, unitPaise: price, taxRateBp: d.taxRateBp }];
  const full = invoiceTotals(lines);
  const split = taxBreakup(full.taxPaise, opts.stateCode, opts.stateCode);
  const half = d.taxRateBp / 2;
  const days = d.durationDays ?? 0;
  const end = addDays(opts.startsOn, days);
  const covers =
    d.kind === "visit" ? `${d.visits ?? 0} ${d.visits === 1 ? "visit" : "visits"} to use between ${formatDate(opts.startsOn)} and ${formatDate(end)} (${days} days)`
    : `${formatDate(opts.startsOn)} to ${formatDate(end)} (${days} ${days === 1 ? "day" : "days"})`;
  const includes: string[] = [];
  if (d.ptCredits) includes.push(`${d.ptCredits} personal training ${d.ptCredits === 1 ? "session" : "sessions"}`);
  if (d.classEntitlements) includes.push(`${d.classEntitlements} class ${d.classEntitlements === 1 ? "booking" : "bookings"}`);
  const out: PlanPreview = {
    priceLabel: formatRupees(price), pricePaise: price, discountPaise: 0, taxPaise: full.taxPaise, totalPaise: full.totalPaise, cgstPaise: split.cgstPaise, sgstPaise: split.sgstPaise,
    taxSplit: d.taxRateBp === 0 ? "" : `CGST ${pct(half)} and SGST ${pct(half)}`, covers, includes,
  };
  if (opts.discountBp && opts.discountBp > 0) {
    const discountPaise = Math.floor((price * opts.discountBp) / 10_000);
    out.atDiscount = { bp: opts.discountBp, discountPaise, totalPaise: invoiceTotals(lines, discountPaise).totalPaise };
  }
  return out;
}

/** Rupees typed by a person (“2,500” or “2500.50”) as paise, or null when it isn’t an amount. */
export function rupeesToPaise(text: string): number | null {
  const t = text.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export const PT_GST_NOTE = "Personal training is taxed like the memberships.";

export interface PtPricingDraft { sessionPricePaise: number | null; taxRateBp: number; packs: number[]; expiryDays: number | null }
export interface PtPricingErrors { sessionPricePaise?: string; taxRateBp?: string; packs?: string; expiryDays?: string }

export function validatePtPricing(d: PtPricingDraft): PtPricingErrors {
  const e: PtPricingErrors = {};
  if (d.sessionPricePaise === null || !Number.isInteger(d.sessionPricePaise) || d.sessionPricePaise < 1) e.sessionPricePaise = "Enter the price of one session in rupees before GST, for example 800.";
  else if (d.sessionPricePaise > 5_000_000) e.sessionPricePaise = "The price of one session can be at most ₹50,000.";
  if (!GST_RATES_BP.includes(d.taxRateBp)) e.taxRateBp = "Choose a GST rate from the list.";
  if (d.packs.length === 0) e.packs = "Offer at least one pack, for example 4, 8 and 12.";
  else if (d.packs.length > 6) e.packs = "Offer at most six packs.";
  else if (d.packs.some((n) => !Number.isInteger(n) || n < 1 || n > 100) || new Set(d.packs).size !== d.packs.length) e.packs = "Enter each pack as a whole number of sessions from 1 to 100, with no repeats.";
  if (d.expiryDays === null || !Number.isInteger(d.expiryDays) || d.expiryDays < 30 || d.expiryDays > 730) e.expiryDays = "Enter how many days a pack lasts, from 30 to 730.";
  return e;
}
