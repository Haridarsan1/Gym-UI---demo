import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { logRemainingSets, signInAs } from "./helpers";

/**
 * Screenshots of the trainer app for the end of M2: coach-led logging, review with goal confirmation, the schedule with a leave
 * conflict, and marking attended and no-show. Skipped in normal runs; `npm run m2:shots3` runs it at 390, 768 and 1440 px and
 * puts the pictures on sheets.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? `docs/checkpoints/m2-3/${WIDTH}/screens`;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m2-3-shots.json", "utf8"));

test.skip(!process.env.M2_SHOTS, "Only runs for npm run m2:shots3");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024 });

/** Closes any toast, so none sits over the picture or over the next button. */
async function clearToasts(page: Page) {
  for (const b of await page.getByRole("button", { name: "Dismiss" }).all()) await b.click({ timeout: 800 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

async function shot(page: Page, key: string, target?: Locator) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m2-3-shots.json`);
  mkdirSync(OUT, { recursive: true });
  await clearToasts(page);
  if (target) {
    await page.evaluate(() => (document.body.style.paddingBottom = "100vh"));
    await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate((dy) => window.scrollBy(0, dy), WIDTH < 640 ? -76 : -24);
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}-${key}.png` });
  await page.evaluate(() => (document.body.style.paddingBottom = ""));
}

const h1 = (page: Page, name: string | RegExp) => expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
const mainNav = (page: Page, name: string) => page.locator('nav[aria-label="Main"]:visible').getByRole("link", { name, exact: true });
const scheduleTab = (page: Page, name: string | RegExp) => page.getByRole("tab", { name }).or(page.getByRole("navigation", { name: "Schedule sections" }).getByRole("button", { name }));
const goal = (page: Page) => page.getByRole("list", { name: "Goals" }).getByRole("listitem").filter({ hasText: "Train three times a week" });

test("Coach-led logging: log a missed session, then correct it", async ({ page }) => {
  await signInAs(page, "u_trainer_meera", "/t/clients/mem_126");
  await h1(page, "Arnav Banerjee");
  await page.getByRole("link", { name: "Log a session" }).click();
  await h1(page, "Log a session");
  await expect(page.getByRole("link", { name: /Mon 16 Nov.*Not logged/ })).toBeVisible();
  await shot(page, "log-days");
  await page.getByRole("link", { name: /Mon 16 Nov.*Not logged/ }).click();
  await expect(page.getByRole("heading", { name: /for Arnav$/, level: 2 })).toBeVisible();
  // A main exercise with its first set open, pre-filled.
  await page.getByRole("button", { name: "Next exercise" }).click();
  await expect(page.getByRole("form", { name: "Set 1" })).toBeVisible();
  await shot(page, "log-session");
  const finish = page.getByRole("button", { name: "Finish session", exact: true });
  for (let i = 0; i < 12; i++) {
    await logRemainingSets(page);
    if (await finish.count()) break;
    await page.getByRole("button", { name: "Next exercise" }).click();
  }
  await finish.click();
  const sheet = page.getByRole("dialog", { name: "Finish session" });
  await sheet.getByLabel("Note about the session").fill("Coached in person after the missed week.");
  await shot(page, "log-finish");
  await sheet.getByRole("button", { name: "Finish session" }).click();
  await expect(page.getByRole("article", { name: "Finished log" })).toContainText("Entered by Coach Meera");
  await shot(page, "log-done");
  await page.getByRole("button", { name: "Correct this log" }).click();
  for (let i = 0; i < 12; i++) {
    const change = page.getByRole("button", { name: "Change set 1" });
    if (await change.count()) {
      await change.click();
      const reps = page.getByRole("form", { name: "Set 1" }).getByRole("textbox", { name: "Reps" });
      if (await reps.count()) {
        await reps.fill("12");
        await page.getByRole("button", { name: "Save set" }).click();
        break;
      }
      await page.getByRole("button", { name: "Cancel" }).click();
    }
    await page.getByRole("button", { name: "Next exercise" }).click();
  }
  await page.getByRole("button", { name: /^Save correction( now)?$/ }).last().click();
  const c = page.getByRole("dialog", { name: "Save correction" });
  await c.getByRole("button", { name: "Save correction" }).click();
  await expect(c.getByRole("alert")).toBeVisible();
  await c.getByLabel("Why are you correcting it?").fill("Arnav did 12 reps on the first lift, not the prescribed number.");
  await shot(page, "log-correct");
  await c.getByRole("button", { name: "Save correction" }).click();
  const after = page.getByRole("article", { name: "Finished log" });
  await expect(after).toContainText("corrected once");
  await after.getByText("What the original said").click();
  await shot(page, "log-corrected", after.getByRole("heading", { name: "Corrections" }));
});

