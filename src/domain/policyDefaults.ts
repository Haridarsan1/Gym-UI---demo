import type { PolicyValues } from "@/domain/policies";

/** What a gym has before its owner changes anything. The demo gym starts from these. */
export const POLICY_DEFAULTS: PolicyValues = {
  cancellationCutoffHours: 12, lateCancelConsumesCredit: true, noShowConsumesCredit: true, streakThresholdPercent: 75, bookingHorizonDays: 14, sessionMinutes: 60, membersMayChooseTrainer: false,
  reviewCadenceDays: 28, missedWorkoutsThreshold: 2, missedWorkoutsWindowDays: 7, creditExpiryWarningDays: 14, noShowAfterMinutes: 15, markWindowHours: 48, partialPaymentsEnabled: false,
  freezeMinDays: 7, freezeMaxDays: 30, maxFreezesPerMembership: 2, cancellationFeePaise: 50_000, repeatScanWindowMinutes: 10, graceDays: 0, reminderGapDays: 3,
};
