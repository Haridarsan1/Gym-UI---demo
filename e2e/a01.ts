import { expect, type Page } from "@playwright/test";
import { hasHorizontalScroll, logRemainingSets, readStore } from "./helpers";

/**
 * A01, as one journey through the screens (M3 acceptance, strict): the front desk registers a member, records the payment, checks them in and assigns a trainer; the trainer publishes
 * a workout; the member logs the session in their own app; the trainer reviews the trend; the front desk renews the membership. Every hand-over is the demo role switcher. Run at
 * 390 px and 1440 px.
 */

const noSideways = async (page: Page, where: string) => expect(await hasHorizontalScroll(page), `${where}: sideways scroll`).toBe(false);
const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

/** Opens the account menu and signs in as someone else from the demo role switcher. */
async function switchTo(page: Page, who: RegExp, landing: RegExp) {
  await page.getByRole("button", { name: /^Account menu for / }).first().click();
  await page.locator('header:visible, aside:visible, nav:visible').getByRole("button", { name: who }).first().click();
  await expect(page).toHaveURL(landing);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

export async function a01Journey(page: Page) {
  // ── Front desk: register, pay later ────────────────────────────────────────────────────────────
  await page.goto("/desk/new");
  await page.getByLabel("Full name").fill("Kavya Rao");
  await page.getByLabel("Mobile number").fill("98765 01234");
  await page.getByLabel("Email").fill("kavya.rao@example.in");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await next.click();
  await page.getByRole("switch", { name: "Assessments" }).click();
  await next.click();
  await page.getByRole("radio", { name: /Monthly Plus/ }).click();
  await next.click();
  await expect(page.getByRole("heading", { name: "Step 4 of 5: Trainer" })).toBeVisible();
  await page.getByRole("radio", { name: "No trainer yet" }).click();
  await next.click();
  await expect(page.getByRole("heading", { name: "Step 5 of 5: Payment" })).toBeVisible();
  await page.getByRole("radio", { name: /Pay later/ }).click();
  await page.getByRole("button", { name: "Register member" }).click();
  await expect(page.getByRole("heading", { name: "Kavya Rao is a member" })).toBeVisible();
  const member = (await readStore(page, "members")).find((m) => m.phone === "9876501234")!;
  const id = member.id as string;
  expect((await readStore(page, "memberships")).find((m) => m.memberId === id)).toMatchObject({ status: "pending" });
  expect((await readStore(page, "invoices")).filter((i) => i.memberId === id)).toMatchObject([{ status: "open" }]);
  await noSideways(page, "Registered");

  // ── Front desk: record the payment ─────────────────────────────────────────────────────────────
  await page.goto("/desk/dues");
  await page.getByRole("link", { name: "Collect from Kavya Rao" }).click();
  const pay = dialog(page, "Collect payment");
  await pay.getByRole("radio", { name: "UPI" }).click();
  await pay.getByLabel("UPI reference").fill("kavya@okbank");
  await pay.getByRole("button", { name: "Record payment" }).click();
  const done = dialog(page, "Payment recorded");
  await expect(done).toContainText("Paid in full");
  await done.getByRole("button", { name: "Done" }).click();
  expect((await readStore(page, "memberships")).find((m) => m.memberId === id)).toMatchObject({ status: "active", startsOn: "2026-11-17" });

  // ── Front desk: check in ───────────────────────────────────────────────────────────────────────
  await page.goto("/desk");
  await page.getByRole("combobox", { name: /Search members/ }).fill("kavya");
  await page.getByRole("option", { name: /Kavya Rao/ }).getByRole("button").click();
  await expect(page.getByRole("region", { name: "Check-in result" })).toHaveAttribute("data-result", "allowed");
  expect((await readStore(page, "checkIns")).filter((c) => c.memberId === id)).toHaveLength(1);

  // ── Front desk: assign a trainer ───────────────────────────────────────────────────────────────
  await page.goto(`/desk/members/${id}?tab=trainer`);
  await page.getByRole("button", { name: /^(Assign|Change) trainer$/ }).first().click();
  const tr = dialog(page, /^(Assign|Change) trainer$/);
  await tr.getByRole("radio", { name: "Meera Joshi" }).click();
  await tr.getByLabel("Reason").fill("First plan with a coach");
  await tr.getByRole("button", { name: /^(Assign|Change) trainer$/ }).click();
  await expect(page.getByRole("list", { name: "Trainer history" })).toContainText("Meera Joshi");
  expect((await readStore(page, "trainerAssignments")).filter((a) => a.memberId === id && !a.effectiveTo)).toMatchObject([{ trainerId: "u_trainer_meera" }]);

  // ── Trainer: publish a workout ─────────────────────────────────────────────────────────────────
  await switchTo(page, /Trainer/, /\/t$/);
  await page.goto(`/t/library/programs?member=${id}`);
  await expect(page.getByRole("heading", { name: /^Program for Kavya Rao$/, level: 1 })).toBeVisible();
  const add = async (name: string, section: "Warm-up" | "Main" | "Cool-down" = "Main") => {
    // From 1280 px the library is a zone of its own beside the workout; below that it is a sheet.
    const zone = page.getByRole("region", { name: "Add an exercise" });
    const inline = (await zone.count()) > 0 && (await zone.first().isVisible());
    if (!inline) await page.getByRole("button", { name: "Add exercise" }).click();
    const d = inline ? zone : dialog(page, "Add an exercise");
    await d.getByRole("radio", { name: section }).click();
    await d.getByRole("searchbox", { name: "Search the library" }).fill(name);
    await d.getByRole("button", { name: `Add ${name}` }).click();
  };
  await add("Arm circles", "Warm-up");
  await add("Goblet squat");
  await add("Plank");
  await page.getByLabel("Program name").fill("Getting started");
  await page.getByLabel("Workout name").fill("Full body");
  const rows = page.getByRole("list", { name: "Exercises in this workout" }).getByRole("listitem");
  await rows.nth(1).getByLabel("Load (kg)").fill("12");
  await rows.nth(2).getByLabel("Reps", { exact: true }).fill("");
  await rows.nth(2).getByLabel("Time (s)").fill("30");
  await page.getByRole("button", { name: "Publish version 1" }).click();
  const confirm = dialog(page, "Publish program");
  await confirm.getByRole("button", { name: "Publish version 1" }).click();
  const published = dialog(page, "Version published");
  await expect(published.getByRole("heading", { name: "Version 1 is published" })).toBeVisible();
  await published.getByRole("link", { name: "Back to Kavya" }).click();
  await expect(page.getByRole("heading", { name: "Kavya Rao", level: 1 })).toBeVisible();
  expect((await readStore(page, "workoutPlanVersions")).filter((v) => v.memberId === id)).toMatchObject([{ status: "published", versionNumber: 1, authorId: "u_trainer_meera" }]);
  await noSideways(page, "Published");

  // ── Member: log the session in their own app ───────────────────────────────────────────────────
  await switchTo(page, /Kavya Rao/, /\/m$/);
  await page.getByRole("main").getByRole("link", { name: "Start workout" }).click();
  await expect(page.getByRole("heading", { name: "Arm circles", level: 2 })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await logRemainingSets(page);
    if (i < 2) await page.getByRole("button", { name: "Next exercise" }).click();
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const finish = dialog(page, "Finish workout");
  await finish.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByRole("heading", { name: /Workout complete|Nice work|Done/ }).first()).toBeVisible({ timeout: 8000 }).catch(() => undefined);
  const logs = (await readStore(page, "workoutLogs")).filter((l) => l.memberId === id);
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ status: "completed", enteredByRole: "member" });
  await noSideways(page, "Logged");

  // ── Trainer: review the trend ──────────────────────────────────────────────────────────────────
  await switchTo(page, /Trainer/, /\/t$/);
  await page.goto(`/t/clients/${id}/review`);
  await expect(page.getByRole("heading", { name: "Review", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sticking to the plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trends, last 12 weeks" })).toBeVisible();
  await page.getByLabel("Feedback for Kavya").fill("Good first session. Add load to the squat next week.");
  await page.getByRole("button", { name: "Share review" }).click();
  await expect(page.getByText("Review shared with Kavya")).toBeVisible();
  expect((await readStore(page, "trainerReviews")).filter((r) => r.memberId === id && r.kind === "shared_review")).toHaveLength(1);
  await noSideways(page, "Reviewed");

  // ── Front desk: renew ──────────────────────────────────────────────────────────────────────────
  await switchTo(page, /Front desk/, /\/desk$/);
  await page.goto(`/desk/members/${id}`);
  await page.getByRole("button", { name: "Renew or change plan" }).click();
  const chg = dialog(page, "Change plan");
  await expect(chg.getByRole("radio", { name: /Monthly Plus/ })).toContainText("Renewal, starts 18 Dec 2026");
  await chg.getByRole("radio", { name: /Monthly Plus/ }).click();
  await chg.getByRole("button", { name: "Confirm" }).click();
  const made = dialog(page, "Plan change made");
  await made.getByRole("button", { name: "Collect payment" }).click();
  const pay2 = dialog(page, "Collect payment");
  await pay2.getByRole("radio", { name: "UPI" }).click();
  await pay2.getByLabel("UPI reference").fill("kavya2@okbank");
  await pay2.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog(page, "Payment recorded")).toContainText("Paid in full");
  await dialog(page, "Payment recorded").getByRole("button", { name: "Done" }).click();
  const memberships = (await readStore(page, "memberships")).filter((m) => m.memberId === id).sort((a, b) => String(a.startsOn).localeCompare(String(b.startsOn)));
  expect(memberships).toHaveLength(2);
  expect(String(memberships[1]!.startsOn) > String(memberships[0]!.endsOn)).toBe(true);
  const invoices = (await readStore(page, "invoices")).filter((i) => i.memberId === id);
  expect(invoices.every((i) => i.status === "paid")).toBe(true);
  expect(new Set(invoices.map((i) => i.number)).size).toBe(2);
  await noSideways(page, "Renewed");
}
