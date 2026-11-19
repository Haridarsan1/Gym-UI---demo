import { describe, expect, it } from "vitest";
import { cashVariance, closeProblem, expectedCash } from "@/domain/dayClose";

const pay = (amountPaise: number, receivedAt: string, extra: Record<string, string> = {}) => ({ method: "cash", status: "succeeded", amountPaise, receivedAt, branchId: "b1", ...extra });

describe("expectedCash", () => {
  it("adds cash taken at the branch that day in India time, and takes off cash handed back", () => {
    const r = expectedCash("b1", "2026-11-17", [pay(150000, "2026-11-17T05:00:00.000Z"), pay(50000, "2026-11-16T19:00:00.000Z"), pay(99900, "2026-11-17T05:00:00.000Z", { method: "upi" }), pay(1000, "2026-11-17T05:00:00.000Z", { branchId: "b2" }), pay(777, "2026-11-17T05:00:00.000Z", { status: "failed" }), pay(200, "2026-11-17T20:00:00.000Z")], [{ amountPaise: 20000, method: "cash", status: "completed", createdAt: "2026-11-17T06:00:00.000Z", branchId: "b1" }, { amountPaise: 9000, method: "upi", status: "completed", createdAt: "2026-11-17T06:00:00.000Z", branchId: "b1" }]);
    // 16 Nov 19:00 UTC is 17 Nov 00:30 in India, so it counts; 17 Nov 20:00 UTC is 18 Nov in India, so it does not.
    expect(r).toEqual({ receivedPaise: 200000, refundedPaise: 20000, expectedPaise: 180000, count: 2 });
  });
});

describe("cashVariance and closeProblem", () => {
  it("is negative when the drawer is short", () => expect(cashVariance(180000, 179800)).toBe(-200));
  it("needs a note when the count differs, and not when it matches", () => {
    const base = { expectedPaise: 180000, date: "2026-11-17", today: "2026-11-17" };
    expect(closeProblem({ ...base, countedPaise: 179800, note: "" })).toBe("The count is different from what we expected. Add a note that says why.");
    expect(closeProblem({ ...base, countedPaise: 179800, note: "Change given" })).toBeNull();
    expect(closeProblem({ ...base, countedPaise: 180000, note: "" })).toBeNull();
  });
  it("refuses a future day and a count that is not a whole number of paise", () => {
    expect(closeProblem({ expectedPaise: 0, countedPaise: 0, note: "", date: "2026-11-18", today: "2026-11-17" })).toBe("You can’t close a day that hasn’t happened yet.");
    expect(closeProblem({ expectedPaise: 0, countedPaise: -5, note: "", date: "2026-11-17", today: "2026-11-17" })).toBe("Enter the cash you counted, in rupees.");
  });
});
