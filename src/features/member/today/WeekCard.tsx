import type { TodayData } from "@/api/member";
import { Ring } from "@/design/Ring";
import { StreakFlame } from "@/design/StreakFlame";
import { DayStrip } from "@/features/member/today/DayStrip";

/** This week: the seven days, the ring and the streak. The streak counts weeks, so there is no daily guilt. */
export function WeekCard({ t, part = "both" }: { t: TodayData; part?: "both" | "strip" | "streak" }) {
  const { planned, done } = t.week;
  const need = Math.ceil((planned * t.streakThresholdPercent) / 100);
  const message = t.streakPaused
    ? "Nothing counts as missed while your membership is frozen."
    : planned === 0
      ? "No workouts are planned this week."
      : done >= need
        ? "You have done enough this week to keep your streak."
        : `${need - done} more ${need - done === 1 ? "workout" : "workouts"} to keep your streak.`;
  const strip = <DayStrip days={t.weekDays} />;
  const streak = (
    <div className="flex items-center gap-5">
      <Ring value={!t.streakPaused && planned ? done / planned : 0} label={t.streakPaused ? "Workouts are paused while your membership is frozen" : planned ? `${done} of ${planned} workouts done this week` : "No workouts planned this week"}>
        <span className="font-display text-3xl font-extrabold tabular">{!t.streakPaused && planned ? `${done}/${planned}` : "–"}</span>
      </Ring>
      <div className="min-w-0 flex-1 space-y-2">
        <StreakFlame weeks={t.streakWeeks} paused={t.streakPaused} />
        <p className="text-sm text-clay-muted">{message}</p>
      </div>
    </div>
  );
  return (
    <section aria-labelledby={part === "streak" ? "streak-title" : "week-title"} className="clay p-5">
      <h2 id={part === "streak" ? "streak-title" : "week-title"} className="text-lg font-bold">{part === "streak" ? "Your week and streak" : "This week"}</h2>
      {part !== "streak" && strip}
      {part === "both" && <div className="mt-4">{streak}</div>}
      {part === "streak" && <div className="mt-4">{streak}</div>}
    </section>
  );
}
