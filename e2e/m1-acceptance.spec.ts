import { expect, test } from "@playwright/test";
import { DEMO_NOW, hasHorizontalScroll, logRemainingSets, readStore } from "./helpers";

/**
 * M1 acceptance: one member, one visit, every part of the member app. It follows Arjun from the login screen through a workout
 * logged as 10, 10 and 8 reps against 3 × 10 (the P03 check), his progress, a booking, a renewal paid through the gateway, his
 * check-in pass and his consent. It runs at 390 px and at 1440 px, fails on any console error, and checks that nothing scrolls sideways.
 */
test("M1 acceptance: a member signs in, trains, sees progress, books, renews, checks in and manages consent", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error: ${m.text()}`);
  });
  const noSideways = async (where: string) => expect(await hasHorizontalScroll(page), `${where}: sideways scroll`).toBe(false);

  await page.clock.install({ time: DEMO_NOW });
  await page.clock.resume();
  await page.addInitScript(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 0 })));

  // 1. Sign in with a phone number and any 6-digit code.
  await page.goto("/login");
  await page.getByRole("button", { name: "Phone and code" }).click();
  await page.getByLabel("Mobile number").fill("98200 22002");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/m$/);
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Arjun$/, level: 1 })).toBeVisible();
  await noSideways("Today");

  // What Progress says before the workout.
  const completedCount = async () => {
    await page.goto("/m/progress");
    const note = await page.getByRole("region", { name: "Key stats" }).getByText(/^\d+ of \d+ scheduled$/).textContent();
    return Number(/^(\d+) of/.exec(note!)![1]);
  };
  const before = await completedCount();
  await page.goto("/m");

  // 2. P03: log 10, 10 and 8 reps against 3 × 10. The workout counts as completed.
  await page.getByRole("link", { name: "Start workout" }).click();
  await expect(page.getByRole("heading", { name: "Arm circles", level: 2 })).toBeVisible();
  await logRemainingSets(page);
  for (let i = 0; i < 6; i++) {
    await page.getByRole("button", { name: "Next exercise" }).click();
    if ((await page.getByRole("heading", { level: 2 }).first().textContent()) === "Dumbbell bench press") {
      const third = page.getByRole("form", { name: "Set 3" });
      for (const n of [1, 2]) await page.getByRole("form", { name: `Set ${n}` }).getByRole("button", { name: "Log set" }).click();
      await third.getByRole("button", { name: "Less reps" }).click();
      await third.getByRole("button", { name: "Less reps" }).click();
      await expect(third.getByRole("textbox", { name: "Reps" })).toHaveValue("8");
      await third.getByRole("button", { name: "Log set" }).click();
      await expect(page.getByRole("list", { name: "Sets, 3 of 3 logged" })).toContainText(/10 × [\d.]+ kg.*10 × [\d.]+ kg.*8 × [\d.]+ kg/s);
    } else await logRemainingSets(page);
  }
  await noSideways("Workout");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("dialog", { name: "Finish workout" }).getByRole("button", { name: "Finish workout" }).click();
  await expect(page.locator('[data-stage="done"]')).toBeVisible({ timeout: 8000 });
  const log = (await readStore(page, "workoutLogs")).find((l) => l.memberId === "mem_arjun" && l.scheduledOn === "2026-11-17")!;
  expect(log.status).toBe("completed");
  const bench = (log.entries as Array<{ exerciseId: string; sets: Array<{ reps?: number }> }>).find((e) => e.exerciseId === "ex_db_bench")!;
  expect(bench.sets.map((s) => s.reps)).toEqual([10, 10, 8]);
  await noSideways("Workout complete");

  // 3. It shows in Progress: the completed count goes up by one, and the completion chart is there.
  expect(await completedCount()).toBe(before + 1);
  await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible();
  await noSideways("Progress");
  const more = page.locator("summary", { hasText: /^More charts/ });
  if (!(await more.evaluate((el) => (el.parentElement as HTMLDetailsElement).open))) await more.click();
  await expect(page.getByRole("region", { name: "Workout completion" })).toBeVisible();

  // 4. Book a session with the member’s own trainer, and see the credit move.
  await page.goto("/m/bookings");
  await expect(page.getByRole("region", { name: "Training sessions" })).toContainText("5 sessions left");
  await page.getByRole("button", { name: "Book a session" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Book a session" });
  await sheet.getByRole("button", { name: /Meera Joshi/ }).click();
  await sheet.getByRole("radiogroup", { name: "Day" }).getByRole("radio").nth(2).click();
  await sheet.getByRole("list", { name: /^Times on/ }).locator("button:not([disabled])").first().click();
  await expect(sheet.getByRole("region", { name: "Credit" })).toContainText("4 after this booking");
  await sheet.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("region", { name: "Training sessions" })).toContainText("4 sessions left");
  await noSideways("Bookings");

  // 5. Renew through the gateway: the new dates and price come first; then the confirmation stamp, a receipt, one renewal.
  await page.goto("/m/membership?renew=1");
  const renew = page.getByRole("dialog", { name: "Renew your membership" });
  await expect(renew.getByRole("region", { name: "What you will get" })).toContainText("New period: 9 Dec 2026 to 8 Jan 2027");
  await renew.getByRole("button", { name: "Continue to payment" }).click();
  await renew.getByRole("button", { name: /^Pay ₹4,130$/ }).click();
  await expect(renew.locator(".stamp")).toContainText("Renewed");
  await renew.getByRole("link", { name: "Open receipt" }).click();
  await expect(page.getByRole("heading", { name: "Tax invoice and receipt", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeVisible();
  await noSideways("Receipt");
  expect((await readStore(page, "memberships")).filter((m) => m.memberId === "mem_arjun" && m.invoiceId)).toHaveLength(1);

  // 6. The pass: ready, then scanned at the door.
  await page.goto("/m/pass");
  await expect(page.getByText("Ready to scan")).toBeVisible();
  await noSideways("Pass");
  await page.getByRole("button", { name: "Scan my pass at the door" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Checked in at Andheri" })).toBeVisible();

  // 7. Consent: withdraw marketing, and it is saved and recorded.
  await page.goto("/m/me");
  await expect(page.getByRole("heading", { name: "Me", level: 1 })).toBeVisible();
  const marketing = page.getByRole("switch", { name: "Offers and news" });
  if ((await marketing.getAttribute("aria-checked")) === "false") await marketing.click();
  await marketing.click();
  await expect(page.getByText("Offers and news: turned off")).toBeVisible();
  await noSideways("Me");
  expect((await readStore(page, "auditEvents")).filter((a) => a.action === "consent.change").length).toBeGreaterThanOrEqual(1);

  // Nothing went wrong behind the scenes.
  expect(problems).toEqual([]);
});
