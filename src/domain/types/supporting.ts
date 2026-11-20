import { z } from "zod";
import { BADGE_KEYS, type BadgeKey } from "@/domain/badges";
import { id, isoDate, isoDateTime } from "./common";

/**
 * Records beyond the S07 list that the member app needs. Each exists for one reason, written next to it and in docs/PLAN.md.
 */

export const ReviewKind = z.enum(["shared_review", "private_note", "member_checkin"]);

/**
 * Why: T06 and P04 need feedback that the member can see, notes the trainer keeps to themselves, and the member’s own
 * check-in on effort, recovery and obstacles. One record with a kind keeps the history in one place, with its author.
 * Only `shared_review` and the member’s own `member_checkin` are visible to the member. `readByMemberAt` drives the
 * “new review” card on Today.
 */
export const TrainerReview = z.object({
  id,
  tenantId: id,
  memberId: id,
  kind: ReviewKind,
  authorId: id,
  body: z.string(),
  /** Member check-in only. */
  effort: z.number().int().min(1).max(10).optional(),
  recovery: z.number().int().min(1).max(5).optional(),
  obstacles: z.string().optional(),
  followUpOn: isoDate.optional(),
  createdAt: isoDateTime,
  readByMemberAt: isoDateTime.optional(),
});
export type TrainerReview = z.infer<typeof TrainerReview>;

/**
 * Why: O04 and S04 say members choose which messages they get, and the app offers optional sounds and haptics (off by
 * default for sound). Consent to marketing is a separate Consent record, not stored here.
 */
export const MemberSettings = z.object({
  id,
  tenantId: id,
  memberId: id,
  email: z.object({ bookingReminders: z.boolean(), workoutUpdates: z.boolean(), renewalReminders: z.boolean(), inactivityPrompts: z.boolean() }),
  soundOn: z.boolean(),
  hapticsOn: z.boolean(),
  updatedAt: isoDateTime,
});
export type MemberSettings = z.infer<typeof MemberSettings>;

export const EmailTemplate = z.enum(["booking_confirmed", "booking_canceled", "booking_rescheduled", "payment_receipt", "membership_renewed", "sessions_purchased", "data_request", "member_welcome", "payment_reminder", "refund_issued", "staff_invite", "renewal_reminder", "inactivity_prompt", "marketing_update"]);

/**
 * Why: O04 says every message the gym sends is logged with its outcome, and messages are email only (confirmed decision). The
 * log is what the owner console shows later. In demo mode nothing is really sent, so `status` is "sent" with the text that
 * would have gone, or "skipped" with the reason, such as no email address on file.
 */
export const EmailLogEntry = z.object({
  id,
  tenantId: id,
  /** The member a message is about. Absent for messages to staff, such as an invitation. */
  memberId: id.optional(),
  /** The staff member a message is to (an invitation). */
  userId: id.optional(),
  bookingId: id.optional(),
  /** The invoice a payment email is about. */
  invoiceId: id.optional(),
  template: EmailTemplate,
  /** The address it went to, if the member has one. */
  to: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  /** “failed”: the mail server didn’t accept it and it can be tried again (O04). “skipped”: it was never going to be sent, and `detail` says why. */
  status: z.enum(["sent", "skipped", "failed"]),
  detail: z.string().optional(),
  /** How many times it has been tried. Absent on messages written before retries. */
  attempts: z.number().int().min(1).optional(),
  lastAttemptAt: isoDateTime.optional(),
  /** The group send this belongs to. */
  campaign: z.string().optional(),
  sentAt: isoDateTime,
});
export type EmailLogEntry = z.infer<typeof EmailLogEntry>;

/**
 * Why: a celebration should happen once, when a badge is first earned. Storing the award is how the app knows it is new
 * and keeps the date. Which badges exist and how they are earned is in domain/badges.ts.
 */
