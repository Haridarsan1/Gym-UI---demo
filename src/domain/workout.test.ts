import { describe, expect, it } from "vitest";
import type { PlanDay, Prescription } from "@/domain/types";
import { asPrescribed, clearSet, describeLogged, lastTimeFor, lastTimeText, prefillFor, describeSet, describeTarget, emptyEntries, entryFor, fieldsFor, hasActivity, logSet, loggingBlockedReason, normalizeEntries, progress, restAfter, skipSet, statusFor, substituteExercise, targetReps } from "@/domain/workout";

const bench: Prescription = { exerciseId: "ex_bench", order: 1, section: "main", sets: 3, reps: 10, loadKg: 20, restSec: 75 };
const row: Prescription = { exerciseId: "ex_row", order: 2, section: "main", sets: 2, reps: { min: 8, max: 12 }, restSec: 60 };
const plank: Prescription = { exerciseId: "ex_plank", order: 3, section: "main", sets: 2, durationSec: 45, restSec: 45 };
const warm: Prescription = { exerciseId: "ex_warm", order: 0, section: "warmup", sets: 1, durationSec: 60 };
const day: PlanDay = { dayOffset: 0, weekIndex: 0, dayIndex: 0, title: "Upper", canceled: false, prescriptions: [plank, bench, warm, row] };

describe("targets", () => {
  it("describes what the trainer wrote", () => {
    expect(describeTarget(bench)).toBe("3 × 10, 20 kg, rest 1 min 15 s");
    expect(describeTarget(row)).toBe("2 × 8–12, rest 1 min");
    expect(describeTarget(plank)).toBe("2 × 45 s, rest 45 s");
  });
  it("pre-fills the lower end of a range", () => {
    expect(targetReps(row)).toBe(8);
    expect(targetReps(bench)).toBe(10);
    expect(targetReps(plank)).toBeUndefined();
  });
  it("asks for what was prescribed, and an optional load with reps", () => {
    expect(fieldsFor(bench)).toEqual(["reps", "load"]);
    expect(fieldsFor(plank)).toEqual(["duration"]);
  });
  it("logs a set exactly as prescribed with one tap", () => {
    expect(asPrescribed(bench, 2)).toEqual({ setNumber: 2, reps: 10, loadKg: 20, durationSec: undefined, distanceM: undefined, skipped: false, asPrescribed: true });
  });
});

describe("entries", () => {
  it("starts with every exercise in the day’s order and nothing logged", () => {
    const e = emptyEntries(day);
    expect(e.map((x) => x.exerciseId)).toEqual(["ex_warm", "ex_bench", "ex_row", "ex_plank"]);
    expect(e.every((x) => x.sets.length === 0)).toBe(true);
    expect(hasActivity(e)).toBe(false);
  });
  it("keeps 10, 10 and 8 reps against three sets of ten, next to what was prescribed", () => {
    let e = emptyEntries(day);
    e = logSet(e, bench, { ...asPrescribed(bench, 1) });
    e = logSet(e, bench, { ...asPrescribed(bench, 2) });
    e = logSet(e, bench, { setNumber: 3, reps: 8, loadKg: 20, skipped: false });
    expect(entryFor(e, bench)!.sets.map((s) => s.reps)).toEqual([10, 10, 8]);
    expect(bench.reps).toBe(10);
  });
  it("replaces a set that is corrected instead of adding another", () => {
    let e = logSet(emptyEntries(day), bench, { setNumber: 1, reps: 9, skipped: false });
    e = logSet(e, bench, { setNumber: 1, reps: 10, skipped: false });
    expect(entryFor(e, bench)!.sets).toHaveLength(1);
    expect(entryFor(e, bench)!.sets[0]!.reps).toBe(10);
  });
  it("takes a set back to not logged", () => {
    const e = clearSet(skipSet(emptyEntries(day), bench, 1), bench, 1);
    expect(entryFor(e, bench)!.sets).toEqual([]);
  });
  it("drops sets beyond the prescription and keeps the later of two rows for a set", () => {
    const messy = [{ exerciseId: "ex_bench", sets: [{ setNumber: 1, reps: 5, skipped: false }, { setNumber: 1, reps: 10, skipped: false }, { setNumber: 9, reps: 10, skipped: false }] }];
    const e = normalizeEntries(day, messy);
    expect(entryFor(e, bench)!.sets).toEqual([{ setNumber: 1, reps: 10, skipped: false }]);
  });
});

