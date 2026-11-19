import { expect, test, type Page } from "@playwright/test";
import { chrome, hasHorizontalScroll, logRemainingSets, readStore, signInAs } from "./helpers";

/**
 * M2 acceptance (the trainer app’s “done when”): trainer transfer (A02) through the API with the demo role switcher; a published plan that
 * stays intact after a new version (W03: 10, 10 and 8 reps against 3 × 10); goal confirmation that awards the badge once (P04); and consent
 * withdrawal that hides assessments (T02, S04). Each scenario drives the real screens and the real API, and checks the database.
 * They run on a phone, so the account menu and the role switcher are the ones on a phone.
 */

type Row = Record<string, unknown>;

/** Calls an API function the way a screen would, as one of the demo people, from inside the page. Returns the value, or the error code. */
async function api(page: Page, module: string, fn: string, userId: string, input: unknown): Promise<{ value?: unknown; error?: string }> {
  return page.evaluate(
    async ([mod, name, id, arg]) => {
      const m = await import(/* @vite-ignore */ `/src/api/${mod}.ts`);
      try {
        return { value: await m[name as string]({ userId: id, name: "", role: "x", tenantId: "t_pulse", branchIds: [] }, arg) };
      } catch (e) {
        return { error: (e as { code?: string }).code ?? "other" };
      }
    },
    [module, fn, userId, input] as const,
  );
}

