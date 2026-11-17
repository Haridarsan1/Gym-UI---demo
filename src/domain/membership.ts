import type { Membership, TrainerAssignment } from "@/domain/types";

const LIVE_ORDER: Membership["status"][] = ["active", "frozen", "pending", "scheduled"];

/**
 * The membership to show for a member: the one in force or about to be, otherwise the most recent one.
 * Lifecycle rules (freeze, renew, cancel) are added in M3.
 */
export function currentMembership<T extends Pick<Membership, "status" | "startsOn" | "endsOn">>(memberships: T[]): T | undefined {
  for (const status of LIVE_ORDER) {
    const live = memberships.filter((m) => m.status === status).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
    if (live[0]) return live[0];
  }
  return [...memberships].sort((a, b) => (b.endsOn ?? b.startsOn).localeCompare(a.endsOn ?? a.startsOn))[0];
}

/** The trainer assignment in force on a date, if any. The old trainer’s row ends the day before the new one starts (T01, A02). */
export function assignmentOn<T extends Pick<TrainerAssignment, "effectiveFrom" | "effectiveTo">>(assignments: T[], date: string): T | undefined {
  return assignments.find((a) => a.effectiveFrom <= date && (a.effectiveTo === undefined || a.effectiveTo >= date));
}
