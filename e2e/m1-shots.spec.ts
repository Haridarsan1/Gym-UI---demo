import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { doWorkout, readStore, signInAs } from "./helpers";

/**
 * Takes the screenshots of the member app that a review uses, then scripts/contact-sheets.mjs puts them on sheets.
 * Skipped in normal runs. `npm run m1:shots` (390 px) and `npm run m1_5:shots` (390, 768 and 1440 px) run it; SHOT_WIDTH picks
 * the width. Motion is reduced so every screen is in its finished state.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? (WIDTH === 390 ? "docs/checkpoints/m1-final/screens" : `docs/checkpoints/m1-5/${WIDTH}/screens`);
const SPLIT = WIDTH >= 768;
const INLINE_BOOKING = WIDTH >= 1024;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m1-shots.json", "utf8"));

test.skip(!process.env.M1_SHOTS, "Only runs for npm run m1:shots");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024 });

async function shot(page: Page, key: string, target?: Locator) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m1-shots.json`);
  mkdirSync(OUT, { recursive: true });
  if (target) {
    await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, -76));
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}-${key}.png` });
}

const region = (page: Page, name: string | RegExp) => page.getByRole("region", { name });
const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const ready = (page: Page, h1: string | RegExp) => expect(page.getByRole("heading", { name: h1, level: 1 })).toBeVisible();

test("Today, as four members", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m");
  await ready(page, /^Good/);
  await shot(page, "today-arjun");
  await signInAs(page, "u_member_priya", "/m");
  await ready(page, /^Good/);
  await shot(page, "today-priya");
  await signInAs(page, "u_member_rahul", "/m");
  await ready(page, /^Good/);
  await shot(page, "today-rahul");
  await signInAs(page, "u_member_sneha", "/m");
  await ready(page, /^Good/);
  await shot(page, "today-sneha");
});

test("Program and the workout session", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m/program");
  await ready(page, "Program");
  await shot(page, "program");
  await page.getByRole("button", { name: /Preview Upper body and core/ }).click();
  // From 768 px the preview sits beside the path; on phones it is a sheet.
  await expect(SPLIT ? region(page, "Selected workout") : dialog(page, "Workout preview")).toBeVisible();
  await shot(page, "program-preview");
  if (!SPLIT) await page.keyboard.press("Escape");
  await page.goto("/m");
  await page.getByRole("link", { name: "Start workout" }).click();
  await page.getByRole("button", { name: "Next exercise" }).click();
  await expect(page.getByRole("heading", { name: "Dumbbell bench press", level: 2 })).toBeVisible();
  await shot(page, "workout-exercise");
  await page.getByRole("form", { name: "Set 1" }).getByRole("button", { name: "Log set" }).click();
  await expect(page.getByRole("region", { name: "Rest timer" })).toBeVisible();
  await shot(page, "workout-rest");
});

test("Finishing a workout and the summary", async ({ page }) => {
  await doWorkout(page);
  await expect(dialog(page, "Finish workout")).toBeVisible();
  await shot(page, "workout-finish");
  await dialog(page, "Finish workout").getByRole("button", { name: "Finish workout" }).click();
  await expect(page.locator('[data-stage="done"]')).toBeVisible({ timeout: 8000 });
  await shot(page, "workout-complete");
});

test("Progress and Reviews", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m/progress");
  await expect(region(page, "Key stats")).toBeVisible();
  await shot(page, "progress-top");
  await shot(page, "progress-records", region(page, "Personal records"));
  await shot(page, "progress-goals", region(page, "Goals"));
  await shot(page, "progress-photos", region(page, "Progress photos"));
  await page.goto("/m/progress/reviews");
  await ready(page, /Reviews/);
  await shot(page, "reviews");
});

test("Bookings", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m/bookings");
  await expect(region(page, "Training sessions")).toContainText("5 sessions left");
  await shot(page, "bookings");
  await page.getByRole("button", { name: "Book a session" }).first().click();
  const d = INLINE_BOOKING ? region(page, "Book a session") : dialog(page, "Book a session");
  await expect(d.getByRole("button", { name: /Meera Joshi/ })).toBeVisible();
  await shot(page, "book-trainer");
  await d.getByRole("button", { name: /Meera Joshi/ }).click();
  await d.getByRole("radiogroup", { name: "Day" }).getByRole("radio").nth(2).click();
  await shot(page, "book-slot");
  await d.getByRole("list", { name: /^Times on/ }).locator("button:not([disabled])").first().click();
  await expect(d.getByRole("region", { name: "Booking details" })).toBeVisible();
  await shot(page, "book-confirm");
  if (INLINE_BOOKING) await d.getByRole("button", { name: "Close" }).click();
  else await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cancel session" }).click();
  await expect(dialog(page, /Cancel/)).toBeVisible();
  await shot(page, "cancel-sheet");
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: /^Past/ }).click();
  await shot(page, "bookings-past");
});

test("Membership: renewing, paying, failing, buying sessions, auto-renew, lists", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m/membership");
  await ready(page, "Membership");
  await shot(page, "membership");
  await page.getByRole("button", { name: "Renew membership" }).click();
  const d = dialog(page, "Renew your membership");
  await expect(d.getByRole("region", { name: "What you will get" })).toBeVisible();
  await shot(page, "renew-choose");
  await d.getByRole("radio", { name: /Quarterly/ }).click();
  await shot(page, "renew-upgrade");
  await d.getByRole("radio", { name: /Monthly Plus/ }).click();
  await d.getByRole("button", { name: "Continue to payment" }).click();
  await expect(d.getByRole("region", { name: "Summary" })).toBeVisible();
  await shot(page, "renew-pay");
  await d.getByRole("button", { name: /^Pay ₹4,130$/ }).click();
  await expect(d.locator(".stamp")).toBeVisible();
  await shot(page, "renew-done");
  await d.getByRole("button", { name: "Done" }).click();
  await shot(page, "demo-panel", region(page, "Demo controls"));
  await page.getByRole("switch", { name: "Make payments fail" }).click();
  await expect(page.getByRole("switch", { name: "Make payments fail" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Buy more sessions" }).click();
  const b = dialog(page, "Buy more sessions");
  await expect(b.getByRole("radio", { name: /^8 sessions/ })).toBeVisible();
  await shot(page, "buy-sessions");
  await b.getByRole("button", { name: "Continue to payment" }).click();
  await b.getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(b.getByRole("alert")).toBeVisible();
  await shot(page, "pay-failed");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Set up auto-renew" }).click();
  await expect(dialog(page, "Turn on auto-renew")).toBeVisible();
  await shot(page, "auto-renew");
  await page.keyboard.press("Escape");
  await shot(page, "invoices", page.getByRole("radiogroup", { name: "Money" }));
  await page.getByRole("radio", { name: /^Payments/ }).click();
  await shot(page, "payments", page.getByRole("radiogroup", { name: "Money" }));
});

test("Membership: an overdue invoice and a frozen member, and the receipt", async ({ page }) => {
  await signInAs(page, "u_member_priya", "/m/membership");
  await ready(page, "Membership");
  await page.getByRole("button", { name: /^Pay ₹2,950$/ }).click();
  await expect(dialog(page, "Pay invoice").getByRole("region", { name: "Summary" })).toBeVisible();
  await shot(page, "priya-pay");
  await signInAs(page, "u_member_rahul", "/m/membership");
  await ready(page, "Membership");
  await shot(page, "rahul-membership");
  await signInAs(page, "u_member_arjun", "/m/membership");
  const inv = (await readStore(page, "invoices")).find((i) => i.memberId === "mem_arjun")!;
  await page.goto(`/m/membership/invoices/${inv.id}`);
  await expect(page.getByRole("heading", { name: "Tax invoice and receipt", level: 1 })).toBeVisible();
  await shot(page, "receipt");
});

test("Check-in pass", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m/pass");
  await expect(page.getByText("Ready to scan")).toBeVisible();
  await shot(page, "pass");
  await page.getByRole("button", { name: "Scan my pass at the door" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Checked in at Andheri" })).toBeVisible();
  await shot(page, "pass-checked-in");
  await signInAs(page, "u_member_rahul", "/m/pass");
  await expect(page.getByRole("alert")).toBeVisible();
  await shot(page, "pass-frozen");
});

test("Me", async ({ page }) => {
  await signInAs(page, "u_member_arjun", "/m/me");
  await ready(page, "Me");
  await shot(page, "me-top");
  await shot(page, "me-consent", region(page, "Consent"));
  await shot(page, "me-messages", region(page, "Emails we send you"));
  await shot(page, "me-data", region(page, "Your data"));
  await page.getByRole("button", { name: "Ask for deletion" }).click();
  await expect(dialog(page, "Ask for your data to be deleted")).toBeVisible();
  await shot(page, "me-delete");
});
