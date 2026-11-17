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
  email: z.object({ bookingReminders: z.boolean(), workoutUpdates: z.boolean(), renewalReminders: z.boolean() }),
  soundOn: z.boolean(),
  hapticsOn: z.boolean(),
  updatedAt: isoDateTime,
});
export type MemberSettings = z.infer<typeof MemberSettings>;

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
 * Why: the booking, cancellation and streak rules are the gym’s choice (M02, T04, O02), not constants in code. The owner
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
});
export type GymPolicies = z.infer<typeof GymPolicies>;