test("Review: check-in, goal confirmation, feedback with a follow-up, a private note", async ({ page }) => {
  await signInAs(page, "u_trainer_meera", "/t/clients/mem_arjun/review");
  await h1(page, "Review");
  await expect(page.getByRole("heading", { name: "Arjun’s latest check-in" })).toBeVisible();
  await shot(page, "review-checkin");

  await page.goto("/t/clients/mem_144/review");
  await h1(page, "Review");
  await expect(goal(page)).toContainText("Target reached");
  await shot(page, "review-reached", page.getByRole("heading", { name: "Goals", exact: true }));
  await page.getByLabel("Feedback for Harsh").fill("Three sessions a week for a month. Well done. Next, we add load to the squat.");
  await page.getByRole("button", { name: "In 2 weeks" }).click();
  await shot(page, "review-write", page.getByRole("heading", { name: "Write your review" }));
  await page.getByRole("button", { name: "Share review" }).click();
  await expect(page.getByText("Review shared with Harsh")).toBeVisible();
  await page.getByRole("radio", { name: /Private note/ }).click();
  await page.getByLabel("Your note").fill("Ask about his knee before adding load.");
  await shot(page, "review-private", page.getByRole("heading", { name: "Write your review" }));
  await page.getByRole("button", { name: "Save private note" }).click();
  await expect(page.getByText("Private note saved")).toBeVisible();
  await goal(page).getByRole("button", { name: "Confirm achieved" }).click();
  await shot(page, "review-confirm");
  await page.getByRole("dialog", { name: "Confirm goal achieved" }).getByRole("button", { name: "Confirm achieved" }).click();
  await expect(goal(page)).toContainText("Achieved");
  await shot(page, "review-confirmed", page.getByRole("heading", { name: "Goals", exact: true }));
});

test("Schedule: sessions, attended and no-show, leave that clashes, moving it", async ({ page }) => {
  await signInAs(page, "u_trainer_meera", "/t/schedule");
  await h1(page, "Schedule");
  await expect(page.getByRole("list", { name: "Today’s sessions" }).getByRole("listitem")).toHaveCount(4);
  await shot(page, "schedule-sessions");

  // Seven thirty in the evening: three sessions have started and are waiting to be marked.
  await page.clock.setSystemTime(new Date("2026-11-17T14:00:00.000Z"));
  await mainNav(page, "Today").click();
  await mainNav(page, "Schedule").click();
  const toMark = page.getByRole("list", { name: "Sessions to mark" });
  await expect(toMark.getByRole("listitem")).toHaveCount(3);
  await shot(page, "schedule-to-mark", page.getByRole("heading", { name: "To mark" }));
  await toMark.getByRole("button", { name: /^Mark .+ attended$/ }).first().click();
  await shot(page, "mark-attended");
  await page.getByRole("dialog", { name: "Mark attended" }).getByRole("button", { name: "Mark attended" }).click();
  await expect(toMark.getByRole("listitem")).toHaveCount(2);
  await toMark.getByRole("button", { name: /^Mark .+ a no-show$/ }).first().click();
  await shot(page, "mark-no-show");
  await page.getByRole("dialog", { name: "Mark no-show" }).getByRole("button", { name: "Mark no-show" }).click();
  await expect(page.getByRole("list", { name: "Today’s sessions" })).toContainText("No-show");
  await shot(page, "schedule-marked", page.getByRole("heading", { name: "Today", exact: true }));

  await scheduleTab(page, /^Shifts and leave/).click();
  await page.getByRole("form", { name: "Add leave" }).getByLabel("First day").fill("2026-11-19");
  await page.getByRole("form", { name: "Add leave" }).getByLabel("Reason (optional)").fill("Conference");
  await page.getByRole("button", { name: "Add leave" }).click();
  await expect(page.getByRole("list", { name: "Upcoming leave" })).toContainText("1 booked session clashes");
  await shot(page, "schedule-leave", page.getByRole("heading", { name: "Leave", exact: true }));
  await scheduleTab(page, /^Sessions/).click();
  await expect(page.getByRole("heading", { name: "1 booked session is on your leave" })).toBeVisible();
  await shot(page, "schedule-conflict");
  await page.getByRole("button", { name: "Move Arjun’s session" }).click();
  await expect(page.getByRole("dialog", { name: "Move Arjun’s session" }).getByRole("heading", { name: "With you" })).toBeVisible();
  await shot(page, "schedule-move");
  await page.getByRole("dialog", { name: "Move Arjun’s session" }).getByRole("list", { name: /^Your times on/ }).first().getByRole("button").first().click();
  await expect(page.getByText("Arjun’s session is moved")).toBeVisible();
  await shot(page, "schedule-moved");
  await scheduleTab(page, /^Availability/).click();
  await expect(page.getByRole("heading", { name: "Weekly availability" })).toBeVisible();
  await shot(page, "schedule-availability");
  await scheduleTab(page, /^Shifts and leave/).click();
  await expect(page.getByRole("list", { name: "Upcoming shifts" })).toContainText("Sunday cover");
  await shot(page, "schedule-shifts");
});
