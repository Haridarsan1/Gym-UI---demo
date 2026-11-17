import { describe, expect, it } from "vitest";
import { barPath, formatTick, formatValue, niceTicks } from "@/design/charts/scale";

describe("niceTicks", () => {
  it("gives round numbers that cover the data", () => {
    expect(niceTicks(0, 87)).toEqual({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(niceTicks(78.1, 82.6)).toMatchObject({ min: 78, max: 84 });
  });
  it("widens a flat series so it still has a scale", () => {
    const t = niceTicks(80, 80);
    expect(t.min).toBeLessThan(80);
    expect(t.max).toBeGreaterThan(80);
  });
  it("covers every value, and ticks climb in equal steps", () => {
    for (const [a, b] of [[0, 3], [0.2, 0.9], [4200, 9100], [-3, 5]] as const) {
      const t = niceTicks(a, b);
      expect(t.min).toBeLessThanOrEqual(a);
      expect(t.max).toBeGreaterThanOrEqual(b);
      const steps = t.ticks.slice(1).map((v, i) => Math.round((v - t.ticks[i]!) * 1e6) / 1e6);
      expect(new Set(steps).size).toBe(1);
    }
  });
  it("does not throw on nothing", () => {
    expect(niceTicks(NaN, NaN).ticks).toEqual([0, 1]);
  });
});

describe("formatting", () => {
  it("groups the Indian way and keeps decimals only when asked", () => {
    expect(formatValue(125000)).toBe("1,25,000");
    expect(formatValue(81.44, 1)).toBe("81.4");
    expect(formatValue(80, 1)).toBe("80");
  });
  it("compacts only where an axis needs it", () => {
    expect(formatTick(9500)).toBe("9,500");
    expect(formatTick(12500)).toBe("12.5K");
  });
});

describe("barPath", () => {
  it("is square at the baseline and rounded at the top", () => {
    const d = barPath(10, 20, 16, 40);
    expect(d.startsWith("M10,60")).toBe(true); // starts at the bottom-left corner, square
    expect(d).toContain("Q10,20");
  });
  it("never rounds more than the bar is tall", () => {
    expect(barPath(0, 0, 20, 2)).toContain("V2");
  });
});
