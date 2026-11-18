import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Screenshots of the trainer app for milestone M2 checkpoints. Skipped in normal runs; `npm run m2:shots` runs it at 390, 768
 * and 1440 px (SHOT_WIDTH) and scripts/contact-sheets.mjs puts the pictures on sheets. SHOT_OUT is the folder for this width.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? `docs/checkpoints/m2-1/${WIDTH}/screens`;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m2-shots.json", "utf8"));

test.skip(!process.env.M2_SHOTS, "Only runs for npm run m2:shots");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024 });

async function shot(page: Page, key: string, target?: Locator) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m2-shots.json`);
  mkdirSync(OUT, { recursive: true });
  if (target) {
    await page.evaluate(() => (document.body.style.paddingBottom = "100vh"));
    await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate((dy) => window.scrollBy(0, dy), WIDTH < 640 ? -76 : -24);
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}-${key}.png` });
}

const ready = (page: Page) => expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), \w+$/, level: 1 })).toBeVisible();

test("Trainer Today", async ({ page }) => {
  await signInAs(page, "u_trainer_meera", "/t");
  await ready(page);
  await expect(page.getByText(/Sessions today/).first()).toBeVisible();
  await shot(page, "today-sessions");
  if (WIDTH >= 768) {
    for (const [name, key] of [["Reviews overdue", "today-reviews"], ["Missed workouts", "today-missed"], ["Credits expiring", "today-credits"], ["Waiting for a plan", "today-plans"]] as const) {
      await page.getByRole("navigation", { name: "Your day" }).getByRole("button", { name: new RegExp(name) }).click();
      await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
      await shot(page, key);
    }
    await page.getByRole("navigation", { name: "Your day" }).getByRole("button", { name: /Missed workouts/ }).click();
    if (WIDTH >= 1280) await page.getByRole("list", { name: "Missed workouts" }).getByRole("button").first().click();
    await shot(page, "today-client");
  } else {
    for (const [title, key] of [["Reviews overdue", "today-reviews"], ["Missed workouts", "today-missed"], ["Credits expiring", "today-credits"], ["Waiting for a plan", "today-plans"]] as const) {
      await shot(page, key, page.getByRole("heading", { name: title, level: 2 }));
    }
    await shot(page, "today-client", page.getByRole("region", { name: "Missed workouts" }));
  }
  await signInAs(page, "u_trainer_kavya", "/t");
  await ready(page);
  if (WIDTH >= 768) await page.getByRole("navigation", { name: "Your day" }).getByRole("button", { name: /Credits expiring/ }).click();
  await shot(page, "today-quiet", WIDTH < 768 ? page.getByRole("heading", { name: "Credits expiring", level: 2 }) : undefined);
});
