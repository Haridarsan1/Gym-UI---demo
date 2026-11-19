import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { changeStore, signInAs } from "./helpers";

/**
 * Screenshots of the front desk for M3 Checkpoint 1: check-in (every result state) and the new member wizard (every step, with the
 * duplicate stop and the duplicate warning). Skipped in normal runs; `npm run m3:shots1` runs it at 390, 768 and 1440 px.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? `docs/checkpoints/m3-1/${WIDTH}/screens`;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m3-1-shots.json", "utf8"));

test.skip(!process.env.M3_SHOTS, "Only runs for npm run m3:shots1");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024, launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }, permissions: ["camera"] });

async function clearToasts(page: Page) {
  for (const b of await page.getByRole("button", { name: "Dismiss" }).all()) await b.click({ timeout: 800 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

async function shot(page: Page, key: string, target?: Locator) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m3-1-shots.json`);
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

const result = (page: Page) => page.getByRole("region", { name: "Check-in result" });
const search = (page: Page) => page.getByRole("combobox", { name: /Search members/ });
const pick = async (page: Page, text: string, name: RegExp) => {
  await search(page).fill(text);
  await page.getByRole("option", { name }).getByRole("button").click();
};

test("Check-in: every result state", async ({ page }) => {
  await signInAs(page, "u_desk_andheri", "/desk");
  await expect(page.getByText("Ready for the next member")).toBeVisible();
  await shot(page, "checkin-ready");
  await search(page).fill("ar");
  await expect(page.getByRole("listbox", { name: "Matching members" })).toBeVisible();
  await shot(page, "checkin-search");
  await pick(page, "arjun", /Arjun Kumar/);
  await expect(result(page)).toHaveAttribute("data-result", "allowed");
  await shot(page, "checkin-allowed");
  await pick(page, "arjun", /Arjun Kumar/);
  await expect(result(page)).toHaveAttribute("data-result", "repeat_scan");
  await shot(page, "checkin-repeat");
  await pick(page, "priya", /Priya Sharma/);
  await expect(result(page)).toHaveAttribute("data-result", "allowed_with_dues");
  await shot(page, "checkin-dues");
  await changeStore(page, "memberships", `(v) => v.memberId === "mem_sneha" && v.status === "active" ? { ...v, endsOn: "2026-11-15", graceUntil: "2026-11-20" } : false`);
  await pick(page, "sneha", /Sneha Patil/);
  await expect(result(page)).toContainText("Checked in, membership ended");
  await shot(page, "checkin-grace");
  await changeStore(page, "memberships", `(v) => v.memberId === "mem_sneha" && v.status === "active" ? { ...v, endsOn: "2026-10-01", graceUntil: undefined, status: "expired" } : false`);
  await page.getByRole("button", { name: "Next member" }).click();
  await pick(page, "sneha", /Sneha Patil/);
  await expect(result(page)).toHaveAttribute("data-result", "denied");
  await shot(page, "checkin-denied");
  await page.getByRole("button", { name: "Let in anyway…" }).click();
  await page.getByRole("dialog", { name: "Let in anyway" }).getByLabel("Reason").fill("Paid by cheque this morning, manager confirmed");
  await shot(page, "checkin-override-sheet");
  await page.getByRole("dialog", { name: "Let in anyway" }).getByRole("button", { name: "Let in" }).click();
  await expect(result(page)).toHaveAttribute("data-result", "override");
  await shot(page, "checkin-override");
  await shot(page, "checkin-list", page.getByRole("heading", { name: "Today’s check-ins" }));
  await page.getByRole("button", { name: "Next member" }).click();
  await page.getByRole("button", { name: "Scan QR" }).click();
  await expect(page.getByRole("dialog", { name: "Scan a pass" })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "checkin-scan");
});

test("New member: every step, with the duplicate stop and warning", async ({ page }) => {
  await signInAs(page, "u_desk_andheri", "/desk/new");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await expect(page.getByRole("heading", { name: "Step 1 of 5: Details" })).toBeVisible();
  await shot(page, "wizard-details");
  await page.getByLabel("Full name").fill("Kabir Anand");
  await page.getByLabel("Mobile number").fill("98200 22002");
  await expect(page.getByRole("alert", { name: "This phone number or email is already used" })).toContainText("Arjun Kumar");
  await shot(page, "wizard-blocked");
  await page.getByLabel("Mobile number").fill("98765 43210");
  await page.getByLabel("Full name").fill("Rahul Mehta");
  await expect(page.getByRole("alert").filter({ hasText: "A member with this name already exists" })).toBeVisible();
  await shot(page, "wizard-warning");
  await page.getByLabel("Full name").fill("Kabir Anand");
  await page.getByLabel("Email").fill("kabir.anand@example.in");
  await page.getByLabel("Date of birth").fill("1994-05-12");
  await page.getByLabel("How did they hear about the gym?").selectOption("Walk-in");
  await next.click();
  await page.getByRole("switch", { name: "Progress photos" }).click();
  await page.getByRole("switch", { name: "Assessments" }).click();
  await shot(page, "wizard-consent");
  await next.click();
  await page.getByRole("radio", { name: /Monthly Plus/ }).click();
  await shot(page, "wizard-plan");
  await next.click();
  await page.getByRole("radio", { name: "Meera Joshi" }).click();
  await shot(page, "wizard-trainer");
  await next.click();
  await page.getByLabel("Discount (₹)").fill("100");
  await page.getByRole("radio", { name: "UPI" }).click();
  await page.getByLabel("UPI reference").fill("kabir@okbank");
  await shot(page, "wizard-payment");
  await page.getByRole("button", { name: "Register member" }).click();
  await expect(page.getByRole("heading", { name: "Kabir Anand is a member" })).toBeVisible();
  await shot(page, "wizard-done");
});
