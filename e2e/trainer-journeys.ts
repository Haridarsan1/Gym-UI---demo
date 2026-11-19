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
