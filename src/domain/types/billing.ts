import { z } from "zod";
import { basisPoints, id, idempotencyKey, isoDate, isoDateTime, paise } from "./common";

export const PlanKind = z.enum(["trial", "time", "visit"]);

/** What a gym sells (M01). A sale copies these terms into the membership, so later edits never change it. */
export const MembershipPlan = z.object({
  id,
  tenantId: id,
  name: z.string().min(1),
  kind: PlanKind,
  pricePaise: paise,
  taxRateBp: basisPoints,
  durationDays: z.number().int().positive().optional(),
  visits: z.number().int().positive().optional(),
  branchIds: z.array(id),
  classEntitlements: z.number().int().nonnegative().optional(),
  ptCredits: z.number().int().nonnegative().optional(),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.optional(),
  active: z.boolean(),
  /** The most any discount on this plan can be, whatever the person giving it may otherwise give (M03). Absent: each person’s own limit applies. */
  maxDiscountBp: basisPoints.optional(),
  /** Days after the plan ends that a member may still come in. Absent: the gym’s default (M02). */
  graceDays: z.number().int().min(0).max(30).optional(),
});
export type MembershipPlan = z.infer<typeof MembershipPlan>;

/** Membership state only. Whether the invoice is paid is a separate status (M02). */
export const MembershipStatus = z.enum(["pending", "scheduled", "active", "frozen", "expired", "canceled"]);

export const PlanTerms = z.object({
  name: z.string(),
  kind: PlanKind,
  pricePaise: paise,
  taxRateBp: basisPoints,
  durationDays: z.number().int().positive().optional(),
  visits: z.number().int().positive().optional(),
  branchIds: z.array(id),
  classEntitlements: z.number().int().nonnegative().optional(),
  ptCredits: z.number().int().nonnegative().optional(),
  /** The plan’s grace period when it was sold, in days after the end date. Absent: the gym’s default applies (M02). */
  graceDays: z.number().int().min(0).max(30).optional(),
});

export const Membership = z.object({
  id,
  tenantId: id,
  memberId: id,
  planId: id,
  /** The terms agreed at the time of sale. */
  terms: PlanTerms,
  status: MembershipStatus,
  startsOn: isoDate,
  endsOn: isoDate.optional(),
  /** Null for plans without a visit limit. */
  visitsRemaining: z.number().int().nonnegative().nullable(),
  freezes: z.array(z.object({ from: isoDate, to: isoDate.optional(), reason: z.string() })),
  /** A last day of grace set directly, for one membership. Wins over every number of days. */
  graceUntil: isoDate.optional(),
  /** Grace days the desk set for this membership alone. Wins over the plan’s and the gym’s (M02). */
  graceDays: z.number().int().min(0).max(30).optional(),
  canceledEffectiveOn: isoDate.optional(),
  cancelReason: z.string().optional(),
  autoRenew: z.boolean(),
  /** What an auto-renew charge is taken from, chosen when the member opted in. */
  autoRenewMethod: z.enum(["upi", "card"]).optional(),
  renewsMembershipId: id.optional(),
  /** Set when this membership replaced another mid-term (an upgrade); the older one ends the day before this starts. */
  upgradeOf: id.optional(),
  /** The invoice that bought this membership. One invoice buys at most one membership, however many times its payment event arrives. */
  invoiceId: id.optional(),
  createdAt: isoDateTime,
});
export type Membership = z.infer<typeof Membership>;

/** Payment state of an invoice. "Overdue" is worked out from `dueOn` and is not stored. */
export const InvoiceStatus = z.enum(["draft", "open", "partially_paid", "paid", "void"]);

export const InvoiceLine = z.object({
  description: z.string(),
  quantity: z.number().int().positive(),
  unitPaise: paise,
  taxRateBp: basisPoints,
});

export type InvoiceLine = z.infer<typeof InvoiceLine>;

/**
 * What an invoice buys, so that paying it does the right thing exactly once: a renewal starts the next membership, a
 * sessions invoice adds training credits. Left out for invoices the front desk writes by hand (M3).
 */
export const InvoicePurpose = z.object({
  kind: z.enum(["renewal", "sessions"]),
  planId: id.optional(),
  sessions: z.number().int().positive().optional(),
  /** Made by the member’s own checkout, not sent by the gym. Choosing another plan replaces it, and it doesn’t stop a renewal. */
  selfServe: z.boolean().optional(),
});

/** The last number given out in one series (a prefix in a financial year). Counted inside the transaction that makes the document, so there are no gaps and no duplicates. */
export const NumberSeries = z.object({ id, tenantId: id, prefix: z.string(), financialYear: z.string(), last: z.number().int().nonnegative() });
export type NumberSeries = z.infer<typeof NumberSeries>;

export const Invoice = z.object({
  id,
  tenantId: id,
  /** Printed GST number: the branch prefix, the financial year and four digits, 16 characters, for example PFAND/26-27/0042 (domain/numbering.ts). */
  number: z.string(),
  memberId: id,
  membershipId: id.optional(),
  branchId: id,
  /** GST state code of the place of supply (for example "27" for Maharashtra). Decides CGST + SGST or IGST on the receipt. */
  placeOfSupply: z.string().regex(/^\d{2}$/),
  issuedOn: isoDate,
  dueOn: isoDate,
  lines: z.array(InvoiceLine).min(1),
  discountPaise: paise,
  subtotalPaise: paise,
  taxPaise: paise,
  totalPaise: paise,
  status: InvoiceStatus,
  purpose: InvoicePurpose.optional(),
  createdAt: isoDateTime,
});
export type Invoice = z.infer<typeof Invoice>;

