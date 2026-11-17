import { describe, expect, it } from "vitest";
import { nextFree, slotKeyFor, slotsForDay, slotsForHorizon, weekdayOf } from "@/domain/slots";

const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, open: "05:30", close: "22:30" }));
const hours = [...week, { weekday: 6, open: "06:00", close: "20:00" }, { weekday: 0, open: "07:00", close: "13:00" }];
const windows = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, start: "06:00", end: "11:00" }, { weekday, start: "17:00", end: "21:00" }]);
const base = { availability: windows, branchHours: hours, sessionMinutes: 60, busy: [], nowIso: "2026-11-17T06:30:00.000Z", today: "2026-11-17", horizonDays: 14 };
// 17 Nov 2026 is a Tuesday; 18 Nov a Wednesday; 22 Nov a Sunday.
const times = (date: string, extra: Partial<Parameters<typeof slotsForDay>[0]> = {}) => slotsForDay({ ...base, date, ...extra }).map((s) => (s.taken ? `${s.time}x` : s.time));

describe("slots", () => {
  it("fall on the session grid inside each window the trainer is available", () => {
    expect(times("2026-11-18")).toEqual(["06:00", "07:00", "08:00", "09:00", "10:00", "17:00", "18:00", "19:00", "20:00"]);
  });
  it("never run past the end of a window", () => {
    expect(times("2026-11-18", { sessionMinutes: 90 })).toEqual(["06:00", "07:30", "09:00", "17:00", "18:30"]);
  });
  it("stay inside the branch’s opening hours", () => {
    expect(times("2026-11-21")).toEqual(["06:00", "07:00", "08:00", "09:00", "10:00", "17:00", "18:00", "19:00"]); // Saturday: closes at 20:00
    expect(times("2026-11-18", { branchHours: hours.map((h) => (h.weekday === 3 ? { ...h, open: "08:00", close: "18:00" } : h)) })).toEqual(["08:00", "09:00", "10:00", "17:00"]);
  });
  it("are empty on a day the branch is closed or the trainer is off", () => {
    expect(times("2026-11-22")).toEqual([]); // Sunday: the trainer has no windows
    expect(times("2026-11-18", { branchHours: hours.filter((h) => h.weekday !== 3) })).toEqual([]);
  });
  it("leave out times that have passed, and today’s earlier slots", () => {
    // 12:00 noon in India on Tuesday: the morning is gone, the evening is left.
    expect(times("2026-11-17")).toEqual(["17:00", "18:00", "19:00", "20:00"]);
    expect(times("2026-11-17", { nowIso: "2026-11-17T12:30:00.000Z" })).toEqual(["19:00", "20:00"]); // 18:00 in India: the 18:00 slot has started
  });
  it("stop at the booking horizon, and don’t offer yesterday", () => {
    expect(times("2026-12-01")).toHaveLength(9); // 14 days ahead
    expect(times("2026-12-02")).toEqual([]);
    expect(times("2026-11-16")).toEqual([]);
  });
  it("mark a slot taken when it overlaps a booking the trainer has", () => {
    const busy = [{ startsAt: "2026-11-18T12:30:00.000Z", endsAt: "2026-11-18T13:30:00.000Z" }]; // 18:00 to 19:00 in India
    expect(times("2026-11-18", { busy })).toEqual(["06:00", "07:00", "08:00", "09:00", "10:00", "17:00", "18:00x", "19:00", "20:00"]);
    // A booking that straddles two slots takes both.
    const half = [{ startsAt: "2026-11-18T12:00:00.000Z", endsAt: "2026-11-18T13:00:00.000Z" }]; // 17:30 to 18:30
    expect(times("2026-11-18", { busy: half })).toEqual(["06:00", "07:00", "08:00", "09:00", "10:00", "17:00x", "18:00x", "19:00", "20:00"]);
  });
  it("converts to India time: 18:00 is 12:30 UTC", () => {
    const s = slotsForDay({ ...base, date: "2026-11-18" }).find((x) => x.time === "18:00")!;
    expect(s.startsAt).toBe("2026-11-18T12:30:00.000Z");
    expect(s.endsAt).toBe("2026-11-18T13:30:00.000Z");
  });
});

describe("the horizon and suggestions", () => {
  it("lists only days that have slots", () => {
    const days = slotsForHorizon(base);
    expect(days.map((d) => d.date).slice(0, 4)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
    expect(days.some((d) => weekdayOf(d.date) === 0)).toBe(false);
  });
  it("suggests the next free slots after a moment, skipping taken ones", () => {
    const busy = [{ startsAt: "2026-11-18T12:30:00.000Z", endsAt: "2026-11-18T13:30:00.000Z" }];
    const days = slotsForHorizon({ ...base, busy });
    const next = nextFree(days, "2026-11-18T12:30:00.000Z", 3);
    expect(next.map((s) => `${s.date} ${s.time}`)).toEqual(["2026-11-18 19:00", "2026-11-18 20:00", "2026-11-19 06:00"]);
  });
  it("makes the slot key from trainer, date and local time", () => {
    expect(slotKeyFor("u_trainer_meera", "2026-11-19", "18:00")).toBe("u_trainer_meera|2026-11-19T18:00");
  });
});
