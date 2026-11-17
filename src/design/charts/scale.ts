/** Round axis ticks: clean numbers (0, 20, 40 or 80, 82, 84) that cover the data, with about `count` steps. */
export function niceTicks(min: number, max: number, count = 4): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const frac = rawStep / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: lo, max: hi, ticks };
}

/** Whole numbers with Indian grouping (1,25,000), or up to `decimals` places for small values. */
export function formatValue(v: number, decimals = 0): string {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

/** Compact for a crowded axis: 12K, 1.2L is avoided on purpose; K is clearer on a phone. */
export function formatTick(v: number): string {
  return Math.abs(v) >= 10_000 ? `${formatValue(v / 1000, 1)}K` : formatValue(v, 1);
}

/** Corner path for a bar: square at the baseline, 4px rounded at the data end. */
export function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
