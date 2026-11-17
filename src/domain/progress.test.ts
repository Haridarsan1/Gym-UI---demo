import { describe, expect, it } from "vitest";
import type { WorkoutLog } from "@/domain/types";
import { RANGES, TARGET_REACHED, chartForGoal, planCharts, completionTotals, targetReachedAt, effectiveMeasurements, goalProgress, loadedExercises, measurementError, pointsFor, rangeStart, recordTimeline, segments, strengthSeries, summarize, weekList, weeklyAttendance, weeklyVolume } from "@/domain/progress";

const log = (scheduledOn: string, entries: WorkoutLog["entries"], status: WorkoutLog["status"] = "completed"): WorkoutLog => ({
  id: `wl_${scheduledOn}`, tenantId: "t", memberId: "m", planVersionId: "v", weekIndex: 0, dayIndex: 0, scheduledOn, status, completedAt: `${scheduledOn}T08:00:00.000Z`, entries,
  enteredBy: "u", enteredByRole: "member", corrections: [], idempotencyKey: `k-${scheduledOn}`,
});
const sets = (...s: Array<[number, number]>) => s.map(([reps, loadKg], i) => ({ setNumber: i + 1, reps, loadKg, skipped: false }));

describe("ranges", () => {
  it("are whole weeks ending with this week (Tue 17 Nov 2026)", () => {
    expect(rangeStart("4w", "2026-11-17", "2026-01-05")).toBe("2026-10-26");
    expect(rangeStart("12w", "2026-11-17", "2026-01-05")).toBe("2026-08-31");
    expect(rangeStart("all", "2026-11-17", "2026-01-07")).toBe("2026-01-05");
    expect(RANGES.map((r) => r.key)).toEqual(["4w", "12w", "26w", "all"]);
  });
  it("all time starts this week when there is nothing earlier", () => {
    expect(rangeStart("all", "2026-11-17", "2026-12-01")).toBe("2026-11-16");
  });
  it("lists every Monday", () => {
    expect(weekList("2026-11-03", "2026-11-17")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });
});

describe("measurements", () => {
  it("leaves out a reading that a correction replaced, and keeps both rows in the history", () => {
    const rows = [{ id: "a" }, { id: "b", corrects: "a" }, { id: "c" }];
    expect(effectiveMeasurements(rows).map((r) => r.id)).toEqual(["b", "c"]);
  });
  it("gives baseline, latest and change for the range, and nothing when the range is empty", () => {
    const rows = [
      { kind: "weight", value: 82.4, measuredOn: "2026-09-01" }, { kind: "weight", value: 81.2, measuredOn: "2026-10-10" }, { kind: "weight", value: 80.1, measuredOn: "2026-11-10" }, { kind: "waist", value: 90, measuredOn: "2026-11-01" },
    ];
    const s = summarize(pointsFor(rows, "weight", "2026-09-01", "2026-11-17"))!;
    expect(s).toMatchObject({ baseline: { value: 82.4 }, latest: { value: 80.1 }, change: -2.3, count: 3 });
    expect(summarize(pointsFor(rows, "weight", "2026-10-26", "2026-11-17"))).toMatchObject({ baseline: { value: 80.1 }, change: 0, count: 1 });
    expect(summarize(pointsFor(rows, "weight", "2026-11-12", "2026-11-17"))).toBeNull();
    expect(summarize(pointsFor(rows, "body_fat", "2026-01-01", "2026-11-17"))).toBeNull();
  });
  it("skips a reading with no value instead of counting it as zero", () => {
    expect(pointsFor([{ kind: "weight", value: undefined, measuredOn: "2026-11-01" }], "weight", "2026-01-01", "2026-12-01")).toEqual([]);
  });
  it("breaks a series into segments where the gap is too long", () => {
    const pts = [{ date: "2026-10-01", value: 1 }, { date: "2026-10-08", value: 2 }, { date: "2026-11-12", value: 3 }, { date: "2026-11-15", value: 4 }];
    expect(segments(pts, 21).map((s) => s.length)).toEqual([2, 2]);
    expect(segments(pts, 60).map((s) => s.length)).toEqual([4]);
    expect(segments([], 21)).toEqual([]);
  });
  it("says what is wrong with a typed value, and how to fix it", () => {
    expect(measurementError("weight", 72.5)).toBeUndefined();
    expect(measurementError("weight", undefined)).toBe("Enter your weight as a number, for example 72.5.");
    expect(measurementError("weight", 5)).toBe("Enter a weight between 20 and 300 kg.");
    expect(measurementError("body_fat", 90)).toBe("Enter a body fat between 2 and 70 %.");
    expect(measurementError("waist", NaN)).toMatch(/^Enter your waist as a number/);
  });
});

describe("strength", () => {
  const logs = [
    log("2026-11-03", [{ exerciseId: "bench", sets: sets([10, 40], [10, 40], [8, 40]) }]),
    log("2026-11-10", [{ exerciseId: "bench", sets: sets([10, 42.5], [6, 45], [8, 42.5]) }, { exerciseId: "row", sets: sets([10, 30]) }]),
    log("2026-11-12", [{ exerciseId: "bench", sets: sets([10, 100]) }], "skipped"),
    log("2026-11-14", [{ exerciseId: "bench", sets: sets([10, 100]) }], "draft"),
  ];
  it("is the best set in each finished workout: heaviest load, then most reps", () => {
    expect(strengthSeries(logs, "bench")).toEqual([{ date: "2026-11-03", value: 40, reps: 10 }, { date: "2026-11-10", value: 45, reps: 6 }]);
  });
  it("has no point for a workout without the exercise, and ignores skipped and draft workouts", () => {
    expect(strengthSeries(logs, "row")).toEqual([{ date: "2026-11-10", value: 30, reps: 10 }]);
    expect(strengthSeries(logs, "squat")).toEqual([]);
  });
  it("lists the exercises with loads, the most often done first", () => {
    expect(loadedExercises(logs)).toEqual(["bench", "row"]);
  });
});

describe("weekly volume, attendance and completion", () => {
  const weeks = ["2026-11-02", "2026-11-09", "2026-11-16"];
  const logs = [log("2026-11-03", [{ exerciseId: "bench", sets: sets([10, 40], [10, 40]) }]), log("2026-11-05", [{ exerciseId: "row", sets: sets([10, 30]) }])];
  it("sums load × reps, and leaves a week with no workout as a gap, not zero", () => {
    expect(weeklyVolume(logs, weeks)).toEqual([1100, null, null]);
  });
  it("for one exercise, a week without it is a gap", () => {
    expect(weeklyVolume(logs, weeks, "bench")).toEqual([800, null, null]);
    expect(weeklyVolume(logs, weeks, "squat")).toEqual([null, null, null]);
  });
  it("counts visits, with weeks before the membership and frozen weeks as gaps and an empty week as a real zero", () => {
    expect(weeklyAttendance(["2026-11-03", "2026-11-05", "2026-11-18"], weeks, "2026-11-09", new Set())).toEqual([null, 0, 1]);
    expect(weeklyAttendance(["2026-11-03"], weeks, "2026-11-02", new Set(["2026-11-09"]))).toEqual([1, null, 0]);
  });
  it("totals completion with the rate empty when nothing was scheduled", () => {
    const t = completionTotals([{ scheduled: 4, completed: 3, partial: 1, skipped: 0, missed: 0, extra: 1, completionRate: 0.75 }, { scheduled: 2, completed: 1, partial: 0, skipped: 1, missed: 0, extra: 0, completionRate: 0.5 }]);
    expect(t).toEqual({ scheduled: 6, completed: 4, partial: 1, skipped: 1, missed: 0, extra: 1, completionRate: 4 / 6 });
    expect(completionTotals([{ scheduled: 0, completed: 0, partial: 0, skipped: 0, missed: 0, extra: 0, completionRate: null }]).completionRate).toBeNull();
    expect(completionTotals([]).completionRate).toBeNull();
  });
});

describe("personal records", () => {
  it("lists records newest first, never counting the first time an exercise is logged", () => {
    const logs = [
      log("2026-11-03", [{ exerciseId: "bench", sets: sets([10, 40]) }]),
      log("2026-11-10", [{ exerciseId: "bench", sets: sets([10, 42.5]) }, { exerciseId: "row", sets: sets([10, 30]) }]),
      log("2026-11-14", [{ exerciseId: "bench", sets: sets([10, 42.5]) }]),
      log("2026-11-17", [{ exerciseId: "bench", sets: sets([8, 45]) }, { exerciseId: "row", sets: sets([10, 32.5]) }]),
    ];
    expect(recordTimeline(logs).map((r) => `${r.date} ${r.exerciseId} ${r.previousKg}>${r.loadKg}`)).toEqual([
      "2026-11-17 bench 42.5>45", "2026-11-17 row 30>32.5", "2026-11-10 bench 40>42.5",
    ]);
  });
  it("has none for a single workout, or for skipped ones", () => {
    expect(recordTimeline([log("2026-11-03", [{ exerciseId: "bench", sets: sets([10, 40]) }])])).toEqual([]);
    expect(recordTimeline([log("2026-11-03", [{ exerciseId: "bench", sets: sets([10, 40]) }]), log("2026-11-10", [{ exerciseId: "bench", sets: sets([10, 90]) }], "skipped")])).toEqual([]);
  });
});

describe("goal progress", () => {
  it("goes up towards a higher target", () => {
    expect(goalProgress({ baseline: 40, target: 60 }, 50)).toEqual({ fraction: 0.5, reached: false });
    expect(goalProgress({ baseline: 40, target: 60 }, 61)).toEqual({ fraction: 1, reached: true });
  });
  it("goes down towards a lower target, for weight loss", () => {
    expect(goalProgress({ baseline: 82.4, target: 78 }, 80.2).fraction).toBeCloseTo(0.5, 5);
    expect(goalProgress({ baseline: 82.4, target: 78 }, 77.9)).toEqual({ fraction: 1, reached: true });
    expect(goalProgress({ baseline: 82.4, target: 78 }, 84)).toEqual({ fraction: 0, reached: false });
  });
  it("has no bar, and is not reached, without a baseline or a reading", () => {
    expect(goalProgress({ baseline: undefined, target: 78 }, 80)).toEqual({ fraction: null, reached: false });
    expect(goalProgress({ baseline: 82, target: 78 }, undefined)).toEqual({ fraction: null, reached: false });
  });
});

describe("goals and their charts", () => {
  it("finds when the target was first reached from the goal’s history", () => {
    const history = [{ at: "2026-11-01T10:00:00.000Z", note: "Goal set." }, { at: "2026-11-17T08:00:00.000Z", note: `${TARGET_REACHED} with a logged weight of 77.9 kg.` }];
    expect(targetReachedAt(history)).toBe("2026-11-17T08:00:00.000Z");
    expect(targetReachedAt([history[0]!])).toBeUndefined();
    expect(targetReachedAt([])).toBeUndefined();
  });
  it("links each goal to its chart", () => {
    expect(chartForGoal("weight", [])).toEqual({ chart: "weight" });
    expect(chartForGoal("waist", [])).toEqual({ chart: "measurement", kind: "waist" });
    expect(chartForGoal("body_fat", [])).toEqual({ chart: "measurement", kind: "body_fat" });
    expect(chartForGoal("sessions_per_week", [])).toEqual({ chart: "attendance" });
  });
  it("sends a strength goal to the first of its exercises the member has data for", () => {
    expect(chartForGoal("bench_press", ["ex_back_squat", "ex_db_bench"])).toEqual({ chart: "strength", exerciseId: "ex_db_bench" });
    expect(chartForGoal("bench_press", ["ex_bench_press", "ex_db_bench"])).toEqual({ chart: "strength", exerciseId: "ex_bench_press" });
    expect(chartForGoal("bench_press", ["ex_back_squat"])).toBeUndefined();
  });
  it("has no chart for a metric it does not know", () => {
    expect(chartForGoal("handstand_seconds", ["ex_bench_press"])).toBeUndefined();
  });
});

describe("the order of the charts", () => {
  const strength = ["ex_back_squat", "ex_db_bench"];
  it("puts the chart of a weight goal first, and the rest after", () => {
    expect(planCharts([{ metric: "weight", status: "active" }], strength)).toEqual({ linked: [{ slot: "weight" }], rest: ["measurements", "strength", "volume", "attendance"] });
  });
  it("puts a strength goal’s chart first, opened on its exercise", () => {
    const p = planCharts([{ metric: "bench_press", status: "active" }], strength);
    expect(p.linked).toEqual([{ slot: "strength", exerciseId: "ex_db_bench" }]);
    expect(p.rest).not.toContain("strength");
  });
  it("follows the order of the goals, once per chart", () => {
    const p = planCharts([{ metric: "squat", status: "active" }, { metric: "weight", status: "active" }, { metric: "deadlift", status: "active" }, { metric: "waist", status: "active" }], [...strength, "ex_deadlift"]);
    expect(p.linked.map((l) => l.slot)).toEqual(["strength", "weight", "measurements"]);
    expect(p.linked[0]).toEqual({ slot: "strength", exerciseId: "ex_back_squat" });
    expect(p.linked[2]).toEqual({ slot: "measurements", kind: "waist" });
  });
  it("ignores goals that are achieved, revised or closed, and goals it cannot chart", () => {
    expect(planCharts([{ metric: "weight", status: "achieved" }, { metric: "squat", status: "closed" }, { metric: "juggling", status: "active" }], strength).linked).toEqual([]);
  });
  it("with no active goals every chart waits under More charts", () => {
    expect(planCharts([], strength).rest).toEqual(["weight", "measurements", "strength", "volume", "attendance"]);
  });
  it("sends sessions a week to attendance", () => {
    expect(planCharts([{ metric: "sessions_per_week", status: "active" }], []).linked).toEqual([{ slot: "attendance" }]);
  });
});
