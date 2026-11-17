import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

const card = (page: Page, name: string) => page.getByRole("region", { name });

test.describe("Today: Arjun (a workout today)", () => {
  test.beforeEach(async ({ page }) => signInAs(page, "u_member_arjun", "/m"));

  test("greets him, shows today’s workout from the new plan, and a Start button he can reach with a thumb", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Arjun$/, level: 1 })).toBeVisible();
    await expect(page.getByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} \w{3}$/).first()).toBeVisible(); // the small date line above the greeting
    const hero = card(page, "Upper body and core");
    await expect(hero.getByText(/^Today’s workout, week 2$/)).toBeVisible();
    await expect(hero.getByText(/5 exercises, about \d+ min/)).toBeVisible();
    await expect(hero.getByRole("list", { name: "Exercises" }).getByRole("listitem")).toHaveText(["Dumbbell bench press", "One-arm dumbbell row", "Seated dumbbell press", "+2 more"]);
    await expect(hero.getByText(/^New plan from Coach Meera, \d+ \w{3}$/)).toBeVisible();
    const start = hero.getByRole("link", { name: "Start workout" });
    await expect(start).toBeVisible();
    // The Start button sits in the lower part of a phone screen where a thumb reaches.
    const box = (await start.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThan(300);
  });

  test("the raised button in the tab bar starts today’s workout", async ({ page }) => {
    const raised = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Start today’s workout" });
    await expect(raised).toBeVisible();
    await raised.click();
    await expect(page).toHaveURL(/\/m\/workout\/\d{4}-\d{2}-\d{2}$/);
  });

  test("shows the week ring and a streak of several weeks", async ({ page }) => {
    const week = card(page, "This week");
    await expect(week.getByRole("img", { name: /^0 of 4 workouts done this week$/ })).toBeVisible();
    await expect(week.getByRole("img", { name: /^\d+-week streak$/ })).toBeVisible();
    await expect(week.getByText(/3 more workouts to keep your streak/)).toBeVisible();
  });

  test("shows five sessions left, the next booking, and the exact free-cancellation deadline", async ({ page }) => {
    const sessions = card(page, "Training sessions");
    await expect(sessions.getByText("5", { exact: true })).toBeVisible();
    await expect(sessions.getByText("1 held for a booking")).toBeVisible();
    await expect(sessions.getByText(/with Meera Joshi$/)).toBeVisible();
    // A 6 pm session can be canceled free until 6 am that day (12 hours before).
    await expect(sessions.getByText(/^Free cancellation until 6:00 am (today|tomorrow|\w{3} \d{1,2} \w{3})$/)).toBeVisible();
    await expect(sessions.getByRole("link", { name: "Manage bookings" })).toHaveAttribute("href", "/m/bookings");
  });

  test("shows the new review card, which opens the Reviews section of Progress", async ({ page }) => {
    const review = card(page, "New review from Coach Meera");
    await expect(review.getByText(/^New plan is live from/)).toBeVisible();
    await review.getByRole("link", { name: "Read review" }).click();
    await expect(page).toHaveURL(/\/m\/progress\/reviews$/);
  });

  test("shows the membership and has no payment notice", async ({ page }) => {
    const m = card(page, "Monthly Plus");
    await expect(m.getByText("Active")).toBeVisible();
    await expect(m.getByText(/\(21 days left\)$/)).toBeVisible();
    await expect(page.getByLabel("Payment due")).toHaveCount(0);
  });
});

test.describe("Today: other states", () => {
  test("Priya: a rest day, the raised button is the check-in pass, and an overdue invoice is shown calmly", async ({ page }) => {
    await signInAs(page, "u_member_priya", "/m");
    const hero = card(page, "Rest day");
    await expect(hero.getByText(/^Your next workout is Wed 18 Nov: Full body B\. Rest is part of the plan\.$/)).toBeVisible();
    await expect(hero.getByRole("link", { name: "Open check-in pass" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Check-in pass" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Start today’s workout/ })).toHaveCount(0);
    const due = page.getByLabel("Payment due");
    await expect(due).toContainText("of ₹2,950 was due 4 days ago.");
    await expect(due.getByRole("link", { name: "Pay ₹2,950" })).toHaveAttribute("href", /^\/m\/membership\?pay=inv_/);
    await expect(hero.getByRole("link", { name: "Log your weight" })).toHaveAttribute("href", "/m/progress?log=weight");
    await expect(hero.getByRole("link", { name: "Book a session" })).toHaveAttribute("href", "/m/bookings");
    // Money is never shown in red.
    expect(await due.evaluate((el) => getComputedStyle(el).color)).not.toMatch(/rgb\((1[6-9]\d|2\d\d), ([0-5]?\d), ([0-5]?\d)\)/);
  });

  test("Rahul: a frozen membership explains itself, pauses the streak, and offers no workout", async ({ page }) => {
    await signInAs(page, "u_member_rahul", "/m");
    await expect(page.getByRole("complementary", { name: "Membership frozen" })).toContainText("Your membership is frozen until");
    await expect(page.getByRole("complementary", { name: "Membership frozen" })).toContainText("nothing counts as missed");
    await expect(card(page, "Taking a break")).toBeVisible();
    await expect(page.getByRole("link", { name: /Start (today’s )?workout/ })).toHaveCount(0);
    await expect(page.getByRole("img", { name: /^\d+-week streak, paused$/ })).toBeVisible();
  });

  test("Sneha: no plan yet, with her trainer’s name and no empty cards", async ({ page }) => {
    await signInAs(page, "u_member_sneha", "/m");
    const hero = card(page, "Your plan is on its way");
    await expect(hero).toContainText("Coach Meera is putting your plan together.");
    await expect(page.getByRole("img", { name: "No workouts planned this week" })).toBeVisible();
    await expect(page.getByText("Finish your first week to start a streak")).toBeVisible();
    await expect(page.getByRole("img", { name: /week streak/ })).toHaveCount(0);
    await expect(card(page, "Training sessions")).toHaveCount(0);
    await expect(card(page, "10-visit pass")).toContainText("4 visits left");
  });
});

test.describe("Today: loading and failing", () => {
  test("shows a placeholder while loading", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 1500, maxMs: 1500, failureRate: 0 })));
    await page.reload();
    await expect(page.getByRole("status", { name: "Loading today" })).toBeVisible();
    await expect(page.getByText(/^Good (morning|afternoon|evening), Arjun$/)).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("status", { name: "Loading today" })).toHaveCount(0);
  });

  test("says what went wrong and offers Try again when the server cannot be reached", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 1 })));
    await page.reload();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("We couldn’t load today", { timeout: 15_000 });
    await expect(alert).toContainText("We couldn’t reach the server. Check your connection and try again.");
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 0 })));
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText(/^Good (morning|afternoon|evening), Arjun$/)).toBeVisible();
  });
});

test.describe("Today: layout", () => {
  for (const width of [360, 390, 1440]) {
    test(`fits at ${width}px with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await signInAs(page, "u_member_arjun", "/m");
      await expect(card(page, "Upper body and core")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    });
  }
  test("is readable with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signInAs(page, "u_member_arjun", "/m");
    await expect(card(page, "Upper body and core")).toBeVisible();
    await expect(card(page, "This week").getByRole("img", { name: /workouts done this week/ })).toBeVisible();
  });
});
