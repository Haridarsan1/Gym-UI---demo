import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";

/** The exercise library (W01) on a phone: a list with filters folded above it, and an exercise as its own screen. */

const list = (page: Page) => page.getByRole("list", { name: "Exercise list" }).getByRole("listitem");
const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

test.describe("Exercise library on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/library");
    await expect(page.getByRole("heading", { name: "Exercises", level: 1 })).toBeVisible();
    await expect(list(page).first()).toBeVisible();
  });

  test("lists the library by name, with the category and muscles under each", async ({ page }) => {
    expect(await list(page).count()).toBeGreaterThan(25);
    await expect(list(page).filter({ hasText: "Barbell bench press" })).toContainText("Strength, Chest, Triceps, Shoulders");
    const names = await list(page).locator(".font-semibold").evaluateAll((els) => els.map((e) => e.textContent!.trim()));
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("searches by name, muscle and equipment, and the search is in the address", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Search exercises" }).fill("bench press");
    await expect(list(page)).toHaveCount(2);
    await expect(page).toHaveURL(/q=bench/);
    await page.getByRole("searchbox").fill("cable");
    await expect(list(page).first()).toBeVisible();
    await page.getByRole("searchbox").fill("zzzz");
    await expect(page.getByRole("heading", { name: "No exercises match" })).toBeVisible();
    await page.getByRole("searchbox").fill("");
    await page.reload();
    await expect(list(page).first()).toBeVisible();
  });

  test("filters by category, muscle and equipment together, from a fold above the list", async ({ page }) => {
    await page.getByText("Filters", { exact: false }).first().click();
    const filters = page.getByRole("group", { name: "Filters" });
    await filters.getByRole("radio", { name: /^Strength/ }).click();
    await filters.getByLabel("Muscle group").selectOption("chest");
    await filters.getByLabel("Equipment").selectOption("dumbbells");
    await expect(list(page)).toHaveCount(2);
    await expect(page).toHaveURL(/cat=strength/);
    await expect(page).toHaveURL(/muscle=chest/);
    await expect(page.getByText("Filters (on)")).toBeVisible();
    await filters.getByRole("radio", { name: "All" }).click();
    await filters.getByLabel("Muscle group").selectOption("");
    await filters.getByLabel("Equipment").selectOption("");
    expect(await list(page).count()).toBeGreaterThan(10);
  });

  test("opens an exercise as its own screen, with a way back that keeps the search", async ({ page }) => {
    await page.getByRole("searchbox").fill("bench");
    await list(page).filter({ hasText: "Barbell bench press" }).getByRole("link").click();
    await expect(page.getByRole("heading", { name: "Barbell bench press", level: 1 })).toBeVisible();
    await expect(page.getByText("Comes with Ember")).toBeVisible();
    await expect(page.getByRole("region", { name: "How to do it" })).toContainText("Lie on the bench");
    await expect(page.getByRole("list").filter({ hasText: "Push-up" }).getByRole("link", { name: "Push-up" })).toBeVisible();
    await page.getByRole("link", { name: "Exercises", exact: true }).first().click();
    await expect(page).toHaveURL(/q=bench/);
    await expect(page.getByRole("searchbox")).toHaveValue("bench");
  });

  test("adds the gym’s own exercise, then edits it, archives it and brings it back", async ({ page }) => {
    await page.getByRole("button", { name: "Add exercise" }).click();
    const d = dialog(page, "Add an exercise");
    await d.getByRole("button", { name: "Add exercise" }).click();
    await expect(d.getByRole("alert")).toContainText("Give the exercise a name.");
    await d.getByLabel("Name").fill("Sled push");
    await d.getByLabel("Category").selectOption("conditioning");
    await d.getByRole("textbox", { name: "Muscle groups" }).fill("legs");
    await d.getByRole("button", { name: "Add to muscle groups" }).click();
    await d.getByRole("textbox", { name: "Equipment" }).fill("sled");
    await d.getByRole("textbox", { name: "Equipment" }).press("Enter");
    await d.getByLabel("How to do it").fill("Lean in, drive through your legs and keep your arms straight.");
    await d.getByLabel("Can be swapped for").selectOption({ label: "Walking lunge" });
    await d.getByRole("button", { name: "Add exercise" }).click();
    await expect(page.getByText("Exercise added")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sled push", level: 1 })).toBeVisible();
    await expect(page.getByText("Your gym’s exercise, added by Meera Joshi")).toBeVisible();
    await expect(page.getByRole("link", { name: "Walking lunge" })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    const e = dialog(page, "Edit exercise");
    await e.getByLabel("Name").fill("Sled push, heavy");
    await e.getByRole("button", { name: "Save exercise" }).click();
    await expect(page.getByRole("heading", { name: "Sled push, heavy", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Archive" }).click();
    await dialog(page, "Archive exercise").getByRole("button", { name: "Archive exercise" }).click();
    await expect(page.getByText("Exercise archived")).toBeVisible();
    await expect(page.getByText("Archived", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Exercise restored")).toBeVisible();
    await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  });

  test("an exercise that comes with Ember can be copied, not changed", async ({ page }) => {
    await page.goto("/t/library?ex=ex_plank");
    await expect(page.getByRole("heading", { name: "Plank", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await page.getByRole("button", { name: "Make a copy for your gym" }).click();
    const d = dialog(page, "Add an exercise");
    await expect(d.getByLabel("Name")).toHaveValue("Plank (our version)");
    await d.getByLabel("Name").fill("Plank with reach");
    await d.getByRole("button", { name: "Add exercise" }).click();
    await expect(page.getByRole("heading", { name: "Plank with reach", level: 1 })).toBeVisible();
  });

  test("a name that is taken is refused with the name in the message", async ({ page }) => {
    await page.getByRole("button", { name: "Add exercise" }).click();
    const d = dialog(page, "Add an exercise");
    await d.getByLabel("Name").fill("plank");
    await d.getByRole("textbox", { name: "Muscle groups" }).fill("core");
    await d.getByRole("textbox", { name: "Muscle groups" }).press("Enter");
    await d.getByLabel("How to do it").fill("Hold a straight line from head to heels.");
    await d.getByRole("button", { name: "Add exercise" }).click();
    await expect(d.getByRole("alert")).toContainText("There is already an exercise called “Plank”.");
  });
});
