import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { ApiError } from "@/api/errors";
import { openMember } from "@/api/member";
import { BADGES, earnedBadges, type BadgeKey } from "@/domain/badges";
import { weekStart } from "@/domain/dates";
import { detectPRs, streakWeeks, volumeKg, weekStats } from "@/domain/metrics";
import type { BadgeAward, WorkoutLog } from "@/domain/types";
import { progress, type Progress } from "@/domain/workout";
import type { Session } from "@/app/session";

const finished = (l: WorkoutLog) => l.status !== "draft";
const byTime = (a: WorkoutLog, b: WorkoutLog) => (a.completedAt ?? a.scheduledOn).localeCompare(b.completedAt ?? b.scheduledOn);

/** Everything the badge rules and the streak need, worked out from the member’s own records. */
async function loadFacts(memberId: string, tenantId: string, today: string) {
  const [versions, memberships, goals, checkIns, policy] = await Promise.all([
    db.workoutPlanVersions.where("memberId").equals(memberId).toArray(),
    db.memberships.where("memberId").equals(memberId).toArray(),
    db.goals.where("memberId").equals(memberId).toArray(),
    db.checkIns.where("memberId").equals(memberId).toArray(),
    db.gymPolicies.where("tenantId").equals(tenantId).first(),
  ]);
  const published = versions.filter((v) => v.status === "published").sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const freezes = memberships.flatMap((m) => m.freezes);
  const threshold = policy?.streakThresholdPercent ?? 75;
  const monday = weekStart(today);
  const streakFor = (subset: WorkoutLog[]) => (published.length ? streakWeeks(weekStats(published, subset, freezes, published[0]!.startsOn, today), threshold, monday) : 0);
  const weekFor = (subset: WorkoutLog[]) => {
    const w = published.length ? weekStats(published, subset, freezes, published[0]!.startsOn, today).find((x) => x.weekStart === monday) : undefined;
    return { planned: w?.planned ?? 0, done: w?.done ?? 0, paused: !!w?.frozen };
  };
  const recordsIn = (all: WorkoutLog[]) => {
    const ordered = all.filter((l) => finished(l) && l.status !== "skipped").sort(byTime);
    return ordered.reduce((n, l, i) => n + detectPRs(ordered.slice(0, i), l).length, 0);
  };
  return { published, streakFor, weekFor, recordsIn, goalsAchieved: goals.filter((g) => g.status === "achieved").length, checkIns: checkIns.length };
}

/**
 * Awards the badges this workout earned. Run inside the submit transaction: a badge is awarded once, so a repeated submit
 * finds it already there and awards nothing. Badges are never taken away.
 */
export async function awardBadges(args: { memberId: string; tenantId: string; today: string; nowIso: string; log: WorkoutLog }): Promise<BadgeKey[]> {
  const { memberId, tenantId, today, nowIso, log } = args;
  if (log.status === "skipped") return [];
  const logs = (await db.workoutLogs.where("memberId").equals(memberId).toArray()).filter(finished);
  const f = await loadFacts(memberId, tenantId, today);
  const have = new Set((await db.badgeAwards.where("memberId").equals(memberId).toArray()).map((b) => b.badge));
  const fresh = earnedBadges({
    completedWorkouts: logs.filter((l) => l.status === "completed").length, personalRecords: f.recordsIn(logs), streakWeeks: f.streakFor(logs), goalsAchieved: f.goalsAchieved, checkIns: f.checkIns,
  }).filter((b) => !have.has(b));
  const rows: BadgeAward[] = fresh.map((badge) => ({ id: `bd_${memberId}_${badge}`, tenantId, memberId, badge, awardedAt: nowIso, workoutLogId: log.id }));
  if (rows.length) await db.badgeAwards.bulkPut(rows);
  return fresh;
}

export interface WorkoutSummary {
  date: string;
  title: string;
  status: Exclude<WorkoutLog["status"], "draft">;
  progress: Progress;
  volumeKg: number;
  records: Array<{ exerciseId: string; name: string; loadKg: number; previousKg: number }>;
  week: { planned: number; before: number; after: number; paused: boolean };
  streak: { before: number; after: number };
  badges: Array<{ key: BadgeKey; label: string; description: string }>;
  effort?: number;
  recovery?: number;
}

/** What the complete screen celebrates: the result, the volume, new records, the week and streak, and badges earned by this workout. */
export async function getWorkoutSummary(session: Session | null, date: string): Promise<WorkoutSummary> {
  const c = await openMember(session);
  assertCan(c.principal, "workoutlog.read", c.resource);
  assertCan(c.principal, "workoutplan.read", c.resource);
  const logs = await db.workoutLogs.where("memberId").equals(c.memberId).toArray();
  const log = logs.find((l) => l.scheduledOn === date);
  if (!log || !finished(log)) throw new ApiError("not_found", "There is no finished workout on this day. Finish a workout and its summary appears here.");
  const version = await db.workoutPlanVersions.get(log.planVersionId);
  const day = version?.days.find((d) => d.weekIndex === log.weekIndex && d.dayIndex === log.dayIndex);
  const done = logs.filter(finished);
  const others = done.filter((l) => l.id !== log.id);
  const earlier = others.filter((l) => l.status !== "skipped" && byTime(l, log) < 0);
  const f = await loadFacts(c.memberId, c.tenantId, c.today);
  const names = new Map((await db.exercises.bulkGet([...new Set(log.entries.map((e) => e.exerciseId))])).filter((e): e is NonNullable<typeof e> => !!e).map((e) => [e.id, e.name]));
  const awards = (await db.badgeAwards.where("memberId").equals(c.memberId).toArray()).filter((b) => b.workoutLogId === log.id);
  const after = f.weekFor(done);
  const before = f.weekFor(others);
  return {
    date, title: day?.title ?? "Workout", status: log.status as WorkoutSummary["status"],
    progress: day ? progress(day, log.entries) : { total: 0, done: 0, skipped: 0, open: 0 },
    volumeKg: volumeKg(log),
    records: log.status === "skipped" ? [] : detectPRs(earlier, log).map((r) => ({ ...r, name: names.get(r.exerciseId) ?? "Exercise" })),
    week: { planned: after.planned, before: before.done, after: after.done, paused: after.paused },
    streak: { before: f.streakFor(others), after: f.streakFor(done) },
    badges: awards.map((a) => ({ key: a.badge, label: BADGES[a.badge].label, description: BADGES[a.badge].description })),
    effort: log.effort, recovery: log.feedback?.recovery,
  };
}

const FeedbackInput = z.object({ date: z.string(), effort: z.number().int().min(1).max(10).optional(), recovery: z.number().int().min(1).max(5).optional() });
export type FeedbackInput = z.input<typeof FeedbackInput>;

/** Saves how hard the workout felt and how recovered the member feels (P04). Both are optional and can be changed. */
export async function saveWorkoutFeedback(session: Session | null, raw: FeedbackInput): Promise<void> {
  const parsed = FeedbackInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Choose a number from the scale.");
  const input = parsed.data;
  const c = await openMember(session);
  assertCan(c.principal, "workoutlog.write", c.resource);
  await db.transaction("rw", db.workoutLogs, async () => {
    const log = await db.workoutLogs.where("memberId").equals(c.memberId).and((l) => l.scheduledOn === input.date).first();
    if (!log || !finished(log)) throw new ApiError("not_found", "There is no finished workout on this day.");
    await db.workoutLogs.update(log.id, {
      ...(input.effort !== undefined ? { effort: input.effort } : {}),
      ...(input.recovery !== undefined ? { feedback: { ...log.feedback, recovery: input.recovery } } : {}),
    });
  });
}

