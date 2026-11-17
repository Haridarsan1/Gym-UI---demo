import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getProgram, getWorkout, saveWorkoutDraft, submitWorkout } from "@/api/workout";
import { db } from "@/demo/db";
import { resetDemo } from "@/demo";
import { asPrescribed, emptyEntries, entryFor, inOrder, logSet, skipSet } from "@/domain/workout";

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

beforeAll(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("reading a workout", () => {
  it("gives today’s exercises in order with targets, instructions and alternatives", async () => {
    const w = await getWorkout(arjun, TODAY);
    expect(w).toMatchObject({ title: "Upper body and core", versionNumber: 2, authorName: "Meera Joshi", status: "none", blockedReason: undefined });
    expect(w.exercises.map((x) => x.prescription.order)).toEqual([...w.exercises.map((x) => x.prescription.order)].sort((a, b) => a - b));
    expect(w.exercises.filter((x) => x.prescription.section === "main")).toHaveLength(5);
    const bench = w.exercises.find((x) => x.exercise.id === "ex_db_bench")!;
    expect(bench.prescription).toMatchObject({ sets: 3, reps: 10 });
    expect(bench.exercise.instructions.length).toBeGreaterThan(20);
    expect(bench.alternatives.map((a) => a.id)).toContain("ex_pushup");
    expect(bench.last).toMatchObject({ set: { skipped: false } });
    expect(bench.last!.date < TODAY).toBe(true);
    expect(w.entries).toHaveLength(w.exercises.length);
    expect(w.idempotencyKey).toMatch(/^wk-/);
  });

  it("says there is no workout on a rest day", async () => {
    expect(await code(getWorkout(as("u_member_priya"), TODAY))).toBe("not_found");
  });

  it("is for members only", async () => {
    expect(await code(getWorkout(as("u_trainer_meera"), TODAY))).toBe("forbidden");
    expect(await code(getWorkout(null, TODAY))).toBe("unauthenticated");
  });

  it("refuses a date that isn’t a date", async () => {
    expect(await code(getWorkout(arjun, "tomorrow"))).toBe("invalid");
  });
});

describe("drafts", () => {
  it("does not create a draft until something is logged", async () => {
    const w = await getWorkout(arjun, TODAY);
    expect(await saveWorkoutDraft(arjun, { date: TODAY, entries: w.entries, idempotencyKey: w.idempotencyKey })).toEqual({ status: "none" });
    expect(await db.workoutLogs.where("memberId").equals("mem_arjun").and((l) => l.scheduledOn === TODAY).count()).toBe(0);
  });

  it("saves what was logged and brings it back on the next visit, with the same key", async () => {
    const w = await getWorkout(arjun, TODAY);
    const p = w.exercises.find((x) => x.prescription.section === "main")!.prescription;
    const entries = skipSet(logSet(w.entries, p, asPrescribed(p, 1)), p, 2);
    await saveWorkoutDraft(arjun, { date: TODAY, entries, idempotencyKey: w.idempotencyKey });
    await saveWorkoutDraft(arjun, { date: TODAY, entries, idempotencyKey: w.idempotencyKey });
    const again = await getWorkout(arjun, TODAY);
    expect(again.status).toBe("draft");
    expect(again.idempotencyKey).toBe(w.idempotencyKey);
    expect(entryFor(again.entries, p)!.sets).toEqual([expect.objectContaining({ setNumber: 1, asPrescribed: true }), { setNumber: 2, skipped: true }]);
    expect(await db.workoutLogs.where("memberId").equals("mem_arjun").and((l) => l.scheduledOn === TODAY).count()).toBe(1);
  });

  it("keeps a swapped exercise and its sets", async () => {
    const w = await getWorkout(arjun, TODAY);
    const bench = w.exercises.find((x) => x.exercise.id === "ex_db_bench")!;
    const entries = w.entries.map((e) => (e.exerciseId === "ex_db_bench" ? { exerciseId: "ex_pushup", substitutionFor: "ex_db_bench", sets: [{ setNumber: 1, reps: 14, skipped: false }] } : e));
    await saveWorkoutDraft(arjun, { date: TODAY, entries: [...entries], idempotencyKey: w.idempotencyKey });
    const again = await getWorkout(arjun, TODAY);
    expect(entryFor(again.entries, bench.prescription)).toMatchObject({ exerciseId: "ex_pushup", substitutionFor: "ex_db_bench" });
    expect(again.exercises.find((x) => x.exercise.id === "ex_db_bench")!.alternatives.map((a) => a.id)).toContain("ex_pushup");
  });
});

describe("submitting", () => {
  it("completes a workout logged as 10, 10 and 8 against 3 × 10, and keeps the prescription as it was", async () => {
    const w = await getWorkout(arjun, TODAY);
    const bench = w.exercises.find((x) => x.exercise.id === "ex_db_bench")!.prescription;
    let entries = emptyEntries({ prescriptions: w.exercises.map((x) => x.prescription) });
    for (const x of w.exercises) for (let n = 1; n <= x.prescription.sets; n++) entries = logSet(entries, x.prescription, asPrescribed(x.prescription, n));
    entries = logSet(entries, bench, { ...asPrescribed(bench, 3), reps: 8, asPrescribed: false });
    const result = await submitWorkout(arjun, { date: TODAY, entries, idempotencyKey: w.idempotencyKey, effort: 7, notes: "Felt strong" });
    expect(result).toMatchObject({ status: "completed", repeated: false, progress: { total: 15, done: 15, skipped: 0, open: 0 } });

    const after = await getWorkout(arjun, TODAY);
    expect(after.status).toBe("completed");
    expect(after.effort).toBe(7);
    const done = after.exercises.find((x) => x.exercise.id === "ex_db_bench")!;
    expect(done.prescription).toMatchObject({ sets: 3, reps: 10 });
    expect(entryFor(after.entries, done.prescription)!.sets.map((s) => s.reps)).toEqual([10, 10, 8]);
    expect(after.blockedReason).toMatch(/already logged/);
  });

  it("is idempotent: the same key twice is one log, and a late draft save changes nothing", async () => {
    const w = await getWorkout(arjun, TODAY);
    const log = (await db.workoutLogs.where("memberId").equals("mem_arjun").and((l) => l.scheduledOn === TODAY).toArray())[0]!;
    const again = await submitWorkout(arjun, { date: TODAY, entries: w.entries, idempotencyKey: log.idempotencyKey });
    expect(again).toMatchObject({ status: "completed", repeated: true, logId: log.id });
    expect(await saveWorkoutDraft(arjun, { date: TODAY, entries: emptyEntries({ prescriptions: w.exercises.map((x) => x.prescription) }), idempotencyKey: log.idempotencyKey })).toEqual({ status: "completed" });
    const rows = await db.workoutLogs.where("memberId").equals("mem_arjun").and((l) => l.scheduledOn === TODAY).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entries.some((e) => e.sets.length)).toBe(true);
  });

  it("refuses a second, different submission for the same day", async () => {
    const w = await getWorkout(arjun, TODAY);
    expect(await code(submitWorkout(arjun, { date: TODAY, entries: w.entries, idempotencyKey: "wk-another-key-1" }))).toBe("conflict");
  });

  it("records who entered it", async () => {
    const log = (await db.workoutLogs.where("memberId").equals("mem_arjun").and((l) => l.scheduledOn === TODAY).toArray())[0]!;
    expect(log).toMatchObject({ enteredBy: "u_member_arjun", enteredByRole: "member", planVersionId: expect.any(String) });
  });
});

