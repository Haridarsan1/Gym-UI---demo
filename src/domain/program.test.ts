import { describe, expect, it } from "vitest";
import { cloneWeek, compareDays, fromPlanDays, moveItem, parseReps, summarize, toPlanDays, validateProgram, type EditorDoc, type EditorRx } from "@/domain/program";

const lib = new Map([["ex_a", { name: "Bench press", archived: false }], ["ex_b", { name: "Row", archived: false }], ["ex_old", { name: "Old lift", archived: true }]]);
const rx = (over: Partial<EditorRx> = {}): EditorRx => ({ key: "r", exerciseId: "ex_a", section: "main", sets: 3, reps: "10", ...over });
const doc = (over: Partial<EditorDoc> = {}): EditorDoc => ({ name: "Block", notes: "", weeks: [{ key: "w", days: [{ key: "d", title: "Push", weekday: 0, items: [rx()] }] }], ...over });

describe("parseReps", () => {
  it("reads a number, a range, and nothing", () => {
    expect(parseReps("10")).toBe(10);
    expect(parseReps(" 8-12 ")).toEqual({ min: 8, max: 12 });
    expect(parseReps("8 – 12")).toEqual({ min: 8, max: 12 });
    expect(parseReps("")).toBeUndefined();
  });
  it("rejects what is not reps", () => {
    for (const bad of ["abc", "12-8", "0", "1000", "-3", "8-"]) expect(parseReps(bad), bad).toBe("invalid");
  });
});

describe("toPlanDays and fromPlanDays", () => {
  const two: EditorDoc = doc({
    weeks: [
      { key: "w1", days: [{ key: "a", title: "Push", weekday: 2, items: [rx({ reps: "8-12", loadKg: 40, restSec: 90 }), rx({ key: "r2", exerciseId: "ex_b", section: "warmup", reps: "", durationSec: 60 })] }, { key: "b", title: " ", weekday: 0, items: [rx()] }] },
      { key: "w2", days: [] },
      { key: "w3", days: [{ key: "c", title: "Pull", weekday: 4, items: [rx({ cues: " slow " })] }] },
    ],
  });
  it("turns weeks and weekdays into day offsets, in weekday order, and numbers the prescriptions", () => {
    const days = toPlanDays(two);
    expect(days.map((d) => [d.dayOffset, d.weekIndex, d.dayIndex, d.title])).toEqual([[0, 0, 0, "Day 1"], [2, 0, 1, "Push"], [18, 2, 0, "Pull"]]);
    expect(days[1]!.prescriptions.map((p) => p.order)).toEqual([0, 1]);
    expect(days[1]!.prescriptions[0]).toEqual({ exerciseId: "ex_a", order: 0, section: "main", sets: 3, reps: { min: 8, max: 12 }, loadKg: 40, restSec: 90 });
    expect(days[1]!.prescriptions[1]).toEqual({ exerciseId: "ex_b", order: 1, section: "warmup", sets: 3, durationSec: 60 });
    expect(days[2]!.prescriptions[0]!.cues).toBe("slow");
  });
  it("round-trips, keeping an empty week in the middle", () => {
    const back = fromPlanDays(toPlanDays(two), 3);
    expect(back).toHaveLength(3);
    expect(back[1]!.days).toEqual([]);
    expect(toPlanDays({ weeks: back })).toEqual(toPlanDays(two));
  });
  it("derives the number of weeks from the days when not told", () => {
    expect(fromPlanDays(toPlanDays(two))).toHaveLength(3);
  });
});

