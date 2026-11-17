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
  graceUntil: isoDate.optional(),
  canceledEffectiveOn: isoDate.optional(),
  cancelReason: z.string().optional(),
  autoRenew: z.boolean(),
  renewsMembershipId: id.optional(),
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

export const Invoice = z.object({
  id,
  tenantId: id,
  /** Printed number, for example INV-2026-0042. */
  number: z.string(),
  memberId: id,
  membershipId: id.optional(),
  branchId: id,
  issuedOn: isoDate,
  dueOn: isoDate,
  lines: z.array(InvoiceLine).min(1),
  discountPaise: paise,
  subtotalPaise: paise,
  taxPaise: paise,
  totalPaise: paise,
  status: InvoiceStatus,
  createdAt: isoDateTime,
});
export type Invoice = z.infer<typeof Invoice>;

export const PaymentMethod = z.enum(["cash", "upi", "card", "transfer", "online"]);
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
  idempotencyKey,
  reconciliation: z.object({ status: z.enum(["unmatched", "matched", "flagged"]), note: z.string().optional(), settlementId: z.string().optional() }),
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
