import type { ReactNode } from "react";
import { formatValue } from "@/design/charts/scale";
import type { Point } from "@/domain/progress";
import { formatDayMonth } from "@/lib/when";

/** Baseline, latest and change for a series (P02). With nothing in the range every figure is “–” and the card says so. */
export function Stats({ baseline, latest, change, unit, decimals = 1 }: { baseline?: Point; latest?: Point; change?: number; unit: string; decimals?: number }) {
  const sign = change === undefined ? "" : change > 0 ? "+" : change < 0 ? "−" : "";
  const word = change === undefined ? "" : change > 0 ? "up" : change < 0 ? "down" : "no change";
  const cell = (label: string, value: string | undefined, sub?: string) => (
    <div className="min-w-0">
      <dt className="text-sm text-clay-muted">{label}</dt>
      <dd className="font-display text-[1.7rem] font-extrabold leading-tight">{value ?? "–"}</dd>
      <dd className="truncate text-xs text-clay-muted">{sub ?? " "}</dd>
    </div>
  );
  const fmt = (v: number) => `${formatValue(v, decimals)}`;
  return (
    <dl className="grid grid-cols-3 gap-3">
      {cell("Baseline", baseline && fmt(baseline.value), baseline ? `${unit}, ${formatDayMonth(baseline.date)}` : undefined)}
      {cell("Latest", latest && fmt(latest.value), latest ? `${unit}, ${formatDayMonth(latest.date)}` : undefined)}
      {cell("Change", change === undefined ? undefined : `${sign}${fmt(Math.abs(change))}`, change === undefined ? undefined : `${unit}, ${word}`)}
    </dl>
  );
}

/** One chart on the Progress screen: a title, what it measures, the three figures, the chart and its table. */
export function MetricCard({ id, title, hint, stats, children }: { id: string; title: string; hint?: string; stats: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="clay p-5">
      <h2 id={id} className="text-lg font-bold">{title}</h2>
      {hint && <p className="text-sm text-clay-muted">{hint}</p>}
      <div className="mt-3">{stats}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Shown when a chart has nothing in the range. It says so and what to do, and draws no empty chart. */
export function NoData({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-clay-lavender px-4 py-4 text-[0.95rem]">{children}</p>;
}

/** Tabs and selects that change what one chart shows (not the date range, which is global and sits above all of them). */
export function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-[2.75rem] shrink-0 rounded-full px-4 text-sm font-semibold ${o.value === value ? "bg-clay-ink text-white" : "bg-clay-lavender"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
