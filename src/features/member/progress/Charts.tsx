import { useState } from "react";
import type { ProgressData } from "@/api";
import { BarChart, Legend, LineChart, StackedBars, TableView } from "@/design/charts/Charts";
import { formatValue } from "@/design/charts/scale";
import { MEMBER_MEASUREMENTS, completionTotals, measurementInfo, pointsFor, summarize, type Point } from "@/domain/progress";
import { Chips, MetricCard, NoData, Stats } from "@/features/member/progress/MetricCard";
import { formatDate, formatDayMonth } from "@/lib/when";

export interface Range {
  from: string;
  to: string;
  /** Index of the first week in the range within `data.weeks`. */
  firstWeek: number;
}

const BAR_WEEKS = 52;

/** The weekly series for a range, as points, with gaps left out so baseline and latest are real readings. */
const weekPoints = (weeks: string[], values: Array<number | null>): Point[] => weeks.flatMap((w, i) => (values[i] === null || values[i] === undefined ? [] : [{ date: w, value: values[i]! }]));

function dated(points: Point[], unit: string, decimals = 1) {
  const s = summarize(points);
  return <Stats baseline={s?.baseline} latest={s?.latest} change={s?.change} unit={unit} decimals={decimals} />;
}

export function WeightCard({ data, range, onLog }: { data: ProgressData; range: Range; onLog: () => void }) {
  const points = pointsFor(data.measurements, "weight", range.from, range.to);
  return (
    <MetricCard id="weight-title" title="Weight" hint="Each reading you or your trainer entered." stats={dated(points, "kg")}>
      {points.length ? (
        <>
          <LineChart label="Weight" unit="kg" points={points} from={range.from} to={range.to} maxGapDays={21} />
          <p className="text-xs text-clay-muted">A line breaks where there are more than three weeks between readings.</p>
          <TableView caption="Weight readings" columns={["Date", "Weight (kg)", "Entered by"]} rows={data.measurements.filter((m) => m.kind === "weight" && m.measuredOn >= range.from).map((m) => [formatDate(m.measuredOn), formatValue(m.value, 1), m.by]).reverse()} />
        </>
      ) : (
        <NoData>
          No weight entries in this range. <button type="button" onClick={onLog} className="font-semibold underline underline-offset-4">Log your weight</button> to start the chart.
        </NoData>
      )}
    </MetricCard>
  );
}

export function MeasurementsCard({ data, range, onLog }: { data: ProgressData; range: Range; onLog: () => void }) {
  const kinds = MEMBER_MEASUREMENTS.filter((m) => m.kind !== "weight" && data.measurements.some((r) => r.kind === m.kind));
  const [pick, setPick] = useState<string>();
  const kind = kinds.find((k) => k.kind === pick)?.kind ?? kinds[0]?.kind;
  const info = kind ? measurementInfo(kind)! : undefined;
  const points = kind ? pointsFor(data.measurements, kind, range.from, range.to) : [];
  return (
    <MetricCard id="measure-title" title="Measurements" hint="Waist, chest, hips, arm, thigh and body fat." stats={dated(points, info?.unit ?? "cm")}>
      {kinds.length === 0 ? (
        <NoData>
          No measurements yet. <button type="button" onClick={onLog} className="font-semibold underline underline-offset-4">Log a measurement</button>, or ask your trainer to record one at your next review.
        </NoData>
      ) : (
        <>
          <Chips label="Measurement" value={kind!} options={kinds.map((k) => ({ value: k.kind, label: k.label }))} onChange={setPick} />
          {points.length ? (
            <>
              <LineChart label={info!.label} unit={info!.unit} points={points} from={range.from} to={range.to} maxGapDays={42} />
              <TableView caption={`${info!.label} readings`} columns={["Date", `${info!.label} (${info!.unit})`, "Entered by", "Method"]} rows={data.measurements.filter((m) => m.kind === kind && m.measuredOn >= range.from).map((m) => [formatDate(m.measuredOn), formatValue(m.value, 1), m.by, m.method ?? "–"]).reverse()} />
            </>
          ) : (
            <NoData>No {info!.label.toLowerCase()} entries in this range. Try a longer range.</NoData>
          )}
        </>
      )}
    </MetricCard>
  );
}