describe("substitution", () => {
  it("records the swap against the exercise it replaced and clears the old sets", () => {
    let e = logSet(emptyEntries(day), bench, asPrescribed(bench, 1));
    e = substituteExercise(e, bench, "ex_pushup");
    const entry = entryFor(e, bench)!;
    expect(entry).toEqual({ exerciseId: "ex_pushup", substitutionFor: "ex_bench", sets: [] });
    expect(hasActivity(e)).toBe(true);
  });
  it("still answers the prescription after the swap, so sets count towards it", () => {
    let e = substituteExercise(emptyEntries(day), bench, "ex_pushup");
    e = logSet(e, bench, { setNumber: 1, reps: 12, skipped: false });
    expect(progress(day, e).done).toBe(1);
  });
  it("undoes the swap when the prescribed exercise is chosen again", () => {
    const e = substituteExercise(substituteExercise(emptyEntries(day), bench, "ex_pushup"), bench, "ex_bench");
    expect(entryFor(e, bench)).toEqual({ exerciseId: "ex_bench", sets: [] });
  });
});

describe("progress and status", () => {
  const all = (e = emptyEntries(day)) => [bench, row, plank].reduce((acc, p) => Array.from({ length: p.sets }, (_, i) => i + 1).reduce((a, n) => logSet(a, p, asPrescribed(p, n)), acc), e);
  it("counts the main sets only: 3 + 2 + 2", () => {
    expect(progress(day, emptyEntries(day))).toEqual({ total: 7, done: 0, skipped: 0, open: 7 });
  });
  it("is completed when every set was done, whatever the reps", () => {
    let e = all();
    e = logSet(e, bench, { setNumber: 3, reps: 8, loadKg: 20, skipped: false });
    expect(statusFor(progress(day, e))).toBe("completed");
  });
  it("is partial when some sets were done, skipped or left", () => {
    const e = skipSet(logSet(emptyEntries(day), bench, asPrescribed(bench, 1)), bench, 2);
    expect(progress(day, e)).toEqual({ total: 7, done: 1, skipped: 1, open: 5 });
    expect(statusFor(progress(day, e))).toBe("partial");
  });
  it("is skipped when nothing was done, even if sets were skipped one by one", () => {
    expect(statusFor(progress(day, skipSet(emptyEntries(day), bench, 1)))).toBe("skipped");
    expect(statusFor(progress(day, emptyEntries(day)))).toBe("skipped");
  });
  it("is not changed by a missed warm-up", () => {
    expect(statusFor(progress(day, all()))).toBe("completed");
  });
  it("uses the warm-up when it is all there is", () => {
    const only: PlanDay = { ...day, prescriptions: [warm] };
    expect(progress(only, emptyEntries(only)).total).toBe(1);
  });
});

describe("rest", () => {
  it("uses the prescribed rest, and none after the last set of the workout", () => {
    expect(restAfter(bench, false)).toBe(75);
    expect(restAfter(bench, true)).toBe(0);
    expect(restAfter({}, false)).toBe(0);
  });
});

describe("when a workout can be logged", () => {
  const base = { date: "2026-11-17", today: "2026-11-17", membershipStatus: "active", hasDraft: false };
  it("opens on its day for an active member", () => {
    expect(loggingBlockedReason(base)).toBeUndefined();
  });
  it("is closed before its day", () => {
    expect(loggingBlockedReason({ ...base, date: "2026-11-18" })).toMatch(/opens on its day/);
  });
  it("lets a draft carry on past midnight, but not for long", () => {
    expect(loggingBlockedReason({ ...base, today: "2026-11-18", hasDraft: true })).toBeUndefined();
    expect(loggingBlockedReason({ ...base, today: "2026-11-18" })).toMatch(/has passed/);
    expect(loggingBlockedReason({ ...base, today: "2026-11-19", hasDraft: true })).toMatch(/has passed/);
  });
  it("is closed when the membership is frozen, ended or missing", () => {
    expect(loggingBlockedReason({ ...base, membershipStatus: "frozen" })).toMatch(/frozen/);
    expect(loggingBlockedReason({ ...base, membershipStatus: "expired" })).toMatch(/not active/);
    expect(loggingBlockedReason({ ...base, membershipStatus: undefined })).toMatch(/front desk/);
  });
  it("is final once submitted", () => {
    expect(loggingBlockedReason({ ...base, logStatus: "completed" })).toMatch(/already logged/);
    expect(loggingBlockedReason({ ...base, logStatus: "skipped" })).toMatch(/already logged/);
    expect(loggingBlockedReason({ ...base, logStatus: "draft", hasDraft: true })).toBeUndefined();
  });
});

describe("logged sets in words", () => {
  it("says what was done", () => {
    expect(describeSet({ setNumber: 1, reps: 10, loadKg: 20, skipped: false })).toBe("10 × 20 kg");
    expect(describeSet({ setNumber: 1, reps: 12, skipped: false })).toBe("12 reps");
    expect(describeSet({ setNumber: 1, durationSec: 45, skipped: false })).toBe("45 s");
    expect(describeSet({ setNumber: 2, skipped: true })).toBe("skipped");
  });
  it("lists the sets in order", () => {
    expect(describeLogged({ sets: [{ setNumber: 1, reps: 10, loadKg: 20, skipped: false }, { setNumber: 2, reps: 10, loadKg: 20, skipped: false }, { setNumber: 3, reps: 8, loadKg: 20, skipped: false }] })).toBe("10 × 20 kg, 10 × 20 kg, 8 × 20 kg");
  });
});