export const BadgeAward = z.object({
  id,
  tenantId: id,
  memberId: id,
  badge: z.enum(BADGE_KEYS as [BadgeKey, ...BadgeKey[]]),
  awardedAt: isoDateTime,
  workoutLogId: id.optional(),
});
export type BadgeAward = z.infer<typeof BadgeAward>;

/**
 * Why: T04 and O01 book coaching against “trainer availability”, and the member needs the open slots. This is the weekly
 * pattern: on this weekday the trainer takes sessions between start and end at this branch. Leave and shifts (O01) are
 * added in M2, which owns the trainer’s schedule.
 */
export const TrainerAvailability = z.object({
  id,
  tenantId: id,
  trainerId: id,
  branchId: id,
  /** 0 = Sunday. */
  weekday: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});
export type TrainerAvailability = z.infer<typeof TrainerAvailability>;

/**
 * Why: O01 lets a trainer work extra hours on one date, such as covering another branch. A shift adds a window on its date to the weekly
 * pattern; it never removes one. Leave (below) is what removes days.
 */
export const TrainerShift = z.object({
  id,
  tenantId: id,
  trainerId: id,
  branchId: id,
  date: isoDate,
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  note: z.string().optional(),
  createdAt: isoDateTime,
});
export type TrainerShift = z.infer<typeof TrainerShift>;

/**
 * Why: T04, O01 and O02 need days a trainer is away. Leave blocks new bookings on every day from `from` to `to` (both included).
 * Bookings already on those days become conflicts the trainer and the front desk resolve (confirmed after M1.5). Canceling leave
 * keeps the record and frees the days.
 */
export const TrainerLeave = z.object({
  id,
  tenantId: id,
  trainerId: id,
  from: isoDate,
  to: isoDate,
  reason: z.string().optional(),
  createdBy: id,
  createdAt: isoDateTime,
  canceledAt: isoDateTime.optional(),
});
export type TrainerLeave = z.infer<typeof TrainerLeave>;

/**
 * Why: the booking, cancellation, streak and trainer-dashboard rules are the gym’s choice (M02, T04, T07, O02), not constants in code. The owner
 * edits them in M4 (Policies). One row per gym.
 */
export const GymPolicies = z.object({
  id,
  tenantId: id,
  /** Free cancellation until this many hours before a session. */
  cancellationCutoffHours: z.number().int().min(0).max(168),
  /** Cancelling after the cutoff uses the credit. */
  lateCancelConsumesCredit: z.boolean(),
  noShowConsumesCredit: z.boolean(),
  /** A week counts toward the streak when at least this share of planned workouts is completed or partial. */
  streakThresholdPercent: z.number().int().min(1).max(100),
  /** How far ahead members can book. */
  bookingHorizonDays: z.number().int().min(1).max(60),
  sessionMinutes: z.number().int().min(15).max(180),
  /** “Members can book sessions with other trainers”. Off by default: members book only with the trainer they are assigned to. */
  membersMayChooseTrainer: z.boolean(),
  /** How often a client is reviewed when none of their goals sets its own cadence (T02). */
  reviewCadenceDays: z.number().int().min(7).max(180),
  /** The trainer’s Today lists a client who missed at least this many scheduled workouts… */
  missedWorkoutsThreshold: z.number().int().min(1).max(14),
  /** …within this many days before today (T07). */
  missedWorkoutsWindowDays: z.number().int().min(3).max(28),
  /** Training credits count as expiring this many days before their pack ends (T07). */
  creditExpiryWarningDays: z.number().int().min(1).max(90),
  /** Minutes after a session starts before “No-show” can be marked. “Attended” can be marked from the start. */
  noShowAfterMinutes: z.number().int().min(0).max(120),
  /** Hours after a session starts during which the trainer can still mark it. */
  markWindowHours: z.number().int().min(1).max(336),
  /** Whether the desk may record a payment smaller than the amount due (M03). Off by default. */
  partialPaymentsEnabled: z.boolean(),
  /** A freeze must be at least this many days… */
  freezeMinDays: z.number().int().min(1).max(60),
  /** …and at most this many. */
  freezeMaxDays: z.number().int().min(1).max(180),
  /** How many freezes one membership may have. */
  maxFreezesPerMembership: z.number().int().min(0).max(12),
  /** Kept from a cancellation refund, in paise, before the unused days are returned. */
  cancellationFeePaise: z.number().int().nonnegative(),
  /** A second scan at the same branch within this many minutes of an entry is a repeat, not a new visit (M05). */
  repeatScanWindowMinutes: z.number().int().min(1).max(60),
  /** The gym’s default grace period after a membership ends: days the member may still come in. A plan can set its own, and the desk can change one membership’s (M02). */
  graceDays: z.number().int().min(0).max(30),
  /** A payment reminder for the same invoice can be sent again after this many days (O04). */
  reminderGapDays: z.number().int().min(1).max(30),
});
export type GymPolicies = z.infer<typeof GymPolicies>;

