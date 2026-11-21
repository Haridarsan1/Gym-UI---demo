import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { changeStore, hasHorizontalScroll, logRemainingSets, readStore } from "./helpers";

/** Trainer journeys shared by the phone spec and the wide-screen spec, so each one is driven the same way at every width. */

const noSideways = async (page: Page, where: string) => expect(await hasHorizontalScroll(page), `${where}: sideways scroll`).toBe(false);

/**
 * T05: Coach Meera logs a session her client missed, then corrects it. Arnav Banerjee has four scheduled days and no logs.
 * Entries say who entered them, the log is made once, and the correction keeps the original and writes an audit event.
 */
export async function coachLogJourney(page: Page) {
  await page.goto("/t/clients/mem_126");
  await page.getByRole("link", { name: "Log a session" }).click();
  await expect(page.getByRole("heading", { name: "Log a session", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Arnav Banerjee: which day?", level: 2 })).toBeVisible();
  await noSideways(page, "Days");
  await page.getByRole("link", { name: /Mon 16 Nov.*Not logged/ }).click();
  await expect(page.getByRole("heading", { name: /for Arnav$/, level: 2 })).toBeVisible();
  await expect(page.getByText("This session will say “Entered by Coach Meera”.")).toBeVisible();
  await noSideways(page, "Session");

  // The same set rows as the member’s: every set is pre-filled, so a set done as prescribed is one tap.
  const finish = page.getByRole("button", { name: "Finish session", exact: true });
  for (let i = 0; i < 12; i++) {
    await logRemainingSets(page);
    if (await finish.count()) break;
    await page.getByRole("button", { name: "Next exercise" }).click();
  }
  await finish.click();
  const sheet = page.getByRole("dialog", { name: "Finish session" });
  await expect(sheet).toContainText("Every prescribed set is done.");
  await expect(sheet).toContainText("It will say “Entered by Coach Meera”.");
  await sheet.getByLabel("Note about the session").fill("Coached in person after the missed week.");
  await sheet.getByRole("button", { name: "Finish session" }).click();

  const done = page.getByRole("article", { name: "Finished log" });
  await expect(done).toContainText("Completed");
  await expect(done).toContainText("Entered by Coach Meera");
  await expect(done).toContainText("Coached in person after the missed week.");
  const logs = (await readStore(page, "workoutLogs")).filter((l) => l.memberId === "mem_126" && l.scheduledOn === "2026-11-16");
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ status: "completed", enteredBy: "u_trainer_meera", enteredByRole: "trainer" });
  const original = JSON.stringify(logs[0]!.entries);

  // A finished log is corrected, not overwritten: a reason is required, and the original is kept.
  await done.getByRole("button", { name: "Correct this log" }).click();
  await expect(page.getByText("Correcting a finished log. The original is kept.")).toBeVisible();
  for (let i = 0; i < 12; i++) {
    const change = page.getByRole("button", { name: "Change set 1" });
    if (await change.count()) {
      await change.click();
      const reps = page.getByRole("form", { name: "Set 1" }).getByRole("textbox", { name: "Reps" });
      if (await reps.count()) {
        await reps.fill("12");
        await page.getByRole("button", { name: "Save set" }).click();
        break;
      }
      await page.getByRole("button", { name: "Cancel" }).click();
    }
    await page.getByRole("button", { name: "Next exercise" }).click();
  }
  await page.getByRole("button", { name: /^Save correction( now)?$/ }).last().click();
  const c = page.getByRole("dialog", { name: "Save correction" });
  await c.getByRole("button", { name: "Save correction" }).click();
  await expect(c.getByRole("alert")).toContainText("Say why you are correcting this log.");
  await c.getByLabel("Why are you correcting it?").fill("Arnav did 12 reps on the first lift, not the prescribed number.");
  await c.getByRole("button", { name: "Save correction" }).click();

  const after = page.getByRole("article", { name: "Finished log" });
  await expect(after).toContainText("corrected once");
  await expect(after.getByRole("heading", { name: "Corrections" })).toBeVisible();
  await expect(after).toContainText("Arnav did 12 reps on the first lift");
  await after.getByText("What the original said").click();
  await expect(after).toContainText("entered by Coach Meera");
  const corrected = (await readStore(page, "workoutLogs")).filter((l) => l.memberId === "mem_126" && l.scheduledOn === "2026-11-16");
  expect(corrected).toHaveLength(1);
  const corrections = corrected[0]!.corrections as Array<{ previous: { entries: unknown } }>;
  expect(corrections).toHaveLength(1);
  expect(JSON.stringify(corrections[0]!.previous.entries)).toBe(original);
  const audit = (await readStore(page, "auditEvents")).filter((e) => e.action === "workout.correct");
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({ actorId: "u_trainer_meera", entityId: corrected[0]!.id, memberId: "mem_126" });
  await noSideways(page, "Corrected log");

  // The client’s page says who entered the workout.
  await page.goto("/t/clients/mem_126");
  await page.getByRole("tab", { name: "Workouts" }).click();
  await expect(page.getByRole("list", { name: "Recent workouts" }).getByRole("listitem").first()).toContainText("Entered by Coach Meera, corrected later");
}

/**
 * T06, P04: Coach Meera reviews Harsh Chopra, whose review is a day overdue and whose goal shows “Target reached”. She shares feedback
 * with a follow-up date, keeps a private note, and confirms the goal, which awards the badge once.
 */
export async function reviewJourney(page: Page) {
  await page.goto("/t/clients/mem_144");
  await page.getByRole("link", { name: "Review is due" }).click();
  await expect(page.getByRole("heading", { name: "Review", level: 1 })).toBeVisible();
  await expect(page.getByText(/^Review due since 16 Nov 2026, 1 day ago/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sticking to the plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trends, last 12 weeks" })).toBeVisible();
  await noSideways(page, "Review");

  // Shared feedback with a follow-up date: it becomes the next review date.
  await expect(page.getByRole("radio", { name: /Shared with Harsh/ })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Feedback for Harsh").fill("Three sessions a week for a month. Well done. Next, we add load to the squat.");
  await page.getByRole("button", { name: "In 2 weeks" }).click();
  await expect(page.getByLabel("Follow-up date")).toHaveValue("2026-12-01");
  await page.getByRole("button", { name: "Share review" }).click();
  await expect(page.getByText("Review shared with Harsh")).toBeVisible();
  await expect(page.getByText(/^Next review 1 Dec 2026, the follow-up date you set/)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).first().click().catch(() => undefined);

  // A private note: kept apart, and says so. A follow-up date doesn’t apply to it.
  await page.getByRole("radio", { name: /Private note/ }).click();
  await expect(page.getByLabel("Follow-up date")).toHaveCount(0);
  await page.getByLabel("Your note").fill("Ask about his knee before adding load.");
  await page.getByRole("button", { name: "Save private note" }).click();
  await expect(page.getByText("Private note saved")).toBeVisible();
  const history = page.getByRole("list", { name: "Reviews and notes" });
  await expect(history).toContainText("Shared with the client");
  await expect(history).toContainText("follow-up 1 Dec 2026");
  await expect(history).toContainText("Private note, only you can read it");
  await expect(history).toContainText("Ask about his knee");

  // Confirm achieved: only for a goal showing “Target reached”, and the badge is awarded once.
  const goal = page.getByRole("list", { name: "Goals" }).getByRole("listitem").filter({ hasText: "Train three times a week" });
  await expect(goal).toContainText("Target reached");
  await goal.getByRole("button", { name: "Confirm achieved" }).click();
  const sheet = page.getByRole("dialog", { name: "Confirm goal achieved" });
  await expect(sheet).toContainText("Only you can confirm it.");
  await sheet.getByRole("button", { name: "Confirm achieved" }).click();
  await expect(goal).toContainText("Achieved");
  await expect(goal.getByRole("button", { name: "Confirm achieved" })).toHaveCount(0);

  const reviews = (await readStore(page, "trainerReviews")).filter((r) => r.memberId === "mem_144");
  expect(reviews.filter((r) => r.kind === "shared_review" && r.followUpOn === "2026-12-01")).toHaveLength(1);
  expect(reviews.filter((r) => r.kind === "private_note" && r.authorId === "u_trainer_meera")).toHaveLength(1);
  const badges = (await readStore(page, "badgeAwards")).filter((b) => b.memberId === "mem_144" && b.badge === "goal_achieved");
  expect(badges).toHaveLength(1);
  const audit = (await readStore(page, "auditEvents")).filter((e) => e.action === "goal.confirm" || e.action === "review.shared");
  expect(audit.map((e) => e.action).sort()).toEqual(["goal.confirm", "review.shared"]);
  await noSideways(page, "Reviewed");
}

const mainNav = (page: Page, name: string) => page.locator('nav[aria-label="Main"]:visible').getByRole("link", { name, exact: true });
/** A schedule section: a tab on a phone, a button in the section menu from 768 px. */
const scheduleTab = (page: Page, name: string | RegExp) => page.getByRole("tab", { name }).or(page.getByRole("navigation", { name: "Schedule sections" }).getByRole("button", { name }));

/**
 * O01, O02, T04, M06: Coach Meera’s day. Her sessions are listed; at 7:30 pm three have started, so she marks one attended and one a
 * no-show (the credit rule is said first and applied); she adds leave that clashes with Arjun’s booked session, moves it, edits her
 * weekly availability, and adds a one-off shift. Everything is checked in the database.
 */
export async function scheduleJourney(page: Page, width: number) {
  await mainNav(page, "Schedule").click();
  await expect(page.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
  const today = page.getByRole("list", { name: "Today’s sessions" });
  await expect(today.getByRole("listitem")).toHaveCount(4);
  await expect(today.getByRole("listitem").first()).toContainText("Attended");
  await expect(page.getByRole("list", { name: "Sessions to mark" })).toHaveCount(0);
  await noSideways(page, "Schedule at noon");

  // Seven thirty in the evening: the 5, 6 and 7 pm sessions have started and are waiting to be marked.
  await page.clock.setSystemTime(new Date("2026-11-17T14:00:00.000Z"));
  await mainNav(page, "Today").click();
  await mainNav(page, "Schedule").click();
  const toMark = page.getByRole("list", { name: "Sessions to mark" });
  await expect(toMark.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("Attended: uses 1 session credit. No-show: uses 1 session credit.")).toBeVisible();
  await noSideways(page, "To mark");

  // Attended is open from the start; a no-show only 15 minutes later (all three began over 30 minutes ago here).
  await expect(toMark.getByRole("button", { name: /a no-show$/ }).first()).toBeEnabled();
  await toMark.getByRole("button", { name: /^Mark .+ attended$/ }).first().click();
  const attended = page.getByRole("dialog", { name: "Mark attended" });
  await expect(attended).toContainText("Uses 1 session credit.");
  await attended.getByRole("button", { name: "Mark attended" }).click();
  await expect(page.getByText(/marked attended/)).toBeVisible();
  await expect(toMark.getByRole("listitem")).toHaveCount(2);
  await toMark.getByRole("button", { name: /^Mark .+ a no-show$/ }).first().click();
  const noShow = page.getByRole("dialog", { name: "Mark no-show" });
  await expect(noShow).toContainText("Uses 1 session credit.");
  await noShow.getByRole("button", { name: "Mark no-show" }).click();
  await expect(toMark.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Today’s sessions" })).toContainText("No-show");
  await expect(page.getByRole("list", { name: "Today’s sessions" })).toContainText("Session credit used");
  const bookings = (await readStore(page, "bookings")).filter((b) => b.trainerId === "u_trainer_meera" && String(b.startsAt).startsWith("2026-11-17"));
  expect(bookings.map((b) => b.status).sort()).toEqual(["attended", "attended", "booked", "no_show"]);
  const ledger = await readStore(page, "creditLedger");
  const marked = bookings.filter((b) => b.status === "attended" || b.status === "no_show").map((b) => b.id);
  expect(ledger.filter((e) => marked.includes(e.bookingId as string) && e.kind === "consumption" && String(e.idempotencyKey).startsWith("mark:"))).toHaveLength(2);

  // Leave that clashes with Arjun’s booked session on Thursday 19 Nov: shown to the trainer, and moved.
  await scheduleTab(page, /^Shifts and leave/).click();
  await expect(page.getByRole("list", { name: "Upcoming leave" })).toContainText("Year-end break");
  await page.getByRole("form", { name: "Add leave" }).getByLabel("First day").fill("2026-11-19");
  await page.getByRole("form", { name: "Add leave" }).getByLabel("Reason (optional)").fill("Conference");
  await page.getByRole("button", { name: "Add leave" }).click();
  await expect(page.getByText(/1 booked session is on those days/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Upcoming leave" })).toContainText("1 booked session clashes");
  await noSideways(page, "Leave");
  await scheduleTab(page, /^Sessions/).click();
  await expect(page.getByRole("heading", { name: "1 booked session is on your leave" })).toBeVisible();
  if (width >= 1280) await expect(page.getByRole("complementary", { name: "Needs you now" })).toContainText("1 on your leave to move");
  const clash = page.getByRole("list", { name: "Sessions on leave" }).getByRole("listitem");
  await expect(clash).toContainText("Arjun Kumar");
  await expect(clash).toContainText("On your leave");
  // The date is said once, not repeated under the name.
  await expect(clash).not.toContainText("Thu 19 Nov");
  const arjunBefore = (await readStore(page, "bookings")).find((b) => b.memberId === "mem_arjun" && String(b.startsAt).startsWith("2026-11-19"))!;
  const ledgerBefore = (await readStore(page, "creditLedger")).filter((e) => e.memberId === "mem_arjun").length;
  await clash.getByRole("button", { name: "Move Arjun’s session" }).click();
  const move = page.getByRole("dialog", { name: "Move Arjun’s session" });
  await expect(move).toContainText("keeps the session credit");
  await expect(move.getByRole("heading", { name: "With another trainer at Andheri" })).toBeVisible();
  await move.getByRole("list", { name: /^Your times on/ }).first().getByRole("button").first().click();
  await expect(page.getByText("Arjun’s session is moved")).toBeVisible();
  await expect(page.getByRole("heading", { name: /on your leave$/ })).toHaveCount(0);
  const arjunAfter = (await readStore(page, "bookings")).find((b) => b.id === arjunBefore.id)!;
  expect(arjunAfter.startsAt).not.toBe(arjunBefore.startsAt);
  expect(arjunAfter).toMatchObject({ status: "booked", trainerId: "u_trainer_meera" });
  expect((await readStore(page, "creditLedger")).filter((e) => e.memberId === "mem_arjun")).toHaveLength(ledgerBefore);
  expect((await readStore(page, "emailLog")).filter((e) => e.memberId === "mem_arjun" && e.template === "booking_rescheduled")).toHaveLength(1);

  // Weekly availability: a bad window says what is wrong; a good one saves.
  await scheduleTab(page, /^Availability/).click();
  await expect(page.getByRole("heading", { name: "Weekly availability" })).toBeVisible();
  await noSideways(page, "Availability");
  await page.getByLabel("Monday window 1 end").fill("05:00");
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect(page.getByRole("alert")).toContainText("The end must be after the start.");
  await page.getByLabel("Monday window 1 end").fill("11:00");
  await page.getByLabel("Monday window 1 start").fill("07:00");
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect(page.getByText("Availability saved")).toBeVisible();
  const monday = (await readStore(page, "trainerAvailability")).filter((a) => a.trainerId === "u_trainer_meera" && a.weekday === 1).map((a) => a.start).sort();
  expect(monday).toEqual(["07:00", "17:00"]);

  // A one-off shift is listed, and removing it takes it off.
  await scheduleTab(page, /^Shifts and leave/).click();
  await expect(page.getByRole("list", { name: "Upcoming shifts" })).toContainText("Sunday cover");
  const shift = page.getByRole("form", { name: "Add a shift" });
  await shift.getByLabel("Date").fill("2026-11-24");
  await shift.getByLabel("From").fill("12:00");
  await shift.getByLabel("To").fill("14:00");
  await shift.getByLabel("Note (optional)").fill("Extra hours");
  await page.getByRole("button", { name: "Add shift" }).click();
  await expect(page.getByRole("list", { name: "Upcoming shifts" })).toContainText("Extra hours");
  expect((await readStore(page, "trainerShifts")).filter((x) => x.trainerId === "u_trainer_meera")).toHaveLength(2);
  await page.getByRole("button", { name: /^Remove the shift on Tue 24 Nov/ }).click();
  await expect(page.getByRole("list", { name: "Upcoming shifts" })).not.toContainText("Extra hours");
  await noSideways(page, "Shifts");
}

/**
 * M05: the front desk at Andheri. Search and check a member in (allowed), a repeat scan, a member who owes money, one on the grace
 * period, one turned away and let in by override with a reason. The result is read from `data-result` and the words on screen.
 */
export async function checkInJourney(page: Page) {
  await expect(page.getByRole("heading", { name: "Check-in", level: 1 })).toBeVisible();
  await expect(page.getByText("Ready for the next member")).toBeVisible();
  await noSideways(page, "Check-in");
  const result = page.getByRole("region", { name: "Check-in result" });
  const search = page.getByRole("combobox", { name: /Search members/ });
  const find = async (text: string) => {
    await search.fill(text);
    await expect(page.getByRole("listbox", { name: "Matching members" })).toBeVisible();
  };

  // Keyboard first: “/” goes to the search, Enter checks in the highlighted member.
  await page.getByRole("heading", { name: "Check-in", level: 1 }).click();
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await find("arjun");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(result).toHaveAttribute("data-result", "allowed");
  await expect(result).toContainText("Checked in");
  await expect(result).toContainText("Arjun Kumar");
  await expect(page.getByRole("list", { name: "Today’s check-ins" })).toContainText("Arjun Kumar");
  await noSideways(page, "Result: allowed");

  // The same member again straight away: a repeat, no extra visit.
  await search.fill("arjun");
  await page.getByRole("option", { name: /Arjun Kumar/ }).getByRole("button").click();
  await expect(result).toHaveAttribute("data-result", "repeat_scan");
  await expect(result).toContainText(/Already checked in at \d+:\d{2} (am|pm)/);
  await expect(result).toContainText("No extra visit was used");

  // A payment is due: let in, with the amount.
  await search.fill("priya");
  await page.getByRole("option", { name: /Priya Sharma/ }).getByRole("button").click();
  await expect(result).toHaveAttribute("data-result", "allowed_with_dues");
  await expect(result).toContainText("Checked in, a payment is due");
  await expect(result).toContainText("Owes");

  // The membership has ended but is in its grace period.
  await changeStore(page, "memberships", `(v) => v.memberId === "mem_sneha" && v.status === "active" ? { ...v, endsOn: "2026-11-15", graceUntil: "2026-11-20" } : false`);
  await search.fill("sneha");
  await page.getByRole("option", { name: /Sneha Patil/ }).getByRole("button").click();
  await expect(result).toHaveAttribute("data-result", "allowed");
  await expect(result).toContainText("Checked in, membership ended");
  await expect(result).toContainText("grace period");

  // Turned away, then let in by override with a reason.
  await changeStore(page, "memberships", `(v) => v.memberId === "mem_sneha" && v.status === "active" ? { ...v, endsOn: "2026-10-01", graceUntil: undefined, status: "expired" } : false`);
  await page.getByRole("button", { name: "Next member" }).click();
  await search.fill("sneha");
  await page.getByRole("option", { name: /Sneha Patil/ }).getByRole("button").click();
  await expect(result).toHaveAttribute("data-result", "denied");
  await expect(result).toContainText("Not checked in");
  await expect(result).toContainText("membership ended on 1 Oct 2026");
  await page.getByRole("button", { name: "Let in anyway…" }).click();
  const sheet = page.getByRole("dialog", { name: "Let in anyway" });
  await sheet.getByRole("button", { name: "Let in" }).click();
  await expect(sheet.getByRole("alert")).toContainText("Say why you are letting them in.");
  await sheet.getByLabel("Reason").fill("Paid by cheque this morning, manager confirmed");
  await sheet.getByRole("button", { name: "Let in" }).click();
  await expect(result).toHaveAttribute("data-result", "override");
  await expect(result).toContainText("Checked in by override");
  await expect(result).toContainText("Paid by cheque this morning");
  const rows = page.getByRole("list", { name: "Today’s check-ins" });
  await expect(rows).toContainText("Turned away");
  await expect(rows).toContainText("Override");
  const audit = (await readStore(page, "auditEvents")).filter((e) => e.action === "checkin.override");
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({ actorId: "u_desk_andheri", memberId: "mem_sneha", reason: "Paid by cheque this morning, manager confirmed" });
  await noSideways(page, "Result: override");

  // Next member clears the screen.
  await page.getByRole("button", { name: "Next member" }).click();
  await expect(page.getByText("Ready for the next member")).toBeVisible();
  await expect(search).toBeFocused();
}

/**
 * T01, M01, M03: the front desk registers Kabir Anand. A phone number that belongs to a member stops it; the same name is a warning
 * that has to be answered; then consent, the Monthly Plus plan, Coach Meera from today, a discount, a UPI payment, and the pass.
 */
export async function newMemberJourney(page: Page) {
  await page.goto("/desk/new");
  await expect(page.getByRole("heading", { name: "New member", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step 1 of 5: Details" })).toBeVisible();
  await noSideways(page, "Wizard step 1");
  const next = page.getByRole("button", { name: "Next", exact: true });

  // A phone number that already belongs to a member is flagged, with two choices: families share numbers, so it does not stop registration.
  await page.getByLabel("Full name").fill("Kabir Anand");
  await page.getByLabel("Mobile number").fill("98200 22002");
  const shared = page.getByRole("alert", { name: "This phone number or email is already used" });
  await expect(shared).toContainText("Arjun Kumar");
  await expect(shared.getByRole("link", { name: "Same person: open their profile" })).toHaveAttribute("href", "/desk/members/mem_arjun");
  await next.click();
  await expect(page.getByRole("heading", { name: "Step 1 of 5: Details" })).toBeVisible();
  await expect(page.getByText("Choose: the same person (open their profile), or a different person sharing this number.")).toBeVisible();
  await noSideways(page, "Shared number: asked");
  await shared.getByRole("radio", { name: "Different person sharing this number" }).click();
  await expect(shared).toContainText("Noted. This is recorded on the new member");
  await noSideways(page, "Shared number: answered");

  // The same name as someone else is a warning: it has to be answered.
  await page.getByLabel("Mobile number").fill("98765 43210");
  await page.getByLabel("Full name").fill("Rahul Mehta");
  const warn = page.getByRole("alert").filter({ hasText: "A member with this name already exists" });
  await expect(warn).toContainText("Bandra");
  await next.click();
  await expect(page.getByRole("heading", { name: "Step 1 of 5: Details" })).toBeVisible();
  await expect(page.getByText("Check it is a different person, then continue.")).toBeVisible();
  await noSideways(page, "Duplicate: warning");
  // A different name clears it.
  await page.getByLabel("Full name").fill("Kabir Anand");
  await expect(page.getByRole("alert").filter({ hasText: /already/ })).toHaveCount(0);
  await page.getByLabel("Email").fill("kabir.anand@example.in");
  await page.getByLabel("Date of birth").fill("1994-05-12");
  await page.getByLabel("How did they hear about the gym?").selectOption("Walk-in");
  await next.click();

  await expect(page.getByRole("heading", { name: "Step 2 of 5: Consent" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Using their details" })).toBeDisabled();
  await page.getByRole("switch", { name: "Progress photos" }).click();
  await page.getByRole("switch", { name: "Assessments" }).click();
  await noSideways(page, "Wizard step 2");
  await next.click();

  await expect(page.getByRole("heading", { name: "Step 3 of 5: Plan" })).toBeVisible();
  await next.click();
  await expect(page.getByText("Choose a plan.")).toBeVisible();
  await page.getByRole("radio", { name: /Monthly Plus/ }).click();
  await expect(page.getByText("Today’s price and terms are copied into the membership.")).toBeVisible();
  await noSideways(page, "Wizard step 3");
  await next.click();

  await expect(page.getByRole("heading", { name: "Step 4 of 5: Trainer" })).toBeVisible();
  await page.getByRole("radio", { name: "Meera Joshi" }).click();
  await noSideways(page, "Wizard step 4");
  await next.click();

  await expect(page.getByRole("heading", { name: "Step 5 of 5: Payment" })).toBeVisible();
  const invoice = page.getByRole("region", { name: "Invoice" });
  await expect(invoice).toContainText("₹4,130");
  await page.getByLabel("Discount (₹)").fill("1000");
  await page.getByRole("button", { name: "Register member" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "You can give up to ₹175" })).toBeVisible();
  await page.getByLabel("Discount (₹)").fill("100");
  await expect(invoice).toContainText("₹4,012");
  await page.getByRole("radio", { name: "UPI" }).click();
  await page.getByLabel("UPI reference").fill("kabir@okbank");
  await noSideways(page, "Wizard step 5");
  // A double press makes one member.
  await page.getByRole("button", { name: "Register member" }).dblclick();

  await expect(page.getByRole("heading", { name: "Kabir Anand is a member" })).toBeVisible();
  await expect(page.getByText(/active until 17 Dec 2026/)).toBeVisible();
  await expect(page.getByText(/Invoice\s+PFAND\/26-27\/\d{4}/)).toBeVisible();
  await expect(page.getByText(/Receipt RCP-2026-\d{4}/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Pass for Kabir Anand" })).toBeVisible();
  await expect(page.getByText(/were emailed to kabir.anand@example.in/)).toBeVisible();
  await noSideways(page, "Wizard done");

  const members = (await readStore(page, "members")).filter((m) => m.phone === "9876543210");
  expect(members).toHaveLength(1);
  const id = members[0]!.id as string;
  expect(members[0]).toMatchObject({ name: "Kabir Anand", email: "kabir.anand@example.in", homeBranchId: "br_andheri", leadSource: "Walk-in", dateOfBirth: "1994-05-12" });
  const ms = (await readStore(page, "memberships")).filter((m) => m.memberId === id);
  expect(ms).toHaveLength(1);
  expect(ms[0]).toMatchObject({ status: "active", startsOn: "2026-11-17", terms: { name: "Monthly Plus", pricePaise: 350000 } });
  const pay = (await readStore(page, "payments")).filter((p) => p.memberId === id);
  expect(pay).toHaveLength(1);
  expect(pay[0]).toMatchObject({ method: "upi", amountPaise: 401200, reference: "kabir@okbank", receivedBy: "u_desk_andheri" });
  expect((await readStore(page, "consents")).filter((c) => c.memberId === id).map((c) => c.scope).sort()).toEqual(["assessments", "data_processing", "photos"]);
  expect((await readStore(page, "trainerAssignments")).find((a) => a.memberId === id)).toMatchObject({ trainerId: "u_trainer_meera", effectiveFrom: "2026-11-17" });
  expect((await readStore(page, "invoices")).filter((i) => i.memberId === id)).toHaveLength(1);

  // The pass works at the door at once.
  await page.getByRole("link", { name: "Back to check-in" }).click();
  await page.getByRole("combobox", { name: /Search members/ }).fill("kabir");
  await page.getByRole("option", { name: /Kabir Anand/ }).getByRole("button").click();
  await expect(page.getByRole("region", { name: "Check-in result" })).toHaveAttribute("data-result", "allowed");
}

/**
 * M02, M03, A02: the front desk works on Arjun Kumar’s membership. Freeze and unfreeze; upgrade to Quarterly with a GST credit note, paid by UPI;
 * cancel with the amount he may be eligible for, and “Request refund”; change his trainer.
 */
export async function memberLifecycleJourney(page: Page) {
  await page.goto("/desk/members");
  await expect(page.getByRole("heading", { name: "Members", level: 1 })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search members" }).fill("arjun");
  await expect(page.getByText("1 member")).toBeVisible();
  await noSideways(page, "Members");
  await page.locator("text=Arjun Kumar >> visible=true").first().click();
  await expect(page.getByRole("heading", { name: "Arjun Kumar", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Membership" })).toContainText("Monthly Plus");
  await noSideways(page, "Profile");
  const dialog = (name: string) => page.getByRole("dialog", { name });

  // Freeze, then unfreeze early.
  await page.getByRole("button", { name: "Freeze", exact: true }).click();
  const fz = dialog("Freeze membership");
  await fz.getByRole("button", { name: "Freeze membership" }).click();
  await expect(fz.getByRole("alert")).toContainText("Say why it is being frozen.");
  await fz.getByLabel("Reason").fill("Travel for work");
  await expect(fz).toContainText("7 days frozen");
  await fz.getByRole("button", { name: "Freeze membership" }).click();
  await expect(page.getByText("Arjun’s membership is frozen")).toBeVisible();
  await expect(page.getByText(/Frozen 17 Nov 2026 to 23 Nov 2026: Travel for work/)).toBeVisible();
  expect((await readStore(page, "memberships")).find((m) => m.id === "ms_mem_arjun")).toMatchObject({ status: "frozen" });
  await page.getByRole("button", { name: "Unfreeze", exact: true }).click();
  await dialog("Unfreeze membership").getByRole("button", { name: "Unfreeze now" }).click();
  await expect(page.getByText("Arjun can come in again")).toBeVisible();
  expect((await readStore(page, "memberships")).find((m) => m.id === "ms_mem_arjun")).toMatchObject({ status: "active" });
  await noSideways(page, "Unfrozen");

  // Upgrade with a credit note, then collect the difference by UPI.
  await page.getByRole("button", { name: "Renew or change plan" }).click();
  const chg = dialog("Change plan");
  await expect(chg.getByRole("radio", { name: /Monthly ₹/ })).toContainText("Starts");
  await chg.getByRole("radio", { name: /Quarterly/ }).click();
  await expect(chg.getByRole("radio", { name: /Quarterly/ })).toContainText("Upgrade now: pay ₹");
  await expect(chg.getByRole("radio", { name: /Quarterly/ })).toContainText(/Credit note for \d+ of 30 unused days/);
  await noSideways(page, "Change plan");
  await chg.getByRole("button", { name: "Confirm" }).click();
  const made = dialog("Plan change made");
  await expect(made).toContainText(/GST credit note CNAND\/26-27\/0001 for ₹/);
  await expect(made).toContainText(/Invoice PFAND\/26-27\/\d{4}: ₹7,670/);
  await made.getByRole("button", { name: "Collect payment" }).click();
  const pay = dialog("Collect payment");
  await pay.getByRole("radio", { name: "UPI" }).click();
  await pay.getByLabel("UPI reference").fill("arjun@okbank");
  await pay.getByRole("button", { name: "Record payment" }).click();
  const done = dialog("Payment recorded");
  await expect(done).toContainText(/Receipt RCP-2026-\d{4}/);
  await expect(done).toContainText("Paid in full");
  await expect(done).toContainText("Upgrade started: Quarterly, active 17 Nov 2026");
  await done.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("region", { name: "Membership" })).toContainText("Quarterly");
  const cns = await readStore(page, "creditNotes");
  expect(cns).toHaveLength(1);
  expect(cns[0]).toMatchObject({ memberId: "mem_arjun", number: "CNAND/26-27/0001" });
  expect((await readStore(page, "memberships")).find((m) => m.id === "ms_mem_arjun")).toMatchObject({ status: "expired", endsOn: "2026-11-16" });
  await page.getByRole("tab", { name: "Invoices and payments" }).click();
  await expect(page.getByRole("list", { name: "Credit notes" })).toContainText("CNAND/26-27/0001");
  await expect(page.getByRole("list", { name: "Payments" })).toContainText("Credit note");
  await expect(page.getByRole("list", { name: "Payments" })).toContainText("UPI");
  await noSideways(page, "Billing");

  // Cancel: access continues until the date; the amount he may be owed is shown, and “Request refund” asks finance.
  await page.getByRole("tab", { name: "Membership" }).click();
  await page.getByRole("button", { name: "Cancel membership" }).first().click();
  const cn = dialog("Cancel membership");
  await cn.getByLabel("Takes effect on").fill("2026-11-24");
  await cn.getByLabel("Reason").fill("Moving to another city");
  await expect(cn).toContainText(/May be eligible for ₹[\d,.]+ under policy/);
  await cn.getByRole("button", { name: "Cancel membership" }).click();
  const canceled = dialog("Membership canceled");
  await expect(canceled).toContainText("Access continues until 24 Nov 2026");
  await expect(canceled).toContainText("Nothing is refunded automatically");
  const refundsBefore = (await readStore(page, "refunds")).length;
  await canceled.getByRole("button", { name: "Request refund" }).click();
  const ask = dialog("Request refund");
  await expect(ask.getByLabel("Reason")).toHaveValue("Cancellation: Moving to another city");
  await ask.getByRole("button", { name: "Send to finance" }).click();
  await expect(page.getByText("Refund requested")).toBeVisible();
  const reqs = (await readStore(page, "refundRequests")).filter((r) => r.memberId === "mem_arjun");
  expect(reqs).toHaveLength(1);
  expect(reqs[0]).toMatchObject({ memberId: "mem_arjun", status: "pending", source: "cancellation", requestedBy: "u_desk_andheri" });
  expect(await readStore(page, "refunds")).toHaveLength(refundsBefore);
  await canceled.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("list", { name: "Refund requests" })).toContainText("waiting for finance");
  await expect(page.getByRole("region", { name: "Membership" })).toContainText("Being canceled from 24 Nov 2026: Moving to another city");
  await noSideways(page, "Canceled");

  // The trainer transfer screen (A02).
  await page.getByRole("tab", { name: "Trainer" }).click();
  await expect(page.getByRole("heading", { name: "Trainer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change trainer" }).click();
  const tr = dialog("Change trainer");
  await tr.getByRole("radio", { name: "Aditya Rao" }).click();
  await tr.getByLabel("Reason").fill("Meera is moving to Bandra");
  await tr.getByRole("button", { name: "Change trainer" }).click();
  await expect(page.getByText("Trainer changed")).toBeVisible();
  await expect(page.getByRole("list", { name: "Trainer history" })).toContainText("Aditya Rao");
  await expect(page.getByRole("list", { name: "Trainer history" })).toContainText("Meera Joshi");
  await expect(page.getByRole("list", { name: "Trainer history" })).toContainText("Meera is moving to Bandra");
  expect((await readStore(page, "trainerAssignments")).filter((a) => a.memberId === "mem_arjun" && !a.effectiveTo)).toHaveLength(1);
}

/**
 * M03, O04: dues, a reminder, a part payment (the gym allows them), the rest by UPI from the Collect payment screen, and the printable tax receipt.
 */
export async function moneyJourney(page: Page) {
  await changeStore(page, "gymPolicies", `(v) => ({ ...v, partialPaymentsEnabled: true })`);
  await page.goto("/desk/dues");
  await expect(page.getByRole("heading", { name: "Dues", level: 1 })).toBeVisible();
  const row = page.locator("tr:visible, li:visible").filter({ hasText: "Priya Sharma" }).filter({ hasText: "PFAND" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/\d+ days?/);
  await noSideways(page, "Dues");

  await page.getByRole("button", { name: "Remind: Priya Sharma" }).click();
  await expect(page.getByText("Reminder sent to Priya")).toBeVisible();
  await expect(page.getByRole("button", { name: /: Priya Sharma$/ }).filter({ hasText: "Sent, again" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /: Priya Sharma$/ }).filter({ hasText: "Sent, again" })).toContainText("Sent, again 20 Nov 2026");
  expect((await readStore(page, "emailLog")).filter((e) => e.memberId === "mem_priya" && e.template === "payment_reminder")).toHaveLength(1);
  await expect(page.getByRole("link", { name: "Collect from Priya Sharma" })).toHaveAttribute("href", /\/desk\/members\/mem_priya\?collect=/);

  // A part payment, in cash: the invoice is part paid and the membership waits.
  await page.getByRole("link", { name: "Collect from Priya Sharma" }).click();
  const pay = page.getByRole("dialog", { name: "Collect payment" });
  await expect(pay).toBeVisible();
  await expect(pay).toContainText("Less than the amount due is a part payment.");
  await pay.getByLabel("Amount received (₹)").fill("1000");
  await pay.getByRole("button", { name: "Record payment" }).click();
  const part = page.getByRole("dialog", { name: "Payment recorded" });
  await expect(part).toContainText("₹1,000 received for invoice PFAND");
  await expect(part).toContainText(/Receipt RCP-2026-\d{4}/);
  await expect(part).toContainText(/₹[\d,.]+ still due/);
  await expect(part.getByText("Membership started")).toHaveCount(0);
  await part.getByRole("button", { name: "Done" }).click();
  await page.getByRole("tab", { name: "Invoices and payments" }).click();
  await expect(page.getByRole("list", { name: "Invoices" })).toContainText("Part paid");
  await expect(page.getByRole("list", { name: "Payments" })).toContainText("Cash");
  await noSideways(page, "Part paid");

  // The rest from the Collect payment screen, by UPI. Paying in full starts the renewal.
  await page.goto("/desk/payments/new");
  await expect(page.getByRole("heading", { name: "Collect payment", level: 1 })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search members" }).fill("priya");
  await page.getByRole("list", { name: "Matching members" }).getByRole("button", { name: /Priya Sharma/ }).click();
  const owed = page.getByRole("list", { name: "Open invoices" });
  await expect(owed).toContainText("part paid (₹1,000)");
  await noSideways(page, "Collect payment");
  await owed.getByRole("button", { name: /^Collect/ }).click();
  const rest = page.getByRole("dialog", { name: "Collect payment" });
  await rest.getByRole("radio", { name: "UPI" }).click();
  await rest.getByLabel("UPI reference").fill("priya@okbank");
  await rest.getByRole("button", { name: "Record payment" }).click();
  const full = page.getByRole("dialog", { name: "Payment recorded" });
  await expect(full).toContainText("Paid in full");
  await expect(full).toContainText(/Renewal booked: .*, starts \d+ \w+ 2026|Renewal booked: .*, active/);
  await full.getByRole("link", { name: "View or print the receipt" }).click();
  await expect(page.getByRole("heading", { name: "Tax invoice and receipt", level: 1 })).toBeVisible();
  await expect(page.getByText(/GSTIN/)).toBeVisible();
  await expect(page.getByText(/Priya Sharma/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeVisible();
  await noSideways(page, "Receipt");
  const pays = (await readStore(page, "payments")).filter((p) => p.memberId === "mem_priya" && p.receivedBy === "u_desk_andheri" && String(p.receivedAt).startsWith("2026-11-17"));
  expect(pays.map((p) => p.amountPaise).sort((a, b) => Number(a) - Number(b))).toEqual([100000, 195000]);
  expect(new Set(pays.map((p) => p.receiptNumber)).size).toBe(2);
  const inv = (await readStore(page, "invoices")).find((i) => i.memberId === "mem_priya" && (i.purpose as { kind?: string } | undefined)?.kind === "renewal" && i.status === "paid");
  expect(inv).toBeTruthy();
  await page.goto("/desk/dues");
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: "Priya Sharma" }).filter({ hasText: "PFAND" })).toHaveCount(0);
}

/**
 * M04: the front desk asks for a refund; finance approves it from the queue (the money goes back against a payment, both steps audited) and rejects another
 * with a reason the desk can read.
 */
export async function refundJourney(page: Page, signIn: (userId: string, path: string) => Promise<void>) {
  await page.goto("/desk/members/mem_arjun?tab=billing");
  await page.getByRole("button", { name: "Request refund" }).first().click();
  const ask = page.getByRole("dialog", { name: "Request refund" });
  await ask.getByLabel("Amount (₹)").fill("500");
  await ask.getByLabel("Reason").fill("Charged twice at the desk");
  await ask.getByRole("button", { name: "Send to finance" }).click();
  await expect(page.getByText("Refund requested")).toBeVisible();
  const requests = (await readStore(page, "refundRequests")).filter((r) => r.memberId === "mem_arjun");
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ status: "pending", amountPaise: 50000, requestedBy: "u_desk_andheri" });
  // The desk can’t see the queue.
  await page.goto("/desk/finance/refunds");
  await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();

  await signIn("u_finance", "/desk/finance/refunds");
  await expect(page.getByRole("heading", { name: "Refunds", level: 1 })).toBeVisible();
  await expect(page.getByText("You can approve refunds up to ₹25,000.")).toBeVisible();
  const queue = page.getByRole("list", { name: "Refund requests" });
  const card = queue.getByRole("listitem").filter({ hasText: "Arjun Kumar" });
  await expect(card).toContainText("₹500");
  await expect(card).toContainText("Charged twice at the desk");
  await expect(card).toContainText(/Goes back against the \w+ payment/);
  await noSideways(page, "Refund queue");
  await card.getByRole("button", { name: "Approve the refund for Arjun Kumar" }).click();
  const ok = page.getByRole("dialog", { name: "Approve refund" });
  await expect(ok).toContainText("The member is emailed. This is audited and can’t be undone.");
  await ok.getByRole("button", { name: "Approve refund" }).click();
  await expect(page.getByText("Refunded ₹500 to Arjun")).toBeVisible();
  await expect(queue.getByRole("listitem").filter({ hasText: "Arjun Kumar" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Decided refunds" })).toContainText("Approved by Deepa Menon");
  const refunds = (await readStore(page, "refunds")).filter((r) => r.reason === "Charged twice at the desk");
  expect(refunds).toHaveLength(1);
  expect(refunds[0]).toMatchObject({ amountPaise: 50000, status: "completed", approvedBy: "u_finance", requestedBy: "u_desk_andheri" });
  const actions = (await readStore(page, "auditEvents")).filter((e) => e.memberId === "mem_arjun").map((e) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["refund.request", "refund.approve"]));

  // A rejection needs a reason, which the desk reads.
  const other = queue.getByRole("listitem").first();
  await other.getByRole("button", { name: /^Reject the refund for/ }).click();
  const no = page.getByRole("dialog", { name: "Reject refund" });
  await no.getByRole("button", { name: "Reject refund" }).click();
  await expect(no.getByRole("alert")).toContainText("Say why it is rejected.");
  await no.getByLabel("Why? The desk sees this.").fill("Outside the policy: the plan was used");
  await no.getByRole("button", { name: "Reject refund" }).click();
  await expect(page.getByText("Refund rejected")).toBeVisible();
  await expect(page.getByRole("list", { name: "Decided refunds" })).toContainText("Note: Outside the policy: the plan was used");
  await noSideways(page, "Refunds decided");
}

/**
 * T04, O01, A03: the front desk’s bookings calendar at Andheri. Book a session for a member and see the time leave the free list, then a
 * trainer’s leave (added by the trainer, here written to the store) puts Arjun’s session in conflict and the desk moves it.
 */
export async function bookingsJourney(page: Page, wide: boolean) {
  await page.goto("/desk/bookings?date=2026-11-18");
  await expect(page.getByRole("heading", { name: "Bookings", level: 1 })).toBeVisible();
  if (!wide) await page.getByRole("radio", { name: "Meera", exact: false }).first().click();
  await noSideways(page, "Bookings");
  const before = (await readStore(page, "bookings")).length;
  await page.getByRole("button", { name: /^Book Meera.* at / }).first().click();
  const sheet = page.getByRole("dialog", { name: "Book a session" });
  await sheet.getByLabel("Search members").fill("Arjun");
  await sheet.getByRole("button", { name: /Arjun Kumar/ }).click();
  await expect(sheet).toContainText(/\d+ sessions? left/);
  await sheet.getByRole("button", { name: "Book session" }).click();
  await expect(page.getByText("Session booked")).toBeVisible();
  const after = await readStore(page, "bookings");
  expect(after).toHaveLength(before + 1);
  expect(after.filter((b) => b.memberId === "mem_arjun" && String(b.startsAt).startsWith("2026-11-18"))).toHaveLength(1);
  expect((await readStore(page, "auditEvents")).some((e) => e.memberId === "mem_arjun" && e.reason === "Booked at the front desk")).toBe(true);

  // Leave on Thursday 19 Nov puts Arjun’s booked session in conflict.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("ember-demo");
    open.onsuccess = () => {
      const tx = open.result.transaction("trainerLeave", "readwrite");
      tx.objectStore("trainerLeave").add({ id: "lv_e2e", tenantId: "t_pulse", trainerId: "u_trainer_meera", from: "2026-11-19", to: "2026-11-19", reason: "Conference", createdBy: "u_trainer_meera", createdAt: "2026-11-17T06:00:00.000Z" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.goto("/desk/bookings?date=2026-11-19");
  await expect(page.getByRole("heading", { name: "1 session is on its trainer’s leave" })).toBeVisible();
  await noSideways(page, "Bookings with a conflict");
  await page.getByRole("button", { name: "Move Arjun’s session" }).click();
  const move = page.getByRole("dialog", { name: "Move Arjun’s session" });
  await expect(move).toContainText("keeps the session credit");
  const arjun = (await readStore(page, "bookings")).find((b) => b.memberId === "mem_arjun" && String(b.startsAt).startsWith("2026-11-19"))!;
  await move.getByRole("list", { name: /times on/ }).first().getByRole("button").first().click();
  await expect(page.getByText("Arjun’s session is moved")).toBeVisible();
  await expect(page.getByRole("heading", { name: /on its trainer’s leave$/ })).toHaveCount(0);
  const moved = (await readStore(page, "bookings")).find((b) => b.id === arjun.id)!;
  expect(moved.startsAt).not.toBe(arjun.startsAt);
  expect(moved.status).toBe("booked");
}

/**
 * M03, M04, O06: the cash day close at the desk (a variance needs a note, and the closed day says it is locked), then finance: invoices and payments with billed
 * and collected apart, reconciliation with a flagged duplicate event that is accepted with a note, and a CSV export.
 */
export async function financeJourney(page: Page, signIn: (userId: string, path: string) => Promise<void>) {
  await page.goto("/desk/finance/day-close");
  await expect(page.getByRole("heading", { name: "Day close", level: 1 })).toBeVisible();
  await noSideways(page, "Day close");
  await page.getByLabel("Cash counted (₹)").fill("200");
  await expect(page.getByRole("status").filter({ hasText: "Over by ₹200" })).toBeVisible();
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByRole("alert")).toContainText("Add a note that says why.");
  await page.getByLabel(/^Note/).fill("A member left a tip in the drawer");
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText("Day closed", { exact: true })).toBeVisible();
  await expect(page.getByText("Cash for this day is locked.", { exact: false })).toBeVisible();
  const close = (await readStore(page, "dayCloses"))[0]!;
  expect(close).toMatchObject({ branchId: "br_andheri", status: "closed", variancePaise: 20000, closedBy: "u_desk_andheri" });
  await noSideways(page, "Closed day");

  await signIn("u_finance", "/desk/finance/invoices");
  await expect(page.getByRole("heading", { name: "Invoices and payments", level: 1 })).toBeVisible();
  const totals = page.getByRole("group", { name: "Totals" }).or(page.locator("dl[aria-label=Totals]"));
  await expect(totals).toContainText("Billed");
  await expect(totals).toContainText("Collected");
  await noSideways(page, "Invoices");
  await page.getByLabel("Status").selectOption("overdue");
  await expect(page.getByRole("table", { name: "Invoices" }).or(page.getByRole("list", { name: "Invoices" })).first()).toBeVisible();
  await page.getByRole("radio", { name: "Payments" }).click();
  await expect(page.getByRole("table", { name: "Payments" }).or(page.getByRole("list", { name: "Payments" })).first()).toBeVisible();
  await noSideways(page, "Payments");

  await page.goto("/desk/finance/reconciliation");
  await expect(page.getByRole("heading", { name: "Reconciliation", level: 1 })).toBeVisible();
  const flagged = page.getByRole("list", { name: "Flagged items" });
  await expect(flagged.getByRole("listitem")).toHaveCount(4);
  await expect(flagged).toContainText("Gateway event delivered 3 times");
  await expect(flagged).toContainText("The payout is a different amount");
  await expect(flagged).toContainText("A payout line Ember doesn’t know");
  await noSideways(page, "Reconciliation");
  await flagged.getByRole("button", { name: /^Accept with a note: Gateway event delivered 3 times/ }).click();
  const dlg = page.getByRole("dialog", { name: "Accept this item" });
  await dlg.getByRole("button", { name: "Accept" }).click();
  await expect(dlg.getByRole("alert")).toContainText("Say what you checked");
  await dlg.getByLabel("Note").fill("Gateway retried after a timeout; one payment exists");
  await dlg.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(flagged.getByRole("listitem")).toHaveCount(3);
  const events = (await readStore(page, "gatewayEvents")).filter((e) => e.deliveries === 3);
  expect(events[0]).toMatchObject({ reviewedBy: "u_finance" });
  await expect(page.getByRole("list", { name: "Day closes" })).toContainText("Over ₹200");

  await page.goto("/desk/finance/exports");
  await expect(page.getByRole("heading", { name: "Exports", level: 1 })).toBeVisible();
  await noSideways(page, "Exports");
  await page.getByRole("radio", { name: /Payments/ }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ember-payments-all-branches-\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByText("Export ready")).toBeVisible();
  expect((await readStore(page, "auditEvents")).filter((e) => e.action === "export.create")).toHaveLength(1);
}

/**
 * O06, O07: the owner’s dashboard. Billed and collected apart, renewals against the cohort, the check-in heat map, trainer utilisation and alerts; a branch and a range change the
 * numbers; and a branch manager sees only their own branch, here and in the switcher.
 */
export async function dashboardJourney(page: Page, signIn: (userId: string, path: string) => Promise<void>) {
  await page.goto("/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  const kpis = page.getByRole("group", { name: "Key figures" }).or(page.locator("dl[aria-label='Key figures']"));
  for (const label of ["Billed", "Collected", "Dues", "Active memberships", "Ending soon", "Renewals"]) await expect(kpis).toContainText(label);
  await expect(page.getByText("Invoiced in this range")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Billed and collected by week/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Check-ins by weekday and hour/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Trainers" })).toContainText("Meera Joshi");
  await expect(page.getByRole("list", { name: "Alerts" })).toContainText("overdue");
  await noSideways(page, "Dashboard");
  const allBilled = await kpis.locator("div", { hasText: /^Billed/ }).first().textContent();

  // A branch from the switcher changes the numbers.
  await page.getByRole("combobox", { name: "Branch" }).first().selectOption("br_bandra");
  await expect(page.getByText(/visits, Bandra/)).toBeVisible();
  expect(await kpis.locator("div", { hasText: /^Billed/ }).first().textContent()).not.toBe(allBilled);
  await page.getByRole("combobox", { name: "Branch" }).first().selectOption("all");

  // A shorter range, and a custom one with the dates the wrong way round saying so.
  await page.getByRole("radio", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/range=7/);
  await expect(page.getByText("11 Nov 2026 to 17 Nov 2026")).toBeVisible();
  await page.getByLabel("From").fill("2026-11-10");
  await expect(page.getByText("10 Nov 2026 to 17 Nov 2026")).toBeVisible();
  await noSideways(page, "Dashboard, 7 days");

  // The report an alert points to is one tap away.
  await page.goto("/owner");
  await expect(page.getByRole("list", { name: "Alerts" }).getByRole("link", { name: "See the report" }).first()).toHaveAttribute("href", /\/owner\/reports\?report=/);

  // A branch manager sees only their own branch.
  await signIn("u_bm_bandra", "/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByText(/visits, Bandra/)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Branch" })).toHaveCount(0);
  await expect(page.getByText("Andheri")).toHaveCount(0);
  await expect(page.getByText("Powai")).toHaveCount(0);
  await noSideways(page, "Branch manager dashboard");
}

/**
 * O06, O07: the owner’s reports. Every report opens with its definition and three figures; the CSV is what is on screen; the cash day close a desk made is reopened by the owner with a
 * reason (and the desk can close it again); a branch manager’s reports and file hold only their own branch.
 */
export async function reportsJourney(page: Page, signIn: (userId: string, path: string) => Promise<void>) {
  const TITLES = ["Memberships", "Renewals", "Check-ins", "Trainer utilisation", "Training credits", "Invoices", "Collections", "Dues", "Refunds", "Cash day closes"];
  const pick = async (title: string) => {
    const list = page.getByRole("navigation", { name: "Reports" }).getByRole("button", { name: title, exact: true });
    if (await list.isVisible()) await list.click();
    else await page.getByRole("combobox", { name: "Report" }).selectOption({ label: title });
  };
  // The cash day close a desk made, for the owner to reopen.
  await page.goto("/desk/finance/day-close");
  await page.getByLabel("Cash counted (₹)").fill("150");
  await page.getByLabel(/^Note/).fill("A member left a tip");
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText("Cash for this day is locked.", { exact: false })).toBeVisible();

  await signIn("u_owner", "/owner/reports");
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  for (const title of TITLES) {
    await pick(title);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Summary" }).or(page.locator("dl[aria-label=Summary]"))).toBeVisible();
    await expect(page.getByText(/For Andheri, Bandra, Powai\./)).toBeVisible();
    await noSideways(page, title);
  }
  await pick("Invoices");
  await expect(page.getByText(/^Invoices issued in the range/)).toBeVisible();
  await expect(page.locator("table:visible, ul[aria-label=Invoices]:visible").first()).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  expect(file.suggestedFilename()).toBe("ember-invoices-all-branches-2026-10-19-to-2026-11-17.csv");
  const csv = readFileSync((await file.path())!, "utf8");
  expect(csv.split("\r\n")[0]).toBe("Invoice,Date,Member,Branch,Total,Paid,Due,Status");
  expect(csv).toContain("Andheri");
  expect(csv).toContain("Bandra");
  await expect(page.getByText("Export ready")).toBeVisible();
  expect((await readStore(page, "auditEvents")).filter((e) => e.action === "export.create")).toHaveLength(1);

  // The owner reopens the day, with a reason.
  await pick("Cash day closes");
  await expect(page.locator("li:visible, td:visible").filter({ hasText: "A member left a tip" }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Reopen Andheri/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Reopen cash day" });
  await sheet.getByRole("button", { name: "Reopen the day" }).click();
  await expect(sheet.getByRole("alert")).toContainText("Say why the day is being reopened.");
  await sheet.getByLabel("Reason").fill("A cash payment was missed");
  await sheet.getByRole("button", { name: "Reopen the day" }).click();
  await expect(page.getByText("Day reopened")).toBeVisible();
  await expect(page.locator("li:visible, td:visible").filter({ hasText: /Reopened by Neha Kulkarni: A cash payment was missed/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Reopen Andheri/ })).toHaveCount(0);
  expect((await readStore(page, "dayCloses"))[0]).toMatchObject({ status: "reopened", reopenedBy: "u_owner", reopenReason: "A cash payment was missed" });
  expect((await readStore(page, "auditEvents")).filter((e) => e.action === "dayclose.reopen")).toHaveLength(1);

  // The desk sees it reopened and counts again.
  await signIn("u_desk_andheri", "/desk/finance/day-close");
  await expect(page.getByText(/The owner reopened this day: A cash payment was missed/)).toBeVisible();
  await page.getByLabel("Cash counted (₹)").fill("150");
  await page.getByLabel(/^Note/).fill("The same tip, counted again");
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText("Cash for this day is locked.", { exact: false })).toBeVisible();

  // A branch manager’s reports and file hold only their own branch, and no reopen.
  await signIn("u_bm_bandra", "/owner/reports?report=invoices");
  await expect(page.getByText(/For Bandra\./)).toBeVisible();
  await expect(page.locator("main").getByText("Andheri")).toHaveCount(0);
  await expect(page.locator("main").getByText("Powai")).toHaveCount(0);
  const [mine] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  expect(mine.suggestedFilename()).toBe("ember-invoices-bandra-2026-10-19-to-2026-11-17.csv");
  const own = readFileSync((await mine.path())!, "utf8");
  expect(own).toContain("Bandra");
  expect(own).not.toContain("Andheri");
  expect(own).not.toContain("Powai");
  await pick("Cash day closes");
  await expect(page.getByRole("button", { name: /^Reopen/ })).toHaveCount(0);
}
