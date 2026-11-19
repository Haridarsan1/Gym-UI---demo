import type { HeatMap } from "@/domain/reports";
import { CHART_COLORS } from "@/design/charts/colors";
import { formatDayMonth, formatRupees } from "@/lib/when";
import { cn } from "@/lib/format";

/** Billed and collected for each week, side by side: two bars a week, never one on top of the other, because they are different things (O07). */
export function MoneyBars({ weeks }: { weeks: Array<{ week: string; billedPaise: number; collectedPaise: number }> }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.billedPaise, w.collectedPaise]));
  const W = 320, H = 150, L = 4, B = 22, T = 6;
  const slot = (W - L) / Math.max(1, weeks.length);
  const bw = Math.min(14, (slot - 4) / 2);
  const h = (v: number) => Math.max(v > 0 ? 2 : 0, ((H - B - T) * v) / max);
  return (
    <div>
      <ul className="flex gap-4 text-sm" aria-label="Key">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: CHART_COLORS.lilac }} />Billed</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: CHART_COLORS.ember }} />Collected</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full" role="img" aria-label={`Billed and collected by week, ${weeks.length} weeks. The table below has every figure.`}>
        <line x1={L} x2={W} y1={H - B} y2={H - B} stroke={CHART_COLORS.grid} />
        {weeks.map((w, i) => {
          const x = L + slot * i + (slot - bw * 2 - 2) / 2;
          return (
            <g key={w.week}>
              <rect x={x} y={H - B - h(w.billedPaise)} width={bw} height={h(w.billedPaise)} rx={2} fill={CHART_COLORS.lilac} />
              <rect x={x + bw + 2} y={H - B - h(w.collectedPaise)} width={bw} height={h(w.collectedPaise)} rx={2} fill={CHART_COLORS.ember} />
              {(weeks.length <= 6 || i % 2 === 0) && <text x={L + slot * i + slot / 2} y={H - 6} textAnchor="middle" fontSize={9} fill={CHART_COLORS.muted}>{formatDayMonth(w.week)}</text>}
            </g>
          );
        })}
      </svg>
      <details className="mt-2 rounded-xl bg-clay-lavender px-3 py-1">
        <summary className="flex min-h-[2.75rem] cursor-pointer items-center text-sm font-semibold">View as table</summary>
        <div className="max-h-56 overflow-auto pb-2">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Billed and collected by week</caption>
            <thead><tr className="text-clay-muted"><th scope="col" className="py-1 pr-2 font-semibold">Week of</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Billed</th><th scope="col" className="py-1 text-right font-semibold">Collected</th></tr></thead>
            <tbody>{weeks.map((w) => <tr key={w.week} className="border-t border-clay-line"><th scope="row" className="py-1 pr-2 font-normal">{formatDayMonth(w.week)}</th><td className="py-1 pr-2 text-right tabular">{formatRupees(w.billedPaise)}</td><td className="py-1 text-right tabular">{formatRupees(w.collectedPaise)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
const FIRST = 5, LAST = 22; // The gym is open 5:30 am to 10:30 pm

/** Visits by weekday and hour. Darker is busier; the three busiest slots are said in words, and every figure is in the table. */
export function HeatMapView({ heat }: { heat: HeatMap }) {
  const hours = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);
  return (
    <div>
      {heat.total === 0 ? <p className="text-clay-muted">No check-ins in this range.</p> : (
        <>
          <p className="text-[0.95rem]">Busiest: {heat.peaks.map((p) => `${DAYS[p.weekday]} ${hourLabel(p.hour)} (${p.count})`).join(", ")}.</p>
          <div role="img" aria-label={`Check-ins by weekday and hour. ${heat.total} visits. Busiest: ${heat.peaks.map((p) => `${DAYS[p.weekday]} at ${hourLabel(p.hour)}, ${p.count}`).join("; ")}.`} className="mt-2 overflow-x-auto">
            <div className="grid min-w-[17rem] gap-[2px]" style={{ gridTemplateColumns: `2rem repeat(${hours.length}, minmax(0, 1fr))` }} aria-hidden="true">
              <span />
              {hours.map((h) => <span key={h} className="text-center text-[0.6rem] leading-4 text-clay-muted">{h % 3 === 0 ? h : ""}</span>)}
              {DAYS.map((day, d) => (
                <div key={day} className="contents">
                  <span className="text-xs leading-5 text-clay-muted">{day}</span>
                  {hours.map((h) => {
                    const n = heat.cells[d]![h]!;
                    return <span key={h} className={cn("h-5 rounded-[3px]", n === 0 && "bg-clay-lavender/60")} style={n > 0 ? { background: CHART_COLORS.ember, opacity: 0.2 + 0.8 * (n / heat.max) } : undefined} />;
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-clay-muted">Hours of the day, 5 am to 10 pm. Darker is busier.</p>
          <details className="mt-2 rounded-xl bg-clay-lavender px-3 py-1">
            <summary className="flex min-h-[2.75rem] cursor-pointer items-center text-sm font-semibold">View as table</summary>
            <div className="max-h-64 overflow-auto pb-2">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Check-ins by weekday and hour</caption>
                <thead><tr className="text-clay-muted"><th scope="col" className="py-1 pr-2 font-semibold">Day</th><th scope="col" className="py-1 pr-2 font-semibold">Hour</th><th scope="col" className="py-1 text-right font-semibold">Visits</th></tr></thead>
                <tbody>{heat.cells.flatMap((row, d) => row.map((n, h) => ({ d, h, n }))).filter((x) => x.n > 0).map((x) => <tr key={`${x.d}-${x.h}`} className="border-t border-clay-line"><td className="py-1 pr-2">{DAYS[x.d]}</td><td className="py-1 pr-2">{hourLabel(x.h)}</td><td className="py-1 text-right tabular">{x.n}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
