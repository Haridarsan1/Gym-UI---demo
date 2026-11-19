import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, logRemainingSets, readStore, signInAs } from "./helpers";
import { coachLogJourney } from "./trainer-journeys";

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

for (const width of WIDTHS) {
  test.describe(`trainer clients at ${width} px`, () => {
    test("Clients: search and filter the list, open a client beside it, move through their sections, and leave a private note", async ({ page }) => {
      const problems = await open(page, width, "u_trainer_meera", "/t");
      await nav(page, "Clients").click();
      await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
      const rows = page.getByRole("list", { name: "Your clients" }).getByRole("listitem");
      await expect(rows.first()).toBeVisible();
      expect(await page.locator("[data-zones]").getAttribute("data-zones")).toBe(width >= 1280 ? "3" : "2");
      await noSideways(page, "Clients");

      // Search keeps the list on screen and narrows it; the filter narrows it by what needs attention.
      await page.getByRole("searchbox").fill("arjun");
      await expect(rows).toHaveCount(1);
      await page.getByRole("searchbox").fill("");
      await page.getByRole("radio", { name: "Needs a plan" }).click();
      await expect(rows.filter({ hasText: "Sneha Patil" })).toHaveCount(1);
      await page.getByRole("radio", { name: "Everyone" }).click();

      // The client opens in the detail zone and the list stays where it was.
      await page.getByRole("searchbox").fill("arjun");
      await rows.first().getByRole("link").click();
      await expect(page).toHaveURL(/\/t\/clients\/mem_arjun\?q=arjun$/);
      await expect(page.getByRole("heading", { name: "Arjun Kumar", level: 1 })).toBeVisible();
      await expect(rows.first().getByRole("link")).toHaveAttribute("aria-current", "page");
      const glance = page.getByRole("complementary", { name: "Client at a glance" });
      await expect(glance).toContainText("Monthly Plus");
      if (width >= 1280) {
        // The glance is a third zone beside the profile; below that it is the top of the Overview tab.
        const g = (await glance.boundingBox())!;
        const prof = (await page.getByRole("article", { name: "Arjun Kumar, client" }).boundingBox())!;
        expect(g.x).toBeGreaterThanOrEqual(prof.x + prof.width - 1);
      }
      await noSideways(page, "Client profile");

      await page.getByRole("tab", { name: "Workouts" }).click();
      await expect(page.getByRole("list", { name: "Recent workouts" }).getByRole("listitem").first()).toContainText(/Entered by/);
      await page.getByRole("tab", { name: "Notes and reviews" }).click();
      await page.getByRole("textbox", { name: "Private note" }).fill("Moved to the heavier block, watch the left shoulder.");
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(page.getByRole("list", { name: "Notes and reviews" }).getByRole("listitem").first()).toContainText("Moved to the heavier block");

      // Another client from the list, without leaving the screen.
      await page.getByRole("searchbox").fill("");
      await rows.nth(1).getByRole("link").click();
      await expect(page).toHaveURL(/\/t\/clients\/mem_\w+/);
      await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Arjun Kumar");
      expect(problems).toEqual([]);
    });

    test("Clients: a client who needs a plan offers to build one and to start the assessment", async ({ page }) => {
      await open(page, width, "u_trainer_meera", "/t/clients/mem_sneha");
      await expect(page.getByRole("heading", { name: "Sneha Patil", level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Build a plan" })).toHaveAttribute("href", "/t/library/programs?member=mem_sneha");
      await expect(page.getByRole("link", { name: "Assessment and goals" })).toHaveAttribute("href", "/t/clients/mem_sneha/assessment");
      await expect(page.getByText("No program yet.")).toBeVisible();
    });
  });
}

for (const width of WIDTHS) {
  test.describe(`trainer assessment at ${width} px`, () => {
    test("Assessment: from the client, record an assessment, add a goal with its own cadence, and see the history", async ({ page }) => {
      const problems = await open(page, width, "u_trainer_meera", "/t");
      await nav(page, "Clients").click();
      await page.getByRole("searchbox").fill("arjun");
      await page.getByRole("list", { name: "Your clients" }).getByRole("link").first().click();
      await page.getByRole("link", { name: "Assessment and goals" }).click();
      await expect(page.getByRole("heading", { name: "Assessment and goals", level: 1 })).toBeVisible();
      expect(await page.locator("[data-zones]").getAttribute("data-zones")).toBe(width >= 1280 ? "3" : "2");
      await noSideways(page, "Assessment");
      const history = page.getByRole("list", { name: "Assessments" }).getByRole("listitem");
      await expect(history).toHaveCount(2);
      if (width >= 1280) {
        // The history is its own zone beside the form.
        const hb = (await page.getByRole("region", { name: "Assessment history" }).boundingBox())!;
        const fb = (await page.getByRole("region", { name: /Record a new assessment/ }).boundingBox())!;
        expect(hb.x).toBeGreaterThanOrEqual(fb.x + fb.width - 1);
      }
      await page.getByLabel("Weight").fill("79.5");
      await page.getByRole("button", { name: "Record assessment" }).click();
      await expect(history).toHaveCount(3);

      // A goal opens in a side panel, never a bottom sheet, on these widths.
      await page.getByRole("button", { name: "Add a goal" }).click();
      const d = page.getByRole("dialog", { name: "Add a goal" });
      const b = (await d.boundingBox())!;
      expect(b.x + b.width).toBeGreaterThan(width - 2);
      await d.getByLabel("Goal", { exact: true }).fill("Deadlift 100 kg");
      await d.getByLabel("What it measures").selectOption("deadlift");
      await d.getByLabel("Target", { exact: true }).fill("100");
      await d.getByLabel("Review every").fill("21");
      await d.getByRole("button", { name: "Add goal" }).click();
      await expect(page.getByRole("list", { name: "Active goals" }).filter({ hasText: "Deadlift 100 kg" })).toContainText("Review every 21 days");

      // Back to the client, where the new goal shows too.
      await page.getByRole("link", { name: "Arjun", exact: true }).click();
      await expect(page.getByRole("region", { name: "Goals" })).toContainText("Deadlift 100 kg");
      expect(problems).toEqual([]);
    });

    test("Assessment: a client who withdrew consent shows the notice and no form", async ({ page }) => {
      await open(page, width, "u_trainer_farah", "/t");
      await page.goto("/t/clients/mem_rahul/assessment");
      await expect(page.getByRole("heading", { name: "Assessment and goals", level: 1 })).toBeVisible();
      await expect(page.getByText("Assessment consent withdrawn")).toBeVisible();
      await expect(page.getByRole("button", { name: "Record assessment" })).toHaveCount(0);
      await noSideways(page, "Consent withdrawn");
    });
  });
}

for (const width of WIDTHS) {
  test.describe(`trainer library at ${width} px`, () => {
    test("Exercises: filter, open an exercise beside the list, follow a substitute, add the gym’s own and archive it", async ({ page }) => {
      const problems = await open(page, width, "u_trainer_meera", "/t");
      await nav(page, "Exercises").click();
      await expect(page.getByRole("heading", { name: "Exercises", level: 1 })).toBeVisible();
      const list = page.getByRole("list", { name: "Exercise list" }).getByRole("listitem");
      await expect(list.first()).toBeVisible();
      expect(await page.locator("[data-zones]").getAttribute("data-zones")).toBe(width >= 1280 ? "3" : "2");
      await noSideways(page, "Exercises");

      // Filters: their own zone from 1280 px, a fold above the list below that.
      if (width >= 1280) {
        const fz = (await page.getByRole("complementary", { name: "Filters" }).boundingBox())!;
        const lz = (await page.getByRole("list", { name: "Exercise list" }).boundingBox())!;
        expect(lz.x).toBeGreaterThanOrEqual(fz.x + fz.width - 1);
      } else await page.getByText("Filters", { exact: false }).first().click();
      const filters = page.getByRole("group", { name: "Filters" });
      await filters.getByRole("radio", { name: /^Strength/ }).click();
      await filters.getByLabel("Muscle group").selectOption("chest");
      await filters.getByLabel("Equipment").selectOption("dumbbells");
      await expect(list).toHaveCount(2);
      await filters.getByRole("radio", { name: "All" }).click();
      await filters.getByLabel("Muscle group").selectOption("");
      await filters.getByLabel("Equipment").selectOption("");

      // An exercise opens beside the list, which stays where it was; a substitute opens in place.
      await page.getByRole("searchbox").fill("barbell bench");
      await list.first().getByRole("link").click();
      await expect(page.getByRole("heading", { name: "Barbell bench press", level: 2 })).toBeVisible();
      await expect(list.first().getByRole("link")).toHaveAttribute("aria-current", "page");
      await page.getByRole("link", { name: "Push-up" }).click();
      await expect(page.getByRole("heading", { name: "Push-up", level: 2 })).toBeVisible();
      await expect(page).toHaveURL(/ex=ex_pushup/);

      // Add one; the form is a side panel, and the new exercise opens in the detail zone.
      await page.getByRole("button", { name: "Add exercise" }).click();
      const d = page.getByRole("dialog", { name: "Add an exercise" });
      const b = (await d.boundingBox())!;
      expect(b.x + b.width).toBeGreaterThan(width - 2);
      await d.getByLabel("Name").fill("Battle ropes");
      await d.getByLabel("Category").selectOption("conditioning");
      await d.getByRole("textbox", { name: "Muscle groups" }).fill("shoulders");
      await d.getByRole("textbox", { name: "Muscle groups" }).press("Enter");
      await d.getByLabel("How to do it").fill("Alternate waves with both arms, staying low and braced.");
      await d.getByRole("button", { name: "Add exercise" }).click();
      await expect(page.getByRole("heading", { name: "Battle ropes", level: 2 })).toBeVisible();
      await page.getByRole("button", { name: "Archive" }).click();
      await page.getByRole("dialog", { name: "Archive exercise" }).getByRole("button", { name: "Archive exercise" }).click();
      await expect(page.getByText("Exercise archived")).toBeVisible();
      expect(problems).toEqual([]);
    });
  });
}

for (const width of WIDTHS) {
  test.describe(`trainer program builder at ${width} px`, () => {
    test("Program builder: build a client’s first program, drag to reorder, preview as the client, and publish", async ({ page }) => {
      const problems = await open(page, width, "u_trainer_meera", "/t");
      await nav(page, "Clients").click();
      await page.getByRole("searchbox").fill("sneha");
      await page.getByRole("list", { name: "Your clients" }).getByRole("link").first().click();
      await page.getByRole("link", { name: "Build a plan" }).click();
      await expect(page.getByRole("heading", { name: "Program for Sneha Patil", level: 1 })).toBeVisible();
      expect(await page.locator("[data-zones]").getAttribute("data-zones")).toBe(width >= 1280 ? "3" : "2");
      await noSideways(page, "Builder");

      // Weeks and days on the left, the open day beside them.
      const navZ = (await page.getByRole("navigation", { name: "Weeks and days" }).boundingBox())!;
      const dayZ = (await page.getByRole("region", { name: /^Week 1,/ }).boundingBox())!;
      expect(dayZ.x).toBeGreaterThanOrEqual(navZ.x + navZ.width - 1);

      const items = page.getByRole("list", { name: "Exercises in this workout" }).getByRole("listitem");
      const addFrom = async (name: string, section: "Warm-up" | "Main" | "Cool-down" = "Main") => {
        if (width >= 1280) {
          // The library is a zone of its own: one click, no dialog.
          const lib = page.getByRole("region", { name: "Add an exercise" });
          await lib.getByRole("radio", { name: section }).click();
          await lib.getByRole("searchbox", { name: "Search the library" }).fill(name);
          await lib.getByRole("button", { name: `Add ${name}` }).click();
          await expect(page.getByRole("dialog")).toHaveCount(0);
        } else {
          await page.getByRole("button", { name: "Add exercise" }).click();
          const d = page.getByRole("dialog", { name: "Add an exercise" });
          const b = (await d.boundingBox())!;
          expect(b.x + b.width).toBeGreaterThan(width - 2); // a side panel
          await d.getByRole("radio", { name: section }).click();
          await d.getByRole("searchbox", { name: "Search the library" }).fill(name);
          await d.getByRole("button", { name: `Add ${name}` }).click();
          await page.keyboard.press("Escape");
        }
      };
      await addFrom("Goblet squat");
      await addFrom("Dumbbell bench press");
      await addFrom("Plank");
      await expect(items).toHaveCount(3);

      // Drag the last exercise above the middle one with the mouse: the row follows the pointer, and the order changes when it is dropped.
      // The rows are scrolled well inside the window, so the page’s own edge scrolling never joins in.
      await items.nth(1).evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 260));
      const handle = items.nth(2).getByRole("button", { name: /^Drag to reorder/ });
      const target = (await items.nth(1).boundingBox())!;
      const hb = (await handle.boundingBox())!;
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - 20, { steps: 4 });
      await page.mouse.move(hb.x + hb.width / 2, target.y + target.height / 2 - 10, { steps: 12 });
      await expect(items.nth(2)).toHaveAttribute("data-dragging", "true");
      await page.mouse.up();
      await expect(items.nth(1)).toContainText("Plank");
      await expect(items.nth(2)).toContainText("Dumbbell bench press");

      // The buttons do it too, for anyone who can’t drag.
      await page.waitForTimeout(400); // the dropped row finishes settling
      await items.nth(1).getByRole("button", { name: /^Move .* up$/ }).click();
      await expect(items.first()).toContainText("Plank");

      await page.getByLabel("Program name").fill("Getting started");
      await page.getByLabel("Workout name").fill("Full body");

      // Preview as the client, in a side panel.
      await page.getByRole("button", { name: "Preview as member" }).click();
      const p = page.getByRole("dialog", { name: "Preview as member" });
      const pb = (await p.boundingBox())!;
      expect(pb.x + pb.width).toBeGreaterThan(width - 2);
      await expect(p.getByRole("article", { name: "Workout preview" })).toContainText("Plank");
      await p.getByRole("button", { name: "Back to the builder" }).click();

      // The template picker, in a side panel too; “Keep mine” leaves the work alone.
      await page.getByRole("button", { name: "Use a template" }).click();
      const t = page.getByRole("dialog", { name: "Choose a template" });
      await t.getByRole("button", { name: "Use Push, pull, legs" }).click();
      await t.getByRole("button", { name: "Keep mine" }).click();
      await expect(t.getByRole("list", { name: "Templates" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(t).toHaveCount(0);
      await expect(items).toHaveCount(3);

      // Publish: a centred confirmation, then the new version.
      await page.getByRole("button", { name: "Publish version 1" }).click();
      const c = page.getByRole("dialog", { name: "Publish program" });
      const cb = (await c.boundingBox())!;
      expect(Math.abs(cb.x + cb.width / 2 - width / 2)).toBeLessThan(2);
      await c.getByRole("button", { name: "Publish version 1" }).click();
      const done = page.getByRole("dialog", { name: "Version published" });
      await expect(done.getByRole("heading", { name: "Version 1 is published" })).toBeVisible();
      await done.getByRole("link", { name: "Back to Sneha" }).click();
      await expect(page.getByRole("list", { name: "Program versions" })).toContainText("Version 1: Getting started (current)");
      expect(problems).toEqual([]);
    });

    test("Program builder: revise a client’s program, save a draft, and publish the next version", async ({ page }) => {
      await open(page, width, "u_trainer_meera", "/t/clients/mem_arjun");
      await page.getByRole("link", { name: "Revise plan" }).click();
      await expect(page.getByRole("heading", { name: "Program for Arjun Kumar", level: 1 })).toBeVisible();
      await expect(page.getByText("Version 2 is current. You are building version 3.")).toBeVisible();
      const items = page.getByRole("list", { name: "Exercises in this workout" }).getByRole("listitem");
      await items.first().getByLabel("Sets").fill("5");
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page.getByText("Draft saved")).toBeVisible();
      await page.getByRole("button", { name: "Publish version 3" }).click();
      await page.getByRole("dialog", { name: "Publish program" }).getByRole("button", { name: "Publish version 3" }).click();
      await expect(page.getByRole("dialog", { name: "Version published" })).toContainText("Version 2, “Strength and size block”, stays as it was");
      await page.getByRole("dialog", { name: "Version published" }).getByRole("link", { name: "Back to Arjun" }).click();
      await expect(page.getByRole("list", { name: "Program versions" }).getByRole("listitem")).toHaveCount(3);
    });
  });

  test.describe(`trainer coach-led logging at ${width} px`, () => {
    test("Log a session: pick a day beside the client’s list, log it as the coach, and correct it with a reason", async ({ page }) => {
      const problems = await open(page, width, "u_trainer_meera", "/t");
      await coachLogJourney(page);
      expect(problems).toEqual([]);
    });
  });

  test.describe(`trainer templates at ${width} px`, () => {
    test("Templates: reach them from the library, open one beside the list, share it, and create another", async ({ page }) => {
      const problems = await open(page, width, "u_trainer_meera", "/t");
      await nav(page, "Exercises").click();
      await page.getByRole("navigation", { name: "Section" }).getByRole("link", { name: "Templates" }).click();
      await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();
      expect(await page.locator("[data-zones]").getAttribute("data-zones")).toBe(width >= 1280 ? "3" : "2");
      const list = page.getByRole("list", { name: "Template list" }).getByRole("listitem");
      await expect(list).toHaveCount(3);
      await list.filter({ hasText: "Upper and core" }).getByRole("link").click();
      await expect(page.getByRole("heading", { name: "Upper and core, twice a week", level: 2 })).toBeVisible();
      await expect(list.filter({ hasText: "Upper and core" }).getByRole("link")).toHaveAttribute("aria-current", "page");
      if (width >= 1280) {
        const a = (await page.getByRole("complementary", { name: "Template actions" }).boundingBox())!;
        const d = (await page.getByRole("article", { name: "Upper and core, twice a week" }).boundingBox())!;
        expect(a.x).toBeGreaterThanOrEqual(d.x + d.width - 1);
      }
      await page.getByRole("switch", { name: "Share with the gym" }).click();
      await expect(list.filter({ hasText: "Upper and core" })).toContainText("Shared");
      await noSideways(page, "Templates");

      await page.getByRole("link", { name: "New template" }).click();
      await page.getByLabel("Template name").fill("Quick strength");
      const lib = width >= 1280 ? page.getByRole("region", { name: "Add an exercise" }) : null;
      if (lib) {
        await lib.getByRole("searchbox", { name: "Search the library" }).fill("Goblet squat");
        await lib.getByRole("button", { name: "Add Goblet squat" }).click();
      } else {
        await page.getByRole("button", { name: "Add exercise" }).click();
        const d = page.getByRole("dialog", { name: "Add an exercise" });
        await d.getByRole("searchbox", { name: "Search the library" }).fill("Goblet squat");
        await d.getByRole("button", { name: "Add Goblet squat" }).click();
        await page.keyboard.press("Escape");
      }
      await page.getByRole("button", { name: "Save template" }).click();
      await expect(page.getByText("Template saved")).toBeVisible();
      await page.getByRole("link", { name: "Templates" }).first().click();
      await expect(page.getByRole("list", { name: "Template list" }).getByRole("listitem")).toHaveCount(4);
      expect(problems).toEqual([]);
    });
  });
}
