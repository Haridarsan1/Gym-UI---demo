import { describe, expect, it } from "vitest";
import { PT_CREDIT_COST, cancellationDeadline, cancellationOutcome, cancellationSettlement, canReschedule, isFreeCancellation, noShowSettlement } from "@/domain/booking";

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

describe("what happens to the reserved credit (M06)", () => {
  const before = "2026-11-18T10:00:00.000Z"; // before the 00:30 UTC deadline
  const late = "2026-11-19T05:00:00.000Z"; // after it, before the start
  it("costs one credit", () => {
    expect(PT_CREDIT_COST).toBe(1);
  });
  it("gives the credit back for a cancellation in time", () => {
    expect(cancellationSettlement(cancellationOutcome(starts, 12, true, before))).toBe("release");
  });
  it("uses the credit for a late cancellation when the policy says so, and gives it back when it does not", () => {
    expect(cancellationSettlement(cancellationOutcome(starts, 12, true, late))).toBe("consume");
    expect(cancellationSettlement(cancellationOutcome(starts, 12, false, late))).toBe("release");
  });
  it("cannot cancel a session that has started", () => {
    expect(cancellationSettlement(cancellationOutcome(starts, 12, true, "2026-11-19T12:30:00.000Z"))).toBeNull();
  });
  it("settles a no-show by the policy", () => {
    expect(noShowSettlement(true)).toBe("consume");
    expect(noShowSettlement(false)).toBe("release");
  });
  it("lets a session be moved only while cancelling would still be free", () => {
    expect(canReschedule(starts, 12, before)).toBe(true);
    expect(canReschedule(starts, 12, "2026-11-19T00:30:00.000Z")).toBe(true); // the deadline itself
    expect(canReschedule(starts, 12, late)).toBe(false);
  });
});
