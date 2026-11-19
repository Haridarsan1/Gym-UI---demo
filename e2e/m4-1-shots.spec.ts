import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Screenshots for M4 Checkpoint 1: the dashboard (the owner, one branch, a branch manager) and the reports, with a cash day closed with a variance and the owner’s reopen.
 * Skipped in normal runs; `npm run m4:shots1` runs it at 390, 768 and 1440 px.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? `docs/checkpoints/m4-1/${WIDTH}/screens`;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m4-1-shots.json", "utf8"));

test.skip(!process.env.M4_SHOTS, "Only runs for npm run m4:shots1");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024 });

async function clearToasts(page: Page) {
  for (const b of await page.getByRole("button", { name: "Dismiss" }).all()) await b.click({ timeout: 800 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

async function shot(page: Page, key: string, target?: Locator) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m4-1-shots.json`);
  mkdirSync(OUT, { recursive: true });
  await clearToasts(page);
  if (target) {
    await page.evaluate(() => (document.body.style.paddingBottom = "100vh"));
    await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate((dy) => window.scrollBy(0, dy), WIDTH < 640 ? -76 : -24);
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}-${key}.png` });
  await page.evaluate(() => (document.body.style.paddingBottom = ""));
}

const pick = async (page: Page, title: string) => {
  const list = page.getByRole("navigation", { name: "Reports" }).getByRole("button", { name: title, exact: true });
  if (await list.isVisible()) await list.click();
  else await page.getByRole("combobox", { name: "Report" }).selectOption({ label: title });
  await expect(page.locator("dl[aria-label=Summary]")).toBeVisible();
};

test("Checkpoint 1: the dashboard and the reports", async ({ page }) => {
  // A cash day closed with a variance, for the reports to show.
  await signInAs(page, "u_desk_andheri", "/desk/finance/day-close");
  await page.getByLabel("Cash counted (₹)").fill("150");
  await page.getByLabel(/^Note/).fill("A member left a tip in the drawer");
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText("Cash for this day is locked.", { exact: false })).toBeVisible();

  await signInAs(page, "u_owner", "/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "dashboard");
  await shot(page, "dashboard-money", page.getByRole("region", { name: "Billed and collected by week" }));
  await shot(page, "dashboard-heat", page.getByRole("region", { name: "When members come in" }));
  await shot(page, "dashboard-alerts", page.getByRole("region", { name: "Needs attention" }));
  await shot(page, "dashboard-utilisation", page.getByRole("region", { name: "Trainer utilisation" }));
  await page.getByRole("combobox", { name: "Branch" }).first().selectOption("br_bandra");
  await expect(page.getByText(/visits, Bandra/)).toBeVisible();
  await shot(page, "dashboard-bandra");

  await page.goto("/owner/reports");
  await shot(page, "reports-memberships");
  await pick(page, "Renewals");
  await shot(page, "reports-renewals");
  await pick(page, "Trainer utilisation");
  await shot(page, "reports-trainers");
  await pick(page, "Invoices");
  await shot(page, "reports-invoices");
  await pick(page, "Collections");
  await shot(page, "reports-collections");
  await page.getByRole("combobox", { name: "Branch" }).first().selectOption("all");
  await pick(page, "Cash day closes");
  await expect(page.locator("li:visible, td:visible").filter({ hasText: "A member left a tip" }).first()).toBeVisible();
  await shot(page, "reports-cash");
  await page.getByRole("button", { name: /^Reopen Andheri/ }).first().click();
  await page.getByRole("dialog", { name: "Reopen cash day" }).getByLabel("Reason").fill("A cash payment was missed");
  await shot(page, "reopen-sheet");

  await signInAs(page, "u_bm_bandra", "/owner");
  await expect(page.getByText(/visits, Bandra/)).toBeVisible();
  await shot(page, "dashboard-bm");
  await page.goto("/owner/reports?report=invoices");
  await expect(page.getByText(/For Bandra\./)).toBeVisible();
  await shot(page, "reports-bm");
});