export function StrengthCard({ data, range }: { data: ProgressData; range: Range }) {
  const options = data.strength.map((s) => ({ value: s.exerciseId, label: s.name }));
  const [pick, setPick] = useState<string>();
  const current = data.strength.find((s) => s.exerciseId === pick) ?? [...data.strength].sort((a, b) => (b.points.at(-1)?.date ?? "").localeCompare(a.points.at(-1)?.date ?? ""))[0];
  const points = current ? current.points.filter((p) => p.date >= range.from && p.date <= range.to) : [];
  return (
    <MetricCard id="strength-title" title="Strength" hint="The heaviest set in each workout, for one exercise." stats={dated(points, "kg")}>
      {!current ? (
        <NoData>Strength shows here once you log a workout with weights. Finish a workout and your best sets appear.</NoData>
      ) : (
        <>
          <label className="block">
            <span className="text-sm font-semibold text-clay-muted">Exercise</span>
            <select value={current.exerciseId} onChange={(e) => setPick(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-clay-line bg-white px-3 font-semibold">
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {points.length ? (
            <>
              <LineChart label={`${current.name}, best set`} unit="kg" points={points} from={range.from} to={range.to} maxGapDays={28} />
              <TableView caption={`${current.name}, best set in each workout`} columns={["Date", "Load (kg)", "Reps"]} rows={[...points].reverse().map((p) => [formatDate(p.date), formatValue(p.value, 1), p.reps === undefined ? "–" : String(p.reps)])} />
            </>
          ) : (
            <div className="mt-3"><NoData>No {current.name.toLowerCase()} sets in this range. Try a longer range.</NoData></div>
          )}
        </>
      )}
    </MetricCard>
  );
}

export function VolumeCard({ data, range }: { data: ProgressData; range: Range }) {
  const [pick, setPick] = useState("all");
  const weeks = data.weeks.slice(Math.max(range.firstWeek, data.weeks.length - BAR_WEEKS));
  const offset = data.weeks.length - weeks.length;
  const series = (pick === "all" ? data.volume.all : data.volume.byExercise[pick] ?? data.volume.all).slice(offset);
  const s = summarize(weekPoints(weeks, series));
  const name = pick === "all" ? "all exercises" : (data.volume.exercises.find((e) => e.id === pick)?.name ?? "this exercise");
  return (
    <MetricCard id="volume-title" title="Weekly volume" hint="Load times completed reps, added up for each week." stats={<Stats baseline={s?.baseline} latest={s?.latest} change={s?.change} unit="kg" decimals={0} />}>
      <label className="block">
        <span className="text-sm font-semibold text-clay-muted">Exercise</span>
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-clay-line bg-white px-3 font-semibold">
          <option value="all">All exercises</option>
          {data.volume.exercises.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>
      {s ? (
        <>
          <BarChart label={`Weekly volume, ${name}`} unit="kg" weeks={weeks} values={series} noun="workouts" />
          <p className="text-xs text-clay-muted">A week with no workout is left blank, not drawn as zero.</p>
          <TableView caption={`Weekly volume, ${name}`} columns={["Week of", "Volume (kg)"]} rows={weeks.map((w, i) => [formatDayMonth(w), series[i] === null ? "No workouts" : formatValue(series[i]!)]).reverse()} />
        </>
      ) : (
        <div className="mt-3"><NoData>No workouts with weights in this range. Finish a workout and its volume appears here.</NoData></div>
      )}
    </MetricCard>
  );
}

export function AttendanceCard({ data, range }: { data: ProgressData; range: Range }) {
  const weeks = data.weeks.slice(Math.max(range.firstWeek, data.weeks.length - BAR_WEEKS));
  const values = data.attendance.slice(data.weeks.length - weeks.length);
  const s = summarize(weekPoints(weeks, values));
  const known = values.filter((v): v is number => v !== null);
  const average = known.length ? Math.round((known.reduce((n, v) => n + v, 0) / known.length) * 10) / 10 : null;
  return (
    <MetricCard id="attendance-title" title="Attendance" hint="Visits to the gym each week, from your check-ins." stats={<Stats baseline={s?.baseline} latest={s?.latest} change={s?.change} unit="visits" decimals={0} />}>
      {s ? (
        <>
          <BarChart label="Visits per week" unit="visits" weeks={weeks} values={values} noun="visits" />
          <p className="text-xs text-clay-muted">Average {average === null ? "–" : formatValue(average, 1)} visits a week. Weeks of a freeze, and weeks before you joined, are left blank.</p>
          <TableView caption="Visits per week" columns={["Week of", "Visits"]} rows={weeks.map((w, i) => [formatDayMonth(w), values[i] === null ? "Not counted" : String(values[i])]).reverse()} />
        </>
      ) : (
        <NoData>No check-ins counted in this range. Weeks of a freeze, and weeks before you joined, are left out.</NoData>
      )}
    </MetricCard>
  );
}

/** P03 exactly: completed against the scheduled workouts whose dates have passed; partial, skipped and not logged counted apart. */
export function CompletionCard({ data, range }: { data: ProgressData; range: Range }) {
  const weeks = data.weeks.slice(Math.max(range.firstWeek, data.weeks.length - BAR_WEEKS));
  const rows = data.completion.slice(data.weeks.length - weeks.length);
  const rangeTotal = completionTotals(data.completion.slice(range.firstWeek));
  const rate = weekPoints(weeks, rows.map((r) => (r.completionRate === null ? null : Math.round(r.completionRate * 100))));
  const s = summarize(rate);
  const stacks = rows.map((r) => (r.scheduled ? { completed: r.completed, partial: r.partial, skipped: r.skipped, missed: r.missed } : null));
  return (
    <MetricCard id="completion-title" title="Workout completion" hint="Completed workouts against those scheduled whose dates have passed. The three figures are each week’s share completed." stats={<Stats baseline={s?.baseline} latest={s?.latest} change={s?.change} unit="%" decimals={0} />}>
      {rangeTotal.scheduled === 0 ? (
        <NoData>No scheduled workouts have passed in this range yet. Completion appears after your first planned day.</NoData>
      ) : (
        <>
          <p className="text-[0.95rem]">
            <span className="font-display text-3xl font-extrabold">{Math.round((rangeTotal.completionRate ?? 0) * 100)}%</span> completed, {rangeTotal.completed} of {rangeTotal.scheduled} scheduled.
          </p>
          <StackedBars label="Workouts per week by result" weeks={weeks} data={stacks} />
          <Legend totals={{ completed: rangeTotal.completed, partial: rangeTotal.partial, skipped: rangeTotal.skipped, missed: rangeTotal.missed }} />
          {rangeTotal.extra > 0 && <p className="mt-1 text-sm text-clay-muted">Plus {rangeTotal.extra} extra {rangeTotal.extra === 1 ? "workout" : "workouts"} on days with nothing planned.</p>}
          <TableView
            caption="Workouts per week by result"
            columns={["Week of", "Scheduled", "Completed", "Partly done", "Skipped", "Not logged"]}
            rows={weeks.map((w, i) => [formatDayMonth(w), rows[i]!.scheduled ? String(rows[i]!.scheduled) : "None", ...(rows[i]!.scheduled ? [rows[i]!.completed, rows[i]!.partial, rows[i]!.skipped, rows[i]!.missed].map(String) : ["–", "–", "–", "–"])]).reverse()}
          />
        </>
      )}
    </MetricCard>
  );
}
