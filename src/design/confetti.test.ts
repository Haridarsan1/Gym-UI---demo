import { describe, expect, it } from "vitest";
import { CONFETTI_COLORS, CONFETTI_MS, makeParticles, stepParticle } from "@/design/confetti";

describe("confetti", () => {
  it("lasts under a second", () => {
    expect(CONFETTI_MS).toBeLessThan(1000);
  });
  it("uses Ember, mint and lilac, all of them", () => {
    const colors = new Set(makeParticles(24, 0, 0).map((p) => p.color));
    expect(colors).toEqual(new Set(CONFETTI_COLORS));
    expect(CONFETTI_COLORS).toContain("#D14000");
  });
  it("starts every piece at the origin and sends it upwards", () => {
    for (const p of makeParticles(30, 100, 200, () => 0.5)) {
      expect([p.x, p.y]).toEqual([100, 200]);
      expect(p.vy).toBeLessThan(0);
    }
  });
  it("lets pieces rise, then fall", () => {
    let p = makeParticles(1, 0, 0, () => 0.5)[0]!;
    const rises = stepParticle(p, 0.05).y < p.y;
    for (let i = 0; i < 20; i++) p = stepParticle(p, 0.05);
    expect(rises).toBe(true);
    expect(p.vy).toBeGreaterThan(0);
  });
});
