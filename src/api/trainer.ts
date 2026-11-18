import { db } from "@/demo/db";
import { assertCan, open } from "@/api/context";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { creditBalance } from "@/domain/credits";
import { daysBetween, istDateOf, todayIST } from "@/domain/dates";
import { assignmentOn, currentMembership } from "@/domain/membership";
import { expiringCredits, recentMissed, reviewCadenceFor, reviewDue, sessionPhases, TRAINER_POLICY_DEFAULTS, type SessionPhase } from "@/domain/trainerToday";
import type { Principal } from "@/domain/permissions";
import type { Session } from "@/app/session";

/**
 * Everything the trainer app reads goes through this file. Each function opens the call, checks that the caller is a
 * trainer, and returns only the clients assigned to them today (their open `TrainerAssignment`). The decisions about what
 * counts as overdue, missed or expiring are in `domain/trainerToday.ts`.
 */

export interface TrainerContext {
  principal: Principal;
  trainerId: string;
  tenantId: string;
  today: string;
  nowIso: string;
}

export async function openTrainer(session: Session | null): Promise<TrainerContext> {
  const { principal } = await open(session);
  if (principal.role !== "trainer" || !principal.tenantId) throw new ApiError("forbidden", "This screen is for trainers. Log in with a trainer account.");
  assertCan(principal, "member.list");
  const clock = now();
  return { principal, trainerId: principal.userId, tenantId: principal.tenantId, today: todayIST(clock), nowIso: clock.toISOString() };
}

export interface ClientRef {
  memberId: string;
  name: string;
}
export interface SessionItem extends ClientRef {
  id: string;
  startsAt: string;
  endsAt: string;
  branchName: string;
  status: "booked" | "attended" | "no_show";
  phase: SessionPhase;
}
export interface OverdueReview extends ClientRef {
  dueOn: string;
  daysOver: number;
  /** In words: “Follow-up date has passed”, “Reviewed every 14 days”, “No review yet”. */
  reason: string;
}
export interface MissedItem extends ClientRef {
  missed: number;
  scheduled: number;
  lastMissedOn?: string;
  lastDoneOn?: string;
}
export interface ExpiringItem extends ClientRef {
  credits: number;
  expiresOn: string;
  daysLeft: number;
}
export interface AwaitingItem extends ClientRef {
  /** Days since the trainer was assigned or the membership began, whichever is later. */
  daysWaiting: number;
  planName: string;
}

export interface TrainerTodayData {
  firstName: string;
  gymName: string;
  today: string;
  nowIso: string;
  /** Clients with an active or frozen membership. */
  clients: number;
  sessions: SessionItem[];
  overdueReviews: OverdueReview[];
  missed: MissedItem[];
  expiring: ExpiringItem[];
  awaitingPlan: AwaitingItem[];
}



