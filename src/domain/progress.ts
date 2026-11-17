import { addDays, daysBetween, weekStart } from "@/domain/dates";
import { adherence, detectPRs, volumeKg, type Adherence } from "@/domain/metrics";
import type { Goal, Measurement, WorkoutLog, WorkoutPlanVersion } from "@/domain/types";
import { bestSet } from "@/domain/workout";

/**
 * Rules behind the Progress screen (P01 to P04, T06). Everything here is a pure function, so the definitions are tested apart
 * from the screen. A missing figure is `null` and is drawn as a gap, never as zero (P03).
 */

// ── Date ranges ─────────────────────────────────────────────────────────────────────────────────

export type RangeKey = "4w" | "12w" | "26w" | "all";
export const RANGES: Array<{ key: RangeKey; label: string; weeks: number | null }> = [
  { key: "4w", label: "4 weeks", weeks: 4 },
  { key: "12w", label: "12 weeks", weeks: 12 },
  { key: "26w", label: "6 months", weeks: 26 },
  { key: "all", label: "All time", weeks: null },
];

/** The Monday a range starts on. Ranges are whole weeks ending with the current week, so weekly charts and totals line up. */
export function rangeStart(key: RangeKey, today: string, earliest: string): string {
  const weeks = RANGES.find((r) => r.key === key)?.weeks;
  const thisWeek = weekStart(today);
  if (weeks === null || weeks === undefined) return weekStart(earliest) < thisWeek ? weekStart(earliest) : thisWeek;
  const start = addDays(thisWeek, -7 * (weeks - 1));
  return start;
}

/** Every Monday from `from` to the current week. */
export function weekList(from: string, today: string): string[] {
  const out: string[] = [];
  for (let w = weekStart(from); w <= weekStart(today); w = addDays(w, 7)) out.push(w);
  return out;
}

// ── Measurements (P01) ──────────────────────────────────────────────────────────────────────────

export const MEMBER_MEASUREMENTS = [
  { kind: "weight", label: "Weight", unit: "kg", min: 20, max: 300 },
  { kind: "waist", label: "Waist", unit: "cm", min: 30, max: 250 },
  { kind: "chest", label: "Chest", unit: "cm", min: 30, max: 250 },
  { kind: "hips", label: "Hips", unit: "cm", min: 30, max: 250 },
  { kind: "arm", label: "Arm", unit: "cm", min: 10, max: 100 },
  { kind: "thigh", label: "Thigh", unit: "cm", min: 20, max: 150 },
  { kind: "body_fat", label: "Body fat", unit: "%", min: 2, max: 70 },
] as const;
export type MemberMeasurementKind = (typeof MEMBER_MEASUREMENTS)[number]["kind"];

export const measurementInfo = (kind: string) => MEMBER_MEASUREMENTS.find((m) => m.kind === kind);

/** What is wrong with a value a member typed, in words that say how to fix it, or nothing when it is fine. */
export function measurementError(kind: MemberMeasurementKind, value: number | undefined): string | undefined {
  const m = measurementInfo(kind)!;
  if (value === undefined || Number.isNaN(value)) return `Enter your ${m.label.toLowerCase()} as a number, for example ${kind === "weight" ? "72.5" : kind === "body_fat" ? "22" : "84"}.`;
  if (value < m.min || value > m.max) return `Enter a ${m.label.toLowerCase()} between ${m.min} and ${m.max} ${m.unit}.`;
  return undefined;
}

/**
 * The readings that count. A correction is a new row that points at the one it replaces (P01), so the old row stays in the
 * history but is left out of charts and totals.
 */
export function effectiveMeasurements<T extends Pick<Measurement, "id" | "corrects">>(rows: T[]): T[] {
  const replaced = new Set(rows.map((r) => r.corrects).filter((x): x is string => !!x));
  return rows.filter((r) => !replaced.has(r.id));
}

export interface Point {
  date: string;
  value: number;
}

export function pointsFor(rows: Array<{ kind: string; value?: number; measuredOn: string }>, kind: string, from: string, to: string): Point[] {
  return rows
    .filter((r) => r.kind === kind && r.value !== undefined && r.measuredOn >= from && r.measuredOn <= to)
    .map((r) => ({ date: r.measuredOn, value: r.value! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface Summary {
  baseline: Point;
  latest: Point;
  /** latest minus baseline. */
  change: number;
  count: number;
}

/** Baseline is the first reading in the range, latest the last, and change the difference. Nothing in the range gives nothing. */
export function summarize(points: Point[]): Summary | null {
  if (!points.length) return null;
  const baseline = points[0]!;
  const latest = points.at(-1)!;
  return { baseline, latest, change: Math.round((latest.value - baseline.value) * 100) / 100, count: points.length };
}

/**
 * Splits a series where the gap between two readings is longer than `maxGapDays`, so the chart shows a gap instead of
 * a line drawn across weeks with no data.
 */
export function segments(points: Point[], maxGapDays: number): Point[][] {
  const out: Point[][] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && daysBetween(last.at(-1)!.date, p.date) <= maxGapDays) last.push(p);
    else out.push([p]);
  }
  return out;
}

// ── Strength (P02) ──────────────────────────────────────────────────────────────────────────────

const finished = (l: Pick<WorkoutLog, "status">) => l.status === "completed" || l.status === "partial";

export interface StrengthPoint extends Point {
  reps?: number;
}

/** The best set (heaviest, then most reps) for an exercise in each finished workout. A swapped exercise counts as itself. */
export function strengthSeries(logs: Array<Pick<WorkoutLog, "status" | "scheduledOn" | "entries">>, exerciseId: string): StrengthPoint[] {
  const out: StrengthPoint[] = [];
  for (const l of [...logs].sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn))) {
    if (!finished(l)) continue;
    const sets = l.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets).filter((s) => s.loadKg && s.reps);
    const best = bestSet(sets);
    if (best?.loadKg) out.push({ date: l.scheduledOn, value: best.loadKg, reps: best.reps });
  }
  return out;
}

