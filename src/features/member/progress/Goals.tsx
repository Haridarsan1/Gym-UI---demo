import { Check } from "lucide-react";
import type { GoalView } from "@/api";
import { formatValue } from "@/design/charts/scale";
import { GOAL_STATUS_WORDS } from "@/domain/progress";
import { formatDate, formatDayMonth } from "@/lib/when";

const num = (v: number | undefined, unit: string) => (v === undefined ? "–" : `${formatValue(v, 1)} ${unit}`);

function dateLine(g: GoalView): string {
  if (g.status === "achieved") return g.achievedOn ? `Achieved on ${formatDate(g.achievedOn)}.` : "Achieved.";
  if (g.status === "closed" || g.status === "revised") return `Target date was ${formatDate(g.targetDate)}.`;
  if (g.daysLeft < 0) return `Target date ${formatDate(g.targetDate)} passed ${-g.daysLeft} ${g.daysLeft === -1 ? "day" : "days"} ago. Talk to your trainer about it.`;
  if (g.daysLeft === 0) return `Target date is today, ${formatDate(g.targetDate)}.`;
  return `By ${formatDate(g.targetDate)}, ${g.daysLeft} ${g.daysLeft === 1 ? "day" : "days"} to go.`;
}

/** Goals with a bar towards the target, the target date and the status in words (P04). Status is never shown by colour alone. */
export function Goals({ goals }: { goals: GoalView[] }) {
  return (
    <section aria-labelledby="goals-title" className="clay p-5">
      <h2 id="goals-title" className="text-lg font-bold">Goals</h2>
      <p className="text-sm text-clay-muted">Set with your trainer. Your readings and workouts move the bar, and your trainer confirms when a goal is achieved.</p>
      {goals.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-clay-lavender px-4 py-4 text-[0.95rem]">No goals yet. Your trainer sets goals with you at your assessment, and they appear here with a bar towards each target.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {goals.map((g) => {
            const pct = g.fraction === null ? null : Math.round(g.fraction * 100);
            const done = g.status === "achieved";
            return (
              <li key={g.id} className="clay-flat p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-bold leading-snug">{g.title}</h3>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${done ? "bg-status-active-bg text-status-active-fg" : g.status === "active" ? "bg-ember-100 text-ember-800" : "bg-status-expired-bg text-status-expired-fg"}`}>
                    {done && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {GOAL_STATUS_WORDS[g.status]}
                  </span>
                </div>
                {pct === null ? (
                  <p className="mt-2 text-sm text-clay-muted">Your trainer tracks this one. Target {num(g.target, g.unit)}.</p>
                ) : (
                  <>
                    <div role="progressbar" aria-label={`${g.title}, progress towards ${num(g.target, g.unit)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct} percent`} className="mt-3 h-3 overflow-hidden rounded-full bg-ember-100">
                      <div className={`h-full rounded-full ${done ? "bg-mint-500" : "bg-ember-650"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-sm text-clay-muted">
                      {pct}% of the way. Started at {num(g.baseline, g.unit)}, now {num(g.current, g.unit)}, target {num(g.target, g.unit)}.
                    </p>
                  </>
                )}
                {g.targetReachedOn && (
                  <p className="mt-2 flex items-start gap-2 rounded-xl bg-mint-100 px-3 py-2 text-sm font-semibold text-mint-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Target reached on {formatDate(g.targetReachedOn)}. Your trainer will confirm it at your next review.</span>
                  </p>
                )}
                <p className="mt-1 text-sm text-clay-muted">{dateLine(g)}</p>
                {g.history.length > 1 && (
                  <details className="mt-1">
                    <summary className="flex min-h-[2.75rem] cursor-pointer items-center text-sm font-semibold">History</summary>
                    <ul className="space-y-1 pb-1 text-sm text-clay-muted">
                      {g.history.map((h, i) => (
                        <li key={i}>{formatDayMonth(h.date)}: {h.note}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