describe("last time", () => {
  const log = (scheduledOn: string, sets: Array<[number, number, boolean?]>, status: "completed" | "partial" | "skipped" | "draft" = "completed") => ({
    status, scheduledOn, entries: [{ exerciseId: "ex_bench", sets: sets.map(([reps, loadKg, skipped], i) => ({ setNumber: i + 1, reps, loadKg, skipped: !!skipped })) }],
  });
  it("is the best set in the most recent finished workout: heaviest load, then most reps, not the final set", () => {
    const last = lastTimeFor([log("2026-11-03", [[10, 20]]), log("2026-11-10", [[10, 22.5], [10, 22.5], [8, 22.5]])], "ex_bench", "2026-11-17");
    expect(last).toMatchObject({ date: "2026-11-10", set: { reps: 10, loadKg: 22.5 } });
    expect(lastTimeText(last!)).toBe("Best last time: 10 × 22.5 kg");
  });
  it("prefers the heavier set even with fewer reps, and the later set only when load and reps are equal", () => {
    expect(lastTimeFor([log("2026-11-10", [[12, 20], [8, 25], [10, 22.5]])], "ex_bench", "2026-11-17")!.set).toMatchObject({ reps: 8, loadKg: 25 });
    expect(lastTimeFor([log("2026-11-10", [[8, 25], [10, 25], [9, 25]])], "ex_bench", "2026-11-17")!.set).toMatchObject({ reps: 10, loadKg: 25 });
  });
  it("picks the longest hold for exercises done for time", () => {
    const l = { status: "completed" as const, scheduledOn: "2026-11-10", entries: [{ exerciseId: "ex_plank", sets: [{ setNumber: 1, durationSec: 40, skipped: false }, { setNumber: 2, durationSec: 55, skipped: false }, { setNumber: 3, durationSec: 30, skipped: false }] }] };
    expect(lastTimeFor([l], "ex_plank", "2026-11-17")!.set.durationSec).toBe(55);
  });
  it("ignores skipped sets, skipped and draft workouts, and today and later", () => {
    const logs = [log("2026-11-03", [[10, 20]]), log("2026-11-10", [[10, 25, true]]), log("2026-11-12", [[10, 30]], "skipped"), log("2026-11-14", [[10, 30]], "draft"), log("2026-11-17", [[10, 30]])];
    expect(lastTimeFor(logs, "ex_bench", "2026-11-17")).toMatchObject({ date: "2026-11-03" });
    expect(lastTimeFor([], "ex_bench", "2026-11-17")).toBeUndefined();
    expect(lastTimeFor(logs, "ex_other", "2026-11-17")).toBeUndefined();
  });
  const last = { date: "2026-11-10", set: { setNumber: 1, reps: 10, loadKg: 22.5, skipped: false } };
  it("pre-fills last time’s reps when they are inside the range, otherwise the bottom of the range", () => {
    expect(prefillFor({ reps: { min: 8, max: 12 } }, last).reps).toBe(10);
    expect(prefillFor({ reps: { min: 8, max: 12 } }, { ...last, set: { ...last.set, reps: 15 } }).reps).toBe(8);
    expect(prefillFor({ reps: { min: 8, max: 12 } }, { ...last, set: { ...last.set, reps: 5 } }).reps).toBe(8);
    expect(prefillFor({ reps: { min: 8, max: 12 } }).reps).toBe(8);
  });
  it("keeps a fixed rep target as prescribed", () => {
    expect(prefillFor({ reps: 10 }, { ...last, set: { ...last.set, reps: 7 } }).reps).toBe(10);
  });
  it("pre-fills last time’s load, otherwise the prescribed load", () => {
    expect(prefillFor({ reps: 10, loadKg: 20 }, last).loadKg).toBe(22.5);
    expect(prefillFor({ reps: 10, loadKg: 20 }).loadKg).toBe(20);
    expect(prefillFor({ reps: 10, loadKg: 20 }, { ...last, set: { setNumber: 1, reps: 10, skipped: false } }).loadKg).toBe(20);
    expect(prefillFor({ reps: 10 }).loadKg).toBeUndefined();
  });
  it("gives a swapped exercise the reps but no load", () => {
    expect(prefillFor({ reps: { min: 8, max: 12 }, loadKg: 20 }, last, true)).toEqual({ reps: 8, loadKg: undefined });
  });
});