describe("finishing early (Priya, on her next two workout days)", () => {
  const priya = as("u_member_priya");
  const onDay = (date: string) => setNow(new Date(`${date}T06:30:00.000Z`));
  const upcoming = async () => (await getProgram(priya)).weeks.flatMap((w) => w.days).filter((d) => d.state === "upcoming").slice(0, 2).map((d) => d.date);

  it("is partial when only some sets were done", async () => {
    const [date] = await upcoming();
    onDay(date!);
    const w = await getWorkout(priya, date!);
    const p = w.exercises.find((x) => x.prescription.section === "main")!.prescription;
    const entries = skipSet(logSet(w.entries, p, asPrescribed(p, 1)), p, 2);
    expect(await submitWorkout(priya, { date: date!, entries, idempotencyKey: w.idempotencyKey })).toMatchObject({ status: "partial", progress: { done: 1, skipped: 1 } });
    const program = await getProgram(priya);
    expect(program.weeks.flatMap((x) => x.days).find((d) => d.date === date)!.state).toBe("partial");
    setNow(new Date("2026-11-17T06:30:00.000Z"));
  });

  it("is skipped when nothing was done, and the day is shown as skipped", async () => {
    const [, date] = await upcoming();
    onDay(date!);
    const w = await getWorkout(priya, date!);
    expect(await submitWorkout(priya, { date: date!, entries: w.entries, idempotencyKey: w.idempotencyKey })).toMatchObject({ status: "skipped", progress: { done: 0 } });
    expect((await getProgram(priya)).weeks.flatMap((x) => x.days).find((d) => d.date === date)!.state).toBe("skipped");
    setNow(new Date("2026-11-17T06:30:00.000Z"));
  });
});

