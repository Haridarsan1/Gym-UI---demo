import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";

/** Clients and the client profile on a phone: the list is a screen, a client opens as another with a Back link. */

const rows = (page: Page) => page.getByRole("list", { name: "Your clients" }).getByRole("listitem");

test.describe("Clients on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/clients");
    await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
  });

  test("lists the trainer’s own clients in name order, with the plan and how they are doing", async ({ page }) => {
    await expect(rows(page).first()).toBeVisible();
    const names = await rows(page).locator(".font-semibold").evaluateAll((els) => els.map((e) => e.textContent!.trim()).filter((t) => /\s/.test(t) && !/%|Review|Behind|Needs|Credits|Frozen/.test(t)));
    expect(names.length).toBeGreaterThan(10);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    const arjun = rows(page).filter({ hasText: "Arjun Kumar" });
    await expect(arjun).toContainText("Strength and size block");
    await expect(arjun).toContainText(/\d+%/);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("searches by name and by phone, and filters by what needs attention, all in the address", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Search clients by name or phone" }).fill("arjun");
    await expect(rows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/q=arjun/);
    await page.getByRole("searchbox").fill("98200 22002");
    await expect(rows(page).first()).toContainText("Arjun Kumar");
    await page.getByRole("searchbox").fill("zzzz");
    await expect(page.getByRole("heading", { name: "No clients match" })).toBeVisible();
    await page.getByRole("searchbox").fill("");
    await page.getByRole("radio", { name: "Needs a plan" }).click();
    await expect(page).toHaveURL(/f=plan/);
    await expect(rows(page).filter({ hasText: "Sneha Patil" })).toHaveCount(1);
    for (const r of await rows(page).all()) await expect(r).toContainText("Needs a plan");
    await page.reload();
    await expect(page.getByRole("radio", { name: "Needs a plan" })).toHaveAttribute("aria-checked", "true");
  });

  test("opens a client with a Back link that returns to the same list", async ({ page }) => {
    await page.getByRole("searchbox").fill("arj");
    await rows(page).first().getByRole("link").click();
    await expect(page).toHaveURL(/\/t\/clients\/mem_arjun\?q=arj$/);
    await expect(page.getByRole("heading", { name: "Arjun Kumar", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Clients", exact: true }).first().click();
    await expect(page).toHaveURL(/\/t\/clients\?q=arj$/);
    await expect(page.getByRole("searchbox")).toHaveValue("arj");
  });
});

test.describe("Client profile on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/clients/mem_arjun");
    await expect(page.getByRole("heading", { name: "Arjun Kumar", level: 1 })).toBeVisible();
  });

  test("Overview: at a glance, adherence, program versions and goals", async ({ page }) => {
    const glance = page.getByRole("complementary", { name: "Client at a glance" });
    await expect(glance).toContainText("Monthly Plus");
    await expect(glance).toContainText("5 training credits free");
    await expect(page.getByRole("region", { name: "Sticking to the plan" })).toContainText(/\d+%/);
    const versions = page.getByRole("list", { name: "Program versions" }).getByRole("listitem");
    await expect(versions).toHaveCount(2);
    await expect(versions.first()).toContainText("Version 2: Strength and size block (current)");
    await expect(versions.first()).toContainText("Meera Joshi");
    await expect(page.getByRole("region", { name: "Goals" })).toContainText("Reach 78 kg");
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("Workouts: every log says who entered it", async ({ page }) => {
    await page.getByRole("tab", { name: "Workouts" }).click();
    await expect(page).toHaveURL(/tab=logs/);
    const logs = page.getByRole("list", { name: "Recent workouts" }).getByRole("listitem");
    await expect(logs.first()).toContainText(/Logged by (the member|Meera Joshi \(coach\))/);
    expect(await logs.count()).toBeGreaterThan(5);
  });

  test("Notes: a private note is saved, says only the trainer can read it, and shows at the top", async ({ page }) => {
    await page.getByRole("tab", { name: "Notes and reviews" }).click();
    const list = page.getByRole("list", { name: "Notes and reviews" });
    await expect(list).toContainText("Left shoulder a little tight");
    await expect(page.getByRole("button", { name: "Save note" })).toBeDisabled();
    await page.getByRole("textbox", { name: "Private note" }).fill("Knee is fine again.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Note saved")).toBeVisible();
    await expect(list.getByRole("listitem").first()).toContainText("Knee is fine again.");
    await expect(list.getByRole("listitem").first()).toContainText("Private note, only you can read it");
    await expect(list.getByRole("listitem").first()).toContainText("You,");
  });

  test("a client who is not yours cannot be opened", async ({ page }) => {
    await signInAs(page, "u_trainer_kavya", "/t");
    await page.goto("/t/clients/mem_arjun");
    await expect(page.getByText("We couldn’t find this client.")).toBeVisible();
    await expect(page.getByText("Arjun Kumar")).toHaveCount(0);
  });
});
