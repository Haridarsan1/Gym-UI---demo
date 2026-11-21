import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Screenshots for M5 Checkpoint 4: the tenants list, a tenant’s detail, a suspended gym as its owner sees it, a support access request, the banner inside a gym, and the audit entries. Skipped in
 * normal runs; `npm run m5:shots` runs it at 390, 768 and 1440 px.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? `docs/checkpoints/m5/${WIDTH}/screens`;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m5-shots.json", "utf8"));

test.skip(!process.env.M5_SHOTS, "Only runs for npm run m5:shots");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024 });

async function clearToasts(page: Page) {
  for (const b of await page.getByRole("button", { name: "Dismiss" }).all()) await b.click({ timeout: 800 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

/** A screenshot named in e2e/m5-shots.json. `target` is scrolled to the top of the screen (or the middle of an open panel). */
async function shot(page: Page, key: string, target?: Locator, inPanel = false) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m5-shots.json`);
  mkdirSync(OUT, { recursive: true });
  await clearToasts(page);
  if (target && inPanel) await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  else if (target) {
    await page.evaluate(() => (document.body.style.paddingBottom = "100vh"));
    await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate((dy) => window.scrollBy(0, dy), WIDTH < 640 ? -76 : -24);
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}-${key}.png` });
  await page.evaluate(() => (document.body.style.paddingBottom = ""));
}

const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

test("Checkpoint 4: tenants, a suspended gym, support access and the audit entries", async ({ page }) => {
  test.setTimeout(240_000);

  // ── Tenants and plans ──
  await signInAs(page, "u_admin", "/admin");
  await expect(page.getByRole("heading", { name: "Gyms", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "tenants");
  await page.goto("/admin/tenants/t_pulse");
  await expect(page.getByRole("heading", { name: "Pulse Fitness", level: 1 })).toBeVisible();
  await shot(page, "tenant-detail");
  await shot(page, "tenant-invoices", page.getByRole("list", { name: "Software invoices" }));
  await page.goto("/admin/plans");
  await expect(page.getByRole("heading", { name: "Ember plans", level: 1 })).toBeVisible();
  await shot(page, "saas-plans");

  // ── Suspending, and the gym seen by its owner and its desk ──
  await page.goto("/admin/tenants/t_pulse");
  await page.getByLabel("Change the state").selectOption({ label: "Suspended" });
  await page.getByRole("button", { name: "Change state" }).click();
  const confirm = dialog(page, "Change the subscription state");
  await confirm.getByLabel("Reason").fill("Payment not received after two reminders");
  await shot(page, "suspend", confirm, true);
  await confirm.getByRole("button", { name: "Make suspended" }).click();
  await expect(page.getByText("Now suspended")).toBeVisible();
  await signInAs(page, "u_owner", "/owner/subscription");
  await expect(page.getByRole("status", { name: "What this means" })).toContainText("The subscription is suspended.");
  await page.waitForTimeout(400);
  await shot(page, "suspended-owner");
  await signInAs(page, "u_desk_andheri", "/desk/members/mem_arjun");
  await expect(page.getByRole("status", { name: "Subscription" })).toContainText("read-only");
  await shot(page, "suspended-desk");

  // ── Support access ──
  await signInAs(page, "u_admin", "/admin/support?tenant=t_lotus");
  await expect(page.getByRole("heading", { name: "Support access", level: 1 })).toBeVisible();
  await page.getByLabel("Why you need access").fill("Help the owner fix the member import");
  await page.getByRole("radio", { name: "60 minutes" }).check();
  await shot(page, "support-request", page.getByLabel("Why you need access"));
  await page.goto("/admin/support?tenant=t_pulse");
  await page.getByLabel("Why you need access").fill("Help the owner fix the member import");
  await page.getByRole("radio", { name: "60 minutes" }).check();
  await page.getByRole("button", { name: "Start support access" }).click();
  await expect(page.getByText("Support access started")).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "support-active", page.getByRole("list", { name: "Active support access" }));
  await signInAs(page, "u_member_arjun", "/m");
  await expect(page.getByRole("status", { name: "Support access" })).toBeVisible();
  await shot(page, "support-banner-member");

  // Inside the gym: look at the dashboard and the audit log, then end it.
  await signInAs(page, "u_admin", "/admin/support");
  await page.getByRole("button", { name: "Open Pulse Fitness" }).click();
  await expect(page.getByRole("status", { name: "Support access" })).toContainText("You are inside this gym");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "support-banner-inside");
  await page.goto("/owner/plans");
  await expect(page.getByRole("heading", { name: "Plans and pricing", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "End support access" }).click();
  await expect(page).toHaveURL(/\/admin\/support$/);

  await signInAs(page, "u_owner", "/owner/audit?kind=access");
  await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: "Support access ended" }).first()).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "audit-support", page.locator("tr:visible, li:visible").filter({ hasText: "Support access ended" }).first());
});
