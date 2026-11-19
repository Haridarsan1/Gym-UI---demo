import { z } from "zod";
import { id, idempotencyKey, isoDateTime } from "./common";

/** A scheduled group class (O01). Recurring classes store the rule and one row per occurrence. */
export const GymClass = z.object({
  id,
  tenantId: id,
  branchId: id,
  name: z.string().min(1),
  trainerId: id.optional(),
  roomId: id.optional(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  capacity: z.number().int().positive(),
  recurrence: z.string().optional(),
  waitlistEnabled: z.boolean(),
  status: z.enum(["scheduled", "canceled"]),
});
export type GymClass = z.infer<typeof GymClass>;

export const BookingStatus = z.enum(["booked", "canceled", "attended", "no_show"]);

/** A personal-training session or a class seat (T04, O01, O02). */
export const Booking = z.object({
  id,
  tenantId: id,
  memberId: id,
  branchId: id,
  kind: z.enum(["pt_session", "class"]),
  trainerId: id.optional(),
  classId: id.optional(),
  /** The room, for sessions that need one. Only conflict-checked when set (M3). */
  roomId: id.optional(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  status: BookingStatus,
  /** Ledger entry holding the credit for this booking, if one is reserved. */
  creditEntryId: id.optional(),
  /** Trainer + start time. Two bookings with the same key cannot both be confirmed (A03). */
  slotKey: z.string().optional(),
  canceledAt: isoDateTime.optional(),
  cancelReason: z.string().optional(),
  createdBy: id,
  createdAt: isoDateTime,
  idempotencyKey,
});
export type Booking = z.infer<typeof Booking>;

export const CheckInResult = z.enum(["allowed", "allowed_with_dues", "override", "denied", "repeat_scan"]);

/** One door scan or desk check-in (M05). A repeat scan in the same window is recorded but debits nothing. */
export const CheckIn = z.object({
  id,
  tenantId: id,
  memberId: id,
  branchId: id,
  membershipId: id.optional(),
  at: isoDateTime,
  method: z.enum(["qr", "desk"]),
  result: CheckInResult,
  /** Plain-language reason shown to staff when denied or overridden. */
  message: z.string().optional(),
  visitDebited: z.boolean(),
  recordedBy: id,
  overriddenBy: id.optional(),
  overrideReason: z.string().optional(),
});
export type CheckIn = z.infer<typeof CheckIn>;
