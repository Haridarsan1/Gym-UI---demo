import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";

/** Trainer Today (T07) on a phone: one column, the five lists one after another. Wider layouts are in responsive.spec.ts and desktop-flows.spec.ts. */

const section = (page: Page, name: string) => page.getByRole("region", { name });

test.describe("Trainer Today on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t");
    await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Meera$/, level: 1 })).toBeVisible();
  });

  test("greets the trainer, sums up the day, and stacks five lists in one column", async ({ page }) => {
    await expect(page.getByText(/^4 sessions today, 3 still to come\. \d+ clients need you\.$/)).toBeVisible();
    for (const title of ["Sessions today", "Reviews overdue", "Missed workouts", "Credits expiring", "Waiting for a plan"]) await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
    expect(await page.locator("[data-zones]").count()).toBe(0);
    // One column: every list is as wide as the others.
    const widths = await page.locator("main section").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(new Set(widths).size).toBe(1);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("lists today’s sessions in time order with the first done and the next marked", async ({ page }) => {
    const rows = section(page, "Sessions today").getByRole("listitem");
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText("Done");
    await expect(rows.nth(1)).toContainText("Next");
    await expect(rows.nth(1)).toContainText(/5:00 pm to 6:00 pm/);
    await expect(rows.nth(2)).not.toContainText("Next");
  });

  test("the long lists show three clients and a Show all that opens the rest", async ({ page }) => {
    const reviews = section(page, "Reviews overdue");
    const count = Number((await reviews.locator("h2 span").last().textContent())!);
    expect(count).toBeGreaterThan(3);
    await expect(reviews.getByRole("listitem")).toHaveCount(3);
    await reviews.getByRole("button", { name: `Show all ${count}` }).click();
    await expect(reviews.getByRole("listitem")).toHaveCount(count);
  });

  test("every row shows why the client is there, and a client opens from it", async ({ page }) => {
    const missed = section(page, "Missed workouts").getByRole("listitem").first();
    await expect(missed).toContainText(/Missed \d of \d workouts in 7 days/);
    await expect(missed).toContainText(/Last trained \d+ \w{3}|No workout logged/);
    await missed.getByRole("link").click();
    await expect(page).toHaveURL(/\/t\/clients\/mem_\d+$/);
  });

  test("meets the touch rules: 44 px targets, no uppercase labels, no sideways scroll, no console errors", async ({ page }) => {
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a, button")]
        .filter((el) => el.offsetParent !== null && !el.classList.contains("sr-only"))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.height < 43.5 || r.width < 43.5))
        .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    expect(small).toEqual([]);
    const upper = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main *")].filter((el) => getComputedStyle(el).textTransform === "uppercase").length);
    expect(upper).toBe(0);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("a trainer with fewer clients sees only their own, and an empty list says what it is for", async ({ page }) => {
    await signInAs(page, "u_trainer_kavya", "/t");
    await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Kavya$/, level: 1 })).toBeVisible();
    await expect(section(page, "Credits expiring")).toContainText("No credits about to expire.");
    await expect(page.getByText("Karthik Gupta")).toHaveCount(0); // Meera’s client
  });
});

test("members and other staff do not get the trainer’s Today", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/t");
  await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sessions today/ })).toHaveCount(0);
});
