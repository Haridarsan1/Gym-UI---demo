import { expect, test, type Page } from "@playwright/test";

const signInAs = (page: Page, role: string, extra: Record<string, unknown> = {}) =>
  page.addInitScript(
    ([r, e]) => localStorage.setItem("ember.session", JSON.stringify({ userId: `u_${r}`, name: "Test User", role: r, tenantId: "t_pulse", branchIds: ["br_andheri"], ...(e as object) })),
    [role, extra] as const,
  );

test("signed-out visitors are sent to log in", async ({ page }) => {
  for (const path of ["/m", "/t", "/desk", "/owner", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("/app sends a signed-in person to their own home", async ({ page }) => {
  await signInAs(page, "front_desk");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/desk$/);
});

test("a member who opens a staff area sees an access-denied page, not the page", async ({ page }) => {
  await signInAs(page, "member", { memberId: "mem_1" });
  for (const path of ["/desk", "/owner", "/admin", "/t"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
  }
  await page.getByRole("link", { name: "Go to my home" }).click();
  await expect(page).toHaveURL(/\/m$/);
});

test("front desk cannot open the owner area or the member app", async ({ page }) => {
  await signInAs(page, "front_desk");
  for (const path of ["/owner", "/m", "/admin"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
  }
});

test("a branch manager and an owner both land in the owner area", async ({ page }) => {
  for (const role of ["owner", "branch_manager"]) {
    await page.goto("/");
    await page.evaluate((r) => localStorage.setItem("ember.session", JSON.stringify({ userId: `u_${r}`, name: "T", role: r, tenantId: "t_pulse", branchIds: [] })), role);
    await page.goto("/owner");
    await expect(page.getByRole("heading", { name: "Owner" })).toBeVisible();
  }
});
