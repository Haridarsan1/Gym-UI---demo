import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { changeStore, hasHorizontalScroll, readStore, signInAs } from "./helpers";

const sheet = (page: Page) => page.getByRole("dialog", { name: "Book a session" });
const credits = (page: Page) => page.getByRole("region", { name: "Training sessions" });
const upcoming = (page: Page) => page.getByRole("list", { name: "Upcoming sessions" }).getByRole("article");

/** Opens the booking sheet and goes to the confirmation step for the first free slot with the member’s own trainer. */
async function walkToConfirm(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Book a session" }).first().click();
  const d = sheet(page);
  await d.getByRole("button", { name: /Meera Joshi/ }).click();
  await d.getByRole("list", { name: /^Times on/ }).locator("button:not([disabled])").first().click();
  await expect(d.getByRole("region", { name: "Booking details" })).toBeVisible();
  return d;
}

test.describe("Bookings: Arjun", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/bookings");
    await expect(credits(page)).toContainText("5");
  });

  test("shows the credits, the upcoming session with its exact free-cancellation time, and the late terms", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Bookings", level: 1 })).toBeVisible();
    await expect(credits(page)).toContainText("5 sessions left");
    await expect(credits(page)).toContainText("1 held for upcoming bookings, 2 used.");
    await expect(upcoming(page)).toHaveCount(1);
    const card = upcoming(page).first();
    await expect(card).toContainText("Coach Meera");
    await expect(card).toContainText("Andheri");
    await expect(card.getByText("Booked", { exact: true })).toBeVisible();
    await expect(card.getByText(/^Free cancellation until 6:00 am \w{3} \d+ \w{3}$/)).toBeVisible();
    await expect(card.getByText(/^After 6:00 am \w{3} \d+ \w{3}, cancelling or not turning up uses this session credit\.$/)).toBeVisible();
    await expect(page.getByRole("radio", { name: "Upcoming (1)" })).toHaveAttribute("aria-checked", "true");
  });

  test("books a session in three steps: trainer (their own first), day, slot; then confirms with the cost and deadline", async ({ page }) => {
    await page.getByRole("button", { name: "Book a session" }).click();
    const d = sheet(page);
    const trainers = d.getByRole("list", { name: "Trainers" }).getByRole("listitem");
    await expect(trainers.first()).toContainText("Meera Joshi");
    await expect(trainers.first()).toContainText("Your trainer");
    await expect(trainers.first()).toContainText(/Next free \w{3} \d+ \w{3}, \d+:\d{2} (am|pm)/);
    expect(await trainers.count()).toBeGreaterThanOrEqual(2);
    await trainers.first().getByRole("button").click();
    const days = d.getByRole("radiogroup", { name: "Day" }).getByRole("radio");
    await expect(days.first()).toBeVisible();
    expect(await days.count()).toBeGreaterThanOrEqual(3);
    await expect(days.first()).toContainText(/\d+ free/);
    await days.nth(2).click(); // a day far enough ahead that free cancellation is still open
    await expect(days.nth(2)).toHaveAttribute("aria-checked", "true");
    await d.getByRole("list", { name: /^Times on/ }).locator("button:not([disabled])").first().click();
    await expect(d.getByRole("region", { name: "Credit" })).toHaveText("Costs 1 session credit. You have 5 sessions left, and 4 after this booking.");
    const cancellation = d.getByRole("region", { name: "Cancellation" });
    await expect(cancellation.getByText(/^Free cancellation until \d{1,2}:\d{2} (am|pm) \w{3} \d+ \w{3}$/)).toBeVisible();
    await expect(cancellation.getByText(/cancelling or not turning up uses this session credit\.$/)).toBeVisible();
    await d.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByText("Session booked", { exact: true })).toBeVisible();
    await expect(upcoming(page)).toHaveCount(2);
    await expect(credits(page)).toContainText("4 sessions left");
    await expect(credits(page)).toContainText("2 held for upcoming bookings, 2 used.");
  });

  test("a slot already inside the cancellation window says so before the member confirms", async ({ page }) => {
    await changeStore(page, "gymPolicies", `(v) => ({ ...v, cancellationCutoffHours: 168 })`); // every slot is within a week
    await page.reload();
    const d = await walkToConfirm(page);
    await expect(d.getByRole("region", { name: "Cancellation" }).getByText(/^Free cancellation ended \d{1,2}:\d{2} (am|pm) \w{3} \d+ \w{3}\. Cancelling now uses your credit\.$/)).toBeVisible();
    await expect(d.getByRole("region", { name: "Cancellation" })).toContainText("cancelling or not turning up uses this session credit");
  });

  test("a confirmation is written to the email delivery log, and so is a cancellation (O04)", async ({ page }) => {
    const d = await walkToConfirm(page);
    await d.getByRole("button", { name: "Confirm booking" }).click();
    await expect(upcoming(page)).toHaveCount(2);
    let log = await readStore(page, "emailLog");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ template: "booking_confirmed", memberId: "mem_arjun", status: "sent", to: "arjun.kumar@example.in" });
    expect(String(log[0]!.subject)).toMatch(/^Session booked: /);
    await upcoming(page).last().getByRole("button", { name: "Cancel session" }).click();
    await page.getByRole("dialog", { name: "Cancel session" }).getByRole("button", { name: "Cancel session" }).click();
    await expect(page.getByText("Session cancelled", { exact: true })).toBeVisible();
    log = await readStore(page, "emailLog");
    expect(log.map((e) => e.template).sort()).toEqual(["booking_canceled", "booking_confirmed"]);
  });

  test("cancelling in time says it is free and gives the credit back", async ({ page }) => {
    await upcoming(page).first().getByRole("button", { name: "Cancel session" }).click();
    const d = page.getByRole("dialog", { name: "Cancel session" });
    await expect(d.getByRole("note")).toContainText("Cancelling now is free. Your session credit goes back to your balance. Free cancellation ends 6:00 am");
    await d.getByRole("button", { name: "Cancel session" }).click();
    await expect(page.getByText("Session cancelled", { exact: true })).toBeVisible();
    await expect(credits(page)).toContainText("6 sessions left");
    await expect(credits(page)).toContainText("0 held for upcoming bookings, 2 used.");
    await expect(page.getByRole("heading", { name: "No sessions booked" })).toBeVisible();
    await page.getByRole("radio", { name: /^Past/ }).click();
    await expect(page.getByRole("list", { name: "Past sessions" }).getByRole("article").first()).toContainText("Cancelled in time. The session credit went back to your balance.");
  });

  test("a late cancellation says, before the member confirms, that the credit is used", async ({ page }) => {
    // Move the session to five hours from now, which is inside the 12-hour free-cancellation window.
    await changeStore(page, "bookings", `(v) => v.id === "bk_arjun_3" ? { ...v, startsAt: new Date(Math.ceil((Date.now() + 5 * 3600e3) / 60e3) * 60e3).toISOString(), endsAt: new Date(Math.ceil((Date.now() + 6 * 3600e3) / 60e3) * 60e3).toISOString(), slotKey: "u_trainer_meera|late-test" } : false`);
    await page.reload();
    const card = upcoming(page).first();
    await expect(card.getByText(/^Free cancellation ended /)).toBeVisible();
    await expect(card.getByRole("button", { name: "Reschedule" })).toHaveCount(0);
    await expect(card).toContainText("Moving a session was free until");
    await card.getByRole("button", { name: "Cancel session" }).click();
    const d = page.getByRole("dialog", { name: "Cancel session" });
    await expect(d.getByRole("note")).toContainText("If you cancel now, this session credit is used and does not come back.");
    expect(await d.getByRole("note").evaluate((el) => getComputedStyle(el).color)).not.toMatch(/rgb\((1[6-9]\d|2\d\d), ([0-5]?\d), ([0-5]?\d)\)/); // calm, not red
    await d.getByRole("button", { name: "Cancel and use the credit" }).click();
    await expect(page.getByText("Session cancelled", { exact: true })).toBeVisible();
    await expect(credits(page)).toContainText("5 sessions left");
    await expect(credits(page)).toContainText("0 held for upcoming bookings, 3 used.");
    await page.getByRole("radio", { name: /^Past/ }).click();
    await expect(page.getByRole("list", { name: "Past sessions" }).getByRole("article").first()).toContainText("Cancelled after the free-cancellation time. The session credit was used.");
  });

  test("keeping the session closes the sheet and changes nothing", async ({ page }) => {
    await upcoming(page).first().getByRole("button", { name: "Cancel session" }).click();
    await page.getByRole("dialog", { name: "Cancel session" }).getByRole("button", { name: "Keep session" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(upcoming(page)).toHaveCount(1);
    await expect(credits(page)).toContainText("5 sessions left");
  });

  test("rescheduling moves the booking and keeps one reserved credit, never two", async ({ page }) => {
    await upcoming(page).first().getByRole("button", { name: "Reschedule" }).click();
    const d = page.getByRole("dialog", { name: "Move your session" });
    await expect(d.getByRole("radiogroup", { name: "Day" })).toBeVisible(); // starts at the slot step, with the same trainer
    await d.getByRole("list", { name: /^Times on/ }).locator("button:not([disabled])").first().click();
    await expect(d.getByRole("region", { name: "Credit" })).toHaveText("No extra credit. The session credit already held for this booking moves with it.");
    const before = await readStore(page, "creditLedger");
    await d.getByRole("button", { name: "Move session" }).click();
    await expect(page.getByText("Session moved", { exact: true })).toBeVisible();
    await expect(upcoming(page)).toHaveCount(1);
    await expect(credits(page)).toContainText("5 sessions left");
    await expect(credits(page)).toContainText("1 held for upcoming bookings, 2 used.");
    const after = await readStore(page, "creditLedger");
    expect(after).toHaveLength(before.length);
    expect(after.filter((e) => e.bookingId === "bk_arjun_3" && e.kind === "reservation")).toHaveLength(1);
    expect((await readStore(page, "emailLog")).map((e) => e.template)).toEqual(["booking_rescheduled"]);
  });

  test("a slot someone else has taken is shown as taken, and can’t be chosen", async ({ page }) => {
    await page.getByRole("button", { name: "Book a session" }).click();
    const d = sheet(page);
    await d.getByRole("button", { name: /Meera Joshi/ }).click();
    const times = d.getByRole("list", { name: /^Times on/ });
    const first = times.locator("button:not([disabled])").first();
    const label = (await first.textContent())!;
    await first.click();
    await d.getByRole("button", { name: "Confirm booking" }).click();
    await expect(upcoming(page)).toHaveCount(2);
    await page.getByRole("button", { name: "Book a session" }).click();
    await sheet(page).getByRole("button", { name: /Meera Joshi/ }).click();
    await expect(sheet(page).getByRole("list", { name: /^Times on/ }).getByRole("button", { name: `${label} taken` })).toBeDisabled();
  });

  test("Past shows attended, no-show and cancelled, in neutral words and never red", async ({ page }) => {
    await page.getByRole("radio", { name: /^Past/ }).click();
    const past = page.getByRole("list", { name: "Past sessions" }).getByRole("article");
    await expect(past).toHaveCount(3);
    await expect(past.nth(0)).toContainText("No-show");
    await expect(past.nth(0)).toContainText("You did not turn up this time. The session credit was used.");
    await expect(past.nth(1)).toContainText("Cancelled");
    await expect(past.nth(1)).toContainText("Cancelled in time. The session credit went back to your balance.");
    await expect(past.nth(2)).toContainText("Attended");
    await expect(past.nth(2)).toContainText("You trained. The session credit was used.");
    const noShow = past.nth(0).getByText("No-show", { exact: true });
    expect(await noShow.evaluate((el) => getComputedStyle(el).color)).not.toMatch(/rgb\((1[6-9]\d|2\d\d), ([0-5]?\d), ([0-5]?\d)\)/);
    expect(await noShow.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toMatch(/rgb\(2[45]\d, 2[0-3]\d, 2[0-3]\d\)/);
  });

  test("shows an error with a retry when the bookings can’t load", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 1 })));
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("We couldn’t load your bookings");
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 0 })));
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(credits(page)).toContainText("5 sessions left");
  });
});

