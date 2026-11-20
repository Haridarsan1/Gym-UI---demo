import { describe, expect, it } from "vitest";
import { hasBranchErrors, hoursText, validateBranch, weekSummary, withinHours, type BranchDraft } from "@/domain/branchRules";
import { istDateTime } from "@/domain/dates";

const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, open: "05:30", close: "22:30" }));
const hours = [...week, { weekday: 6, open: "06:00", close: "20:00" }, { weekday: 0, open: "07:00", close: "13:00" }];
const good: BranchDraft = { address: "Hill Road, Bandra West", hours, rooms: [{ name: "Studio A", capacity: 18 }] };

describe("validating a branch", () => {
  it("accepts the demo branches", () => { expect(hasBranchErrors(validateBranch(good))).toBe(false); });

  it("says what is wrong with an opening day in words", () => {
    expect(validateBranch({ ...good, hours: [{ weekday: 1, open: "10:00", close: "09:00" }] }).days[1]).toBe("It has to open before it closes.");
    expect(validateBranch({ ...good, hours: [{ weekday: 1, open: "10:00", close: "10:00" }] }).days[1]).toBe("It has to open before it closes.");
    expect(validateBranch({ ...good, hours: [{ weekday: 1, open: "5:30", close: "22:30" }] }).days[1]).toBe("Enter the times as hours and minutes, for example 05:30.");
    expect(validateBranch({ ...good, hours: [{ weekday: 1, open: "05:30", close: "24:30" }] }).days[1]).toBe("Enter the times as hours and minutes, for example 05:30.");
    expect(validateBranch({ ...good, hours: [{ weekday: 1, open: "05:30", close: "22:30" }, { weekday: 1, open: "06:00", close: "20:00" }] }).days[1]).toBe("This day is listed twice.");
    expect(validateBranch({ ...good, hours: [] }).hours).toBe("A branch has to be open on at least one day.");
  });

  it("checks rooms: a name, no repeats, a capacity", () => {
    const e = validateBranch({ ...good, rooms: [{ name: " ", capacity: 10 }, { name: "Studio A", capacity: 0 }, { name: "studio a", capacity: null }, { name: "Cycle room", capacity: 501 }] });
    expect(e.roomRows).toEqual({ 0: { name: "Give the room a name." }, 1: { capacity: "Enter how many people it holds, 1 to 500." }, 2: { name: "Another room has this name.", capacity: "Enter how many people it holds, 1 to 500." }, 3: { capacity: "Enter how many people it holds, 1 to 500." } });
    expect(validateBranch({ ...good, rooms: Array.from({ length: 21 }, (_, i) => ({ name: `Room ${i}`, capacity: 5 })) }).rooms).toBe("A branch can have up to 20 rooms.");
    expect(hasBranchErrors(validateBranch({ ...good, rooms: [] }))).toBe(false);
    expect(validateBranch({ ...good, address: "x".repeat(201) }).address).toBe("Use 200 characters or fewer.");
  });
});

describe("saying the week", () => {
  it("joins equal days and says closed days", () => {
    expect(weekSummary(hours)).toEqual(["Mon to Fri 5:30 am to 10:30 pm", "Sat 6 am to 8 pm", "Sun 7 am to 1 pm"]);
    expect(weekSummary(hours.filter((h) => h.weekday !== 0 && h.weekday !== 3))).toEqual(["Mon to Tue 5:30 am to 10:30 pm", "Wed Closed", "Thu to Fri 5:30 am to 10:30 pm", "Sat 6 am to 8 pm", "Sun Closed"]);
    expect(hoursText(undefined)).toBe("Closed");
  });

  it("a session is inside the hours when it starts after opening and ends by closing, in India time", () => {
    const monday = "2026-11-16";
    expect(withinHours(hours, istDateTime(monday, "05:30"), 60)).toBe(true);
    expect(withinHours(hours, istDateTime(monday, "05:00"), 60)).toBe(false);
    expect(withinHours(hours, istDateTime(monday, "21:30"), 60)).toBe(true);
    expect(withinHours(hours, istDateTime(monday, "22:00"), 60)).toBe(false);
    expect(withinHours(hours, istDateTime("2026-11-22", "12:00"), 60)).toBe(true); // Sunday, closes at 1 pm
    expect(withinHours(hours, istDateTime("2026-11-22", "12:30"), 60)).toBe(false);
    expect(withinHours(hours.filter((h) => h.weekday !== 0), istDateTime("2026-11-22", "09:00"), 60)).toBe(false);
  });
});
