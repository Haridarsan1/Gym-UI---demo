import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { daysBetween } from "@/domain/dates";
import { segments, type Point } from "@/domain/progress";
import { barPath, formatTick, formatValue, niceTicks } from "@/design/charts/scale";
import { formatDate, formatDayMonth } from "@/lib/when";

/**
 * Small SVG charts for the member app. They follow one set of marks: 2 px lines, round markers of at least 8 px with a 2 px
 * surface ring, bars no thicker than 24 px with a 4 px rounded top and a square base, hairline grid, a 2 px gap between
 * stacked parts, and the series colour only on marks, never on text. A missing value is a gap, never a zero. Every chart
 * answers a tap, a pointer or the arrow keys with a readout line (never hover only), and offers its values as a table.
 */

import { CHART_COLORS } from "@/design/charts/colors";
export { CHART_COLORS };

const W = 320;
const H = 176;
const M = { l: 38, r: 12, t: 26, b: 26 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

interface Frame {
  y: (v: number) => number;
  ticks: number[];
}

function Grid({ f, unitLabel }: { f: Frame; unitLabel?: string }) {
  return (
    <g aria-hidden="true">
      {f.ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={f.y(t)} y2={f.y(t)} stroke={CHART_COLORS.grid} strokeWidth={1} />
          <text x={M.l - 6} y={f.y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={CHART_COLORS.muted}>
            {formatTick(t)}
          </text>
        </g>
      ))}
      {unitLabel && <text x={2} y={9} textAnchor="start" fontSize={10} fill={CHART_COLORS.muted}>{unitLabel}</text>}
    </g>
  );
}

/** The line under a chart that says what is selected, or what the latest value is. Values lead, labels follow. */
function Readout({ value, label, gap }: { value?: string; label: string; gap?: boolean }) {
  return (
    <p className="mt-1 min-h-[1.75rem] text-sm text-clay-muted" aria-live="polite">
      {gap ? <span>{label}</span> : <><span className="text-base font-bold text-clay-ink">{value}</span> <span>{label}</span></>}
    </p>
  );
}

