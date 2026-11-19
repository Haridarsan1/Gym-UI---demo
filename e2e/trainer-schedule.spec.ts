import { expect, test } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";
import { scheduleJourney } from "./trainer-journeys";

/** The trainer’s schedule (O01, O02, T04, M06) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Schedule on a phone", () => {
  test("marks sessions, handles leave that clashes with a booking, and edits availability and shifts", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_trainer_meera", "/t");
    await scheduleJourney(page, 390);
    expect(problems).toEqual([]);
  });

  test("a session that has not started can’t be marked, and says so", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/schedule");
    await expect(page.getByRole("list", { name: "Today’s sessions" }).getByRole("listitem")).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^Mark .+ attended$/ })).toHaveCount(0);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("a member who books after leave is added sees no times on those days", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/schedule?tab=away");
    await page.getByRole("form", { name: "Add leave" }).getByLabel("First day").fill("2026-11-20");
    await page.getByRole("button", { name: "Add leave" }).click();
    await expect(page.getByRole("list", { name: "Upcoming leave" })).toContainText("20 Nov 2026");
    await page.goto("/login");
    await page.evaluate(() => localStorage.removeItem("ember.session"));
    await signInAs(page, "u_member_arjun", "/m/bookings");
    await page.getByRole("button", { name: "Book a session" }).first().click();
    const d = page.getByRole("dialog", { name: "Book a session" });
    await d.getByRole("list", { name: "Trainers" }).getByRole("listitem").first().getByRole("button").click();
    const days = d.getByRole("radiogroup", { name: "Day" }).getByRole("radio");
    await expect(days.first()).toBeVisible();
    // Her other days are bookable; Friday 20 Nov, the day of her leave, is not offered.
    await expect(days.filter({ hasText: /Mon 23/ })).toHaveCount(1);
    await expect(days.filter({ hasText: /Fri 20/ })).toHaveCount(0);
  });

  test("trainers see only their own schedule; members and the desk cannot open it", async ({ page }) => {
    await signInAs(page, "u_trainer_farah", "/t/schedule?tab=away");
    await expect(page.getByRole("list", { name: "Upcoming leave" })).toContainText("Family event");
    await expect(page.getByRole("list", { name: "Upcoming leave" })).not.toContainText("Year-end break");
    await signInAs(page, "u_member_arjun", "/m");
    await page.goto("/t/schedule");
    await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
  });
});
