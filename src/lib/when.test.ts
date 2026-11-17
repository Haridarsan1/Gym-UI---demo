import { describe, expect, it } from "vitest";
import { dayWord, formatDate, formatDayMonth, formatRupees, formatTime, formatWeekdayDate, freeCancellationText, greeting, whenText } from "@/lib/when";

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
    expect(freeCancellationText(deadline, "2026-11-17T06:30:00.000Z", true)).toBe("Free cancellation until 6:00 am tomorrow");
    expect(freeCancellationText("2026-11-17T13:30:00.000Z", "2026-11-17T06:30:00.000Z", true)).toBe("Free cancellation until 7:00 pm today");
  });
  it("says it ended, and what cancelling does, after the deadline", () => {
    expect(freeCancellationText(deadline, "2026-11-18T03:00:00.000Z", true)).toBe("Free cancellation ended at 6:00 am today. Cancelling now uses your credit.");
    expect(freeCancellationText(deadline, "2026-11-18T03:00:00.000Z", false)).toBe("Free cancellation ended at 6:00 am today. You can still cancel.");
  });
});
