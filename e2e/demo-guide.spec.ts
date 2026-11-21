import { expect, test } from "@playwright/test";
import { expectNoSeriousViolations, readStore, signInAs } from "./helpers";

/** The demo guide: six scenarios, each signing in as the right person and opening the right screen, resetting nothing; and the reset, kept apart and confirmed. */

const SCENARIOS: Array<[string, RegExp, string | RegExp, string]> = [
  ["Log a workout as Arjun", /\/m$/, /^Good (morning|afternoon|evening), Arjun$/, "Arjun Kumar"],
  ["Review a client as Coach Meera", /\/t\/clients\/mem_arjun\/review$/, "Review", "Meera Joshi"],
  ["Check in a member at the front desk", /\/desk$/, "Check-in", "Pooja Nair"],
  ["Approve a refund as finance", /\/desk\/finance\/refunds$/, "Refunds", "Deepa Menon"],
  ["See the dashboard as the owner", /\/owner$/, "Dashboard", "Neha Kulkarni"],
  ["Support access as Ember admin", /\/admin\/support$/, "Support access", "Ember Admin"],
];

test("the login page and the account menu link to the guide, which lists six scenarios", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Demo guide" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { name: "Demo guide", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Scenarios" }).getByRole("listitem")).toHaveCount(6);
  for (const [title] of SCENARIOS) await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();

  await signInAs(page, "u_owner", "/owner");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("link", { name: "Demo guide" }).click();
  await expect(page).toHaveURL(/\/demo$/);
});

for (const [title, url, heading, who] of SCENARIOS) {
  test(`Start: ${title}`, async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: `Start: ${title}` }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Account menu for / }).first()).toContainText(who);
  });
}

test("starting a scenario resets nothing", async ({ page }) => {
  await signInAs(page, "u_owner", "/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  const before = (await readStore(page, "meta")).find((m) => m.key === "seededAt")?.value;
  expect(before).toBeTruthy();
  await page.goto("/demo");
  await page.getByRole("button", { name: "Start: Check in a member at the front desk" }).click();
  await expect(page.getByRole("heading", { name: "Check-in", level: 1 })).toBeVisible();
  expect((await readStore(page, "meta")).find((m) => m.key === "seededAt")?.value).toBe(before);
});

test("reset on the guide asks first, and keeping changes does nothing", async ({ page }) => {
  await signInAs(page, "u_owner", "/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  const before = (await readStore(page, "meta")).find((m) => m.key === "seededAt")?.value;
  await page.goto("/demo");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  const confirm = page.getByRole("dialog", { name: "Reset demo data" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Keep my changes" }).click();
  await expect(confirm).toHaveCount(0);
  expect((await readStore(page, "meta")).find((m) => m.key === "seededAt")?.value).toBe(before);
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("dialog", { name: "Reset demo data" }).getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo data reset" })).toBeVisible();
  expect((await readStore(page, "meta")).find((m) => m.key === "seededAt")?.value).not.toBe(before);
});

test("reset in the account menu asks first", async ({ page }) => {
  await signInAs(page, "u_owner", "/owner");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("button", { name: "Reset demo data" }).click();
  const confirm = page.getByRole("dialog", { name: "Reset demo data" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Keep my changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo data reset" })).toHaveCount(0);
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("dialog", { name: "Reset demo data" }).getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo data reset" })).toBeVisible();
});

test("the guide and the login page have no serious accessibility violations and no sideways scroll", async ({ page }) => {
  for (const path of ["/login", "/demo"]) {
    await page.goto(path);
    await expect(page.locator("h1, h2").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${path} scrolls sideways`).toBe(false);
    await expectNoSeriousViolations(page, `${path} at ${page.viewportSize()?.width} px`);
  }
});
