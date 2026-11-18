import { db } from "@/demo/db";
import { creditBalance, type CreditBalance } from "@/domain/credits";
import { daysBetween } from "@/domain/dates";
import { assignmentOn, currentMembership } from "@/domain/membership";
import { adherence, type Adherence } from "@/domain/metrics";
import { addDays } from "@/domain/dates";
import { expiringCredits, recentMissed, reviewCadenceFor, reviewDue, TRAINER_POLICY_DEFAULTS, type ExpiringCredits, type MissedSummary, type ReviewDue } from "@/domain/trainerToday";
import type { CreditLedgerEntry, Goal, GymPolicies, Member, Membership, TrainerAssignment, TrainerReview, WorkoutLog, WorkoutPlanVersion } from "@/domain/types";
import type { TrainerContext } from "@/api/trainer";

/**
 * One client in the trainer’s book, with everything the trainer’s screens say about them worked out in one place, so Today,
 * the client list and the client profile can never disagree about who is overdue, behind or waiting.
 */
export interface BookClient {
  member: Member;
  membership: Membership;
  assignment: TrainerAssignment;
  plans: WorkoutPlanVersion[];
  logs: WorkoutLog[];
  reviews: TrainerReview[];
  goals: Goal[];
  ledger: CreditLedgerEntry[];
  credits: CreditBalance;
  /** Days between reviews for this client: the shortest cadence on their active goals, or the gym’s default. */
  cadenceDays: number;
  /** Set for an active client with a plan. */
  review?: ReviewDue & { reason: string };
  missed?: MissedSummary;
  expiring?: ExpiringCredits;
  /** Set for an active client with no published plan. */
  awaiting?: { daysWaiting: number; planName: string };
  /** Completed workouts against scheduled ones over the last four weeks. Null when nothing was scheduled. */
  adherence: Adherence;
  /** The most recent finished workout. */
  lastWorkoutOn?: string;
}

export type Rules = Pick<GymPolicies, "reviewCadenceDays" | "missedWorkoutsThreshold" | "missedWorkoutsWindowDays" | "creditExpiryWarningDays">;

const group = <T extends { memberId: string }>(rows: T[]) => {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(r.memberId, [...(map.get(r.memberId) ?? []), r]);
  return map;
};

/** The reason a review is due, in words. */
export const reviewReason = (due: ReviewDue, cadence: number) => (due.why === "follow-up" ? "Follow-up date has passed" : due.why === "cadence" ? `Reviewed every ${cadence} days` : "No review yet");

/** Every client the trainer has today (an open assignment, an active or frozen membership), with their signals. */
export async function loadBook(c: TrainerContext) {
  const [assignments, members, memberships, versions, logs, reviews, ledger, goals, policies] = await Promise.all([
    db.trainerAssignments.where("trainerId").equals(c.trainerId).toArray(),
    db.members.where("tenantId").equals(c.tenantId).toArray(),
    db.memberships.where("tenantId").equals(c.tenantId).toArray(),
    db.workoutPlanVersions.where("tenantId").equals(c.tenantId).toArray(),
    db.workoutLogs.where("tenantId").equals(c.tenantId).toArray(),
    db.trainerReviews.where("tenantId").equals(c.tenantId).toArray(),
    db.creditLedger.where("tenantId").equals(c.tenantId).toArray(),
    db.goals.where("tenantId").equals(c.tenantId).toArray(),
    db.gymPolicies.where("tenantId").equals(c.tenantId).first(),
  ]);
  // The gym’s rules for what counts as overdue, missed and expiring (GymPolicies, set by the owner in M4).
  const rules: Rules = { ...TRAINER_POLICY_DEFAULTS, ...policies };
  const by = { ms: group(memberships), plans: group(versions.filter((v) => v.status === "published")), logs: group(logs), reviews: group(reviews), ledger: group(ledger), goals: group(goals), assignments: group(assignments) };
  const clients: BookClient[] = [];
  for (const member of members) {
    if (member.archivedAt) continue;
    const assignment = assignmentOn(by.assignments.get(member.id) ?? [], c.today);
    if (!assignment || assignment.trainerId !== c.trainerId) continue;
    const membership = currentMembership(by.ms.get(member.id) ?? []);
    if (!membership || (membership.status !== "active" && membership.status !== "frozen")) continue;
    const plans = by.plans.get(member.id) ?? [];
    const mLogs = by.logs.get(member.id) ?? [];
    const mLedger = by.ledger.get(member.id) ?? [];
    const mGoals = by.goals.get(member.id) ?? [];
    const credits = creditBalance(mLedger);
    const cadenceDays = reviewCadenceFor(mGoals, rules.reviewCadenceDays);
    const client: BookClient = {
      member, membership, assignment, plans, logs: mLogs, reviews: by.reviews.get(member.id) ?? [], goals: mGoals, ledger: mLedger, credits, cadenceDays,
      expiring: expiringCredits(mLedger, credits.available, c.today, rules.creditExpiryWarningDays),
      adherence: adherence(plans, mLogs, addDays(c.today, -28), addDays(c.today, -1), c.today),
      lastWorkoutOn: mLogs.filter((l) => l.status === "completed" || l.status === "partial").map((l) => l.scheduledOn).sort().at(-1),
    };
    // A frozen client is not behind and is not waiting on anything.
    if (membership.status === "active") {
      if (!plans.length) {
        const since = assignment.effectiveFrom > membership.startsOn ? assignment.effectiveFrom : membership.startsOn;
        client.awaiting = { daysWaiting: Math.max(0, daysBetween(since, c.today)), planName: membership.terms.name };
      } else {
        const due = reviewDue(client.reviews, plans.map((p) => p.startsOn).sort()[0]!, c.today, cadenceDays);
        client.review = { ...due, reason: reviewReason(due, cadenceDays) };
        const miss = recentMissed(plans, mLogs, membership.freezes, c.today, rules.missedWorkoutsWindowDays);
        if (miss.missed >= rules.missedWorkoutsThreshold) client.missed = miss;
      }
    }
    clients.push(client);
  }
  return { clients, rules, members, memberships, policies };
}
