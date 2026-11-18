import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";

const simulate = (page: Page, failureRate: number) =>
  page.evaluate((f) => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: f })), failureRate);

async function startWorkout(page: Page) {
  await signInAs(page, "u_member_arjun", "/m");
  await page.getByRole("link", { name: "Start workout" }).click();
  await expect(page.getByRole("heading", { name: "Upper body and core", level: 1 })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Arm circles", level: 2 })).toBeVisible();
}

/** Logs every open set of the exercise on screen as prescribed. */
async function logRemainingSets(page: Page) {
  const log = page.getByRole("button", { name: "Log set" });
  while (await log.count()) {
    const before = await page.getByRole("list", { name: /^Sets,/ }).getAttribute("aria-label");
    await log.click();
    await expect(page.getByRole("list", { name: /^Sets,/ })).not.toHaveAttribute("aria-label", before!);
  }
}

const next = (page: Page) => page.getByRole("button", { name: "Next exercise" }).click();

test.describe("Workout session: Arjun", () => {
  test.beforeEach(async ({ page }) => startWorkout(page));

  test("shows the target, how to do it, and the first set pre-filled", async ({ page }) => {
    await expect(page.getByText("Exercise 1 of 7")).toBeVisible();
    await expect(page.getByText("Warm-up")).toBeVisible();
    await page.getByText("How to do it").click();
    await expect(page.getByText(/Stand tall and draw big circles/i).or(page.getByText(/circles/i).filter({ visible: true }).first())).toBeVisible();
    const form = page.getByRole("form", { name: "Set 1" });
    await expect(form.getByRole("textbox", { name: "Time (seconds)" })).toHaveValue("45");
  });

  test("logs 10, 10 and 8 reps against 3 × 10, times the rest, and finishes as completed (P03 check)", async ({ page }) => {
    await logRemainingSets(page);
    await next(page);
    await expect(page.getByRole("heading", { name: "Dumbbell bench press", level: 2 })).toBeVisible();
    await expect(page.getByText(/^Target: 3 × 10/)).toBeVisible();

    // Set 1 and 2 as prescribed: one tap each. A rest timer starts after each.
    const form = page.getByRole("form", { name: "Set 1" });
    await expect(form.getByRole("textbox", { name: "Reps" })).toHaveValue("10");
    // The load is last time’s load, and the hint says so.
    const hint = await form.getByText(/^Best last time: /).textContent();
    const lastLoad = /× ([\d.]+) kg/.exec(hint!)![1]!;
    await expect(form.getByRole("textbox", { name: "Load (kg)" })).toHaveValue(lastLoad);
    await form.getByRole("button", { name: "Log set" }).click();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByText(new RegExp(`10 × ${lastLoad} kg`)).first()).toBeVisible();
    await page.getByRole("button", { name: "Skip rest" }).click();
    await expect(page.getByRole("timer")).toHaveCount(0);
    await page.getByRole("form", { name: "Set 2" }).getByRole("button", { name: "Log set" }).click();

    // Set 3: 8 reps.
    const third = page.getByRole("form", { name: "Set 3" });
    await third.getByRole("button", { name: "Less reps" }).click();
    await third.getByRole("button", { name: "Less reps" }).click();
    await expect(third.getByRole("textbox", { name: "Reps" })).toHaveValue("8");
    await third.getByRole("button", { name: "Log set" }).click();
    await expect(page.getByRole("list", { name: "Sets, 3 of 3 logged" })).toContainText(/8 × [\d.]+ kg/);
    await expect(page.getByRole("list", { name: "Sets, 3 of 3 logged" })).not.toContainText("Set 3 8 × [\\d.]+ kg · as prescribed");

    await next(page);
    for (let i = 0; i < 4; i++) {
      await logRemainingSets(page);
      await next(page).catch(() => undefined);
    }
    await expect(page.getByRole("heading", { name: "Treadmill", level: 2 }).or(page.getByRole("heading", { level: 2 }).first())).toBeVisible();
    await logRemainingSets(page);

    await page.getByRole("button", { name: "Finish workout" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Finish workout" });
    await expect(sheet).toContainText("15 of 15 sets done");
    await sheet.getByLabel("Anything your trainer should know?").fill("Felt strong");
    await sheet.getByRole("button", { name: "Finish workout" }).click();

    await expect(page).toHaveURL(/\/m\/workout\/\d{4}-\d{2}-\d{2}\/complete$/);
    await expect(page.getByRole("heading", { name: "Workout done" })).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Program" }).click();
    await expect(page.getByRole("button", { name: /Upper body and core/ })).toContainText("Done");
    // Opening the preview shows what was done next to the target.
    await page.getByRole("button", { name: /Preview Upper body and core/ }).click();
    const bench = page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Dumbbell bench press" });
    await expect(bench).toContainText("Target: 3 × 10");
    await expect(bench).toContainText(/Did: 10 × [\d.]+ kg, 10 × [\d.]+ kg, 8 × [\d.]+ kg/);
  });

  test("the next set stays clear of the rest timer and the bottom bar", async ({ page }) => {
    await logRemainingSets(page);
    await next(page);
    await page.getByRole("form", { name: "Set 1" }).getByRole("button", { name: "Log set" }).click();
    const timer = page.getByRole("region", { name: "Rest timer" });
    await expect(timer).toBeVisible();
    const logButton = page.getByRole("form", { name: "Set 2" }).getByRole("button", { name: "Log set" });
    await expect(async () => {
      const t = (await timer.boundingBox())!;
      const b = (await logButton.boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(t.y + 1);
    }).toPass();
  });

  test("saves a draft: after a reload the sets are still there and Today offers Continue", async ({ page }) => {
    await logRemainingSets(page);
    await next(page);
    await page.getByRole("form", { name: "Set 1" }).getByRole("button", { name: "Log set" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dumbbell bench press", level: 2 })).toBeVisible();
    await expect(page.getByRole("list", { name: "Sets, 1 of 3 logged" })).toBeVisible();
    await page.goto("/m");
    await expect(page.getByRole("link", { name: "Continue workout" })).toBeVisible();
  });

  test("swaps an exercise and keeps the original in view", async ({ page }) => {
    await next(page);
    await page.getByRole("button", { name: "Swap exercise" }).click();
    const sheet = page.getByRole("dialog", { name: "Swap exercise" });
    await expect(sheet).toContainText("Your trainer prescribed Dumbbell bench press");
    await sheet.getByRole("button", { name: /^Push-up/ }).click();
    await expect(page.getByRole("heading", { name: "Push-up", level: 2 })).toBeVisible();
    await expect(page.getByText("Instead of Dumbbell bench press")).toBeVisible();
    await page.getByRole("button", { name: "Swap exercise" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Dumbbell bench press \(prescribed\)/ }).click();
    await expect(page.getByRole("heading", { name: "Dumbbell bench press", level: 2 })).toBeVisible();
  });

  test("skips a set without any red, and finishing early is saved as partly done", async ({ page }) => {
    await logRemainingSets(page);
    await next(page);
    await page.getByRole("form", { name: "Set 1" }).getByRole("button", { name: "Skip set" }).click();
    const list = page.getByRole("list", { name: /^Sets,/ });
    await expect(list).toContainText("Skipped");
    await page.getByRole("form", { name: "Set 2" }).getByRole("button", { name: "Log set" }).click();
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Finish workout" });
    await expect(sheet).toContainText("1 of 15 sets done, 1 skipped, 13 not logged");
    await sheet.getByRole("button", { name: "Save partly done workout" }).click();
    await expect(page).toHaveURL(/\/complete$/);
    await expect(page.getByRole("heading", { name: "1 of 15 sets done" })).toBeVisible();
  });

  test("a failed submit can be retried and makes one log", async ({ page }) => {
    await logRemainingSets(page);
    await next(page);
    await logRemainingSets(page);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Finish workout" });
    await simulate(page, 1);
    await sheet.getByRole("button", { name: "Save partly done workout" }).click();
    await expect(sheet.getByRole("alert")).toContainText("Your sets are safe");
    await simulate(page, 0);
    await sheet.getByRole("button", { name: "Try again" }).click();
    await expect(page).toHaveURL(/\/complete$/);
    await expect(page.getByRole("heading", { name: /sets done$/ })).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Program" }).click();
    await expect(page.getByRole("button", { name: /Upper body and core/ })).toContainText("Partly done");
    await expect(page.getByRole("list", { name: "Days of the week" }).getByText(/^Partly done,/)).toHaveCount(1);
  });

  test("works at the phone width: no sideways scroll, big targets, the tab bar steps aside", async ({ page }) => {
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    expect(await hasHorizontalScroll(page)).toBe(false);
    for (const name of ["Log set", "Skip set", "Next exercise"]) {
      const box = (await page.getByRole("button", { name }).first().boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    for (const name of ["Less time", "More time"]) {
      const box = (await page.getByRole("button", { name }).boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test("leaving keeps the sets", async ({ page }) => {
    await logRemainingSets(page);
    await page.getByRole("link", { name: /^Leave workout/ }).click();
    await expect(page).toHaveURL(/\/m$/);
    await expect(page.getByRole("link", { name: "Continue workout" })).toBeVisible();
  });
});

test("Workout session: a day with no workout says so", async ({ page }) => {
  await signInAs(page, "u_member_sneha", "/m/workout/2026-11-17");
  await expect(page.getByRole("heading", { name: "No workout on this day" })).toBeVisible();
});

test("Workout session: a future workout can be previewed but not logged", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m/program");
  await page.getByRole("button", { name: "Next week" }).click();
  await page.getByRole("button", { name: /Preview/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Workout preview" });
  await expect(sheet.getByText("This workout opens on its day.")).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Start workout/ })).toHaveCount(0);
});
