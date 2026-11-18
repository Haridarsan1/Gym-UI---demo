import { describe, expect, it } from "vitest";
import { assignmentOn, currentMembership } from "@/domain/membership";

const ms = (status: "active" | "frozen" | "pending" | "scheduled" | "expired" | "canceled", startsOn: string, endsOn?: string) => ({ status, startsOn, endsOn });

describe("currentMembership", () => {
  it("prefers a live membership over a finished one", () => {
    const list = [ms("expired", "2026-01-01", "2026-02-01"), ms("active", "2026-10-20", "2026-11-20")];
    expect(currentMembership(list)?.status).toBe("active");
  });
  it("falls back to the most recently ended membership", () => {
    const list = [ms("expired", "2026-01-01", "2026-02-01"), ms("canceled", "2026-05-01", "2026-06-01")];
    expect(currentMembership(list)?.status).toBe("canceled");
  });
  it("returns nothing for a member with no memberships", () => {
    expect(currentMembership([])).toBeUndefined();
  });
});

describe("assignmentOn", () => {
  const rows = [{ id: "old", effectiveFrom: "2026-01-01", effectiveTo: "2026-10-31" }, { id: "new", effectiveFrom: "2026-11-01", effectiveTo: undefined }];
  it("gives the old trainer until the day before the new one starts", () => {
    expect(assignmentOn(rows, "2026-10-31")?.id).toBe("old");
    expect(assignmentOn(rows, "2026-11-01")?.id).toBe("new");
  });
  it("returns nothing before the first assignment", () => {
    expect(assignmentOn(rows, "2025-12-31")).toBeUndefined();
  });
});

import { includedInPlan } from "@/domain/membership";

describe("what a plan includes", () => {
  const all = ["Andheri", "Bandra", "Powai"];
  it("says time plans give unlimited visits for their length, with training and classes", () => {
    expect(includedInPlan({ kind: "time", durationDays: 30, ptCredits: 2, classEntitlements: 8 }, all, all)).toEqual(["Unlimited visits for 30 days", "Every branch", "2 personal-training sessions", "8 classes"]);
  });
  it("names the branches when the plan doesn’t cover all of them, and counts the visits of a pass", () => {
    expect(includedInPlan({ kind: "visit", visits: 20, durationDays: 90 }, all, ["Andheri", "Powai"])).toEqual(["20 visits, to use within 90 days", "Branches: Andheri and Powai"]);
    expect(includedInPlan({ kind: "visit", visits: 10 }, all, ["Andheri"])).toEqual(["10 visits", "Branch: Andheri"]);
  });
});
