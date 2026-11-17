import { describe, expect, it } from "vitest";
import { addDays, daysBetween, eachDay, weekStart } from "@/domain/dates";
import { adherence, detectPRs, nextWorkout, planFor, scheduledBetween, streakWeeks, volumeKg, weekStats, type WeekStat } from "@/domain/metrics";
import type { PlanDay, WorkoutLog, WorkoutPlanVersion } from "@/domain/types";

const day = (dayOffset: number, canceled = false): PlanDay => ({ dayOffset, weekIndex: Math.floor(dayOffset / 7), dayIndex: 0, title: `Day ${dayOffset}`, canceled, prescriptions: [] });
const version = (id: string, startsOn: string, offsets: number[], status: "published" | "draft" = "published", canceledOffsets: number[] = []): WorkoutPlanVersion => ({
  id, tenantId: "t", memberId: "m", programId: "p", versionNumber: 1, name: id, status, startsOn, authorId: "u", days: [...offsets.map((o) => day(o)), ...canceledOffsets.map((o) => day(o, true))],
});
const log = (scheduledOn: string, status: WorkoutLog["status"], sets: Array<[number, number]> = [], exerciseId = "ex1"): WorkoutLog => ({
  id: `l_${scheduledOn}`, tenantId: "t", memberId: "m", planVersionId: "v", weekIndex: 0, dayIndex: 0, scheduledOn, status, corrections: [], enteredBy: "u", enteredByRole: "member", idempotencyKey: `k-${scheduledOn}-xx`,
  entries: [{ exerciseId, sets: sets.map(([reps, loadKg], i) => ({ setNumber: i + 1, reps, loadKg, skipped: false })) }],
});

