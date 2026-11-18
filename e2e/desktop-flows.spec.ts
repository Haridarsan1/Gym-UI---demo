import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, logRemainingSets, readStore, signInAs } from "./helpers";

/**
 * Member flows on wide screens. The M1 journeys again, but driven the way a person on a tablet or a desktop drives them: through
 * the rail or sidebar, the account menu and the side panels, never by typing an address. They run at 1440 px (sidebar, inline
 * booking) and at 768 px (rail, side panels), fail on any console error, and check that nothing scrolls sideways.
 */
const WIDTHS = [1440, 768] as const;
const HEIGHT = (w: number) => (w < 1024 ? 1024 : 900);

/** Signs in at a width and records every page or console error, to be checked at the end of the test. */
async function open(page: Page, width: number, userId: string, path: string) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error: ${m.text()}`);
  });
  await page.setViewportSize({ width, height: HEIGHT(width) });
  await signInAs(page, userId, path);
  return problems;
}

/** A link in the rail or sidebar (whichever shows), by its visible name. */
const nav = (page: Page, name: string | RegExp) => page.locator('nav[aria-label="Main"]:visible').getByRole("link", { name, exact: typeof name === "string" });

/** Opens one of the pages behind the avatar (Membership, Check-in pass, Me). */
async function fromAccountMenu(page: Page, name: RegExp) {
  const button = page.getByRole("button", { name: /^Account menu/ }).first();
  await button.click();
  await page.locator(`[id="${await button.getAttribute("aria-controls")}"]`).getByRole("link", { name }).click();
}

/** A side panel from 640 px. */
const panel = (page: Page, name: string) => page.getByRole("dialog", { name });

const noSideways = async (page: Page, where: string) => expect(await hasHorizontalScroll(page), `${where}: sideways scroll`).toBe(false);

for (const width of WIDTHS) {
  test.describe(`member flows at ${width} px`, () => {
    test("M1 acceptance: log 10, 10 and 8 against 3 × 10 and see it in Progress", async ({ page }) => {
      const problems = await open(page, width, "u_member_arjun", "/m");
      await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Arjun$/, level: 1 })).toBeVisible();

      const completed = async () => {
        await nav(page, "Progress").click();
        await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible();
        const note = await page.getByRole("region", { name: "Key stats" }).getByText(/^\d+ of \d+ scheduled$/).textContent();
        return Number(/^(\d+) of/.exec(note!)![1]);
      };
      const before = await completed();
      await noSideways(page, "Progress");

      await nav(page, "Today").click();
      await nav(page, /^Start today’s workout$/).click();
      await expect(page.getByRole("heading", { name: "Arm circles", level: 2 })).toBeVisible();
      await logRemainingSets(page);
      for (let i = 0; i < 6; i++) {
        await page.getByRole("button", { name: "Next exercise" }).click();
        if ((await page.getByRole("heading", { level: 2 }).first().textContent()) === "Dumbbell bench press") {
          for (const n of [1, 2]) await page.getByRole("form", { name: `Set ${n}` }).getByRole("button", { name: "Log set" }).click();
          const third = page.getByRole("form", { name: "Set 3" });
          await third.getByRole("button", { name: "Less reps" }).click();
          await third.getByRole("button", { name: "Less reps" }).click();
          await expect(third.getByRole("textbox", { name: "Reps" })).toHaveValue("8");
          await third.getByRole("button", { name: "Log set" }).click();
          await expect(page.getByRole("list", { name: "Sets, 3 of 3 logged" })).toContainText(/10 × [\d.]+ kg.*10 × [\d.]+ kg.*8 × [\d.]+ kg/s);
        } else await logRemainingSets(page);
      }
      await noSideways(page, "Workout");
      await page.getByRole("button", { name: "Finish", exact: true }).click();
      // The finish sheet is a confirmation, so on wide screens it is a centred dialog, not a bottom sheet.
      const finish = panel(page, "Finish workout");
      const fb = (await finish.boundingBox())!;
      expect(Math.abs(fb.x + fb.width / 2 - width / 2)).toBeLessThan(2);
      await finish.getByRole("button", { name: "Finish workout" }).click();
      await expect(page.locator('[data-stage="done"]')).toBeVisible({ timeout: 8000 });
      await noSideways(page, "Workout complete");

      const log = (await readStore(page, "workoutLogs")).find((l) => l.memberId === "mem_arjun" && l.scheduledOn === "2026-11-17")!;
      expect(log.status).toBe("completed");
      const bench = (log.entries as Array<{ exerciseId: string; sets: Array<{ reps?: number }> }>).find((e) => e.exerciseId === "ex_db_bench")!;
      expect(bench.sets.map((s) => s.reps)).toEqual([10, 10, 8]);

      // Back to the app through the navigation, and Progress now counts it.
      expect(await completed()).toBe(before + 1);
      await noSideways(page, "Progress after the workout");
      expect(problems).toEqual([]);
    });

    test("books a session and cancels it, from the sidebar and a side panel", async ({ page }) => {
      const problems = await open(page, width, "u_member_arjun", "/m");
      await nav(page, "Bookings").click();
      await expect(page.getByRole("heading", { name: "Bookings", level: 1 })).toBeVisible();
      const credits = page.getByRole("region", { name: "Training sessions" });
      await expect(credits).toContainText("5 sessions left");
      const upcoming = page.getByRole("list", { name: "Upcoming sessions" }).getByRole("article");
      await expect(upcoming).toHaveCount(1);

      await page.getByRole("button", { name: "Book a session" }).first().click();
      // 768 px: a side panel. 1440 px: inline on the page, with no dialog.
      const flow = width >= 1024 ? page.getByRole("region", { name: "Book a session" }) : panel(page, "Book a session");
      if (width >= 1024) await expect(page.getByRole("dialog")).toHaveCount(0);
      await flow.getByRole("button", { name: /Meera Joshi/ }).click();
      await flow.getByRole("radiogroup", { name: "Day" }).getByRole("radio").nth(2).click();
      await flow.getByRole("list", { name: /^Times on/ }).locator("button:not([disabled])").first().click();
      await expect(flow.getByRole("region", { name: "Credit" })).toContainText("4 after this booking");
      await noSideways(page, "Booking");
      await flow.getByRole("button", { name: "Confirm booking" }).click();
      await expect(page.getByText("Session booked", { exact: true })).toBeVisible();
      await expect(upcoming).toHaveCount(2);
      await expect(credits).toContainText("4 sessions left");

      // Cancel the new one: a centred dialog. Free, so the credit goes back.
      await upcoming.last().getByRole("button", { name: "Cancel session" }).click();
      const confirm = panel(page, "Cancel session");
      const b = (await confirm.boundingBox())!;
      expect(Math.abs(b.x + b.width / 2 - width / 2)).toBeLessThan(2);
      await confirm.getByRole("button", { name: "Cancel session" }).click();
      await expect(page.getByText("Session cancelled", { exact: true })).toBeVisible();
      await expect(upcoming).toHaveCount(1);
      await expect(credits).toContainText("5 sessions left");
      const canceledToday = (await readStore(page, "bookings")).filter((r) => r.memberId === "mem_arjun" && r.status === "canceled" && String(r.canceledAt).startsWith("2026-11-17"));
      expect(canceledToday).toHaveLength(1);
      await noSideways(page, "Bookings");
      expect(problems).toEqual([]);
    });

    test("pays an overdue invoice from Today, in a side panel", async ({ page }) => {
      const problems = await open(page, width, "u_member_priya", "/m");
      await page.getByRole("link", { name: "Pay ₹2,950" }).click();
      const d = panel(page, "Pay invoice");
      const b = (await d.boundingBox())!;
      expect(b.x + b.width).toBeGreaterThan(width - 2);
      await expect(d.getByRole("region", { name: "Summary" })).toContainText("To pay₹2,950");
      await noSideways(page, "Pay invoice");
      await d.getByRole("radio", { name: "Net banking" }).click();
      await d.getByRole("button", { name: /^Pay ₹2,950$/ }).click();
      await d.getByLabel("Your bank").selectOption("HDFC Bank");
      await d.getByRole("button", { name: /^Pay ₹2,950$/ }).click();
      await expect(d.getByRole("status")).toContainText("Renewed");
      await d.getByRole("button", { name: "Done" }).click();
      await expect(d).toHaveCount(0);
      await nav(page, "Today").click();
      await expect(page.getByRole("complementary", { name: "Payment due" })).toHaveCount(0);
      expect((await readStore(page, "invoices")).filter((i) => i.memberId === "mem_priya" && i.status === "open")).toHaveLength(0);
      expect(problems).toEqual([]);
    });

    test("renews a membership from Membership (behind the account menu), then opens the receipt", async ({ page }) => {
      const problems = await open(page, width, "u_member_arjun", "/m");
      await fromAccountMenu(page, /Membership and receipts/);
      await expect(page.getByRole("heading", { name: "Membership", level: 1 })).toBeVisible();
      await noSideways(page, "Membership");
      await page.getByRole("button", { name: "Renew membership" }).click();
      const d = panel(page, "Renew your membership");
      const b = (await d.boundingBox())!;
      expect(b.x + b.width).toBeGreaterThan(width - 2);
      await expect(d.getByRole("region", { name: "What you will get" })).toContainText("New period: 9 Dec 2026 to 8 Jan 2027");
      await d.getByRole("button", { name: "Continue to payment" }).click();
      await d.getByRole("button", { name: /^Pay ₹4,130$/ }).click();
      await expect(d.locator(".stamp")).toContainText("Renewed");
      await d.getByRole("link", { name: "Open receipt" }).click();
      await expect(page.getByRole("heading", { name: "Tax invoice and receipt", level: 1 })).toBeVisible();
      await noSideways(page, "Receipt");
      expect((await readStore(page, "memberships")).filter((m) => m.memberId === "mem_arjun" && m.invoiceId)).toHaveLength(1);
      expect(problems).toEqual([]);
    });
  });
}

/**
 * Trainer journeys at 1440 px (three zones: lists, the chosen list, the client at a glance) and 768 px (the lists beside the
 * chosen list). Driven through the sidebar or rail. Add each trainer journey here as its screen is built.
 */
for (const width of WIDTHS) {
  test.describe(`trainer flows at ${width} px`, () => {
    test("Today: see the day, move between the five lists, and open a client", async ({ page }) => {
      const problems = await open(page, width, "u_trainer_meera", "/t");
      await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Meera$/, level: 1 })).toBeVisible();
      await expect(page.getByText(/^4 sessions today, 3 still to come\./)).toBeVisible();
      await noSideways(page, "Today");

      // Sessions come first, with the next one marked.
      const menu = page.getByRole("navigation", { name: "Your day" });
      await expect(menu.getByRole("button", { name: /Sessions today/ })).toHaveAttribute("aria-current", "true");
      const sessions = page.getByRole("list", { name: "Sessions today" }).getByRole("listitem");
      await expect(sessions).toHaveCount(4);
      await expect(sessions.nth(1)).toContainText("Next");

      // Each list in the menu opens in the detail zone, with its own heading and clients.
      for (const [title, reason] of [["Reviews overdue", /overdue$/], ["Missed workouts", /Missed \d of \d workouts in 7 days/], ["Credits expiring", /expire/], ["Waiting for a plan", /Waiting|Assigned today/]] as const) {
        await menu.getByRole("button", { name: new RegExp(title) }).click();
        await expect(menu.getByRole("button", { name: new RegExp(title) })).toHaveAttribute("aria-current", "true");
        await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
        await expect(page.getByRole("list", { name: title }).getByRole("listitem").first()).toContainText(reason);
        await noSideways(page, title);
      }

      await menu.getByRole("button", { name: /Missed workouts/ }).click();
      const first = page.getByRole("list", { name: "Missed workouts" }).getByRole("listitem").first();
      if (width >= 1280) {
        // Three zones: picking a client shows them at a glance, and the address remembers the list.
        expect(await page.locator("[data-zones]").getAttribute("data-zones")).toBe("3");
        const second = page.getByRole("list", { name: "Missed workouts" }).getByRole("listitem").nth(1);
        const name = (await second.locator(".font-semibold").first().textContent())!;
        await second.getByRole("button").click();
        const glance = page.getByRole("complementary", { name: "Client at a glance" });
        await expect(glance.getByRole("heading", { name, level: 2 })).toBeVisible();
        await expect(glance).toContainText(/Missed \d of \d workouts in the last 7 days/);
        await expect(page).toHaveURL(/show=missed/);
        await glance.getByRole("link", { name: new RegExp(`^Open ${name.split(" ")[0]}`) }).click();
      } else {
        expect(await page.locator("[data-zones]").getAttribute("data-zones")).toBe("2");
        await first.getByRole("link").click();
      }
      await expect(page).toHaveURL(/\/t\/clients\/mem_\d+$/);

      // The sidebar or rail leads back.
      await nav(page, "Clients").click();
      await expect(page).toHaveURL(/\/t\/clients$/);
      await nav(page, "Today").click();
      await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Meera$/, level: 1 })).toBeVisible();
      expect(problems).toEqual([]);
    });

    test("Today: on a wide screen the next session’s client is already at a glance", async ({ page }) => {
      test.skip(width < 1280, "The context zone starts at 1280 px");
      await open(page, width, "u_trainer_meera", "/t");
      const next = page.getByRole("list", { name: "Sessions today" }).getByRole("listitem").nth(1);
      const name = (await next.locator(".font-semibold").first().textContent())!;
      await expect(page.getByRole("complementary", { name: "Client at a glance" }).getByRole("heading", { name, level: 2 })).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Client at a glance" })).toContainText(/Session today at 5:00 pm/);
    });

    test("Today: a quiet list says what it is for", async ({ page }) => {
      await open(page, width, "u_trainer_kavya", "/t");
      await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Kavya$/, level: 1 })).toBeVisible();
      await page.getByRole("navigation", { name: "Your day" }).getByRole("button", { name: /Credits expiring/ }).click();
      await expect(page.getByText("No credits about to expire")).toBeVisible();
      await noSideways(page, "Quiet list");
    });
  });
}