/** “credit_note” is not money: it applies a GST credit note (an upgrade’s unused days) to an invoice. Reports count it apart from collections. */
export const PaymentMethod = z.enum(["cash", "upi", "card", "netbanking", "transfer", "online", "credit_note"]);
export const PaymentStatus = z.enum(["pending", "succeeded", "failed"]);

export const Payment = z.object({
  id,
  tenantId: id,
  invoiceId: id,
  memberId: id,
  branchId: id,
  method: PaymentMethod,
  amountPaise: paise,
  status: PaymentStatus,
  receivedAt: isoDateTime,
  /** Staff member who took the payment. Absent for online payments. */
  receivedBy: id.optional(),
  receiptNumber: z.string().optional(),
  reference: z.string().optional(),
  /** Id of the gateway event that created this payment. A repeated event must not create a second payment (M04). */
  gatewayEventId: z.string().optional(),
  /** Why a failed payment failed, in words for the member. */
  failureReason: z.string().optional(),
  idempotencyKey,
  reconciliation: z.object({ status: z.enum(["unmatched", "matched", "flagged"]), note: z.string().optional(), settlementId: z.string().optional(), reviewedBy: id.optional() }),
});
export type Payment = z.infer<typeof Payment>;

export const Refund = z.object({
  id,
  tenantId: id,
  paymentId: id,
  invoiceId: id,
  amountPaise: paise.refine((n) => n > 0, "Refund amount must be more than zero."),
  reason: z.string().min(1),
  status: z.enum(["pending", "completed", "failed"]),
  requestedBy: id,
  approvedBy: id.optional(),
  /** Unused training credits taken back with this refund (M06). */
  creditsReversed: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  idempotencyKey,
});
export type Refund = z.infer<typeof Refund>;

/**
 * Personal-training credit ledger (M06). Entries are never edited. `credits` is always a positive count.
 *  purchase     adds credits to the available balance
 *  reservation  moves credits from available to reserved (a booking)
 *  consumption  uses reserved credits (session attended or late cancellation)
 *  release      moves reserved credits back to available (booking cancelled in time)
 *  reversal     undoes the entry named in `refEntryId` (for example a refund)
 *  expiry       removes unused available credits
 *  adjustment   a manual correction by staff, with a reason, also written to the audit log
 */
export const CreditEntryKind = z.enum(["purchase", "reservation", "consumption", "release", "reversal", "expiry", "adjustment"]);

export const CreditLedgerEntry = z.object({
  id,
  tenantId: id,
  memberId: id,
  membershipId: id.optional(),
  kind: CreditEntryKind,
  credits: z.number().int().positive(),
  /** For adjustment: whether credits are added or removed. */
  direction: z.enum(["add", "remove"]).optional(),
  bookingId: id.optional(),
  refEntryId: id.optional(),
  expiresOn: isoDate.optional(),
  reason: z.string().optional(),
  createdBy: id,
  createdAt: isoDateTime,
  idempotencyKey,
});
export type CreditLedgerEntry = z.infer<typeof CreditLedgerEntry>;

/**
 * A GST credit note (M03, M04): a document that reduces an earlier invoice, with its own number series. An upgrade issues one for the unused days of
 * the old plan, linked to the original invoice, and applies it to the new invoice as a payment of method “credit_note”, so it is never netted silently.
 */
export const CreditNote = z.object({
  id,
  tenantId: id,
  /** Printed number from the branch’s credit-note series, for example CNAND/26-27/0001. */
  number: z.string(),
  memberId: id,
  branchId: id,
  /** The invoice this credit note reduces. */
  invoiceId: id,
  /** The invoice the credit was applied to, when it was. */
  appliedToInvoiceId: id.optional(),
  placeOfSupply: z.string().regex(/^\d{2}$/),
  issuedOn: isoDate,
  reason: z.string(),
  lines: z.array(InvoiceLine).min(1),
  subtotalPaise: paise,
  taxPaise: paise,
  totalPaise: paise,
  createdBy: id,
  createdAt: isoDateTime,
});
export type CreditNote = z.infer<typeof CreditNote>;

/**
 * A request for a refund that someone who can’t approve it makes (M04). The front desk requests; finance or the owner approves or rejects, and both
 * steps are audited. Approving makes the `Refund` and reverses unused credits; the request keeps pointing at it.
 */
export const RefundRequest = z.object({
  id,
  tenantId: id,
  memberId: id,
  branchId: id,
  invoiceId: id,
  amountPaise: paise.refine((n) => n > 0, "Refund amount must be more than zero."),
  reason: z.string().min(1),
  /** Where it came from: a cancellation (the amount the policy says they may be owed) or a request the desk wrote. */
  source: z.enum(["cancellation", "manual"]),
  status: z.enum(["pending", "approved", "rejected"]),
  requestedBy: id,
  requestedAt: isoDateTime,
  decidedBy: id.optional(),
  decidedAt: isoDateTime.optional(),
  decisionNote: z.string().optional(),
  /** The refund made when it was approved. */
  refundId: id.optional(),
  idempotencyKey,
});
export type RefundRequest = z.infer<typeof RefundRequest>;