describe("dates", () => {
  it("counts days and finds Mondays", () => {
    expect(daysBetween("2026-11-04", "2026-11-17")).toBe(13);
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(weekStart("2026-11-17")).toBe("2026-11-16"); // Tuesday -> Monday
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday belongs to the week before
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(eachDay("2026-11-01", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
});

describe("planFor: which plan applies on a date (T03, T06)", () => {
  const v1 = version("v1", "2026-09-01", [0, 2, 4, 7, 9, 11]);
  const v2 = version("v2", "2026-11-04", [0, 2, 6]);

  it("says there is no plan before the first one starts", () => {
    expect(planFor([v1, v2], "2026-08-31").state).toBe("no_plan");
    expect(planFor([], "2026-11-17").state).toBe("no_plan");
  });
  it("finds the workout on a scheduled day and a rest day otherwise", () => {
    const w = planFor([v1, v2], "2026-09-03");
    expect(w.state).toBe("workout");
    expect(w.state === "workout" && w.day.dayOffset).toBe(2);
    expect(planFor([v1, v2], "2026-09-02").state).toBe("rest");
  });
  it("lets a new version replace the old one from its start date, and leaves earlier dates alone", () => {
    expect(planFor([v1, v2], "2026-11-03").state === "workout" || planFor([v1, v2], "2026-11-03").state === "rest").toBe(true);
    const onV1 = planFor([v1, v2], "2026-10-27"); // offset 56 in v1: no such day, but still governed by v1
    expect(onV1.state === "rest" && onV1.version.id).toBe("v1");
    const on = planFor([v1, v2], "2026-11-04");
    expect(on.state === "workout" && on.version.id).toBe("v2");
    // v1 has a day at offset 63 (3 Nov onwards would be v1 days), but v2 governs from 4 Nov: 10 Nov is v2’s offset 6.
    const later = planFor([v1, v2], "2026-11-10");
    expect(later.state === "workout" && later.version.id).toBe("v2");
    expect(planFor([v1, v2], "2026-11-17").state).toBe("rest"); // offset 13 is not one of v2’s days
  });
  it("ignores drafts and canceled prescriptions", () => {
    expect(planFor([version("d", "2026-11-01", [0], "draft")], "2026-11-01").state).toBe("no_plan");
    expect(planFor([version("c", "2026-11-01", [2], "published", [0])], "2026-11-01").state).toBe("rest");
  });
  it("lists the scheduled days in a range and finds the next workout", () => {
    expect(scheduledBetween([v2], "2026-11-04", "2026-11-10").map((s) => s.date)).toEqual(["2026-11-04", "2026-11-06", "2026-11-10"]);
    expect(nextWorkout([v2], "2026-11-06")?.date).toBe("2026-11-10");
    expect(nextWorkout([v2], "2027-06-01")).toBeUndefined();
  });
});

describe("adherence (P03)", () => {
  const v = version("v", "2026-11-02", [0, 2, 4, 7]); // 2, 4, 6, 9 Nov
  const today = "2026-11-10";

  it("counts completed against scheduled days that have passed, with partial, skipped and missed apart", () => {
    const logs = [log("2026-11-02", "completed"), log("2026-11-04", "partial"), log("2026-11-06", "skipped")];
    expect(adherence([v], logs, "2026-11-01", "2026-11-30", today)).toEqual({ scheduled: 4, completed: 1, partial: 1, skipped: 1, missed: 1, extra: 0, completionRate: 0.25 });
  });
  it("leaves out days that are not over yet, and today until it is logged", () => {
    const w = version("w", "2026-11-02", [0, 8]); // 2 and 10 Nov
    expect(adherence([w], [log("2026-11-02", "completed")], "2026-11-01", "2026-11-30", today).scheduled).toBe(1);
    expect(adherence([w], [log("2026-11-02", "completed"), log("2026-11-10", "completed")], "2026-11-01", "2026-11-30", today).scheduled).toBe(2);
  });
  it("leaves out canceled prescriptions", () => {
    const c = version("c", "2026-11-02", [0], "published", [2]);
    expect(adherence([c], [], "2026-11-01", "2026-11-09", today).scheduled).toBe(1);
  });
  it("reports unscheduled activity next to the scheduled numbers, and ignores drafts", () => {
    const logs = [log("2026-11-02", "completed"), log("2026-11-03", "completed"), log("2026-11-05", "draft")];
    const a = adherence([v], logs, "2026-11-01", "2026-11-09", today);
    expect(a.extra).toBe(1);
    expect(a.completed).toBe(1);
  });
  it("shows no rate rather than zero when nothing was scheduled", () => {
    expect(adherence([], [], "2026-11-01", "2026-11-09", today).completionRate).toBeNull();
  });
});

describe("volume (P02) and personal records", () => {
  it("is the sum of load × completed reps, skipping sets without load or reps and skipped sets", () => {
    const l = log("2026-11-02", "completed", [[10, 40], [10, 40], [8, 40]]);
    expect(volumeKg(l)).toBe(1120);
    l.entries[0]!.sets.push({ setNumber: 4, skipped: true, reps: 10, loadKg: 100 }, { setNumber: 5, skipped: false, reps: 20 });
    expect(volumeKg(l)).toBe(1120);
  });

  it("calls a heavier lift a record, but not the first time an exercise is logged", () => {
    const before = [log("2026-11-02", "completed", [[10, 40]]), log("2026-11-04", "completed", [[8, 45]])];
    expect(detectPRs([], log("2026-11-06", "completed", [[10, 100]]))).toEqual([]);
    expect(detectPRs(before, log("2026-11-06", "completed", [[8, 47.5]]))).toEqual([{ exerciseId: "ex1", loadKg: 47.5, previousKg: 45 }]);
    expect(detectPRs(before, log("2026-11-06", "completed", [[10, 45]]))).toEqual([]);
  });
  it("ignores skipped workouts and drafts when finding the previous best", () => {
    const before = [log("2026-11-02", "skipped", [[10, 200]]), log("2026-11-03", "draft", [[10, 300]]), log("2026-11-04", "completed", [[8, 45]])];
    expect(detectPRs(before, log("2026-11-06", "completed", [[8, 50]]))[0]?.previousKg).toBe(45);
  });
  it("judges a substituted exercise as the exercise actually done", () => {
    const before = [log("2026-11-02", "completed", [[10, 20]], "ex_dumbbell")];
    expect(detectPRs(before, log("2026-11-06", "completed", [[10, 100]], "ex_barbell"))).toEqual([]);
    expect(detectPRs(before, log("2026-11-06", "completed", [[10, 22.5]], "ex_dumbbell"))).toHaveLength(1);
  });
});

describe("streak (weeks in a row at 75% or more)", () => {
  const w = (n: number, planned: number, done: number, frozen = false): WeekStat => ({ weekStart: addDays("2026-10-05", n * 7), planned, done, frozen });
  const current = addDays("2026-10-05", 5 * 7); // week index 5
  const streak = (weeks: WeekStat[], pct = 75) => streakWeeks(weeks, pct, current);

  it("counts weeks in a row that reach the threshold", () => {
    expect(streak([w(2, 4, 3), w(3, 4, 4), w(4, 4, 3), w(5, 4, 3)])).toBe(4);
  });
  it("breaks at a week below the threshold", () => {
    expect(streak([w(1, 4, 4), w(2, 4, 2), w(3, 4, 4), w(4, 4, 4), w(5, 4, 4)])).toBe(3);
  });
  it("treats exactly 75% as enough, and 74% as not", () => {
    expect(streak([w(4, 4, 3), w(5, 4, 3)])).toBe(2);
    expect(streak([w(4, 100, 74), w(5, 4, 4)])).toBe(1);
  });
  it("pauses on weeks with nothing planned, without breaking or adding", () => {
    expect(streak([w(3, 4, 4), w(4, 0, 0), w(5, 4, 3)])).toBe(2);
  });
  it("pauses on frozen weeks, without breaking or adding", () => {
    expect(streak([w(3, 4, 4), w(4, 4, 0, true), w(5, 4, 4)])).toBe(2);
  });
  it("does not break the streak while the current week is still short, and adds it when it reaches the threshold", () => {
    expect(streak([w(3, 4, 4), w(4, 4, 4), w(5, 4, 1)])).toBe(2);
    expect(streak([w(3, 4, 4), w(4, 4, 4), w(5, 4, 3)])).toBe(3);
  });
  it("is zero with no weeks, and uses the gym’s threshold", () => {
    expect(streak([])).toBe(0);
    expect(streak([w(4, 4, 2), w(5, 4, 2)], 50)).toBe(2);
    expect(streak([w(4, 4, 2), w(5, 4, 2)], 75)).toBe(0);
  });

  it("builds weekly numbers from a plan, logs and freezes", () => {
    const v = version("v", "2026-11-02", [0, 2, 4, 7, 9, 11]); // weeks of 2 Nov and 9 Nov, 3 each
    const logs = [log("2026-11-02", "completed"), log("2026-11-04", "partial"), log("2026-11-06", "skipped"), log("2026-11-09", "completed")];
    const stats = weekStats([v], logs, [{ from: "2026-11-09", to: "2026-11-12", reason: "Travel" }], "2026-11-02", "2026-11-17");
    expect(stats.map((s) => [s.weekStart, s.planned, s.done, s.frozen])).toEqual([["2026-11-02", 3, 2, false], ["2026-11-09", 3, 1, true], ["2026-11-16", 0, 0, false]]);
    expect(streakWeeks(stats, 75, "2026-11-16")).toBe(0); // 2/3 is 67%, so week one breaks it; the other weeks pause
  });
});
