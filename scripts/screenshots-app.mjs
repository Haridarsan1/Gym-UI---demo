/**
 * Screenshots of app screens at phone size, for review.
 *   node scripts/screenshots-app.mjs <folder> <shot>...      shots look like  name=userId@/path[@tall]
 * Needs a dev server: npm run dev -- --port 5191
 */
import { chromium } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../src/app/demoAccounts.ts";

const [folder, ...shots] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:5191";
const browser = await chromium.launch();

for (const spec of shots) {
  const [name, rest] = spec.split("=");
  const [userId, path, mode] = rest.split("@");
  const tall = mode === "tall";
  const sim = mode === "slow" ? { minMs: 6000, maxMs: 6000, failureRate: 0 } : mode === "fail" ? { minMs: 0, maxMs: 0, failureRate: 1 } : { minMs: 0, maxMs: 0, failureRate: 0 };
  const ctx = await browser.newContext({ viewport: { width: 390, height: tall ? 1900 : 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId);
  await page.goto(`${base}/login`);
  await page.evaluate(
    ({ sim, ...s }) => {
      localStorage.setItem("ember.session", JSON.stringify(s));
      localStorage.setItem("ember.demo.simulation", JSON.stringify(sim));
    },
    { sim, userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits },
  );
  await page.goto(`${base}${path}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  if (mode === "fail") await page.getByRole("alert").waitFor({ timeout: 20000 });
  await page.waitForTimeout(mode === "slow" ? 500 : 1200);
  const file = `${folder}/${name}.png`;
  await page.screenshot({ path: file });
  console.log(file);
  await ctx.close();
}
await browser.close();
