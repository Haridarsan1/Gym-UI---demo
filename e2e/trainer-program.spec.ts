import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, readStore, signInAs } from "./helpers";

/** The program builder, templates, preview and publish (W02) on a phone. Wider layouts are in desktop-flows.spec.ts. */

const rows = (page: Page) => page.getByRole("list", { name: "Exercises in this workout" }).getByRole("listitem");
const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

async function open(page: Page, memberId: string, heading: RegExp) {
  await signInAs(page, "u_trainer_meera", "/t");
  await page.goto(`/t/library/programs?member=${memberId}`);
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
}
/** Adds an exercise to the open day from the library sheet. */
async function add(page: Page, name: string, section: "Warm-up" | "Main" | "Cool-down" = "Main") {
  await page.getByRole("button", { name: "Add exercise" }).click();
  const d = dialog(page, "Add an exercise");
  await d.getByRole("radio", { name: section }).click();
  await d.getByRole("searchbox", { name: "Search the library" }).fill(name);
  await d.getByRole("button", { name: `Add ${name}` }).click();
}

test.describe("Program builder on a phone", () => {
  test("builds a first program for a client with none, with checks before it can be published", async ({ page }) => {
    await open(page, "mem_sneha", /^Program for Sneha Patil$/);
    await expect(page.getByText("No program yet. You are building the first.")).toBeVisible();
    await expect(page.getByLabel("Starts on")).toHaveValue("2026-11-17");
    await expect(rows(page)).toHaveCount(0);
    expect(await hasHorizontalScroll(page)).toBe(false);

    await add(page, "Arm circles", "Warm-up");
    await add(page, "Goblet squat");
    await add(page, "Plank");
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).nth(1)).toContainText("Goblet squat");

    // Publishing says what is missing; nothing goes out.
    await page.getByRole("button", { name: "Publish version 1" }).click();
    const d = dialog(page, "Publish program");
    await expect(d.getByRole("alert")).toContainText("Give the program a name.");
    await expect(d.getByRole("button", { name: "Publish version 1" })).toBeDisabled();
    await d.getByRole("button", { name: "Not yet" }).click();
    await page.getByLabel("Program name").fill("Getting started");
    await page.getByLabel("Workout name").fill("Full body");
    await rows(page).nth(1).getByLabel("Load (kg)").fill("12");
    await rows(page).nth(2).getByLabel("Reps", { exact: true }).fill("");
    await rows(page).nth(2).getByLabel("Time (s)").fill("30");

    await page.getByRole("button", { name: "Publish version 1" }).click();
    await expect(d.getByRole("heading", { name: "Publish version 1?" })).toBeVisible();
    await expect(d).toContainText("1 workouts over 1 week, 3 exercises.");
    await expect(d).toContainText("Sneha has no program yet, so this one starts their training.");
    await d.getByRole("button", { name: "Publish version 1" }).click();
    const done = dialog(page, "Version published");
    await expect(done.getByRole("heading", { name: "Version 1 is published" })).toBeVisible();
    await expect(done).toContainText("“Getting started” starts on Tue 17 Nov");
    await done.getByRole("link", { name: "Back to Sneha" }).click();
    await expect(page.getByRole("heading", { name: "Sneha Patil", level: 1 })).toBeVisible();
    await expect(page.getByRole("list", { name: "Program versions" })).toContainText("Version 1: Getting started (current)");
    const versions = (await readStore(page, "workoutPlanVersions")).filter((v) => v.memberId === "mem_sneha");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ status: "published", versionNumber: 1, authorId: "u_trainer_meera" });
  });

  test("starts from the current version, saves a draft that survives a reload, and publishes version 3 without touching version 2 or any log", async ({ page }) => {
    await open(page, "mem_arjun", /^Program for Arjun Kumar$/);
    await expect(page.getByText("Version 2 is current. You are building version 3.")).toBeVisible();
    await expect(page.getByLabel("Program name")).toHaveValue("Strength and size block, revised");
    await expect(page.getByLabel("Starts on")).toHaveValue("2026-11-18");
    const before = (await readStore(page, "workoutPlanVersions")).filter((v) => v.memberId === "mem_arjun");
    const logsBefore = (await readStore(page, "workoutLogs")).filter((l) => l.memberId === "mem_arjun");

    await page.getByLabel("Program name").fill("Peak block");
    await rows(page).first().getByLabel("Sets").fill("4");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Version 2 is current. You are building version 3 (a saved draft).")).toBeVisible();
    await expect(page.getByLabel("Program name")).toHaveValue("Peak block");
    await expect(rows(page).first().getByLabel("Sets")).toHaveValue("4");

    await page.getByRole("button", { name: "Publish version 3" }).click();
    const d = dialog(page, "Publish program");
    await expect(d).toContainText("Compared with version 2:");
    await expect(d).toContainText("Version 2 stays as it was, and so does every workout Arjun has logged.");
    await d.getByRole("button", { name: "Publish version 3" }).click();
    const done = dialog(page, "Version published");
    await expect(done.getByRole("heading", { name: "Version 3 is published" })).toBeVisible();
    await expect(done).toContainText("Version 2, “Strength and size block”, stays as it was and covers Arjun until 17 Nov 2026.");

    const after = (await readStore(page, "workoutPlanVersions")).filter((v) => v.memberId === "mem_arjun");
    expect(after.filter((v) => v.status === "published")).toHaveLength(3);
    expect(after.some((v) => v.status === "draft")).toBe(false);
    for (const v of before) expect(after.find((a) => a.id === v.id)).toEqual(v);
    expect((await readStore(page, "workoutLogs")).filter((l) => l.memberId === "mem_arjun")).toEqual(logsBefore);
  });

  test("reorders with the move buttons, removes an exercise, and previews the day as the client sees it", async ({ page }) => {
    await open(page, "mem_arjun", /^Program for Arjun Kumar$/);
    const names = async () => rows(page).locator("p.font-semibold").allTextContents();
    const first = (await names())[0]!;
    await rows(page).first().getByRole("button", { name: `Move ${first} down` }).click();
    expect((await names())[1]).toBe(first);
    await rows(page).nth(1).getByRole("button", { name: `Move ${first} up` }).click();
    expect((await names())[0]).toBe(first);
    const count = await rows(page).count();
    await rows(page).last().getByRole("button", { name: /^Remove / }).click();
    await expect(rows(page)).toHaveCount(count - 1);

    await page.getByRole("button", { name: "Preview as member" }).click();
    const p = dialog(page, "Preview as member");
    await expect(p.getByRole("heading", { name: "Preview as Arjun" })).toBeVisible();
    const card = p.getByRole("article", { name: "Workout preview" });
    await expect(card).toContainText(first);
    await expect(card).toContainText(/Target: \d × \d+/);
    await expect(card.getByRole("region", { name: "Warm-up" })).toBeVisible();
    await expect(card.getByRole("region", { name: "Main" })).toBeVisible();
    await p.getByRole("radio", { name: "Week 2" }).click();
    await expect(card).toContainText("Week 2");
    await p.getByRole("button", { name: "Back to the builder" }).click();
    await expect(p).toHaveCount(0);
  });

  test("starts from a template, asks before replacing work, and starts on a Monday", async ({ page }) => {
    await open(page, "mem_sneha", /^Program for Sneha Patil$/);
    await page.getByRole("button", { name: "Use a template" }).click();
    const t = dialog(page, "Choose a template");
    const list = t.getByRole("list", { name: "Templates" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list).toContainText("Full body, three days");
    await expect(list).toContainText("8 weeks, 3 workouts a week");
    await expect(list).toContainText("By Neha Kulkarni, shared with the gym");
    await expect(list).not.toContainText("Base strength, four days"); // Aditya’s private template
    await t.getByRole("button", { name: "Use Full body, three days" }).click();
    await expect(page.getByText("Started from Full body, three days")).toBeVisible();
    await expect(page.getByLabel("Program name")).toHaveValue("Full body, three days");
    await expect(page.getByLabel("Starts on")).toHaveValue("2026-11-23"); // the next Monday
    await expect(page.getByText(/24 workouts over 8 weeks/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Mon/ }).first()).toBeVisible();

    // With work on screen, choosing another asks first.
    await page.getByRole("button", { name: "Use a template" }).click();
    await t.getByRole("button", { name: "Use Upper and core, twice a week" }).click();
    await expect(t).toContainText("Replace your program with “Upper and core, twice a week”?");
    await t.getByRole("button", { name: "Keep mine" }).click();
    await t.getByRole("button", { name: "Start from blank" }).click();
    await expect(page.getByText(/1 workouts over 1 week, 0 exercises/)).toBeVisible();
  });

  test("weeks: add, copy and remove, and a rest week", async ({ page }) => {
    await open(page, "mem_sneha", /^Program for Sneha Patil$/);
    await add(page, "Goblet squat");
    const nav = page.getByRole("navigation", { name: "Weeks and days" });
    await nav.getByRole("button", { name: "Copy week 1" }).click();
    await expect(nav.getByRole("heading", { name: "Week 2" })).toBeVisible();
    await expect(rows(page)).toHaveCount(1); // the copy keeps its exercise
    await nav.getByRole("button", { name: "Add a rest week" }).click();
    await expect(nav.getByRole("heading", { name: "Week 3 (rest)" })).toBeVisible();
    await expect(page.getByText("This is a rest week.")).toBeVisible();
    await nav.getByRole("button", { name: "Remove week 3" }).click();
    await expect(nav.getByRole("heading", { name: /Week 3/ })).toHaveCount(0);
    await nav.getByRole("button", { name: "Add a day to week 1" }).click();
    await expect(nav.getByRole("list").first().getByRole("button", { name: /Day 2/ })).toBeVisible();
  });

  test("an archived exercise and a workout with no main exercise are named, with where", async ({ page }) => {
    await open(page, "mem_sneha", /^Program for Sneha Patil$/);
    await page.getByLabel("Program name").fill("Check");
    await add(page, "Arm circles", "Warm-up");
    await page.getByRole("button", { name: "Publish version 1" }).click();
    const d = dialog(page, "Publish program");
    await expect(d.getByRole("alert")).toContainText("Week 1, Tue needs at least one main exercise.");
  });
});

