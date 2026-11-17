/** The moment free cancellation ends: the cutoff before the session starts (a GymPolicies value, 12 hours by default). */
export function cancellationDeadline(startsAtIso: string, cutoffHours: number): string {
  return new Date(Date.parse(startsAtIso) - cutoffHours * 3600_000).toISOString();
}

/** Free cancellation holds up to and including the deadline. */
export const isFreeCancellation = (startsAtIso: string, cutoffHours: number, nowIso: string): boolean => Date.parse(nowIso) <= Date.parse(cancellationDeadline(startsAtIso, cutoffHours));

/**
 * What cancelling does to the credit at this moment: released in time, or used when it is late (if the gym’s policy says so).
 * A session that has already started cannot be canceled.
 */
export function cancellationOutcome(startsAtIso: string, cutoffHours: number, lateConsumesCredit: boolean, nowIso: string): "released" | "consumed" | "kept" | "too_late" {
  if (Date.parse(nowIso) >= Date.parse(startsAtIso)) return "too_late";
  if (isFreeCancellation(startsAtIso, cutoffHours, nowIso)) return "released";
  return lateConsumesCredit ? "consumed" : "kept";
}
