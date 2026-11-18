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

const list = (names: string[]): string => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * What a membership includes, in words, from the terms agreed when it was sold (M01). The price is shown beside this, not in it.
 * `allBranchNames` are the gym’s branches; `coveredNames` are the ones this plan covers.
 */
export function includedInPlan(terms: Pick<Membership["terms"], "kind" | "durationDays" | "visits" | "classEntitlements" | "ptCredits">, allBranchNames: string[], coveredNames: string[]): string[] {
  const days = terms.durationDays;
  const out: string[] = [];
  if (terms.kind === "visit") out.push(`${terms.visits ?? 0} visits${days ? `, to use within ${days} days` : ""}`);
  else if (terms.kind === "trial") out.push(`${days ?? 3}-day trial`);
  else out.push(`Unlimited visits for ${days ?? 30} days`);
  out.push(coveredNames.length >= allBranchNames.length ? "Every branch" : `${coveredNames.length === 1 ? "Branch" : "Branches"}: ${list(coveredNames)}`);
  if (terms.ptCredits) out.push(`${terms.ptCredits} personal-training ${terms.ptCredits === 1 ? "session" : "sessions"}`);
  if (terms.classEntitlements) out.push(`${terms.classEntitlements} ${terms.classEntitlements === 1 ? "class" : "classes"}`);
  return out;
}
