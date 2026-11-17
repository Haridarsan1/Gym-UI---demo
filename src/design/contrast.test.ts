import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Text must be readable on every coloured surface the brand uses: at least 4.5:1 (WCAG AA for normal text). */
const css = readFileSync("src/styles/index.css", "utf8");

const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const hexes = (text: string) => [...text.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);

describe("Button3D colours", () => {
  const variants = [...css.matchAll(/\.btn3d\[data-variant="(\w+)"\]\s*\{([^}]*)\}/g)];

  it("defines every variant", () => {
    expect(variants.map((v) => v[1])).toEqual(["ember", "mint", "lilac", "ink", "white"]);
  });

  for (const [, name, body] of variants) {
    it(`${name}: text on the face is at least 4.5:1`, () => {
      const face = /--btn-face:\s*(#[0-9a-f]{6})/i.exec(body!)![1]!;
      const fg = /--btn-fg:\s*(#[0-9a-f]{6})/i.exec(body!)![1]!;
      expect(ratio(face, fg), `${name} ${fg} on ${face}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("keeps white text on Ember", () => {
    const body = variants.find((v) => v[1] === "ember")![2]!;
    expect(/--btn-fg:\s*#ffffff/i.test(body)).toBe(true);
  });
});

describe("marketing orange (clay-ember)", () => {
  it("has white text readable at every point of the gradient", () => {
    const body = /\.clay-ember\s*\{([^}]*)\}/.exec(css)![1]!;
    const stops = hexes(/background:\s*linear-gradient\(([^;]*)\)/.exec(body)![1]!);
    expect(stops.length).toBeGreaterThanOrEqual(2);
    for (const stop of stops) expect(ratio(stop, "#ffffff"), stop).toBeGreaterThanOrEqual(4.5);
    expect(/color:\s*#fff\b/.test(body)).toBe(true);
  });
});
