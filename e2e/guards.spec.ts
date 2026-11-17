import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

const denied = (page: import("@playwright/test").Page) => page.getByRole("heading", { name: "You don’t have access to this page" });

test("signed-out visitors are sent to log in", async ({ page }) => {
  for (const path of ["/m", "/t", "/desk", "/owner", "/admin", "/owner/settings", "/desk/finance/refunds"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("/app sends a signed-in person to their own home", async ({ page }) => {
  await signInAs(page, "u_desk_andheri", "/app");
  await expect(page).toHaveURL(/\/desk$/);
});

test("a member who opens a staff area sees an access-denied page, not the page", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m");
  for (const path of ["/desk", "/owner", "/admin", "/t"]) {
    await page.goto(path);
    await expect(denied(page)).toBeVisible();
  }
  await page.getByRole("link", { name: "Go to my home" }).click();
  await expect(page).toHaveURL(/\/m$/);
});

test("front desk cannot open the owner area, the member app or admin", async ({ page }) => {
  await signInAs(page, "u_desk_andheri", "/desk");
  for (const path of ["/owner", "/m", "/admin"]) {
    await page.goto(path);
    await expect(denied(page)).toBeVisible();
  }
});

test("a trainer cannot open the desk or owner areas", async ({ page }) => {
  await signInAs(page, "u_trainer_meera", "/t");
  for (const path of ["/desk", "/owner"]) {
    await page.goto(path);
    await expect(denied(page)).toBeVisible();
  }
});

test("a platform admin cannot open any gym area", async ({ page }) => {
  await signInAs(page, "u_admin", "/admin");
  for (const path of ["/desk", "/owner", "/m", "/t"]) {
    await page.goto(path);
    await expect(denied(page)).toBeVisible();
  }
});

test("a branch manager and an owner both land in the owner area", async ({ page }) => {
  for (const userId of ["u_owner", "u_bm_bandra"]) {
    await signInAs(page, userId, "/app");
    await expect(page).toHaveURL(/\/owner$/);
  }
});