test.describe("Two tabs booking the same slot (A03)", () => {
  async function tab(context: BrowserContext) {
    const page = await context.newPage();
    await page.goto("/m/bookings");
    await expect(credits(page)).toContainText("sessions left");
    return page;
  }

  test("one succeeds; the other sees “That slot was just taken” with the next free slots, and the credits stay right", async ({ page, context }) => {
    await signInAs(page, "u_member_arjun", "/m/bookings");
    await expect(credits(page)).toContainText("5 sessions left");
    const second = await tab(context);
    const a = await walkToConfirm(page);
    const b = await walkToConfirm(second);
    expect(await a.getByRole("region", { name: "Booking details" }).textContent()).toBe(await b.getByRole("region", { name: "Booking details" }).textContent());

    await Promise.all([a.getByRole("button", { name: "Confirm booking" }).click(), b.getByRole("button", { name: "Confirm booking" }).click()]);

    const pages = [page, second];
    const outcome = async () => ({
      won: await Promise.all(pages.map((p) => p.getByText("Session booked", { exact: true }).isVisible())),
      lost: await Promise.all(pages.map((p) => p.getByText("That slot was just taken.").isVisible())),
    });
    await expect.poll(async () => { const o = await outcome(); return o.won.filter(Boolean).length + o.lost.filter(Boolean).length; }).toBe(2);
    const { won, lost } = await outcome();
    expect(won.filter(Boolean)).toHaveLength(1);
    expect(lost.filter(Boolean)).toHaveLength(1);
    expect(won.findIndex(Boolean)).not.toBe(lost.findIndex(Boolean));
    const loser = pages[lost.findIndex(Boolean)]!;
    const alert = loser.getByRole("alert").filter({ hasText: "That slot was just taken." });
    await expect(alert).toContainText("Nothing was held and your session credits are unchanged.");
    const next = alert.getByRole("list", { name: "Next free slots" }).getByRole("button");
    expect(await next.count()).toBe(4);

    // Exactly one booking holds the slot, and exactly one credit was taken.
    const bookings = (await readStore(page, "bookings")).filter((r) => r.memberId === "mem_arjun" && r.status === "booked");
    expect(bookings).toHaveLength(2); // the seeded session and the winner
    expect(new Set(bookings.map((r) => r.slotKey)).size).toBe(2);
    const reservations = (await readStore(page, "creditLedger")).filter((e) => e.memberId === "mem_arjun" && e.kind === "reservation" && !String(e.id).startsWith("cr_arjun_res_"));
    expect(reservations).toHaveLength(1);
    await expect(credits(page)).toContainText("4 sessions left");
    await expect(credits(second)).toContainText("4 sessions left");

    // The loser picks the first suggested slot and books it, and now both are held.
    await next.first().click();
    await loser.getByRole("dialog", { name: "Book a session" }).getByRole("button", { name: "Confirm booking" }).click();
    await expect(loser.getByText("Session booked", { exact: true }).last()).toBeVisible();
    await expect(credits(loser)).toContainText("3 sessions left");
    await expect(credits(loser)).toContainText("3 held for upcoming bookings, 2 used.");
  });
});

