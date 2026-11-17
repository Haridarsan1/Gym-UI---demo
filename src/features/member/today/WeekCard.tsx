import type { TodayData } from "@/api/member";
import { Ring } from "@/design/Ring";
import { StreakFlame } from "@/design/StreakFlame";

/** This week’s ring and the streak. The streak counts weeks, so there is no daily guilt. */
export function WeekCard({ t }: { t: TodayData }) {
  const { planned, done } = t.week;
  const need = Math.ceil((planned * t.streakThresholdPercent) / 100);
  const message = t.streakPaused
    ? "Your streak is paused while your membership is frozen."
    : planned === 0
      ? "No workouts are planned this week."
      : done >= need
        ? "You have done enough this week to keep your streak."
        : `${need - done} more ${need - done === 1 ? "workout" : "workouts"} to keep your streak.`;
  return (
    <section aria-labelledby="week-title" className="clay p-5">
      <h2 id="week-title" className="text-xs font-semibold uppercase tracking-wide text-clay-muted">This week</h2>
      <div className="mt-3 flex items-center gap-5">
        <Ring value={!t.streakPaused && planned ? done / planned : 0} label={t.streakPaused ? "Workouts are paused while your membership is frozen" : planned ? `${done} of ${planned} workouts done this week` : "No workouts planned this week"}>
          <span className="font-display text-3xl font-extrabold tabular">{!t.streakPaused && planned ? `${done}/${planned}` : "–"}</span>
        </Ring>
        <div className="min-w-0 flex-1 space-y-3">
          <StreakFlame weeks={t.streakWeeks} paused={t.streakPaused} />
          <p className="text-sm text-clay-muted">{message}</p>
        </div>
      </div>
    </section>
  );
}