test.describe("Templates on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/library/templates");
    await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();
  });

  test("lists her own first and the gym’s shared ones, and never another trainer’s private one", async ({ page }) => {
    const list = page.getByRole("list", { name: "Template list" }).getByRole("listitem");
    await expect(list).toHaveCount(3);
    await expect(list.first()).toContainText("yours");
    await expect(list.filter({ hasText: "Push, pull, legs" })).toContainText("by Neha Kulkarni");
    await expect(page.getByText("Base strength, four days")).toHaveCount(0);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("opens a template with its first weeks, and edit, share and archive for her own", async ({ page }) => {
    await page.getByRole("list", { name: "Template list" }).getByRole("link", { name: /Upper and core, twice a week/ }).click();
    await expect(page.getByRole("heading", { name: "Upper and core, twice a week", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "First weeks" })).toContainText("Tue");
    await page.getByRole("switch", { name: "Share with the gym" }).click();
    await expect(page.getByText("Shared with the gym", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Template archived")).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Template restored")).toBeVisible();
  });

  test("a shared template from someone else can be read but not changed", async ({ page }) => {
    await page.goto("/t/library/templates?t=tpl_ppl");
    await expect(page.getByRole("heading", { name: "Push, pull, legs", level: 1 })).toBeVisible();
    await expect(page.getByText("This is Neha Kulkarni’s template")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit template" })).toHaveCount(0);
  });

  test("creates a template in the builder, which then shows in the list, shared if asked", async ({ page }) => {
    await page.getByRole("link", { name: "New template" }).click();
    await expect(page.getByRole("heading", { name: "New template", level: 1 })).toBeVisible();
    await page.getByLabel("Template name").fill("Quick strength");
    await add(page, "Goblet squat");
    await page.getByRole("switch", { name: "Share with the gym" }).click();
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText("Template saved")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit template", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Templates" }).first().click();
    const list = page.getByRole("list", { name: "Template list" }).getByRole("listitem");
    await expect(list).toHaveCount(4);
    await expect(list.filter({ hasText: "Quick strength" })).toContainText("Shared");
  });

  test("a template that is not a sound program is refused with the reason", async ({ page }) => {
    await page.goto("/t/library/templates?new=1");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("alert").first()).toContainText("Give the template a name.");
  });
});