/** Table view of a chart’s values: every number a readout shows is also here, without tapping. */
export function TableView({ caption, columns, rows }: { caption: string; columns: string[]; rows: string[][] }) {
  return (
    <details className="mt-2 rounded-xl bg-clay-lavender px-3 py-1">
      <summary className="flex min-h-[2.75rem] cursor-pointer items-center text-sm font-semibold">View as table</summary>
      <div className="max-h-56 overflow-auto pb-2">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" className="py-1 pr-3 font-semibold">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-clay-line">
                {r.map((cell, j) => (
                  <td key={j} className="py-1 pr-3 tabular">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Arrow keys and taps move through the marks; the index is the one selected, or null. */
function useSelection(count: number) {
  const [index, setIndex] = useState<number | null>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!count) return;
    const move = (to: number) => (e.preventDefault(), setIndex(Math.max(0, Math.min(count - 1, to))));
    if (e.key === "ArrowRight") move((index ?? -1) + 1);
    else if (e.key === "ArrowLeft") move((index ?? count) - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(count - 1);
    else if (e.key === "Escape") setIndex(null);
  };
  return { index, setIndex, onKeyDown };
}

// ── Line chart ──────────────────────────────────────────────────────────────────────────────────

export function LineChart({ label, unit, points, from, to, maxGapDays, decimals = 1, color = CHART_COLORS.ember }: { label: string; unit: string; points: Point[]; from: string; to: string; maxGapDays: number; decimals?: number; color?: string }) {
  const id = useId();
  const sel = useSelection(points.length);
  const svg = useRef<SVGSVGElement>(null);
  const span = Math.max(1, daysBetween(from, to));
  const f = useMemo(() => {
    const vals = points.map((p) => p.value);
    const t = niceTicks(Math.min(...vals), Math.max(...vals), 3);
    return { ...t, y: (v: number) => M.t + PH - ((v - t.min) / (t.max - t.min || 1)) * PH };
  }, [points]);
  const x = (d: string) => M.l + (Math.min(span, Math.max(0, daysBetween(from, d))) / span) * PW;
  const segs = segments(points, maxGapDays);

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => (Math.abs(x(p.date) - px) < Math.abs(x(points[best]!.date) - px) ? (best = i) : 0));
    sel.setIndex(best);
  };
  const shown = sel.index !== null ? points[sel.index] : points.at(-1);
  const fmt = (v: number) => `${formatValue(v, decimals)} ${unit}`;
  return (
    <div>
      <Readout value={shown ? fmt(shown.value) : undefined} label={shown ? `${sel.index === null ? "latest reading on" : "on"} ${formatDate(shown.date)}` : ""} />
      <div tabIndex={0} role="group" aria-label={`${label}, ${points.length} ${points.length === 1 ? "reading" : "readings"}. Use the arrow keys to step through them.`} onKeyDown={sel.onKeyDown} className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-600">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="block w-full touch-pan-y select-none" role="img" aria-label={`${label}: ${points.length} readings from ${formatValue(points[0]!.value, decimals)} to ${formatValue(points.at(-1)!.value, decimals)} ${unit}`} onPointerDown={onPointer} onPointerMove={(e) => e.pointerType === "mouse" && onPointer(e)}>
          <Grid f={f} unitLabel={unit} />
          <text x={M.l} y={H - 8} fontSize={10} fill={CHART_COLORS.muted}>{formatDayMonth(from)}</text>
          <text x={W - M.r} y={H - 8} fontSize={10} textAnchor="end" fill={CHART_COLORS.muted}>{formatDayMonth(to)}</text>
          {segs.map((s, i) => (
            <g key={`${id}-${i}`}>
              {s.length > 1 && <path d={`M${x(s[0]!.date)},${M.t + PH} ${s.map((p) => `L${x(p.date)},${f.y(p.value)}`).join(" ")} L${x(s.at(-1)!.date)},${M.t + PH} Z`} fill={color} opacity={0.1} />}
              {s.length > 1 && <path d={s.map((p, j) => `${j ? "L" : "M"}${x(p.date)},${f.y(p.value)}`).join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            </g>
          ))}
          {sel.index !== null && <line x1={x(points[sel.index]!.date)} x2={x(points[sel.index]!.date)} y1={M.t} y2={M.t + PH} stroke={CHART_COLORS.muted} strokeWidth={1} />}
          {points.map((p, i) => (
            <circle key={p.date + i} cx={x(p.date)} cy={f.y(p.value)} r={i === sel.index ? 6 : 4.5} fill={color} stroke={CHART_COLORS.surface} strokeWidth={2} />
          ))}
        </svg>
      </div>
    </div>
  );
}

// ── Bar chart (one value per week) ──────────────────────────────────────────────────────────────

/** About five week labels along the bottom, the last one always shown unless it would crowd the one before it. */
function xLabels(weeks: string[], slot: number) {
  const every = Math.max(1, Math.ceil(weeks.length / 5));
  const last = weeks.length - 1;
  return weeks.map((w, i) => {
    const regular = i % every === 0 && !(last % every !== 0 && last - i < every / 2 + 1 && i !== last);
    if (!regular && i !== last) return null;
    if (i === last && last % every !== 0 && last - Math.floor(last / every) * every < every / 2) return null;
    return <text key={w} x={M.l + slot * i + slot / 2} y={H - 8} fontSize={10} textAnchor={i === last && weeks.length > 1 ? "end" : "middle"} fill={CHART_COLORS.muted}>{formatDayMonth(w)}</text>;
  });
}

export function BarChart({ label, unit, weeks, values, noun, color = CHART_COLORS.ember }: { label: string; unit: string; weeks: string[]; values: Array<number | null>; noun: string; color?: string }) {
  const sel = useSelection(weeks.length);
  const svg = useRef<SVGSVGElement>(null);
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  const t = niceTicks(0, max || 1, 3);
  const y = (v: number) => M.t + PH - (v / (t.max || 1)) * PH;
  const slot = PW / weeks.length;
  const bw = Math.min(24, Math.max(3, slot - 3));
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W - M.l;
    sel.setIndex(Math.max(0, Math.min(weeks.length - 1, Math.floor(px / slot))));
  };
  const lastWith = values.map((v, i) => (v === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
  const i = sel.index ?? (lastWith >= 0 ? lastWith : null);
  const v = i === null ? null : values[i]!;
  return (
    <div>
      {i === null ? <Readout label="No data in this range" gap /> : v === null ? <Readout label={`Week of ${formatDayMonth(weeks[i]!)}: no ${noun} recorded`} gap /> : <Readout value={`${formatValue(v)} ${unit}`} label={`${sel.index === null ? "in the latest week with data, the week of" : "in the week of"} ${formatDayMonth(weeks[i]!)}`} />}
      <div tabIndex={0} role="group" aria-label={`${label}, ${weeks.length} weeks. Use the arrow keys to step through them.`} onKeyDown={sel.onKeyDown} className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-600">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="block w-full touch-pan-y select-none" role="img" aria-label={`${label}, weekly, ${values.filter((x) => x !== null).length} of ${weeks.length} weeks have data`} onPointerDown={onPointer}>
          <Grid f={{ y, ticks: t.ticks }} unitLabel={unit} />
          {xLabels(weeks, slot)}
          {values.map((val, k) => {
            const bx = M.l + slot * k + (slot - bw) / 2;
            if (val === null) return <line key={k} x1={bx + bw / 2 - 2} x2={bx + bw / 2 + 2} y1={M.t + PH - 1} y2={M.t + PH - 1} stroke={CHART_COLORS.track} strokeWidth={2} strokeLinecap="round" aria-hidden="true" />;
            const h = Math.max(2, M.t + PH - y(val));
            return <path key={k} d={barPath(bx, M.t + PH - h, bw, h)} fill={color} opacity={sel.index === null || sel.index === k ? 1 : 0.6} />;
          })}
          {sel.index !== null && <rect x={M.l + slot * sel.index} y={M.t} width={slot} height={PH} fill="none" stroke={CHART_COLORS.muted} strokeWidth={1} strokeDasharray="0" rx={2} opacity={0.5} />}
        </svg>
      </div>
    </div>
  );
}

// ── Stacked bars: completed, partial, skipped and not logged, per week ──────────────────────────

export interface Stack {
  completed: number;
  partial: number;
  skipped: number;
  missed: number;
}

const PARTS: Array<{ key: keyof Stack; label: string; fill: string }> = [
  { key: "completed", label: "Completed", fill: CHART_COLORS.ember },
  { key: "partial", label: "Partly done", fill: CHART_COLORS.lilac },
  { key: "skipped", label: "Skipped", fill: CHART_COLORS.neutral },
  { key: "missed", label: "Not logged", fill: "#D5CAE3" },
];

export function Legend({ totals }: { totals: Stack }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legend">
      {PARTS.map((p) => (
        <li key={p.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: p.fill }} />
          {p.label}, {totals[p.key]}
        </li>
      ))}
    </ul>
  );
}

export function StackedBars({ label, weeks, data }: { label: string; weeks: string[]; data: Array<Stack | null> }) {
  const sel = useSelection(weeks.length);
  const svg = useRef<SVGSVGElement>(null);
  const tallest = Math.max(1, ...data.map((d) => (d ? d.completed + d.partial + d.skipped + d.missed : 0)));
  const t = niceTicks(0, tallest, 3);
  const y = (v: number) => M.t + PH - (v / (t.max || 1)) * PH;
  const slot = PW / weeks.length;
  const bw = Math.min(24, Math.max(3, slot - 3));
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current!.getBoundingClientRect();
    sel.setIndex(Math.max(0, Math.min(weeks.length - 1, Math.floor((((e.clientX - box.left) / box.width) * W - M.l) / slot))));
  };
  const i = sel.index ?? (data.map((d, k) => (d ? k : -1)).reduce((a, b) => Math.max(a, b), -1));
  const d = i >= 0 ? data[i] : null;
  return (
    <div>
      {i < 0 ? <Readout label="No scheduled workouts have passed in this range" gap /> : !d ? <Readout label={`Week of ${formatDayMonth(weeks[i]!)}: no workouts were scheduled`} gap /> : (
        <Readout value={`${d.completed} of ${d.completed + d.partial + d.skipped + d.missed} completed`} label={`${sel.index === null ? "in the latest week with data, the week of" : "in the week of"} ${formatDayMonth(weeks[i]!)}: ${d.partial} partly done, ${d.skipped} skipped, ${d.missed} not logged`} />
      )}
      <div tabIndex={0} role="group" aria-label={`${label}, ${weeks.length} weeks. Use the arrow keys to step through them.`} onKeyDown={sel.onKeyDown} className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-600">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="block w-full touch-pan-y select-none" role="img" aria-label={`${label}, weekly`} onPointerDown={onPointer}>
          <Grid f={{ y, ticks: t.ticks }} unitLabel="workouts" />
          {xLabels(weeks, slot)}
          {data.map((s, k) => {
            const bx = M.l + slot * k + (slot - bw) / 2;
            if (!s) return <line key={k} x1={bx + bw / 2 - 2} x2={bx + bw / 2 + 2} y1={M.t + PH - 1} y2={M.t + PH - 1} stroke={CHART_COLORS.track} strokeWidth={2} strokeLinecap="round" aria-hidden="true" />;
            let top = M.t + PH;
            const live = PARTS.filter((p) => s[p.key] > 0);
            return (
              <g key={k} opacity={sel.index === null || sel.index === k ? 1 : 0.6}>
                {live.map((p, n) => {
                  const h = M.t + PH - y(s[p.key]);
                  top -= h;
                  const gap = n === 0 ? 0 : 2; // a 2px surface gap between parts, taken from the part above the one below it
                  const height = Math.max(1, h - gap);
                  return n === live.length - 1 ? <path key={p.key} d={barPath(bx, top, bw, height)} fill={p.fill} /> : <rect key={p.key} x={bx} y={top} width={bw} height={height} fill={p.fill} />;
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
