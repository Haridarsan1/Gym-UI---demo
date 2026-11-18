import { db } from "@/demo/db";
import { assertCan, open } from "@/api/context";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { amountDuePaise, isOverdue } from "@/domain/billing";
import { cancellationDeadline } from "@/domain/booking";
import { creditBalance, type CreditBalance } from "@/domain/credits";
import { addDays, daysBetween, eachDay, todayIST, weekStart } from "@/domain/dates";
import { estimateMinutes, nextWorkout, planFor, scheduledBetween, streakWeeks, weekStats } from "@/domain/metrics";
import { assignmentOn, currentMembership } from "@/domain/membership";
import type { Principal, Resource } from "@/domain/permissions";
import type { Booking, GymPolicies, Membership, TrainerReview, WorkoutLog, WorkoutPlanVersion } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Everything the member app reads goes through this file. Each function opens the call (who is asking), checks that the
 * caller is a member, and returns only that member’s own records. A member can never ask for someone else’s.
 */

export interface MemberContext {
  principal: Principal;
  memberId: string;
  tenantId: string;
  resource: Resource;
  today: string;
  nowIso: string;
}

export async function openMember(session: Session | null): Promise<MemberContext> {
  const { principal } = await open(session);
  if (principal.role !== "member" || !principal.memberId || !principal.tenantId) throw new ApiError("forbidden", "This screen is for members. Log in with a member account.");
  const clock = now();
  return {
    principal, memberId: principal.memberId, tenantId: principal.tenantId, today: todayIST(clock), nowIso: clock.toISOString(),
    resource: { tenantId: principal.tenantId, memberId: principal.memberId },
  };
}

export type WeekDayState = "done" | "partial" | "skipped" | "planned" | "missed" | "rest" | "frozen";

/** One day of this week for the strip on Today: Monday to Sunday. */
export interface WeekDay {
  date: string;
  state: WeekDayState;
  isToday: boolean;
  /** The workout planned for the day, when there is one. */
  title?: string;
}

export interface TodayData {
  firstName: string;
  gymName: string;
  today: string;
  nowIso: string;
  trainerName?: string;
  membership: {
    status: Membership["status"];
    planName: string;
    startsOn: string;
    endsOn?: string;
    /** Days until it ends. Negative once it has ended. */
    daysLeft?: number;
    /** Visit passes: visits still to use. */
    visitsRemaining: number | null;
    frozenUntil?: string;
    /** A renewal already paid for that starts after this membership ends. */
    renewedFrom?: string;
  } | null;
  plan:
    | { state: "no_plan" }
    | { state: "rest"; versionName: string; next?: { date: string; title: string } }
    | {
        state: "workout";
        date: string;
        title: string;
        exerciseCount: number;
        /** The first three main exercises, by name, and how many more there are. */
        exercises: string[];
        moreExercises: number;
        minutes: number;
        weekNumber: number;
        versionNumber: number;
        versionName: string;
        /** When this version of the plan started, and who published it (T06: why the workouts changed). */
        startedOn: string;
        authorName: string;
        /** The plan changed within the last two weeks. */
        newPlan: boolean;
        /** Status of today’s log, when there is one: a draft means the workout was started. */
        logStatus?: WorkoutLog["status"];
      };
  /** This week, Monday to Sunday. */
  week: { planned: number; done: number };
  weekDays: WeekDay[];
  streakWeeks: number;
  /** The share of planned workouts a week needs to count towards the streak (a gym policy). */
  streakThresholdPercent: number;
  streakPaused: boolean;
  credits: CreditBalance;
  nextBooking?: { id: string; startsAt: string; endsAt: string; trainerName: string; branchName: string; freeUntil: string; lateConsumesCredit: boolean };
  newReview?: { id: string; trainerName: string; excerpt: string; createdAt: string };
  /** Money owed on open invoices. */
  dues?: { totalPaise: number; overdue: boolean; overdueDays: number; invoiceNumber: string; invoiceId: string; /** What is still owed on that invoice. */ invoiceDuePaise: number };
}

