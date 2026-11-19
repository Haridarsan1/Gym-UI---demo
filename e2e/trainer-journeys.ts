import { expect, type Page } from "@playwright/test";
import { hasHorizontalScroll, logRemainingSets, readStore } from "./helpers";

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
