import { describe, expect, it } from "vitest";
import { cancellationDeadline, cancellationOutcome, isFreeCancellation } from "@/domain/booking";

const starts = "2026-11-19T12:30:00.000Z"; // 6:00 pm in India on 19 Nov

describe("cancellation deadline (T04, O02)", () => {
  it("is the cutoff before the session starts", () => {
    expect(cancellationDeadline(starts, 12)).toBe("2026-11-19T00:30:00.000Z"); // 6:00 am in India
    expect(cancellationDeadline(starts, 0)).toBe(starts);
  });
  it("allows free cancellation up to and including the deadline", () => {
    expect(isFreeCancellation(starts, 12, "2026-11-19T00:29:59.000Z")).toBe(true);
    expect(isFreeCancellation(starts, 12, "2026-11-19T00:30:00.000Z")).toBe(true);
    expect(isFreeCancellation(starts, 12, "2026-11-19T00:30:01.000Z")).toBe(false);
  });
  it("releases the credit in time, uses it when late, and refuses after the start", () => {
    expect(cancellationOutcome(starts, 12, true, "2026-11-18T10:00:00.000Z")).toBe("released");
    expect(cancellationOutcome(starts, 12, true, "2026-11-19T05:00:00.000Z")).toBe("consumed");
    expect(cancellationOutcome(starts, 12, false, "2026-11-19T05:00:00.000Z")).toBe("kept");
    expect(cancellationOutcome(starts, 12, true, "2026-11-19T12:30:00.000Z")).toBe("too_late");
  });
});
