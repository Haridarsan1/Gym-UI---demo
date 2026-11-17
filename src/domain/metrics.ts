import { addDays, daysBetween, eachDay, weekStart } from "@/domain/dates";
import type { Membership, PlanDay, WorkoutLog, WorkoutPlanVersion } from "@/domain/types";

/** Workout logs that are finished. A draft is not a workout yet. */
const final = (l: WorkoutLog) => l.status !== "draft";

export interface Scheduled {
  version: WorkoutPlanVersion;
  day: PlanDay;
  date: string;
}

/** The published plan versions that apply to a member, oldest first. */
const published = (versions: WorkoutPlanVersion[]) => versions.filter((v) => v.status === "published").sort((a, b) => a.startsOn.localeCompare(b.startsOn));

/**
 * What the member’s plan says for one date. The version that started most recently on or before the date governs it,
 * so a new plan replaces the old one from its start date and earlier dates keep their original targets (T06).
 *   "no_plan"  nothing has started yet
 *   "rest"     the plan has no workout that day
 */
export function planFor(versions: WorkoutPlanVersion[], date: string): { state: "no_plan" } | { state: "rest"; version: WorkoutPlanVersion } | ({ state: "workout" } & Scheduled) {
  const governing = published(versions).filter((v) => v.startsOn <= date).at(-1);
  if (!governing) return { state: "no_plan" };
  const day = governing.days.find((d) => d.dayOffset === daysBetween(governing.startsOn, date) && !d.canceled);
  return day ? { state: "workout", version: governing, day, date } : { state: "rest", version: governing };
}

/** Every scheduled (not canceled) workout from `from` to `to`. */
export function scheduledBetween(versions: WorkoutPlanVersion[], from: string, to: string): Scheduled[] {
  const out: Scheduled[] = [];
  for (const date of eachDay(from, to)) {
    const p = planFor(versions, date);
    if (p.state === "workout") out.push({ version: p.version, day: p.day, date });
  }
  return out;
}

/** The next workout after `date`, looking up to 28 days ahead. */
export function nextWorkout(versions: WorkoutPlanVersion[], date: string): Scheduled | undefined {
  return scheduledBetween(versions, addDays(date, 1), addDays(date, 28))[0];
}

export interface Adherence {
  scheduled: number;
  completed: number;
  partial: number;
  skipped: number;
  /** Scheduled, date passed, nothing logged. Shown apart from skipped, because skipping is a choice. */
  missed: number;
  /** Workouts logged on a day with nothing scheduled. Reported next to the scheduled numbers (P03). */
  extra: number;
  /** completed / scheduled, or null when nothing was scheduled. A missing figure is never shown as 0. */
  completionRate: number | null;
}

/**
 * P03: completed workouts against the scheduled workouts whose dates have passed in the period, leaving out canceled
 * prescriptions. Partial and skipped are counted separately. Today counts once it has been logged.
 */
export function adherence(versions: WorkoutPlanVersion[], logs: WorkoutLog[], from: string, to: string, today: string): Adherence {
  const byDate = new Map(logs.filter(final).map((l) => [l.scheduledOn, l]));
  let completed = 0, partial = 0, skipped = 0, missed = 0, scheduled = 0;
  const scheduledDates = new Set<string>();
  for (const s of scheduledBetween(versions, from, to)) {
    scheduledDates.add(s.date);
    const log = byDate.get(s.date);
    if (!log && s.date >= today) continue; // not over yet
    scheduled++;
    if (!log) missed++;
    else if (log.status === "completed") completed++;
    else if (log.status === "partial") partial++;
    else skipped++;
  }
  const extra = logs.filter((l) => final(l) && l.status !== "skipped" && l.scheduledOn >= from && l.scheduledOn <= to && !scheduledDates.has(l.scheduledOn)).length;
  return { scheduled, completed, partial, skipped, missed, extra, completionRate: scheduled ? completed / scheduled : null };
}

/** P02: comparable volume is the sum of load × completed reps, for sets that have both. Skipped sets don’t count. */
export function volumeKg(log: Pick<WorkoutLog, "entries">): number {
  let total = 0;
  for (const e of log.entries) for (const s of e.sets) if (!s.skipped && s.loadKg && s.reps) total += s.loadKg * s.reps;
  return Math.round(total * 10) / 10;
}

export interface PersonalRecord {
  exerciseId: string;
  loadKg: number;
  previousKg: number;
}

/**
 * A personal record is the heaviest load ever lifted for an exercise, in a set that was done. The first time an exercise
 * is logged sets the baseline and is not a record. A substituted exercise is judged as the exercise actually done.
 */
export function detectPRs(before: WorkoutLog[], log: Pick<WorkoutLog, "entries">): PersonalRecord[] {
  const best = new Map<string, number>();
  for (const l of before.filter((x) => final(x) && x.status !== "skipped"))
    for (const e of l.entries) for (const s of e.sets) if (!s.skipped && s.loadKg && s.reps) best.set(e.exerciseId, Math.max(best.get(e.exerciseId) ?? 0, s.loadKg));
  const out: PersonalRecord[] = [];
  for (const e of log.entries) {
    const previous = best.get(e.exerciseId);
    const now = Math.max(0, ...e.sets.filter((s) => !s.skipped && s.loadKg && s.reps).map((s) => s.loadKg!));
    if (previous !== undefined && now > previous) out.push({ exerciseId: e.exerciseId, loadKg: now, previousKg: previous });
  }
  return out;
}

export interface WeekStat {
  weekStart: string;
  planned: number;
  /** Completed or partial. */
  done: number;
  frozen: boolean;
}

/** One entry per week, from the week of `from` to the week of `today`. */
export function weekStats(versions: WorkoutPlanVersion[], logs: WorkoutLog[], freezes: Membership["freezes"], from: string, today: string): WeekStat[] {
  const doneDates = new Set(logs.filter((l) => l.status === "completed" || l.status === "partial").map((l) => l.scheduledOn));
  const out: WeekStat[] = [];
  for (let ws = weekStart(from); ws <= weekStart(today); ws = addDays(ws, 7)) {
    const we = addDays(ws, 6);
    const days = scheduledBetween(versions, ws, we);
    out.push({
      weekStart: ws,
      planned: days.length,
      done: days.filter((d) => doneDates.has(d.date)).length,
      frozen: freezes.some((f) => f.from <= we && (f.to === undefined || f.to >= ws)),
    });
  }
  return out;
}

/**
 * Streak: how many weeks in a row the member did at least `thresholdPercent` of their planned workouts (completed or
 * partial). Weeks with nothing planned, and weeks with a frozen membership, pause the streak instead of breaking it.
 * The week in progress adds to the streak once it reaches the threshold, and never breaks it before it ends.
 */
export function streakWeeks(weeks: WeekStat[], thresholdPercent: number, currentWeekStart: string): number {
  let streak = 0;
  for (const w of [...weeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart))) {
    if (w.weekStart > currentWeekStart) continue;
    if (w.frozen || w.planned === 0) continue;
    if ((w.done / w.planned) * 100 >= thresholdPercent) streak++;
    else if (w.weekStart !== currentWeekStart) break;
  }
  return streak;
}

/**
 * A rough length for a workout, to help a member decide when to start: time under load plus rest between sets, to the
 * nearest five minutes. Sets without a duration are taken as about 40 seconds of work.
 */
export function estimateMinutes(day: Pick<PlanDay, "prescriptions">): number {
  let seconds = 0;
  for (const p of day.prescriptions) seconds += p.sets * (p.durationSec ?? 40) + Math.max(0, p.sets - 1) * (p.restSec ?? 60);
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}
