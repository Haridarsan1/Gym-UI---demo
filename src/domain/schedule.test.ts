import { describe, expect, it } from "vitest";
import { attendanceBlockedReason, attendanceSettlement, creditRuleText, leaveConflicts, leaveProblem, mergeWindows, onLeave, rangesOverlap, weeklyProblem, windowProblem } from "@/domain/schedule";
import { slotsForDay, slotsForHorizon } from "@/domain/slots";

const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: "05:30", close: "22:30" }));
// 2026-11-17 is a Tuesday (weekday 2). “Now” is 12:00 in India, the day before the sessions below.
const base = { branchHours: hours, sessionMinutes: 60, busy: [], nowIso: "2026-11-16T06:30:00.000Z", today: "2026-11-16", horizonDays: 14 };
const tuesday = [{ weekday: 2, start: "06:00", end: "09:00" }];

describe("leave", () => {
  it("covers every day from the first to the last, both included, and not a canceled one", () => {
    const leave = [{ from: "2026-11-20", to: "2026-11-22" }];
    expect(["2026-11-19", "2026-11-20", "2026-11-22", "2026-11-23"].map((d) => onLeave(d, leave))).toEqual([false, true, true, false]);
    expect(onLeave("2026-11-21", [{ from: "2026-11-20", to: "2026-11-22", canceledAt: "2026-11-18T00:00:00.000Z" }])).toBe(false);
  });

  it("is refused when it starts in the past, ends before it starts, or runs over 90 days", () => {
    const today = "2026-11-17";
    expect(leaveProblem({ from: "2026-11-16", to: "2026-11-18" }, today)).toMatch(/past/);
    expect(leaveProblem({ from: "2026-11-20", to: "2026-11-19" }, today)).toMatch(/before the first/);
    expect(leaveProblem({ from: "2026-11-20", to: "2027-03-01" }, today)).toMatch(/90 days/);
    expect(leaveProblem({ from: "2026-11-17", to: "2026-11-17" }, today)).toBeUndefined();
    expect(leaveProblem({ from: "", to: "" }, today)).toMatch(/Choose/);
  });

  it("overlap is inclusive", () => {
    expect(rangesOverlap({ from: "2026-11-01", to: "2026-11-05" }, { from: "2026-11-05", to: "2026-11-09" })).toBe(true);
    expect(rangesOverlap({ from: "2026-11-01", to: "2026-11-04" }, { from: "2026-11-05", to: "2026-11-09" })).toBe(false);
  });

  it("blocks new bookings on those days and no others", () => {
    const leave = [{ from: "2026-11-17", to: "2026-11-17" }];
    expect(slotsForDay({ ...base, date: "2026-11-17", availability: tuesday, leave })).toEqual([]);
    expect(slotsForDay({ ...base, date: "2026-11-17", availability: tuesday }).map((s) => s.time)).toEqual(["06:00", "07:00", "08:00"]);
    // The next Tuesday is free again.
    expect(slotsForDay({ ...base, date: "2026-11-24", availability: tuesday, leave }).length).toBe(3);
    const days = slotsForHorizon({ ...base, availability: tuesday, leave }).map((d) => d.date);
    expect(days).not.toContain("2026-11-17");
    expect(days).toContain("2026-11-24");
  });
});

describe("shifts and windows", () => {
  it("a shift adds hours on its date and does not change other weeks", () => {
    const shifts = [{ date: "2026-11-17", start: "17:00", end: "19:00" }];
    expect(slotsForDay({ ...base, date: "2026-11-17", availability: tuesday, shifts }).map((s) => s.time)).toEqual(["06:00", "07:00", "08:00", "17:00", "18:00"]);
    expect(slotsForDay({ ...base, date: "2026-11-24", availability: tuesday, shifts }).map((s) => s.time)).toEqual(["06:00", "07:00", "08:00"]);
  });

  it("a shift on a day with no weekly window makes the day bookable", () => {
    expect(slotsForDay({ ...base, date: "2026-11-22", availability: tuesday, shifts: [{ date: "2026-11-22", start: "08:00", end: "10:00" }] }).map((s) => s.time)).toEqual(["08:00", "09:00"]);
  });

  it("overlapping windows are merged so a session is never offered twice", () => {
    expect(mergeWindows([{ start: "06:00", end: "09:00" }, { start: "08:00", end: "11:00" }, { start: "17:00", end: "18:00" }])).toEqual([{ start: "06:00", end: "11:00" }, { start: "17:00", end: "18:00" }]);
    const shifts = [{ date: "2026-11-17", start: "08:00", end: "10:00" }];
    const times = slotsForDay({ ...base, date: "2026-11-17", availability: tuesday, shifts }).map((s) => s.time);
    expect(times).toEqual(["06:00", "07:00", "08:00", "09:00"]);
    expect(new Set(times).size).toBe(times.length);
  });

  it("says what is wrong with a window", () => {
    expect(windowProblem({ start: "9am", end: "10:00" })).toMatch(/hours and minutes/);
    expect(windowProblem({ start: "10:00", end: "09:00" })).toMatch(/after the start/);
    expect(windowProblem({ start: "10:00", end: "10:20" })).toMatch(/30 minutes/);
    expect(windowProblem({ start: "10:00", end: "12:00" })).toBeUndefined();
  });

  it("a weekly pattern can’t put the trainer in two places at once", () => {
    const w = (weekday: number, start: string, end: string, branchId = "a") => ({ weekday, start, end, branchId });
    expect(weeklyProblem([w(1, "06:00", "09:00"), w(1, "08:00", "10:00", "b")])).toMatch(/overlap/);
    expect(weeklyProblem([w(1, "06:00", "09:00"), w(1, "09:00", "10:00", "b"), w(2, "06:00", "09:00")])).toBeUndefined();
  });
});

