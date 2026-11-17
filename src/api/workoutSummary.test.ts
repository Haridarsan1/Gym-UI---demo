import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getProgram, getWorkout, submitWorkout, type WorkoutView } from "@/api/workout";
import { getWorkoutSummary, saveWorkoutFeedback } from "@/api/workoutSummary";
import { db } from "@/demo/db";
import { resetDemo } from "@/demo";
import { asPrescribed, logSet } from "@/domain/workout";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? e.code : "other";
  }
  return "resolved";
};
const TODAY = "2026-11-17";
const arjun = as("u_member_arjun");
const priya = as("u_member_priya");

beforeAll(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

/** Logs every set as prescribed. `heavy` lifts a very heavy first set of the dumbbell bench press. */
function allSets(w: WorkoutView, heavy = false, only?: number) {
  let entries = w.entries;
  for (const x of w.exercises) {
    for (let n = 1; n <= x.prescription.sets; n++) {
      if (only !== undefined && x.prescription.order !== only) continue;
      entries = logSet(entries, x.prescription, asPrescribed(x.prescription, n));
    }
  }
  if (heavy) {
    const bench = w.exercises.find((x) => x.exercise.id === "ex_db_bench")!.prescription;
    entries = logSet(entries, bench, { setNumber: 1, reps: 10, loadKg: 200, skipped: false });
  }
  return entries;
}

describe("the summary of a finished workout", () => {
  it("is not there before the workout is finished", async () => {
    expect(await code(getWorkoutSummary(arjun, TODAY))).toBe("not_found");
  });

  it("gives the result, the volume, a record, the week and the streak, and the badges earned once", async () => {
    await db.badgeAwards.where("memberId").equals("mem_arjun").delete();
    // A strength goal Arjun has already passed: this workout is the first to notice.
    await db.goals.add({ id: "goal_test_squat", tenantId: "t_pulse", memberId: "mem_arjun", title: "Squat 70 kg", metric: "squat", unit: "kg", baseline: 40, target: 70, targetDate: "2027-01-01", reviewEveryDays: 28, status: "active", history: [], createdBy: "u_trainer_meera", createdAt: "2026-11-01T00:00:00.000Z" });
    const before = await getWorkout(arjun, TODAY);
    const entries = allSets(before, true);
    const r = await submitWorkout(arjun, { date: TODAY, entries, idempotencyKey: before.idempotencyKey });
    expect(r.status).toBe("completed");
    const s = await getWorkoutSummary(arjun, TODAY);
    expect(s).toMatchObject({ status: "completed", title: "Upper body and core", progress: { total: 15, done: 15, skipped: 0 } });
    expect(s.volumeKg).toBeGreaterThan(2000);
    expect(s.records).toContainEqual(expect.objectContaining({ name: "Dumbbell bench press", loadKg: 200 }));
    expect(s.records.every((x) => x.loadKg > x.previousKg)).toBe(true);
    expect(s.week).toMatchObject({ planned: 4, before: 0, after: 1 });
    expect(s.streak.after).toBeGreaterThanOrEqual(s.streak.before);
    const keys = s.badges.map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(["first_workout", "first_pr"]));
    expect(s.badges[0]).toMatchObject({ label: expect.any(String), description: expect.any(String) });
  });

  it("reports a goal whose target the workout reached, once, and leaves it Active", async () => {
    const s = await getWorkoutSummary(arjun, TODAY);
    expect(s.targetsReached).toEqual([{ id: "goal_test_squat", title: "Squat 70 kg" }]);
    const goal = (await db.goals.get("goal_test_squat"))!;
    expect(goal.status).toBe("active");
    expect(goal.history.at(-1)!.note).toMatch(/^Target reached with [\d.]+ kg in a workout\.$/);
    expect(goal.history).toHaveLength(1);
    // A goal reached by an earlier workout does not celebrate again.
    expect((await getWorkoutSummary(priya, (await getProgram(priya)).weeks.flatMap((w) => w.days).find((d) => d.state === "done")?.date ?? TODAY).catch(() => ({ targetsReached: [] }))).targetsReached).toEqual([]);
  });

  it("awards a badge once: repeating the submit adds none and the summary is unchanged", async () => {
    const w = await getWorkout(arjun, TODAY);
    const count = await db.badgeAwards.where("memberId").equals("mem_arjun").count();
    const again = await submitWorkout(arjun, { date: TODAY, entries: w.entries, idempotencyKey: w.idempotencyKey });
    expect(again.repeated).toBe(true);
    expect(await db.badgeAwards.where("memberId").equals("mem_arjun").count()).toBe(count);
    const s = await getWorkoutSummary(arjun, TODAY);
    expect(s.badges.length).toBe(count);
  });

  it("does not call an ordinary lift a record, and does not repeat a record already set", async () => {
    // Priya’s next workout days (the clock moves to each).
    const days = (await getProgram(priya)).weeks.flatMap((w) => w.days).filter((d) => d.state === "upcoming").map((d) => d.date);
    setNow(new Date(`${days[0]}T06:30:00.000Z`));
    const w = await getWorkout(priya, days[0]!);
    await submitWorkout(priya, { date: days[0]!, entries: allSets(w), idempotencyKey: w.idempotencyKey });
    const s = await getWorkoutSummary(priya, days[0]!);
    expect(s.status).toBe("completed");
    expect(s.records.every((x) => x.loadKg > x.previousKg)).toBe(true);
    setNow(new Date("2026-11-17T06:30:00.000Z"));
  });

  it("is kind about a partly done workout and has nothing to celebrate for a skipped one", async () => {
    const days = (await getProgram(priya)).weeks.flatMap((w) => w.days).filter((d) => d.state === "upcoming").map((d) => d.date);
    setNow(new Date(`${days[0]}T06:30:00.000Z`));
    const w = await getWorkout(priya, days[0]!);
    const main = w.exercises.filter((x) => x.prescription.section === "main");
    await submitWorkout(priya, { date: days[0]!, entries: allSets(w, false, main[0]!.prescription.order), idempotencyKey: w.idempotencyKey });
    const partial = await getWorkoutSummary(priya, days[0]!);
    expect(partial.status).toBe("partial");
    expect(partial.progress.done).toBe(main[0]!.prescription.sets);
    expect(partial.progress.total).toBeGreaterThan(partial.progress.done);
    setNow(new Date(`${days[1]}T06:30:00.000Z`));
    const w2 = await getWorkout(priya, days[1]!);
    await submitWorkout(priya, { date: days[1]!, entries: w2.entries, idempotencyKey: w2.idempotencyKey });
    const skipped = await getWorkoutSummary(priya, days[1]!);
    expect(skipped).toMatchObject({ status: "skipped", records: [], badges: [], volumeKg: 0 });
    setNow(new Date("2026-11-17T06:30:00.000Z"));
  });

  it("is only for members, and only their own", async () => {
    expect(await code(getWorkoutSummary(as("u_trainer_meera"), TODAY))).toBe("forbidden");
    expect(await code(getWorkoutSummary(as("u_member_sneha"), TODAY))).toBe("not_found");
  });
});

describe("effort and recovery (P04)", () => {
  it("saves each answer on its own, and they can be changed", async () => {
    await saveWorkoutFeedback(arjun, { date: TODAY, effort: 7 });
    expect(await getWorkoutSummary(arjun, TODAY)).toMatchObject({ effort: 7, recovery: undefined });
    await saveWorkoutFeedback(arjun, { date: TODAY, recovery: 4 });
    await saveWorkoutFeedback(arjun, { date: TODAY, effort: 8 });
    expect(await getWorkoutSummary(arjun, TODAY)).toMatchObject({ effort: 8, recovery: 4 });
  });
  it("refuses a number off the scale and a day with no finished workout", async () => {
    expect(await code(saveWorkoutFeedback(arjun, { date: TODAY, effort: 11 }))).toBe("invalid");
    expect(await code(saveWorkoutFeedback(arjun, { date: TODAY, recovery: 0 }))).toBe("invalid");
    expect(await code(saveWorkoutFeedback(as("u_member_sneha"), { date: TODAY, effort: 5 }))).toBe("not_found");
    expect(await code(saveWorkoutFeedback(as("u_trainer_meera"), { date: TODAY, effort: 5 }))).toBe("forbidden");
  });
});