const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();
const sharedUnread = (r: TrainerReview) => r.kind === "shared_review" && !r.readByMemberAt;

/** What the member sees first: today’s workout or rest day, their week, their sessions, and anything needing attention. */
export async function getToday(session: Session | null): Promise<TodayData> {
  const c = await openMember(session);
  for (const a of ["membership.read", "workoutplan.read", "workoutlog.read", "booking.read", "credits.read", "review.read", "invoice.read"] as const) assertCan(c.principal, a, c.resource);

  const member = await db.members.get(c.memberId);
  if (!member) throw new ApiError("not_found", "We couldn’t find your membership record. Ask the front desk.");
  const [tenant, memberships, assignments, versions, logs, ledger, bookings, reviews, invoices, policies, users, branches] = await Promise.all([
    db.tenants.get(c.tenantId),
    db.memberships.where("memberId").equals(c.memberId).toArray(),
    db.trainerAssignments.where("memberId").equals(c.memberId).toArray(),
    db.workoutPlanVersions.where("memberId").equals(c.memberId).toArray(),
    db.workoutLogs.where("memberId").equals(c.memberId).toArray(),
    db.creditLedger.where("memberId").equals(c.memberId).toArray(),
    db.bookings.where("memberId").equals(c.memberId).toArray(),
    db.trainerReviews.where("memberId").equals(c.memberId).toArray(),
    db.invoices.where("memberId").equals(c.memberId).toArray(),
    db.gymPolicies.where("tenantId").equals(c.tenantId).first(),
    db.users.where("tenantId").equals(c.tenantId).toArray(),
    db.branches.where("tenantId").equals(c.tenantId).toArray(),
  ]);
  const payments = invoices.length ? await db.payments.where("memberId").equals(c.memberId).toArray() : [];
  const policy: Pick<GymPolicies, "cancellationCutoffHours" | "lateCancelConsumesCredit" | "streakThresholdPercent"> = policies ?? { cancellationCutoffHours: 12, lateCancelConsumesCredit: true, streakThresholdPercent: 75 };
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const trainerId = assignmentOn(assignments, c.today)?.trainerId;

  // Membership
  const current = currentMembership(memberships);
  const freeze = current?.freezes.find((f) => f.from <= c.today && (f.to === undefined || f.to >= c.today));
  const membership: TodayData["membership"] = current
    ? {
        status: current.status, planName: current.terms.name, startsOn: current.startsOn, endsOn: current.endsOn, daysLeft: current.endsOn ? daysBetween(c.today, current.endsOn) : undefined,
        visitsRemaining: current.visitsRemaining, frozenUntil: current.status === "frozen" ? freeze?.to : undefined,
        renewedFrom: memberships.filter((m) => m.status === "scheduled" && m.id !== current.id).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0]?.startsOn,
      }
    : null;

  // Today’s plan
  const published = versions.filter((v: WorkoutPlanVersion) => v.status === "published");
  const p = planFor(published, c.today);
  const todaysLog = logs.find((l) => l.scheduledOn === c.today);
  let plan: TodayData["plan"];
  if (p.state === "no_plan") plan = { state: "no_plan" };
  else if (p.state === "rest") {
    const next = nextWorkout(published, c.today);
    plan = { state: "rest", versionName: p.version.name, next: next ? { date: next.date, title: next.day.title } : undefined };
  } else {
    const main = [...p.day.prescriptions].filter((x) => x.section === "main").sort((x, y) => x.order - y.order);
    const named = await db.exercises.bulkGet(main.slice(0, 3).map((x) => x.exerciseId));
    plan = {
      state: "workout", date: c.today, title: p.day.title, exerciseCount: main.length, minutes: estimateMinutes(p.day),
      exercises: named.map((e) => e?.name ?? "Exercise"), moreExercises: Math.max(0, main.length - 3),
      weekNumber: Math.floor(daysBetween(p.version.startsOn, c.today) / 7) + 1, versionNumber: p.version.versionNumber, versionName: p.version.name,
      startedOn: p.version.startsOn, authorName: userName.get(p.version.authorId) ?? "Your trainer",
      newPlan: p.version.versionNumber > 1 && daysBetween(p.version.startsOn, c.today) <= 14, logStatus: todaysLog?.status,
    };
  }

  // This week and the streak
  const monday = weekStart(c.today);
  const freezes = memberships.flatMap((m) => m.freezes);
  const stats = published.length ? weekStats(published, logs, freezes, [...published].sort((x, y) => x.startsOn.localeCompare(y.startsOn))[0]!.startsOn, c.today) : [];
  const thisWeek = stats.find((w) => w.weekStart === monday);

  // The seven days of this week for the strip
  const finalByDate = new Map(logs.filter((l) => l.status !== "draft").map((l) => [l.scheduledOn, l]));
  const planned = new Map(scheduledBetween(published, monday, addDays(monday, 6)).map((x) => [x.date, x.day.title]));
  const frozenOn = (d: string) => freezes.some((f) => f.from <= d && (f.to === undefined || f.to >= d));
  const weekDays: WeekDay[] = eachDay(monday, addDays(monday, 6)).map((date) => {
    const log = finalByDate.get(date);
    const state: WeekDayState = frozenOn(date) ? "frozen" : log ? (log.status === "completed" ? "done" : log.status === "partial" ? "partial" : "skipped") : !planned.has(date) ? "rest" : date < c.today ? "missed" : "planned";
    return { date, state, isToday: date === c.today, title: planned.get(date) };
  });

  // Next booking
  const upcoming = bookings.filter((b: Booking) => b.status === "booked" && b.startsAt > c.nowIso).sort((x, y) => x.startsAt.localeCompare(y.startsAt))[0];
  const newest = reviews.filter(sharedUnread).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
  const open = invoices.filter((i) => i.status === "open" || i.status === "partially_paid").map((i) => ({ i, due: amountDuePaise(i, payments.filter((x) => x.invoiceId === i.id)) })).filter((x) => x.due > 0);
  const oldest = open.sort((x, y) => x.i.dueOn.localeCompare(y.i.dueOn))[0];

  return {
    firstName: member.name.split(" ")[0] ?? member.name, gymName: tenant?.name ?? "Your gym", today: c.today, nowIso: c.nowIso,
    trainerName: trainerId ? userName.get(trainerId) : undefined, membership, plan,
    week: { planned: thisWeek?.planned ?? 0, done: thisWeek?.done ?? 0 }, weekDays,
    streakWeeks: streakWeeks(stats, policy.streakThresholdPercent, monday), streakThresholdPercent: policy.streakThresholdPercent, streakPaused: !!thisWeek?.frozen || membership?.status === "frozen",
    credits: creditBalance(ledger),
    nextBooking: upcoming ? { id: upcoming.id, startsAt: upcoming.startsAt, endsAt: upcoming.endsAt, trainerName: upcoming.trainerId ? userName.get(upcoming.trainerId) ?? "Your trainer" : "Your trainer", branchName: branches.find((b) => b.id === upcoming.branchId)?.name ?? "", freeUntil: cancellationDeadline(upcoming.startsAt, policy.cancellationCutoffHours), lateConsumesCredit: policy.lateCancelConsumesCredit } : undefined,
    newReview: newest ? { id: newest.id, trainerName: userName.get(newest.authorId) ?? "Your trainer", excerpt: firstSentence(newest.body), createdAt: newest.createdAt } : undefined,
    dues: oldest ? { totalPaise: open.reduce((n, x) => n + x.due, 0), overdue: isOverdue(oldest.i, payments.filter((x) => x.invoiceId === oldest.i.id), c.today), overdueDays: Math.max(0, daysBetween(oldest.i.dueOn, c.today)), invoiceNumber: oldest.i.number, invoiceId: oldest.i.id, invoiceDuePaise: oldest.due } : undefined,
  };
}
