import { describe, expect, it } from "vitest";
import { toPlanDays } from "@/domain/program";
import { blankDoc, initialState, reducer, type Action, type EditorState } from "@/features/trainer/program/editor";

const run = (s: EditorState, ...actions: Action[]) => actions.reduce(reducer, s);
const fresh = () => initialState(blankDoc("Block"), "2026-11-18");
const dayKey = (s: EditorState, w = 0, i = 0) => s.doc.weeks[w]!.days[i]!.key;

describe("program editor state", () => {
  it("starts clean with the first day open, and any change marks it unsaved until saved", () => {
    const s = fresh();
    expect(s.dirty).toBe(false);
    expect(s.selected).toEqual({ week: 0, dayKey: dayKey(s) });
    const typed = run(s, { type: "name", name: "Peak" });
    expect(typed.dirty).toBe(true);
    expect(run(typed, { type: "saved", at: "2026-11-17T06:30:00.000Z" })).toMatchObject({ dirty: false, savedAt: "2026-11-17T06:30:00.000Z" });
  });

  it("adds exercises with sensible defaults for the section, then edits and removes them", () => {
    let s = fresh();
    const d = dayKey(s);
    s = run(s, { type: "addRx", week: 0, dayKey: d, exerciseId: "ex_a", section: "main" }, { type: "addRx", week: 0, dayKey: d, exerciseId: "ex_b", section: "warmup" });
    const [main, warm] = s.doc.weeks[0]!.days[0]!.items;
    expect(main).toMatchObject({ sets: 3, reps: "10" });
    expect(warm).toMatchObject({ section: "warmup", reps: "", durationSec: 45 });
    s = run(s, { type: "rx", week: 0, dayKey: d, rxKey: main!.key, patch: { sets: 5, reps: "5" } });
    expect(s.doc.weeks[0]!.days[0]!.items[0]).toMatchObject({ sets: 5, reps: "5" });
    s = run(s, { type: "removeRx", week: 0, dayKey: d, rxKey: warm!.key });
    expect(s.doc.weeks[0]!.days[0]!.items).toHaveLength(1);
  });

  it("moves exercises and ignores moves that go nowhere", () => {
    let s = fresh();
    const d = dayKey(s);
    for (const id of ["a", "b", "c"]) s = run(s, { type: "addRx", week: 0, dayKey: d, exerciseId: id, section: "main" });
    const ids = () => s.doc.weeks[0]!.days[0]!.items.map((i) => i.exerciseId);
    s = run(s, { type: "moveRx", week: 0, dayKey: d, from: 2, to: 0 });
    expect(ids()).toEqual(["c", "a", "b"]);
    s = run(s, { type: "moveRx", week: 0, dayKey: d, from: 1, to: 9 });
    expect(ids()).toEqual(["c", "a", "b"]);
  });

  it("adds days on free weekdays, up to seven, and removes them", () => {
    let s = fresh();
    for (let i = 0; i < 9; i++) s = run(s, { type: "addDay", week: 0 });
    const days = s.doc.weeks[0]!.days;
    expect(days).toHaveLength(7);
    expect(new Set(days.map((d) => d.weekday)).size).toBe(7);
    s = run(s, { type: "removeDay", week: 0, dayKey: days[3]!.key });
    expect(s.doc.weeks[0]!.days).toHaveLength(6);
  });

  it("copies a day with new keys on the next free weekday", () => {
    let s = fresh();
    const d = dayKey(s);
    s = run(s, { type: "addRx", week: 0, dayKey: d, exerciseId: "a", section: "main" }, { type: "copyDay", week: 0, dayKey: d });
    const [orig, copy] = s.doc.weeks[0]!.days;
    expect(copy!.key).not.toBe(orig!.key);
    expect(copy!.weekday).not.toBe(orig!.weekday);
    expect(copy!.items[0]!.key).not.toBe(orig!.items[0]!.key);
    expect(s.selected.dayKey).toBe(copy!.key);
  });

  it("adds, copies and removes weeks, keeps one, and can add a rest week", () => {
    let s = fresh();
    s = run(s, { type: "addDay", week: 0 }, { type: "addWeek" });
    expect(s.doc.weeks).toHaveLength(2);
    expect(s.doc.weeks[1]!.days).toHaveLength(2);
    s = run(s, { type: "addWeek", rest: true });
    expect(s.doc.weeks[2]!.days).toEqual([]);
    s = run(s, { type: "copyWeek", week: 0 });
    expect(s.doc.weeks).toHaveLength(4);
    s = run(s, { type: "removeWeek", week: 3 }, { type: "removeWeek", week: 2 }, { type: "removeWeek", week: 1 }, { type: "removeWeek", week: 0 });
    expect(s.doc.weeks).toHaveLength(1);
  });

  it("replaces everything when a template is chosen, and says so", () => {
    const s = run(fresh(), { type: "replace", doc: blankDoc("From template"), startsOn: "2026-11-23" });
    expect(s).toMatchObject({ startsOn: "2026-11-23", dirty: true });
    expect(s.doc.name).toBe("From template");
  });

  it("turns into the stored days the member app reads", () => {
    let s = fresh();
    const d = dayKey(s);
    s = run(s, { type: "day", week: 0, dayKey: d, patch: { title: "Push", weekday: 2 } }, { type: "addRx", week: 0, dayKey: d, exerciseId: "ex_bench_press", section: "main" });
    expect(toPlanDays(s.doc)).toEqual([{ dayOffset: 2, weekIndex: 0, dayIndex: 0, title: "Push", canceled: false, prescriptions: [{ exerciseId: "ex_bench_press", order: 0, section: "main", sets: 3, reps: 10 }] }]);
  });
});