describe("validateProgram", () => {
  const messages = (d: EditorDoc) => validateProgram(d, lib).map((i) => i.message);
  it("accepts a sound program", () => {
    expect(messages(doc())).toEqual([]);
  });
  it("needs a name and at least one workout", () => {
    expect(messages(doc({ name: " " }))).toEqual(["Give the program a name."]);
    expect(messages(doc({ weeks: [{ key: "w", days: [] }] }))).toEqual(["Add at least one workout day."]);
  });
  it("needs a main exercise in every workout, and one workout a day", () => {
    const d = doc({ weeks: [{ key: "w", days: [{ key: "a", title: "A", weekday: 1, items: [rx({ section: "warmup" })] }, { key: "b", title: "B", weekday: 1, items: [rx()] }] }] });
    expect(messages(d)).toEqual(expect.arrayContaining(["Week 1, Tue needs at least one main exercise.", "Week 1, Tue has two workouts on the same day."]));
  });
  it("checks every prescription and says which exercise and where", () => {
    const d = doc({ weeks: [{ key: "w", days: [{ key: "a", title: "A", weekday: 0, items: [rx({ sets: 0 }), rx({ key: "x", reps: "lots" }), rx({ key: "y", reps: "" }), rx({ key: "z", exerciseId: "ex_old" }), rx({ key: "q", exerciseId: "ex_gone" }), rx({ key: "l", loadKg: 900, restSec: 2000 })] }] }] });
    expect(messages(d)).toEqual([
      "Week 1, Mon: Bench press needs between 1 and 20 sets.",
      "Week 1, Mon: reps for Bench press should be a number like 10 or a range like 8-12.",
      "Week 1, Mon: Bench press needs reps or a duration.",
      "Week 1, Mon: Old lift is archived. Swap it for another or restore it.",
      "Week 1, Mon: An exercise isn’t in the library any more. Remove it.",
      "Week 1, Mon: the load for Bench press should be between 0 and 500 kg.",
      "Week 1, Mon: rest for Bench press should be at most 15 minutes.",
    ]);
    expect(validateProgram(d, lib).every((i) => i.weekIndex === 0 && i.dayKey === "a")).toBe(true);
  });
  it("accepts timed work with no reps", () => {
    expect(messages(doc({ weeks: [{ key: "w", days: [{ key: "a", title: "A", weekday: 0, items: [rx({ reps: "", durationSec: 45 })] }] }] }))).toEqual([]);
  });
});

describe("helpers", () => {
  it("summarises a program", () => {
    const d = toPlanDays(doc({ weeks: [{ key: "a", days: [{ key: "1", title: "A", weekday: 0, items: [rx(), rx({ exerciseId: "ex_b" })] }, { key: "2", title: "B", weekday: 3, items: [rx()] }] }, { key: "b", days: [{ key: "3", title: "A", weekday: 0, items: [rx()] }] }] }));
    expect(summarize(d)).toEqual({ weeks: 2, workouts: 3, workoutsPerWeek: 1.5, exercises: 2 });
    expect(summarize([])).toEqual({ weeks: 0, workouts: 0, workoutsPerWeek: 0, exercises: 0 });
  });
  it("moves items, and ignores moves that go nowhere", () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    const same = [1, 2, 3];
    expect(moveItem(same, 1, 1)).toBe(same);
    expect(moveItem(same, 5, 0)).toBe(same);
  });
  it("copies a week with new keys", () => {
    const w = doc().weeks[0]!;
    const c = cloneWeek(w);
    expect(c.key).not.toBe(w.key);
    expect(c.days[0]!.key).not.toBe(w.days[0]!.key);
    expect(c.days[0]!.items[0]!.key).not.toBe(w.days[0]!.items[0]!.key);
    expect(toPlanDays({ weeks: [c] })).toEqual(toPlanDays({ weeks: [w] }));
  });
  it("compares versions by day", () => {
    const a = toPlanDays(doc());
    const edited = toPlanDays(doc({ weeks: [{ key: "w", days: [{ key: "d", title: "Push", weekday: 0, items: [rx({ sets: 4 })] }, { key: "e", title: "Pull", weekday: 2, items: [rx()] }] }] }));
    expect(compareDays(a, a)).toEqual({ added: 0, removed: 0, changed: 0, same: 1 });
    expect(compareDays(a, edited)).toEqual({ added: 1, removed: 0, changed: 1, same: 0 });
    expect(compareDays(edited, a)).toEqual({ added: 0, removed: 1, changed: 1, same: 0 });
  });
});

describe("day names", () => {
  it("names days from the start date, and from Monday when there is none", async () => {
    const { dayName } = await import("@/domain/program");
    expect(dayName(undefined, 0)).toBe("Mon");
    expect(dayName("2026-11-18", 0)).toBe("Wed"); // 18 Nov 2026 is a Wednesday
    expect(dayName("2026-11-18", 5)).toBe("Mon");
    expect(dayName("2026-11-18", 2, true)).toBe("Friday");
  });
  it("finds the next Monday on or after a date", async () => {
    const { nextMonday } = await import("@/domain/program");
    expect(nextMonday("2026-11-16")).toBe("2026-11-16");
    expect(nextMonday("2026-11-17")).toBe("2026-11-23");
    expect(nextMonday("2026-11-22")).toBe("2026-11-23");
  });
  it("names the day in an error by the start date", () => {
    const d = doc({ weeks: [{ key: "w", days: [{ key: "a", title: "A", weekday: 0, items: [rx({ section: "warmup" })] }] }] });
    expect(validateProgram(d, lib, "2026-11-18").map((i) => i.message)).toEqual(["Week 1, Wed needs at least one main exercise."]);
  });
});
