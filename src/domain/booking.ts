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

/** A personal-training session costs one credit (M06). */
export const PT_CREDIT_COST = 1;

/** What happens to the reserved credit when a booking ends. */
export type Settlement = "release" | "consume";

/** A cancellation: in time gives the credit back; late uses it when the gym’s policy says so. */
export function cancellationSettlement(outcome: ReturnType<typeof cancellationOutcome>): Settlement | null {
  if (outcome === "too_late") return null;
  return outcome === "consumed" ? "consume" : "release";
}

/** A no-show uses the credit, or gives it back, by the gym’s policy. */
export const noShowSettlement = (noShowConsumesCredit: boolean): Settlement => (noShowConsumesCredit ? "consume" : "release");

/**
 * Moving a booking keeps its one reserved credit and costs nothing, but only while cancelling would still be free. After
 * that the member can keep the session or cancel it under the late terms.
 */
export const canReschedule = (startsAtIso: string, cutoffHours: number, nowIso: string): boolean => isFreeCancellation(startsAtIso, cutoffHours, nowIso);
