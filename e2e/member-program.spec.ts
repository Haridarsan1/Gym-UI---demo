import { expect, test } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";

test.describe("Program path: Arjun", () => {
  test.beforeEach(async ({ page }) => signInAs(page, "u_member_arjun", "/m/program"));

  test("shows the current plan, this week as a path, and today’s workout marked", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Program", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Strength and size block" })).toBeVisible();
    await expect(page.getByText(/Version 2 from Coach Meera/)).toBeVisible();
    const week = page.getByRole("list", { name: "Days of the week" });
    await expect(week.getByRole("button")).toHaveCount(4);
    await expect(week.getByText(/rest day/i).first()).toBeVisible();
    await expect(week.getByRole("button", { name: /Upper body and core/ })).toContainText("Today");
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("opens a preview with targets, instructions and alternatives, and starts the workout", async ({ page }) => {
    await page.getByRole("button", { name: /Preview Upper body and core/ }).click();
    const sheet = page.getByRole("dialog", { name: "Workout preview" });
    await expect(sheet.getByRole("heading", { name: "Upper body and core" })).toBeVisible();
    const bench = sheet.getByRole("listitem").filter({ hasText: "Dumbbell bench press" });
    await expect(bench).toContainText("Target: 3 × 10");
    await expect(bench).toContainText("Instead: Push-up");
    await bench.getByText("How to do it").click();
    await expect(bench.getByText(/Press the dumbbells up over your chest/)).toBeVisible();
    await sheet.getByRole("link", { name: "Start workout" }).click();
    await expect(page).toHaveURL(/\/m\/workout\/\d{4}-\d{2}-\d{2}$/);
  });

  test("closes the preview with Escape and puts focus back on the day", async ({ page }) => {
    const day = page.getByRole("button", { name: /Preview Upper body and core/ });
    await day.click();
    await expect(page.getByRole("dialog", { name: "Workout preview" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(day).toBeFocused();
  });

  test("goes back to earlier weeks, which show how they went, and returns to this week", async ({ page }) => {
    await page.getByRole("button", { name: "Previous week" }).click();
    await expect(page.getByRole("button", { name: "Back to this week" })).toBeVisible();
    const week = page.getByRole("list", { name: "Days of the week" });
    await expect(week.getByText(/^Done,/).first()).toBeVisible();
    await page.getByRole("button", { name: "Back to this week" }).click();
    await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  });

  test("keeps earlier plans, which stay as they were", async ({ page }) => {
    await page.getByText(/^Earlier plans \(1\)/).click();
    await expect(page.getByText(/kept exactly as they were/)).toBeVisible();
  });

  test("touch targets are at least 44 px", async ({ page }) => {
    for (const name of ["Previous week", "Next week"]) {
      const box = (await page.getByRole("button", { name }).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const day = (await page.getByRole("button", { name: /Preview Upper body and core/ }).boundingBox())!;
    expect(day.height).toBeGreaterThanOrEqual(44);
  });
});

test("Program path: a member with no plan yet is told what happens next", async ({ page }) => {
  await signInAs(page, "u_member_sneha", "/m/program");
  await expect(page.getByRole("heading", { name: "Your plan is on its way" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Today" })).toBeVisible();
});

test("Program path: shows an error with a retry when loading fails", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m/program");
  await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 1 })));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("We couldn’t load your program");
  await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 0 })));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Strength and size block" })).toBeVisible();
});
