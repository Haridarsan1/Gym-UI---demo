import type { ProgressData } from "@/api";
import { formatValue } from "@/design/charts/scale";
import { completionTotals, pointsFor, summarize } from "@/domain/progress";
import type { Range } from "@/features/member/progress/Charts";

/** The four figures that say how things are going, before any chart. Each follows the date range; a missing figure is “–”. */
export function KeyStats({ data, range }: { data: ProgressData; range: Range }) {
  const weight = summarize(pointsFor(data.measurements, "weight", range.from, range.to));
  const done = completionTotals(data.completion.slice(range.firstWeek));
  const visits = data.attendance.slice(range.firstWeek).filter((v): v is number => v !== null);
  const average = visits.length ? Math.round((visits.reduce((n, v) => n + v, 0) / visits.length) * 10) / 10 : null;
  const records = data.records.filter((r) => r.date >= range.from);
  const exercises = new Set(records.map((r) => r.exerciseId)).size;
  const tiles: Array<{ label: string; value: string; unit?: string; note: string }> = [
    {
      label: "Weight",
      value: weight ? formatValue(weight.latest.value, 1) : "–",
      unit: weight ? "kg" : undefined,
      note: weight ? (weight.change === 0 || weight.count === 1 ? "No change in this range" : `${weight.change < 0 ? "Down" : "Up"} ${formatValue(Math.abs(weight.change), 1)} kg in this range`) : "No entries in this range",
    },
    { label: "Workouts completed", value: done.completionRate === null ? "–" : `${Math.round(done.completionRate * 100)}`, unit: done.completionRate === null ? undefined : "%", note: done.scheduled ? `${done.completed} of ${done.scheduled} scheduled` : "None scheduled yet" },
    { label: "Visits", value: average === null ? "–" : formatValue(average, 1), unit: average === null ? undefined : "a week", note: average === null ? "No visits counted" : "On average" },
    { label: "Personal records", value: String(records.length), note: records.length ? `Across ${exercises} ${exercises === 1 ? "exercise" : "exercises"}` : "None set in this range" },
  ];
  return (
    <section aria-label="Key stats">
      <dl className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="clay-flat p-4">
            <dt className="text-sm font-semibold text-clay-muted">{t.label}</dt>
            <dd className="mt-1 font-display text-4xl font-extrabold leading-none">
              {t.value}
              {t.unit && <span className="ml-1 font-sans text-sm font-semibold text-clay-muted">{t.unit}</span>}
            </dd>
            <dd className="mt-1 text-sm text-clay-muted">{t.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