test.describe("No credits, a frozen membership, and nothing booked", () => {
  test("with no credits it explains, offers Buy more sessions, and has no Book button", async ({ page }) => {
    await signInAs(page, "u_member_priya", "/m/bookings");
    const c = credits(page);
    await expect(c.getByText("No training sessions left")).toBeVisible();
    await expect(c).toContainText("Each personal-training session you book holds one session credit.");
    await expect(c.getByRole("link", { name: "Buy more sessions" })).toHaveAttribute("href", "/m/membership?buy=sessions");
    await expect(page.getByRole("button", { name: "Book a session" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No sessions booked" })).toBeVisible();
    await expect(page.getByText("Buy more sessions to book your next one.")).toBeVisible();
    await c.getByRole("link", { name: "Buy more sessions" }).click();
    await expect(page).toHaveURL(/\/m\/membership\?buy=sessions$/);
  });

  test("a frozen membership explains why booking is closed", async ({ page }) => {
    await signInAs(page, "u_member_rahul", "/m/bookings");
    await expect(page.getByText(/Your membership is frozen, so booking is paused/)).toBeVisible();
  });

  test("a member with credits and nothing booked is told what to do", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/bookings");
    await changeStore(page, "bookings", `(v) => v.id === "bk_arjun_3" ? null : false`);
    await page.reload();
    await expect(page.getByRole("heading", { name: "No sessions booked" })).toBeVisible();
    await expect(page.getByText("Book a session with your trainer. You will see its free-cancellation time before you confirm.")).toBeVisible();
    await page.getByRole("button", { name: "Book a session" }).last().click();
    await expect(sheet(page)).toBeVisible();
  });
});

test.describe("Bookings at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the sheet fits the phone: big targets, no sideways scroll, nothing shouted or dotted", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/bookings");
    await expect(credits(page)).toContainText("5 sessions left");
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.getByRole("button", { name: "Book a session" }).click();
    const d = sheet(page);
    for (const b of await d.getByRole("list", { name: "Trainers" }).getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await d.getByRole("button", { name: /Meera Joshi/ }).click();
    for (const r of await d.getByRole("radiogroup", { name: "Day" }).getByRole("radio").all()) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const s of (await d.getByRole("list", { name: /^Times on/ }).getByRole("button").all()).slice(0, 4)) expect((await s.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await d.getByRole("list", { name: /^Times on/ }).locator("button:not([disabled])").first().click();
    const shouted = await page.evaluate(() => [...document.querySelectorAll("main *, [role='dialog'] *")].filter((e) => getComputedStyle(e).textTransform === "uppercase").length);
    expect(shouted).toBe(0);
    expect(await page.evaluate(() => [document.querySelector("main"), document.querySelector("[role='dialog']")].map((e) => e?.textContent ?? "").join(" "))).not.toContain("·");
    expect((await d.getByRole("button", { name: "Confirm booking" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