/** T07: the trainer’s dashboard. */
export async function getTrainerToday(session: Session | null): Promise<TrainerTodayData> {
  const c = await openTrainer(session);
  const [user, tenant, assignments, members, memberships, versions, logs, reviews, ledger, bookings, branches, goals, policies] = await Promise.all([
    db.users.get(c.trainerId),
    db.tenants.get(c.tenantId),
    db.trainerAssignments.where("trainerId").equals(c.trainerId).toArray(),
    db.members.where("tenantId").equals(c.tenantId).toArray(),
    db.memberships.where("tenantId").equals(c.tenantId).toArray(),
    db.workoutPlanVersions.where("tenantId").equals(c.tenantId).toArray(),
    db.workoutLogs.where("tenantId").equals(c.tenantId).toArray(),
    db.trainerReviews.where("tenantId").equals(c.tenantId).toArray(),
    db.creditLedger.where("tenantId").equals(c.tenantId).toArray(),
    db.bookings.where("trainerId").equals(c.trainerId).toArray(),
    db.branches.where("tenantId").equals(c.tenantId).toArray(),
    db.goals.where("tenantId").equals(c.tenantId).toArray(),
    db.gymPolicies.where("tenantId").equals(c.tenantId).first(),
  ]);
  // The gym’s rules for what counts as overdue, missed and expiring (GymPolicies, set by the owner in M4).
  const rules = { ...TRAINER_POLICY_DEFAULTS, ...policies };
  const group = <T extends { memberId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) map.set(r.memberId, [...(map.get(r.memberId) ?? []), r]);
    return map;
  };
  const byMember = { ms: group(memberships), plans: group(versions.filter((v) => v.status === "published")), logs: group(logs), reviews: group(reviews), ledger: group(ledger), goals: group(goals), assignments: group(assignments) };
  const memberById = new Map(members.map((m) => [m.id, m]));
  const out: TrainerTodayData = {
    firstName: (user?.name ?? c.principal.userId).split(" ")[0]!, gymName: tenant?.name ?? "Your gym", today: c.today, nowIso: c.nowIso,
    clients: 0, sessions: [], overdueReviews: [], missed: [], expiring: [], awaitingPlan: [],
  };

  for (const m of members) {
    if (m.archivedAt) continue;
    const a = assignmentOn(byMember.assignments.get(m.id) ?? [], c.today);
    if (!a || a.trainerId !== c.trainerId) continue;
    const ms = currentMembership(byMember.ms.get(m.id) ?? []);
    if (!ms || (ms.status !== "active" && ms.status !== "frozen")) continue;
    out.clients++;
    const ref: ClientRef = { memberId: m.id, name: m.name };
    const plans = byMember.plans.get(m.id) ?? [];

    const balance = creditBalance(byMember.ledger.get(m.id) ?? []);
    const exp = expiringCredits(byMember.ledger.get(m.id) ?? [], balance.available, c.today, rules.creditExpiryWarningDays);
    if (exp) out.expiring.push({ ...ref, ...exp });

    if (ms.status !== "active") continue; // a frozen client is not behind, and is not waiting on anything
    if (!plans.length) {
      const since = a.effectiveFrom > ms.startsOn ? a.effectiveFrom : ms.startsOn;
      out.awaitingPlan.push({ ...ref, daysWaiting: Math.max(0, daysBetween(since, c.today)), planName: ms.terms.name });
      continue;
    }
    // A client is reviewed on the cadence their goals set (T02), or the gym’s default when none does.
    const cadence = reviewCadenceFor(byMember.goals.get(m.id) ?? [], rules.reviewCadenceDays);
    const due = reviewDue(byMember.reviews.get(m.id) ?? [], plans.map((p) => p.startsOn).sort()[0]!, c.today, cadence);
    const reason = due.why === "follow-up" ? "Follow-up date has passed" : due.why === "cadence" ? `Reviewed every ${cadence} days` : "No review yet";
    if (due.overdue) out.overdueReviews.push({ ...ref, dueOn: due.dueOn, daysOver: due.daysOver, reason });
    const miss = recentMissed(plans, byMember.logs.get(m.id) ?? [], ms.freezes, c.today, rules.missedWorkoutsWindowDays);
    if (miss.missed >= rules.missedWorkoutsThreshold) out.missed.push({ ...ref, missed: miss.missed, scheduled: miss.scheduled, lastMissedOn: miss.lastMissedOn, lastDoneOn: miss.lastDoneOn });
  }

  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const todays = bookings.filter((b) => b.kind === "pt_session" && b.status !== "canceled" && istDateOf(b.startsAt) === c.today).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  const phases = sessionPhases(todays.map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt, status: b.status as "booked" | "attended" | "no_show" })), c.nowIso);
  out.sessions = todays.map((b, i) => ({
    id: b.id, memberId: b.memberId, name: memberById.get(b.memberId)?.name ?? "Client", startsAt: b.startsAt, endsAt: b.endsAt, branchName: branchName.get(b.branchId) ?? "",
    status: b.status as SessionItem["status"], phase: phases[i]!,
  }));

  out.overdueReviews.sort((x, y) => y.daysOver - x.daysOver || x.name.localeCompare(y.name));
  out.missed.sort((x, y) => y.missed - x.missed || x.name.localeCompare(y.name));
  out.expiring.sort((x, y) => x.daysLeft - y.daysLeft || x.name.localeCompare(y.name));
  out.awaitingPlan.sort((x, y) => y.daysWaiting - x.daysWaiting || x.name.localeCompare(y.name));
  return out;
}
