import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, readStore, signInAs } from "./helpers";

/** Assessment and goals (T02) on a phone, including what happens when the member withdraws assessment consent. */

const open = async (page: Page, userId: string, memberId: string) => {
  await signInAs(page, userId, "/t");
  await page.goto(`/t/clients/${memberId}/assessment`);
  await expect(page.getByRole("heading", { name: "Assessment and goals", level: 1 })).toBeVisible();
};
const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

test.describe("Assessment", () => {
  test("starts from the latest assessment, keeps the history, and records a new one", async ({ page }) => {
    await open(page, "u_trainer_meera", "mem_arjun");
    await expect(page.getByRole("heading", { name: "Record a new assessment" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Some experience" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Tue" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Weight")).toHaveValue("80.6");
    const history = page.getByRole("list", { name: "Assessments" }).getByRole("listitem");
    await expect(history).toHaveCount(2);
    await expect(history.first()).toContainText("(current)");
    await expect(history.first()).toContainText("By Meera Joshi");
    await page.getByLabel("Weight").fill("79.8");
    await page.getByRole("button", { name: "Tue" }).click();
    await page.getByRole("button", { name: "Record assessment" }).click();
    await expect(page.getByText("Assessment recorded")).toBeVisible();
    await expect(history).toHaveCount(3);
    await expect(history.first()).toContainText("79.8 kg");
    expect(await hasHorizontalScroll(page)).toBe(false);
    // Reading and recording are audited.
    const audit = await readStore(page, "auditEvents");
    expect(audit.some((a) => a.action === "assessment.view" && a.memberId === "mem_arjun")).toBe(true);
    expect(audit.some((a) => a.entityType === "assessment" && a.action === "record.edit")).toBe(true);
  });

  test("a first assessment needs a day, says so, and then saves", async ({ page }) => {
    await open(page, "u_trainer_meera", "mem_sneha");
    await expect(page.getByRole("heading", { name: "Record the first assessment" })).toBeVisible();
    await page.getByRole("button", { name: "Record assessment" }).click();
    await expect(page.getByRole("alert")).toContainText("Choose at least one day.");
    await page.getByRole("button", { name: "Wed" }).click();
    await page.getByLabel("Restrictions the client reported").fill("Tight hamstrings.");
    await page.getByRole("button", { name: "Record assessment" }).click();
    await expect(page.getByText("Assessment recorded")).toBeVisible();
    await expect(page.getByRole("list", { name: "Assessments" }).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("list", { name: "Assessments" })).toContainText("Restrictions: Tight hamstrings.");
  });

  test("when the client has withdrawn assessment consent, nothing is shown or recorded, and goals still work", async ({ page }) => {
    await open(page, "u_trainer_farah", "mem_rahul");
    await expect(page.getByRole("status").filter({ hasText: "Assessment consent withdrawn" })).toContainText("turned off assessments on 8 Nov 2026");
    await expect(page.getByRole("status")).toContainText("hidden from everyone at the gym, you included");
    await expect(page.getByRole("button", { name: "Record assessment" })).toHaveCount(0);
    await expect(page.getByText("Mild lower back pain")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Assessments" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Active goals" })).toContainText("Reach 86 kg");
    const audit = await readStore(page, "auditEvents");
    expect(audit.some((a) => a.action === "assessment.view" && a.memberId === "mem_rahul")).toBe(false);
  });

  test("the client profile links here, and Back returns to the client", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/clients/mem_arjun");
    await page.getByRole("link", { name: "Assessment and goals" }).click();
    await expect(page.getByRole("heading", { name: "Assessment and goals", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Arjun" }).first().click();
    await expect(page).toHaveURL(/\/t\/clients\/mem_arjun$/);
  });
});

test.describe("Goals", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "u_trainer_meera", "mem_arjun");
  });

  test("lists active goals with progress, target, date and cadence, and earlier ones apart", async ({ page }) => {
    const active = page.getByRole("list", { name: "Active goals" }).getByRole("listitem");
    await expect(active).toHaveCount(1);
    await expect(active.first()).toContainText("Reach 78 kg");
    await expect(active.first()).toContainText("Now 79.1 kg. Target 78 kg by 5 Jan");
    await expect(active.first()).toContainText("Review every 28 days");
    await page.getByText("Earlier goals (1)").click();
    await expect(page.getByRole("list", { name: "Earlier goals" })).toContainText("Bench press 50 kg for three sets of ten");
  });

  test("adds a goal with its own cadence", async ({ page }) => {
    await page.getByRole("button", { name: "Add a goal" }).click();
    const d = dialog(page, "Add a goal");
    await d.getByRole("button", { name: "Add goal" }).click();
    await expect(d.getByRole("alert")).toContainText("Give the goal a name.");
    await d.getByLabel("Goal", { exact: true }).fill("Squat 80 kg");
    await d.getByLabel("What it measures").selectOption("squat");
    await d.getByLabel("Target", { exact: true }).fill("80");
    await d.getByLabel("Review every").fill("14");
    await d.getByRole("button", { name: "Add goal" }).click();
    await expect(page.getByText("Goal added")).toBeVisible();
    const active = page.getByRole("list", { name: "Active goals" }).getByRole("listitem");
    await expect(active).toHaveCount(2);
    await expect(active.filter({ hasText: "Squat 80 kg" })).toContainText("Review every 14 days");
  });

  test("revising keeps the old goal as Revised and needs a reason", async ({ page }) => {
    await page.getByRole("list", { name: "Active goals" }).getByRole("button", { name: "Revise" }).click();
    const d = dialog(page, "Revise goal");
    await d.getByLabel("Target", { exact: true }).fill("77");
    await d.getByRole("button", { name: "Save revised goal" }).click();
    await expect(d.getByRole("alert")).toContainText("Say why the goal is changing.");
    await d.getByLabel("Why it is changing").fill("Ahead of plan");
    await d.getByRole("button", { name: "Save revised goal" }).click();
    await expect(page.getByText("Goal revised")).toBeVisible();
    await expect(page.getByRole("list", { name: "Active goals" })).toContainText("Target 77 kg");
    await page.getByText(/Earlier goals \(2\)/).click();
    await expect(page.getByRole("list", { name: "Earlier goals" })).toContainText("Revised");
  });

  test("confirming achieved is the trainer’s decision, and closing needs a reason", async ({ page }) => {
    await page.getByRole("list", { name: "Active goals" }).getByRole("button", { name: "Confirm achieved" }).click();
    const d = dialog(page, "Confirm goal achieved");
    await expect(d).toContainText("The target has not been reached in the numbers yet.");
    await d.getByRole("button", { name: "Not yet" }).click();
    await expect(page.getByRole("list", { name: "Active goals" }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("list", { name: "Active goals" }).getByRole("button", { name: "Close" }).click();
    const c = dialog(page, "Close goal");
    await c.getByRole("button", { name: "Close goal" }).click();
    await expect(c.getByRole("alert")).toContainText("Say why the goal is closed.");
    await c.getByLabel("Why").fill("Changed focus");
    await c.getByRole("button", { name: "Close goal" }).click();
    await expect(page.getByText("Goal closed")).toBeVisible();
    await expect(page.getByText("No active goals.")).toBeVisible();
  });
});