describe("leave conflicts", () => {
  const b = (id: string, startsAt: string, extra: Record<string, string> = {}) => ({ id, kind: "pt_session", status: "booked", startsAt, ...extra });
  const leave = [{ from: "2026-11-19", to: "2026-11-20" }];
  const now = "2026-11-17T06:30:00.000Z";

  it("lists booked sessions that have not started and fall on leave days, earliest first", () => {
    const rows = [b("c", "2026-11-20T11:30:00.000Z"), b("a", "2026-11-19T12:30:00.000Z"), b("x", "2026-11-21T01:30:00.000Z")];
    expect(leaveConflicts(rows, leave, now).map((r) => r.booking.id)).toEqual(["a", "c"]);
  });

  it("leaves out canceled, finished and class bookings and canceled leave", () => {
    const rows = [b("k", "2026-11-19T12:30:00.000Z", { status: "canceled" }), b("n", "2026-11-19T12:30:00.000Z", { status: "no_show" }), b("cl", "2026-11-19T12:30:00.000Z", { kind: "class" })];
    expect(leaveConflicts(rows, leave, now)).toEqual([]);
    expect(leaveConflicts([b("a", "2026-11-19T12:30:00.000Z")], [{ ...leave[0]!, canceledAt: now }], now)).toEqual([]);
  });

  it("uses the India date: 11:30 pm on the 18th is still the 18th, and 1:00 am on the 19th is the 19th", () => {
    expect(leaveConflicts([b("late", "2026-11-18T18:00:00.000Z")], leave, now)).toEqual([]);
    expect(leaveConflicts([b("early", "2026-11-18T19:30:00.000Z")], leave, now).map((r) => r.booking.id)).toEqual(["early"]);
  });
});

describe("marking attendance and the credit", () => {
  it("attended uses the credit; a no-show uses it or gives it back by the gym’s rule", () => {
    expect(attendanceSettlement("attended", true)).toBe("consume");
    expect(attendanceSettlement("attended", false)).toBe("consume");
    expect(attendanceSettlement("no_show", true)).toBe("consume");
    expect(attendanceSettlement("no_show", false)).toBe("release");
  });

  it("says the rule in words before the trainer chooses", () => {
    expect(creditRuleText("attended", false)).toBe("Uses 1 session credit");
    expect(creditRuleText("no_show", true)).toBe("Uses 1 session credit");
    expect(creditRuleText("no_show", false)).toBe("Gives the credit back");
  });

  it("a no-show opens 15 minutes after the start, and both close 48 hours after it", () => {
    const s = { status: "booked", startsAt: "2026-11-17T11:30:00.000Z" };
    expect(attendanceBlockedReason(s, "2026-11-17T11:30:00.000Z", "attended")).toBeUndefined();
    expect(attendanceBlockedReason(s, "2026-11-17T11:44:59.000Z", "no_show")).toMatch(/15 minutes after the session starts/);
    expect(attendanceBlockedReason(s, "2026-11-17T11:45:00.000Z", "no_show")).toBeUndefined();
    expect(attendanceBlockedReason(s, "2026-11-19T11:30:00.000Z", "attended")).toBeUndefined();
    expect(attendanceBlockedReason(s, "2026-11-19T11:30:01.000Z", "attended")).toMatch(/48 hours/);
    expect(attendanceBlockedReason(s, "2026-11-19T11:30:01.000Z", "no_show")).toMatch(/48 hours/);
    // The gym’s own values change all of it.
    const rules = { noShowAfterMinutes: 30, markWindowHours: 24 };
    expect(attendanceBlockedReason(s, "2026-11-17T11:50:00.000Z", "no_show", rules)).toMatch(/30 minutes/);
    expect(attendanceBlockedReason(s, "2026-11-18T11:31:00.000Z", "attended", rules)).toMatch(/24 hours/);
  });

  it("a session can be marked from its start, once", () => {
    const s = { status: "booked", startsAt: "2026-11-17T11:30:00.000Z" };
    expect(attendanceBlockedReason(s, "2026-11-17T11:29:00.000Z")).toMatch(/when the session starts/);
    expect(attendanceBlockedReason(s, "2026-11-17T11:30:00.000Z")).toBeUndefined();
    expect(attendanceBlockedReason({ ...s, status: "attended" }, "2026-11-18T00:00:00.000Z")).toBe("Already marked attended.");
    expect(attendanceBlockedReason({ ...s, status: "no_show" }, "2026-11-18T00:00:00.000Z")).toBe("Already marked a no-show.");
    expect(attendanceBlockedReason({ ...s, status: "canceled" }, "2026-11-18T00:00:00.000Z")).toMatch(/canceled/);
  });
});