describe("who can log", () => {
  it("blocks a frozen membership from saving or submitting, but lets them look at the plan", async () => {
    const rahul = as("u_member_rahul");
    const program = await getProgram(rahul);
    const day = program.weeks.flatMap((w) => w.days).find((d) => d.state === "missed" || d.state === "today")!;
    const w = await getWorkout(rahul, day.date);
    expect(w.blockedReason).toMatch(/frozen/);
    expect(await code(submitWorkout(rahul, { date: day.date, entries: w.entries, idempotencyKey: "wk-rahul-frozen-1" }))).toBe("forbidden");
    expect(await code(saveWorkoutDraft(rahul, { date: day.date, entries: w.entries, idempotencyKey: "wk-rahul-frozen-1" }))).toBe("forbidden");
  });

  it("opens a workout on its day only", async () => {
    const program = await getProgram(arjun);
    const next = program.weeks.flatMap((w) => w.days).find((d) => d.state === "upcoming")!;
    const w = await getWorkout(arjun, next.date);
    expect(w.blockedReason).toMatch(/opens on its day/);
    expect(await code(submitWorkout(arjun, { date: next.date, entries: w.entries, idempotencyKey: "wk-arjun-future-1" }))).toBe("forbidden");
  });
});

describe("the program path", () => {
  it("lays the plan out in weeks, with today marked and each day’s result", async () => {
    const p = await getProgram(arjun);
    expect(p.today).toBe(TODAY);
    expect(p.current).toMatchObject({ name: "Strength and size block", versionNumber: 2, authorName: "Meera Joshi" });
    expect(p.earlier).toEqual([expect.objectContaining({ versionNumber: 1, endedOn: "2026-11-03" })]);
    const current = p.weeks.find((w) => w.isCurrent)!;
    expect(current.weekStart).toBe("2026-11-16");
    expect(current.days).toHaveLength(7);
    expect(current.workouts).toBe(4);
    const todayCell = current.days.find((d) => d.date === TODAY)!;
    expect(todayCell).toMatchObject({ title: "Upper body and core", versionNumber: 2 });
    expect(["done", "today"]).toContain(todayCell.state);
    expect(p.weeks.length).toBeGreaterThan(4);
    expect(p.weeks.map((w) => w.weekStart)).toEqual([...p.weeks.map((w) => w.weekStart)].sort());
  });

  it("keeps earlier weeks on the version that was current then (T06)", async () => {
    const p = await getProgram(arjun);
    const first = p.weeks[0]!;
    expect(first.versionNumber).toBe(1);
    expect(first.days.filter((d) => d.state !== "rest").every((d) => d.versionNumber === 1)).toBe(true);
    expect(first.days.some((d) => d.state === "done")).toBe(true);
  });

  it("shows no weeks when there is no plan yet", async () => {
    const p = await getProgram(as("u_member_sneha"));
    expect(p).toMatchObject({ weeks: [], earlier: [] });
    expect(p.current).toBeUndefined();
  });

  it("is for members only", async () => {
    expect(await code(getProgram(as("u_trainer_meera")))).toBe("forbidden");
  });

  it("uses inOrder for the order of prescriptions", () => {
    expect(inOrder({ prescriptions: [{ exerciseId: "b", order: 2, section: "main", sets: 1 }, { exerciseId: "a", order: 1, section: "main", sets: 1 }] }).map((p) => p.exerciseId)).toEqual(["a", "b"]);
  });
});