/** Exercises that have been lifted with a load, the most often done first. */
export function loadedExercises(logs: Array<Pick<WorkoutLog, "status" | "entries">>): string[] {
  const count = new Map<string, number>();
  for (const l of logs.filter(finished)) {
    for (const id of new Set(l.entries.filter((e) => e.sets.some((s) => !s.skipped && s.loadKg && s.reps)).map((e) => e.exerciseId))) count.set(id, (count.get(id) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
}

// ── Volume, attendance and completion, by week (P02, P03) ───────────────────────────────────────

/**
 * Comparable volume per week: the sum of load × completed reps (P02). A week with no finished workout, or none that included
 * the chosen exercise, is `null` (a gap), not zero.
 */
export function weeklyVolume(logs: Array<Pick<WorkoutLog, "status" | "scheduledOn" | "entries">>, weeks: string[], exerciseId?: string): Array<number | null> {
  return weeks.map((w) => {
    const inWeek = logs.filter((l) => finished(l) && weekStart(l.scheduledOn) === w);
    if (!inWeek.length) return null;
    const parts = inWeek.map((l) => ({ entries: exerciseId ? l.entries.filter((e) => e.exerciseId === exerciseId) : l.entries }));
    if (exerciseId && parts.every((p) => p.entries.length === 0)) return null;
    return Math.round(parts.reduce((n, p) => n + volumeKg(p), 0));
  });
}

/**
 * Visits per week from allowed check-ins. Weeks before the member’s first membership, and weeks of a freeze, are gaps:
 * nothing was expected of them. Any other week with no visit is a real 0.
 */
export function weeklyAttendance(checkInDates: string[], weeks: string[], firstWeek: string, frozenWeeks: ReadonlySet<string>): Array<number | null> {
  return weeks.map((w) => {
    if (w < firstWeek || frozenWeeks.has(w)) return null;
    return checkInDates.filter((d) => weekStart(d) === w).length;
  });
}

export interface WeekCompletion extends Adherence {
  weekStart: string;
}

/** P03 for each week: completed against the scheduled workouts whose dates have passed, with partial, skipped and not logged counted apart. */
export function weeklyCompletion(versions: WorkoutPlanVersion[], logs: WorkoutLog[], weeks: string[], today: string): WeekCompletion[] {
  return weeks.map((w) => ({ weekStart: w, ...adherence(versions, logs, w, addDays(w, 6), today) }));
}

/** Totals over a run of weeks. The rate is completed / scheduled, and empty (never 0) when nothing was scheduled. */
export function completionTotals(weeks: Adherence[]): Adherence {
  const t = weeks.reduce((n, w) => ({ scheduled: n.scheduled + w.scheduled, completed: n.completed + w.completed, partial: n.partial + w.partial, skipped: n.skipped + w.skipped, missed: n.missed + w.missed, extra: n.extra + w.extra }), { scheduled: 0, completed: 0, partial: 0, skipped: 0, missed: 0, extra: 0 });
  return { ...t, completionRate: t.scheduled ? t.completed / t.scheduled : null };
}

// ── Personal records (P02) ──────────────────────────────────────────────────────────────────────

export interface RecordEntry {
  exerciseId: string;
  loadKg: number;
  previousKg: number;
  date: string;
  logId: string;
}

/**
 * Every personal record the member has set, newest first. A record is the heaviest load ever lifted for an exercise; the
 * first time an exercise is logged sets the baseline and is not a record (same rule as the workout summary).
 */
export function recordTimeline(logs: WorkoutLog[]): RecordEntry[] {
  const ordered = logs.filter(finished).sort((a, b) => (a.completedAt ?? a.scheduledOn).localeCompare(b.completedAt ?? b.scheduledOn));
  const perWorkout = ordered.map((l, i) => detectPRs(ordered.slice(0, i), l).map((r): RecordEntry => ({ ...r, date: l.scheduledOn, logId: l.id })));
  return perWorkout.reverse().flat();
}

// ── Goals (P04) ─────────────────────────────────────────────────────────────────────────────────

export const GOAL_STATUS_WORDS: Record<Goal["status"], string> = { active: "Active", achieved: "Achieved", revised: "Revised", closed: "Closed" };

export interface GoalProgress {
  /** 0 to 1, or null when there is no baseline or no reading to measure against. */
  fraction: number | null;
  /** The current reading meets the target, going the way the goal goes (down for weight loss, up for strength). */
  reached: boolean;
}

export function goalProgress(goal: Pick<Goal, "baseline" | "target">, current: number | undefined): GoalProgress {
  if (current === undefined || goal.baseline === undefined) return { fraction: null, reached: false };
  const span = goal.target - goal.baseline;
  if (span === 0) return { fraction: 1, reached: current === goal.target };
  return { fraction: Math.min(1, Math.max(0, (current - goal.baseline) / span)), reached: span > 0 ? current >= goal.target : current <= goal.target };
}
