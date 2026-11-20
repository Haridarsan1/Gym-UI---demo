import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Screenshots for M4 Checkpoint 3: communications with a failed and a retried email, the import preview with errors and a shared-number row, the subscription page, the audit log filtered by actor,
 * settings with a logo uploaded, and that logo on the sidebar and on a receipt. Skipped in normal runs; `npm run m4:shots3` runs it at 390, 768 and 1440 px.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? `docs/checkpoints/m4-3/${WIDTH}/screens`;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m4-3-shots.json", "utf8"));

test.skip(!process.env.M4_SHOTS, "Only runs for npm run m4:shots3");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024 });

async function clearToasts(page: Page) {
  for (const b of await page.getByRole("button", { name: "Dismiss" }).all()) await b.click({ timeout: 800 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

/** A screenshot named in e2e/m4-3-shots.json. `target` is scrolled to the top of the screen (or the middle of an open panel, where the window doesn’t scroll). */
async function shot(page: Page, key: string, target?: Locator, inPanel = false) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m4-3-shots.json`);
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

const LOGO_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxMCAkQ3nO4AAAAASUVORK5CYII=", "base64");
const FILE = [
  "name,phone,email,date_of_birth,gender,branch,plan,start_date,visits_left,pt_credits,lead_source",
  "Asha Menon,9820011122,asha@example.in,1992-04-09,female,Bandra,Monthly,2026-11-10,,4,Walk-in",
  "Vikram Shah,9820033344,,,male,Andheri,10-visit pass,2026-11-01,6,,Instagram",
  "Dev Ramaswamy,9820022090,,2010-03-14,male,Andheri,,,,,",
  "Ravi Kale,9820011100,,,,Bandra,,,,,",
  "Sita Kale,9820011100,,,,Bandra,,,,,",
  "No Number,12345,,,,Bandra,,,,,",
  "Meena Ramaswamy,9820022090,,,,Andheri,,,,,",
  "Tara Iyer,9820044455,,,,Pune,Monthly,,,,",
].join("\r\n");

test("Checkpoint 3: communications, import, subscription, audit log, settings and the logo", async ({ page }) => {
  test.setTimeout(240_000);

  // ── Communications ──
  await signInAs(page, "u_owner", "/owner/communications");
  await expect(page.getByRole("heading", { name: "Communications", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "comms");
  await page.getByRole("button", { name: "Edit the Payment reminder email" }).click();
  const tpl = dialog(page, "Email: Payment reminder");
  await tpl.getByLabel("Subject").fill("Quick note: {{amount_due}} is open on {{invoice}}");
  await shot(page, "comms-wording", tpl.getByRole("region", { name: "Preview" }), true);
  await tpl.getByRole("button", { name: "Save wording" }).click();
  await expect(page.getByText("Wording saved")).toBeVisible();
  await page.getByRole("switch", { name: "Demo: make the mail server refuse mail" }).click();
  const offers = page.getByRole("list", { name: "Groups" }).getByRole("listitem").filter({ hasText: "Offers and news" });
  await offers.getByRole("button", { name: /^Send to/ }).click();
  await dialog(page, "Send to a group").getByRole("button", { name: /^Send to/ }).click();
  await expect(page.getByText("Emails sent")).toBeVisible();
  await page.getByRole("button", { name: /^Failed ?\d+$/ }).click();
  const log = page.getByRole("region", { name: "Delivery log" });
  await log.locator("tr:visible, li:visible").filter({ hasText: "Offers and news" }).first().getByRole("button", { name: /^Retry the email to/ }).click();
  await expect(page.getByText("Failed again")).toBeVisible();
  await shot(page, "comms-failed", log);
  await page.getByRole("switch", { name: "Demo: make the mail server refuse mail" }).click();
  await page.getByRole("button", { name: /^Retry all failed/ }).click();
  await expect(page.getByText("Retried")).toBeVisible();
  await page.getByRole("button", { name: /^Sent ?\d+$/ }).click();
  await expect(log.locator("tr:visible, li:visible").filter({ hasText: /Sent on try/ }).first()).toBeVisible();
  await shot(page, "comms-retried", log);
  await page.getByRole("button", { name: /^Not sent ?\d+$/ }).click();
  await expect(log.locator("tr:visible, li:visible").filter({ hasText: "hasn’t agreed to offers and news" }).first()).toBeVisible();
  await shot(page, "comms-notsent", log);

  // ── Import ──
  await signInAs(page, "u_owner", "/owner/import");
  await expect(page.getByRole("heading", { name: "Import members", level: 1 })).toBeVisible();
  await page.getByText("What each column means").click();
  await page.waitForTimeout(300);
  await shot(page, "import");
  await page.getByLabel("Choose a CSV file").setInputFiles({ name: "members.csv", mimeType: "text/csv", buffer: Buffer.from(FILE) });
  const summary = page.locator("dl[aria-label=Summary]");
  await expect(summary).toContainText("Shared number2");
  await shot(page, "import-preview", summary);
  const sita = page.locator("tr:visible, li:visible").filter({ hasText: "Sita Kale" }).first();
  await page.getByRole("checkbox", { name: "Import row 6, Sita Kale" }).uncheck();
  await shot(page, "import-shared", sita);
  await page.getByRole("checkbox", { name: "Import row 6, Sita Kale" }).check();
  await page.getByRole("button", { name: /^Import \d+ members?$/ }).click();
  await dialog(page, "Import members").getByRole("checkbox", { name: /agreed to the gym keeping their details/ }).check();
  await shot(page, "import-confirm");
  await dialog(page, "Import members").getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("region", { name: "Imported" })).toBeVisible();
  await page.getByRole("button", { name: "Send this import again" }).click();
  await expect(page.getByRole("region", { name: "Already imported" })).toBeVisible();
  await shot(page, "import-done", page.getByRole("region", { name: "Already imported" }));

  // ── Subscription ──
  await page.goto("/owner/subscription");
  await expect(page.getByRole("heading", { name: "Subscription", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "subscription");
  await shot(page, "subscription-usage", page.getByRole("list", { name: "Usage against your limits" }));

  // ── Settings and the logo ──
  await page.goto("/owner/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "settings");
  await page.getByLabel("Logo file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: LOGO_PNG });
  await expect(page.getByText("The new logo is shown here.")).toBeVisible();
  await page.getByLabel("Registered address").fill("Ground floor, Veera Desai Road, Andheri West, Mumbai 400053");
  await shot(page, "settings-logo");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  // ── The audit log, with several people’s actions ──
  await signInAs(page, "u_desk_andheri", "/desk/members/mem_arjun");
  await page.getByRole("button", { name: "Grace period" }).click();
  const grace = dialog(page, "Grace period");
  await grace.getByLabel("Grace days for this membership").fill("10");
  await grace.getByLabel("Reason").fill("Away on work");
  await grace.getByRole("button", { name: "Set grace period" }).click();
  await expect(page.getByText("Grace period set")).toBeVisible();

  await signInAs(page, "u_owner", "/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "sidebar-logo");

  await page.goto("/owner/audit");
  await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "audit");
  await page.getByLabel("Who").selectOption({ label: "Pooja Nair, Front desk" });
  await expect(page.getByRole("status")).toContainText("entr");
  await shot(page, "audit-actor");
  await page.getByRole("button", { name: /^Details of Grace period changed/ }).first().click();
  await expect(dialog(page, "Audit entry")).toContainText("Away on work");
  await shot(page, "audit-entry");
  await dialog(page, "Audit entry").getByRole("button", { name: "Close" }).first().click();

  // ── The logo on a receipt ──
  await signInAs(page, "u_desk_andheri", "/desk/members/mem_arjun?tab=billing");
  await page.getByRole("link", { name: /^(INV|PF)/ }).first().click();
  await expect(page.locator('.receipt-sheet img[src^="data:image/"]:visible')).toBeVisible();
  await shot(page, "receipt-logo");

  // ── A branch manager’s audit log ──
  await signInAs(page, "u_bm_bandra", "/owner/audit");
  await expect(page.getByText("What concerns this branch")).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "bm-audit");
});