/**
 * Why: M04 says provider events are processed idempotently. The gateway sends “payment succeeded” and may send it again;
 * the event’s own id is stored so a repeat is recognised and changes nothing. `deliveries` counts how many times it arrived,
 * which the demo control shows next to the one payment and one renewal it made.
 */
export const GatewayEvent = z.object({
  id,
  tenantId: id,
  memberId: id,
  invoiceId: id,
  type: z.enum(["payment.succeeded", "payment.failed"]),
  method: z.enum(["upi", "card", "netbanking"]),
  amountPaise: z.number().int().nonnegative(),
  reference: z.string(),
  paymentId: id,
  receivedAt: isoDateTime,
  deliveries: z.number().int().positive(),
  lastDeliveredAt: isoDateTime,
  /** Finance looked at a repeated delivery and accepted it (M04). */
  reviewedBy: id.optional(),
  reviewNote: z.string().optional(),
});
export type GatewayEvent = z.infer<typeof GatewayEvent>;

/**
 * Why: S04 says members can ask for their data and for deletion, and the gym fulfils them under its retention policy. This
 * is the request; the owner console handles it in M4. Asking again while one is open returns the open one.
 */
export const DataRequest = z.object({
  id,
  tenantId: id,
  memberId: id,
  kind: z.enum(["export", "deletion"]),
  status: z.enum(["requested", "in_progress", "completed", "declined"]),
  requestedAt: isoDateTime,
  requestedBy: id,
  note: z.string().optional(),
  idempotencyKey: z.string().min(8),
});
export type DataRequest = z.infer<typeof DataRequest>;

/**
 * Why: finance matches what Ember collected online with what the payment gateway paid into the bank (M03, M04). A settlement is one
 * payout the gateway reports: the charges in it, by gateway reference, and its fee.
 */
export const GatewaySettlement = z.object({
  id,
  tenantId: id,
  reference: z.string().min(1),
  settledOn: isoDate,
  lines: z.array(z.object({ reference: z.string().min(1), amountPaise: z.number().int().nonnegative() })),
  feePaise: z.number().int().nonnegative(),
});
export type GatewaySettlement = z.infer<typeof GatewaySettlement>;

/**
 * Why: a simple cash day close (M3). The cash Ember expects in the drawer for one branch and day, what was counted, and the difference.
 * One record per branch and day. A closed day’s cash records are locked; only the owner reopens it, with a reason, and both are audited.
 */
export const DayClose = z.object({
  id,
  tenantId: id,
  branchId: id,
  date: isoDate,
  status: z.enum(["closed", "reopened"]),
  expectedPaise: z.number().int(),
  countedPaise: z.number().int().nonnegative(),
  variancePaise: z.number().int(),
  note: z.string().optional(),
  closedBy: id,
  closedAt: isoDateTime,
  reopenedBy: id.optional(),
  reopenedAt: isoDateTime.optional(),
  reopenReason: z.string().optional(),
});
export type DayClose = z.infer<typeof DayClose>;
