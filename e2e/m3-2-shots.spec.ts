import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { changeStore, signInAs } from "./helpers";

/**
 * Screenshots for M3 Checkpoint 2: the member profile with each lifecycle action, a part payment, a refund request and its approval in the finance queue,
 * the bookings calendar with a conflict, reconciliation with a repeated event, and day close with a variance. Skipped in normal runs; `npm run m3:shots2`
 * runs it at 390, 768 and 1440 px.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? `docs/checkpoints/m3-2/${WIDTH}/screens`;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m3-2-shots.json", "utf8"));

test.skip(!process.env.M3_SHOTS, "Only runs for npm run m3:shots2");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024 });

async function clearToasts(page: Page) {
  for (const b of await page.getByRole("button", { name: "Dismiss" }).all()) await b.click({ timeout: 800 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

async function shot(page: Page, key: string, target?: Locator) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m3-2-shots.json`);
  mkdirSync(OUT, { recursive: true });
  await clearToasts(page);
  if (target) {
    await page.evaluate(() => (document.body.style.paddingBottom = "100vh"));
    await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate((dy) => window.scrollBy(0, dy), WIDTH < 640 ? -76 : -24);
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}-${key}.png` });
  await page.evaluate(() => (document.body.style.paddingBottom = ""));
}

test("Checkpoint 2: lifecycle, money, bookings and finance", async ({ page }) => {
  const dialog = (name: string) => page.getByRole("dialog", { name });
  await signInAs(page, "u_desk_andheri", "/desk/members/mem_arjun");
  await expect(page.getByRole("heading", { name: "Arjun Kumar", level: 1 })).toBeVisible();
  await shot(page, "profile");

  // Freeze, then unfreeze.
  await page.getByRole("button", { name: "Freeze", exact: true }).click();
  const fz = dialog("Freeze membership");
  await fz.getByLabel("Reason").fill("Travel for work");
  await expect(fz).toContainText("7 days frozen");
  await shot(page, "freeze-sheet");
  await fz.getByRole("button", { name: "Freeze membership" }).click();
  await expect(page.getByText("Arjun’s membership is frozen")).toBeVisible();
  await shot(page, "frozen");
  await page.getByRole("button", { name: "Unfreeze", exact: true }).click();
  await dialog("Unfreeze membership").getByRole("button", { name: "Unfreeze now" }).click();
  await expect(page.getByText("Arjun can come in again")).toBeVisible();

  // Upgrade with a credit note.
  await page.getByRole("button", { name: "Renew or change plan" }).click();
  const chg = dialog("Change plan");
  await chg.getByRole("radio", { name: /Quarterly/ }).click();
  await expect(chg.getByRole("radio", { name: /Quarterly/ })).toContainText(/Credit note for/);
  await shot(page, "upgrade-sheet");
  await chg.getByRole("button", { name: "Confirm" }).click();
  const made = dialog("Plan change made");
  await expect(made).toContainText(/GST credit note CNAND/);
  await shot(page, "upgrade-made");
  await made.getByRole("button", { name: "Collect payment" }).click();
  const pay = dialog("Collect payment");
  await pay.getByRole("radio", { name: "UPI" }).click();
  await pay.getByLabel("UPI reference").fill("arjun@okbank");
  await pay.getByRole("button", { name: "Record payment" }).click();
  await dialog("Payment recorded").getByRole("button", { name: "Done" }).click();
  await page.getByRole("tab", { name: "Invoices and payments" }).click();
  await expect(page.getByRole("list", { name: "Credit notes" })).toContainText("CNAND/26-27/0001");
  await shot(page, "billing");

  // Cancel, and ask finance for a refund.
  await page.getByRole("tab", { name: "Membership" }).click();
  await page.getByRole("button", { name: "Cancel membership" }).first().click();
  const cn = dialog("Cancel membership");
  await cn.getByLabel("Takes effect on").fill("2026-11-24");
  await cn.getByLabel("Reason").fill("Moving to another city");
  await expect(cn).toContainText(/May be eligible for/);
  await shot(page, "cancel-sheet");
  await cn.getByRole("button", { name: "Cancel membership" }).click();
  const canceled = dialog("Membership canceled");
  await expect(canceled).toContainText("Nothing is refunded automatically");
  await shot(page, "canceled");
  await canceled.getByRole("button", { name: "Request refund" }).click();
  await expect(dialog("Request refund")).toBeVisible();
  await shot(page, "refund-request");
  await dialog("Request refund").getByRole("button", { name: "Send to finance" }).click();
  await expect(page.getByText("Refund requested")).toBeVisible();
  await canceled.getByRole("button", { name: "Done" }).click();

  // A part payment in cash.
  await changeStore(page, "gymPolicies", `(v) => ({ ...v, partialPaymentsEnabled: true })`);
  await page.goto("/desk/dues");
  await page.getByRole("link", { name: "Collect from Priya Sharma" }).click();
  const part = dialog("Collect payment");
  await part.getByLabel("Amount received (₹)").fill("1000");
  await shot(page, "partial-sheet");
  await part.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog("Payment recorded")).toContainText("₹1,000 received");
  await shot(page, "partial-done");
  await dialog("Payment recorded").getByRole("button", { name: "Done" }).click();

  // Bookings with a conflict: leave on Thursday 19 Nov puts Arjun’s session in conflict.
  await page.goto("/desk/bookings?date=2026-11-19");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("ember-demo");
    open.onsuccess = () => {
      const tx = open.result.transaction("trainerLeave", "readwrite");
      tx.objectStore("trainerLeave").add({ id: "lv_shot", tenantId: "t_pulse", trainerId: "u_trainer_meera", from: "2026-11-19", to: "2026-11-19", reason: "Conference", createdBy: "u_trainer_meera", createdAt: "2026-11-17T06:00:00.000Z" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.goto("/desk/bookings?date=2026-11-19");
  await expect(page.getByRole("heading", { name: "1 session is on its trainer’s leave" })).toBeVisible();
  await shot(page, "bookings-conflict");
  await page.getByRole("button", { name: "Move Arjun’s session" }).click();
  await expect(dialog("Move Arjun’s session")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "move-sheet");
  await dialog("Move Arjun’s session").getByRole("list", { name: /times on/ }).first().getByRole("button").first().click();
  await expect(page.getByText("Arjun’s session is moved")).toBeVisible();
  await page.goto("/desk/bookings?date=2026-11-18");
  await expect(page.getByRole("heading", { name: "Bookings", level: 1 })).toBeVisible();
  await shot(page, "bookings-grid");

  // Finance: the refund queue and its approval.
  await signInAs(page, "u_finance", "/desk/finance/refunds");
  const queue = page.getByRole("list", { name: "Refund requests" });
  const card = queue.getByRole("listitem").filter({ hasText: "Arjun Kumar" });
  await expect(card).toContainText(/Goes back against/);
  await shot(page, "refund-queue");
  await card.getByRole("button", { name: "Approve the refund for Arjun Kumar" }).click();
  await expect(dialog("Approve refund")).toBeVisible();
  await shot(page, "refund-approve");
  await dialog("Approve refund").getByRole("button", { name: "Approve refund" }).click();
  await expect(page.getByText(/Refunded ₹[\d,.]+ to Arjun/)).toBeVisible();
  await shot(page, "refund-decided", page.getByRole("list", { name: "Decided refunds" }));

  await page.goto("/desk/finance/reconciliation");
  const flagged = page.getByRole("list", { name: "Flagged items" });
  await expect(flagged.getByRole("listitem")).toHaveCount(4);
  await shot(page, "reconciliation");
  await flagged.getByRole("button", { name: /^Accept: Gateway event delivered 3 times/ }).click();
  await dialog("Accept this item").getByLabel("Note").fill("Gateway retried after a timeout; one payment exists");
  await shot(page, "recon-accept");
  await dialog("Accept this item").getByRole("button", { name: "Accept" }).click();
  await expect(flagged.getByRole("listitem")).toHaveCount(3);

  await page.goto("/desk/finance/invoices");
  await expect(page.getByRole("heading", { name: "Invoices and payments", level: 1 })).toBeVisible();
  await expect(page.locator("dl[aria-label=Totals]")).toContainText("Collected");
  await shot(page, "invoices");
  await page.goto("/desk/finance/exports");
  await shot(page, "exports");

  // Day close at the desk, with a variance against the cash taken today.
  await signInAs(page, "u_desk_andheri", "/desk/finance/day-close");
  await expect(page.getByRole("heading", { name: "Day close", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Cash entries" })).toBeVisible();
  const expected = await page.locator("dl >> text=Expected in the drawer").locator("xpath=following-sibling::dd").first().innerText();
  const rupees = Number(expected.replace(/[₹,]/g, ""));
  await page.getByLabel("Cash counted (₹)").fill(String(rupees - 200));
  await expect(page.getByRole("status").filter({ hasText: "Short by ₹200" })).toBeVisible();
  await shot(page, "dayclose-variance");
  await page.getByLabel(/^Note/).fill("₹200 given as change to a member and not recorded");
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText("Cash for this day is locked.", { exact: false })).toBeVisible();
  await shot(page, "dayclose-closed");
});
