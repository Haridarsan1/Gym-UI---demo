import { describe, expect, it } from "vitest";
import { cancelNowText, dayWord, lateTermsText, formatDate, formatDayMonth, formatRupees, formatTime, formatWeekdayDate, freeCancellationText, greeting, whenText } from "@/lib/when";

describe("India formats", () => {
  it("shows times as 6:30 am and 7:00 pm in India time", () => {
    expect(formatTime("2026-11-17T01:00:00.000Z")).toBe("6:30 am");
    expect(formatTime("2026-11-17T13:30:00.000Z")).toBe("7:00 pm");
    expect(formatTime("2026-11-17T18:30:00.000Z")).toBe("12:00 am"); // midnight
    expect(formatTime("2026-11-17T06:30:00.000Z")).toBe("12:00 pm");
  });
  it("shows dates as 17 Nov 2026", () => {
    expect(formatDate("2026-11-17")).toBe("17 Nov 2026");
    expect(formatDayMonth("2026-11-04")).toBe("4 Nov");
    expect(formatWeekdayDate("2026-11-20")).toBe("Fri 20 Nov");
  });
  it("shows money with Indian grouping", () => {
    expect(formatRupees(295_000)).toBe("₹2,950");
    expect(formatRupees(24_860_000)).toBe("₹2,48,600");
    expect(formatRupees(295_050)).toBe("₹2,950.50");
  });
});

describe("words for days and greetings", () => {
  it("says today, tomorrow, yesterday or the date", () => {
    expect(dayWord("2026-11-17", "2026-11-17")).toBe("today");
    expect(dayWord("2026-11-18", "2026-11-17")).toBe("tomorrow");
    expect(dayWord("2026-11-16", "2026-11-17")).toBe("yesterday");
    expect(dayWord("2026-11-20", "2026-11-17")).toBe("Fri 20 Nov");
  });
  it("greets by India time", () => {
    expect(greeting("2026-11-17T01:00:00.000Z")).toBe("Good morning"); // 6:30 am
    expect(greeting("2026-11-17T08:00:00.000Z")).toBe("Good afternoon"); // 1:30 pm
    expect(greeting("2026-11-17T13:00:00.000Z")).toBe("Good evening"); // 6:30 pm
  });
  it("uses the India date, not the UTC date, for the day word", () => {
    expect(whenText("2026-11-18T00:30:00.000Z", "2026-11-17T20:00:00.000Z")).toBe("6:00 am today"); // 18 Nov 6 am in India; it is already 18 Nov there
  });
});

describe("free cancellation line (T04)", () => {
  const deadline = "2026-11-18T00:30:00.000Z"; // 6:00 am on 18 Nov
  it("names the exact deadline while it is free", () => {
    expect(freeCancellationText(deadline, "2026-11-17T06:30:00.000Z", true)).toBe("Free cancellation until 6:00 am Wed 18 Nov");
    expect(freeCancellationText("2026-11-17T13:30:00.000Z", "2026-11-17T06:30:00.000Z", true)).toBe("Free cancellation until 7:00 pm Tue 17 Nov");
  });
  it("says it ended, and what cancelling does, after the deadline", () => {
    expect(freeCancellationText(deadline, "2026-11-18T03:00:00.000Z", true)).toBe("Free cancellation ended 6:00 am Wed 18 Nov. Cancelling now uses your credit.");
    expect(freeCancellationText(deadline, "2026-11-18T03:00:00.000Z", false)).toBe("Free cancellation ended 6:00 am Wed 18 Nov. You can still cancel.");
  });
});

describe("cancellation and no-show words", () => {
  const deadline = "2026-11-19T00:30:00.000Z"; // 6:00 am in India
  const early = "2026-11-17T06:30:00.000Z";
  const late = "2026-11-19T05:00:00.000Z";
  it("says cancelling is free, and when free cancellation ends", () => {
    expect(cancelNowText("released", deadline, early)).toBe("Cancelling now is free. Your session credit goes back to your balance. Free cancellation ends 6:00 am Thu 19 Nov.");
  });
  it("says a late cancellation uses the credit, and does not hide it", () => {
    expect(cancelNowText("consumed", deadline, late)).toBe("Free cancellation ended 6:00 am Thu 19 Nov. If you cancel now, this session credit is used and does not come back.");
  });
  it("says so when the gym does not charge for a late cancellation, and when it is too late to cancel", () => {
    expect(cancelNowText("kept", deadline, late)).toMatch(/does not take a credit for a late cancellation\. Your session credit goes back/);
    expect(cancelNowText("too_late", deadline, late)).toBe("This session has already started, so it can’t be canceled.");
  });
  it("states the late and no-show terms for each policy", () => {
    expect(lateTermsText(deadline, early, true, true)).toBe("After 6:00 am Thu 19 Nov, cancelling or not turning up uses this session credit.");
    expect(lateTermsText(deadline, early, true, false)).toBe("After 6:00 am Thu 19 Nov, cancelling uses this session credit. If you do not turn up, the credit goes back to you.");
    expect(lateTermsText(deadline, early, false, true)).toBe("You can cancel for free at any time before the session. If you do not turn up, this session credit is used.");
    expect(lateTermsText(deadline, early, false, false)).toBe("Cancelling late or not turning up does not use your session credit.");
  });
});
