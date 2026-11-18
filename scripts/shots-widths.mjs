/**
 * Screenshots of app screens at 390, 768 and 1440 px, for responsive review.
 *   node scripts/shots-widths.mjs <folder> name=userId@/path[@mode] ...      mode: full (whole page), or a CSS selector to click first as click:<role>:<name>
 * Needs a dev server: npm run dev -- --port 5191
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../src/app/demoAccounts.ts";

const [folder, ...shots] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:5191";
const WIDTHS = (process.env.WIDTHS ?? "390,768,1440").split(",").map(Number);
const HEIGHT = { 390: 844, 768: 1024, 1440: 900 };
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch();
for (const spec of shots) {
  const [name, rest] = spec.split("=");
  const [userId, path, mode = ""] = rest.split("@");
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHT[w] ?? 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", hasTouch: w < 1024 });
    const page = await ctx.newPage();
    const a = DEMO_ACCOUNTS.find((x) => x.userId === userId);
    await page.goto(`${base}/login`);
    await page.evaluate((s) => {
      localStorage.setItem("ember.session", JSON.stringify(s));
      localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 0 }));
    }, { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits });
    await page.goto(`${base}${path}`);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await page.waitForTimeout(400);
    for (const step of mode.split(">").filter((m) => m.startsWith("click:"))) {
      const [, role, label] = step.split(":");
      await page.getByRole(role, { name: label }).first().click();
      await page.waitForTimeout(400);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    await page.screenshot({ path: `${folder}/${name}-${w}.png`, fullPage: mode.includes("full") });
    console.log(`${name} ${w}${overflow ? " HORIZONTAL SCROLL" : ""}`);
    await ctx.close();
  }
}
await browser.close();