/** Switches person with the demo role switcher in the account menu, as the screen offers it. */
async function switchTo(page: Page, role: RegExp, landing: RegExp) {
  await page.getByRole("button", { name: /Account menu/ }).first().click();
  await chrome(page).getByRole("button", { name: role }).click();
  await expect(page).toHaveURL(landing);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

const watch = (page: Page) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console error: ${m.text()}`));
  return problems;
};
const noSideways = async (page: Page, where: string) => expect(await hasHorizontalScroll(page), `${where}: sideways scroll`).toBe(false);

test("M2 acceptance: trainer transfer (A02) through the API, checked with the role switcher", async ({ page }) => {
  const problems = watch(page);
  // Priya trains with Aditya. He leaves a private note, and his plan and logs are hers to keep.
  await signInAs(page, "u_desk_andheri", "/desk");
  const note = await api(page, "clients", "addPrivateNote", "u_trainer_aditya", { memberId: "mem_priya", body: "Aditya’s private note: her knee clicks on deep squats." });
  expect(note.error).toBeUndefined();
  const before = {
    plans: (await readStore(page, "workoutPlanVersions")).filter((v) => v.memberId === "mem_priya"),
    logs: (await readStore(page, "workoutLogs")).filter((l) => l.memberId === "mem_priya"),
  };
  expect(before.plans.length).toBeGreaterThan(0);

  // Only people who assign trainers can transfer: a trainer cannot, and cannot take a client either.
  expect((await api(page, "assignments", "transferTrainer", "u_trainer_meera", { memberId: "mem_priya", toTrainerId: "u_trainer_meera" })).error).toBe("forbidden");
  // The front desk moves Priya to Coach Meera.
  const moved = await api(page, "assignments", "transferTrainer", "u_desk_andheri", { memberId: "mem_priya", toTrainerId: "u_trainer_meera", reason: "Aditya moved to the Powai branch" });
  expect(moved.error).toBeUndefined();
  expect((await api(page, "assignments", "transferTrainer", "u_desk_andheri", { memberId: "mem_priya", toTrainerId: "u_trainer_meera" })).error).toBe("conflict");

  const assignments = (await readStore(page, "trainerAssignments")).filter((a) => a.memberId === "mem_priya").sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
  expect(assignments.at(-2)).toMatchObject({ trainerId: "u_trainer_aditya", effectiveTo: "2026-11-16" });
  expect(assignments.at(-1)).toMatchObject({ trainerId: "u_trainer_meera", effectiveFrom: "2026-11-17", assignedBy: "u_desk_andheri", reason: "Aditya moved to the Powai branch" });
  const audit = (await readStore(page, "auditEvents")).find((e) => e.entityType === "trainer_assignment" && e.memberId === "mem_priya" && e.actorId === "u_desk_andheri");
  expect(audit).toMatchObject({ action: "record.edit", reason: "Aditya moved to the Powai branch" });

  // The demo role switcher: front desk to Coach Meera. She now has Priya, with the history and its authors.
  await switchTo(page, /^Trainer/, /\/t$/);
  await page.goto("/t/clients/mem_priya");
  await expect(page.getByRole("heading", { name: "Priya Sharma", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Program versions" })).toContainText("Aditya Rao");
  await page.getByRole("tab", { name: "Workouts" }).click();
  await expect(page.getByRole("list", { name: "Recent workouts" }).getByRole("listitem").first()).toContainText(/Entered by/);
  await page.getByRole("tab", { name: /Notes/ }).click();
  await expect(page.getByText("Aditya’s private note")).toHaveCount(0);
  await expect(page.getByText("her knee clicks")).toHaveCount(0);
  await noSideways(page, "Priya with her new trainer");

  // Nothing Aditya wrote was changed or moved: plans, logs and his private note keep their author.
  const after = {
    plans: (await readStore(page, "workoutPlanVersions")).filter((v) => v.memberId === "mem_priya"),
    logs: (await readStore(page, "workoutLogs")).filter((l) => l.memberId === "mem_priya"),
  };
  expect(after.plans).toEqual(before.plans);
  expect(after.logs).toEqual(before.logs);
  const kept = (await readStore(page, "trainerReviews")).find((r) => r.id === (note.value as { id: string }).id);
  expect(kept).toMatchObject({ kind: "private_note", authorId: "u_trainer_aditya" });

  // Through the API too: the new trainer has her and does not see the private note; the old one no longer can open her.
  const mine = await api(page, "clients", "getClient", "u_trainer_meera", "mem_priya");
  expect((mine.value as { notes: Array<{ body: string }> }).notes.some((n) => n.body.includes("knee clicks"))).toBe(false);
  expect((mine.value as { program: { versions: Array<{ authorName: string }> } }).program.versions.every((v) => v.authorName === "Aditya Rao")).toBe(true);
  expect((await api(page, "clients", "getClient", "u_trainer_aditya", "mem_priya")).error).toBe("not_found");
  expect((await api(page, "coachLog", "getCoachDays", "u_trainer_aditya", "mem_priya")).error).toBe("not_found");
  const adityasList = (await api(page, "clients", "listClients", "u_trainer_aditya", {})).value as Array<{ memberId: string }>;
  expect(adityasList.map((c) => c.memberId)).not.toContain("mem_priya");
  expect(problems).toEqual([]);
});

test("M2 acceptance: a published plan stays intact after a new version (W03: 10, 10 and 8 reps against 3 × 10)", async ({ page }) => {
  const problems = watch(page);
  await signInAs(page, "u_member_arjun", "/m");
  // Arjun logs the dumbbell bench press as 10, 10 and 8 against the prescribed 3 × 10. It counts as completed.
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
    } else await logRemainingSets(page);
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("dialog", { name: "Finish workout" }).getByRole("button", { name: "Finish workout" }).click();
  await expect(page.locator('[data-stage="done"]')).toBeVisible({ timeout: 8000 });

  const bench = (rows: Row[]) => {
    const log = rows.find((l) => l.memberId === "mem_arjun" && l.scheduledOn === "2026-11-17")!;
    const e = (log.entries as Array<{ exerciseId: string; sets: Array<{ reps?: number }> }>).find((x) => x.exerciseId === "ex_db_bench")!;
    return { log, reps: e.sets.map((s) => s.reps) };
  };
  const logged = bench(await readStore(page, "workoutLogs"));
  expect(logged.log.status).toBe("completed");
  expect(logged.reps).toEqual([10, 10, 8]);
  const v2 = (await readStore(page, "workoutPlanVersions")).find((v) => v.memberId === "mem_arjun" && v.versionNumber === 2)!;
  const v2Before = JSON.stringify(v2);
  const prescription = (v: Row) => (v.days as Array<{ prescriptions: Array<{ exerciseId: string; sets: number; reps: number }> }>).flatMap((d) => d.prescriptions).find((p) => p.exerciseId === "ex_db_bench")!;
  expect(prescription(v2)).toMatchObject({ sets: 3, reps: 10 });

  // Through the role switcher: Coach Meera revises the plan and publishes version 3.
  await switchTo(page, /^Trainer/, /\/t$/);
  await page.goto("/t/clients/mem_arjun");
  await page.getByRole("link", { name: "Revise plan" }).click();
  await expect(page.getByText("Version 2 is current. You are building version 3.")).toBeVisible();
  const items = page.getByRole("list", { name: "Exercises in this workout" }).getByRole("listitem");
  await items.first().getByLabel("Sets").fill("5");
  await page.getByRole("button", { name: "Publish version 3" }).click();
  await page.getByRole("dialog", { name: "Publish program" }).getByRole("button", { name: "Publish version 3" }).click();
  await expect(page.getByRole("dialog", { name: "Version published" })).toContainText("Version 2, “Strength and size block”, stays as it was");

  // Version 2 is exactly as it was, the log still says 10, 10 and 8 and “completed”, and version 3 is the new one.
  const versions = (await readStore(page, "workoutPlanVersions")).filter((v) => v.memberId === "mem_arjun" && v.status === "published");
  expect(versions.map((v) => v.versionNumber).sort()).toEqual([1, 2, 3]);
  expect(JSON.stringify(versions.find((v) => v.versionNumber === 2))).toBe(v2Before);
  expect(prescription(versions.find((v) => v.versionNumber === 2)!)).toMatchObject({ sets: 3, reps: 10 });
  const after = bench(await readStore(page, "workoutLogs"));
  expect(after.log).toEqual(logged.log);
  expect(after.reps).toEqual([10, 10, 8]);
  expect(after.log.status).toBe("completed");
  expect(after.log.planVersionId).toBe(v2.id);

  await page.getByRole("dialog", { name: "Version published" }).getByRole("link", { name: "Back to Arjun" }).click();
  await page.getByRole("tab", { name: "Workouts" }).click();
  await expect(page.getByRole("list", { name: "Recent workouts" }).getByRole("listitem").first()).toContainText("Completed");
  await noSideways(page, "Workouts after a new version");
  expect(problems).toEqual([]);
});

test("M2 acceptance: confirming a goal awards the Goal achieved badge once", async ({ page }) => {
  const problems = watch(page);
  await signInAs(page, "u_trainer_meera", "/t/clients/mem_144/review");
  await expect(page.getByRole("heading", { name: "Review", level: 1 })).toBeVisible();
  const goal = page.getByRole("list", { name: "Goals" }).getByRole("listitem").filter({ hasText: "Train three times a week" });
  await expect(goal).toContainText("Target reached");
  expect((await readStore(page, "badgeAwards")).filter((b) => b.memberId === "mem_144" && b.badge === "goal_achieved")).toHaveLength(0);

  await goal.getByRole("button", { name: "Confirm achieved" }).click();
  await page.getByRole("dialog", { name: "Confirm goal achieved" }).getByRole("button", { name: "Confirm achieved" }).click();
  await expect(goal).toContainText("Achieved");
  const badge = () => readStore(page, "badgeAwards").then((rows) => rows.filter((b) => b.memberId === "mem_144" && b.badge === "goal_achieved"));
  expect(await badge()).toHaveLength(1);

  // Confirming again, from the API as the same trainer, changes nothing: one badge, one “Achieved” line, one audit event.
  const goalId = (await readStore(page, "goals")).find((g) => g.memberId === "mem_144" && g.title === "Train three times a week")!.id;
  expect((await api(page, "assessments", "confirmGoalAchieved", "u_trainer_meera", { memberId: "mem_144", goalId })).error).toBeUndefined();
  expect(await badge()).toHaveLength(1);
  const g = (await readStore(page, "goals")).find((x) => x.id === goalId)!;
  expect((g.history as Array<{ note: string }>).filter((h) => h.note.startsWith("Achieved"))).toHaveLength(1);
  expect((await readStore(page, "auditEvents")).filter((e) => e.action === "goal.confirm" && e.entityId === goalId)).toHaveLength(1);
  // Nobody else can confirm it: the client’s own app has no way to, and another trainer or a member is refused.
  expect((await api(page, "assessments", "confirmGoalAchieved", "u_member_arjun", { memberId: "mem_144", goalId })).error).toBe("forbidden");
  expect((await api(page, "assessments", "confirmGoalAchieved", "u_trainer_farah", { memberId: "mem_144", goalId })).error).toBe("not_found");
  await page.reload();
  await expect(page.getByRole("list", { name: "Goals" }).getByRole("listitem").filter({ hasText: "Train three times a week" }).getByRole("button", { name: "Confirm achieved" })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("M2 acceptance: withdrawing assessment consent hides assessments from the trainer, and agreeing again brings them back", async ({ page }) => {
  const problems = watch(page);
  await signInAs(page, "u_member_arjun", "/m/me#consent");
  const consent = page.getByRole("region", { name: "Consent" });
  const sw = consent.getByRole("switch", { name: "Assessments" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  const recorded = (await readStore(page, "assessments")).filter((a) => a.memberId === "mem_arjun").length;
  expect(recorded).toBeGreaterThan(0);

  // The member turns assessments off. The records are kept.
  await sw.click();
  await expect(page.getByText("Assessments: turned off")).toBeVisible();
  await expect(consent).toContainText(/Withdrawn on 17 Nov 2026/);
  expect((await readStore(page, "assessments")).filter((a) => a.memberId === "mem_arjun")).toHaveLength(recorded);

  // Coach Meera, through the role switcher, sees it hidden: no form, no history, a clear reason.
  await switchTo(page, /^Trainer/, /\/t$/);
  await page.goto("/t/clients/mem_arjun/assessment");
  await expect(page.getByRole("heading", { name: "Assessment and goals", level: 1 })).toBeVisible();
  await expect(page.getByText("Assessment consent withdrawn")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record assessment" })).toHaveCount(0);
  await expect(page.getByText("Training experience")).toHaveCount(0);
  const viewsBefore = (await readStore(page, "auditEvents")).filter((e) => e.action === "assessment.view").length;
  const viewed = await api(page, "assessments", "getAssessment", "u_trainer_meera", "mem_arjun");
  expect(viewed.value).toMatchObject({ state: "consent_withdrawn", assessments: [] });
  expect((await readStore(page, "auditEvents")).filter((e) => e.action === "assessment.view")).toHaveLength(viewsBefore);
  const refused = await api(page, "assessments", "saveAssessment", "u_trainer_meera", { memberId: "mem_arjun", experience: "some", availability: { days: [1], time: "any" }, preferences: "", restrictions: "", baseline: {} });
  expect(refused.error).toBe("forbidden");
  // Goals are not health records: they are still there.
  await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
  await noSideways(page, "Assessment, consent withdrawn");

  // The owner can see that an assessment exists but not its contents.
  expect((await api(page, "sensitive", "viewSensitive", "u_owner", { kind: "assessment", memberId: "mem_arjun", entityId: "x" })).error).toBe("forbidden");

  // The member agrees again: the same records are readable again, nothing was lost.
  await switchTo(page, /^Member/, /\/m$/);
  await page.goto("/m/me#consent");
  await page.getByRole("region", { name: "Consent" }).getByRole("switch", { name: "Assessments" }).click();
  await expect(page.getByRole("region", { name: "Consent" }).getByRole("switch", { name: "Assessments" })).toHaveAttribute("aria-checked", "true");
  await switchTo(page, /^Trainer/, /\/t$/);
  await page.goto("/t/clients/mem_arjun/assessment");
  await expect(page.getByRole("button", { name: "Record assessment" })).toBeVisible();
  await expect(page.getByText("Assessment consent withdrawn")).toHaveCount(0);
  expect((await readStore(page, "assessments")).filter((a) => a.memberId === "mem_arjun")).toHaveLength(recorded);
  expect(problems).toEqual([]);
});
