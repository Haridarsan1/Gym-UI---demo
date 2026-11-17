import { db } from "@/demo/db";
import { weekStart, addDays } from "@/domain/dates";
import { MEMBER_MEASUREMENTS, STRENGTH_METRICS, TARGET_REACHED, goalProgress, strengthSeries, targetReachedAt } from "@/domain/progress";
import type { Goal, Measurement, WorkoutLog } from "@/domain/types";

const MEASURED = new Set<string>(MEMBER_MEASUREMENTS.map((m) => m.kind));
const finished = (l: { status: string }) => l.status === "completed" || l.status === "partial";

/** Where a goal stands now: the latest reading, the best lift, or the recent weekly pace. Unknown metrics have no reading. */
export function currentFor(metric: string, readings: Measurement[], logs: Array<Pick<WorkoutLog, "status" | "scheduledOn" | "entries">>, today: string): number | undefined {
  if (MEASURED.has(metric)) return readings.filter((r) => r.kind === metric && r.value !== undefined && r.measuredOn <= today).sort((a, b) => a.measuredOn.localeCompare(b.measuredOn)).at(-1)?.value;
  const ids = STRENGTH_METRICS[metric];
  if (ids) {
    const loads = [...ids.flatMap((id) => strengthSeries(logs, id).map((p) => p.value)), ...readings.filter((r) => r.kind === "strength_benchmark" && ids.includes(r.exerciseId ?? "")).map((r) => r.value ?? 0)];
    return loads.length ? Math.max(...loads) : undefined;
  }
  if (metric === "sessions_per_week") {
    const thisWeek = weekStart(today);
    const from = addDays(thisWeek, -28);
    const n = logs.filter((l) => finished(l) && l.scheduledOn >= from && l.scheduledOn < thisWeek).length;
    return Math.round((n / 4) * 10) / 10;
  }
  return undefined;
}

/**
 * One rule for every kind of goal (weight, measurement, strength, sessions): when a reading or a workout first reaches an
 * active goal’s target, a “Target reached” note goes into the goal’s history, and the goal stays Active. Only the trainer
 * confirms Achieved, in a review. Returns the goals reached for the first time just now. Run inside the caller’s transaction.
 */
export async function recordTargetsReached(args: { memberId: string; userId: string; nowIso: string; today: string; readings: Measurement[]; logs: Array<Pick<WorkoutLog, "status" | "scheduledOn" | "entries">>; describe: (g: Goal, current: number) => string; only?: (g: Goal) => boolean }): Promise<Goal[]> {
  const { memberId, userId, nowIso, today, readings, logs, describe, only } = args;
  const reached: Goal[] = [];
  for (const g of (await db.goals.where("memberId").equals(memberId).toArray()).filter((x) => x.status === "active" && !targetReachedAt(x.history) && (!only || only(x)))) {
    const current = currentFor(g.metric, readings, logs, today);
    if (current === undefined || !goalProgress(g, current).reached) continue;
    const updated = { ...g, history: [...g.history, { at: nowIso, by: userId, note: `${TARGET_REACHED} ${describe(g, current)}` }] };
    await db.goals.update(g.id, { history: updated.history });
    reached.push(updated);
  }
  return reached;
}
