import { describe, expect, it } from "vitest";
import { autoRenewTerms, planOnOffer, renewalBlockedReason, renewalQuote, renewalStart, sessionPackQuote } from "@/domain/renewal";
import type { MembershipPlan } from "@/domain/types";

const plan = (over: Partial<MembershipPlan> = {}): MembershipPlan => ({ id: "pl_monthly", tenantId: "t", name: "Monthly", kind: "time", pricePaise: 250_000, taxRateBp: 1800, durationDays: 30, branchIds: ["b1"], effectiveFrom: "2026-01-01", active: true, ...over });
const current = { status: "active" as const, endsOn: "2026-12-08", planId: "pl_monthly", terms: { pricePaise: 250_000 } };

describe("when a renewal starts", () => {
  it("is the day after the current membership ends, so no paid days are lost", () => {
    expect(renewalStart(current, "2026-11-17")).toBe("2026-12-09");
  });
  it("is today when the membership has ended, was canceled, or there is none", () => {
    expect(renewalStart({ status: "expired", endsOn: "2026-11-01" }, "2026-11-17")).toBe("2026-11-17");
    expect(renewalStart({ status: "canceled", endsOn: "2026-12-30" }, "2026-11-17")).toBe("2026-11-17");
    expect(renewalStart(undefined, "2026-11-17")).toBe("2026-11-17");
  });
  it("is today when an active membership ends today or has run out", () => {
    expect(renewalStart({ status: "active", endsOn: "2026-11-16" }, "2026-11-17")).toBe("2026-11-17");
  });
});

describe("the renewal quote", () => {
  it("shows the new dates and the price with GST before anything is paid", () => {
    const q = renewalQuote(plan(), current, "2026-11-17");
    expect(q).toMatchObject({ startsOn: "2026-12-09", endsOn: "2027-01-08", status: "scheduled", subtotalPaise: 250_000, taxPaise: 45_000, totalPaise: 295_000, samePlan: true, upgrade: false });
  });
  it("starts today as active when the old membership has ended", () => {
    expect(renewalQuote(plan(), { ...current, status: "expired", endsOn: "2026-11-01" }, "2026-11-17")).toMatchObject({ startsOn: "2026-11-17", status: "active" });
  });
  it("calls a dearer plan an upgrade and prices it from today’s catalogue, not the old terms", () => {
    const q = renewalQuote(plan({ id: "pl_plus", name: "Monthly Plus", pricePaise: 350_000, ptCredits: 2 }), current, "2026-11-17");
    expect(q).toMatchObject({ upgrade: true, samePlan: false, totalPaise: 413_000, ptCredits: 2 });
    expect(renewalQuote(plan({ pricePaise: 300_000 }), current, "2026-11-17").samePlan).toBe(true); // a price rise on the same plan is not an upgrade
    expect(renewalQuote(plan({ pricePaise: 300_000 }), current, "2026-11-17").upgrade).toBe(true);
  });
  it("carries a visit pass’s visits", () => {
    expect(renewalQuote(plan({ kind: "visit", visits: 10, durationDays: 60 }), undefined, "2026-11-17")).toMatchObject({ visits: 10, endsOn: "2027-01-16" });
  });
});

describe("what can be renewed", () => {
  it("offers only plans on sale at the member’s branch, never a free trial", () => {
    expect(planOnOffer(plan(), "b1", "2026-11-17")).toBe(true);
    expect(planOnOffer(plan(), "b2", "2026-11-17")).toBe(false);
    expect(planOnOffer(plan({ kind: "trial", pricePaise: 0 }), "b1", "2026-11-17")).toBe(false);
    expect(planOnOffer(plan({ active: false }), "b1", "2026-11-17")).toBe(false);
    expect(planOnOffer(plan({ effectiveTo: "2026-11-01" }), "b1", "2026-11-17")).toBe(false);
  });
  it("says why renewing is closed", () => {
    expect(renewalBlockedReason("frozen", undefined)).toMatch(/frozen/);
    expect(renewalBlockedReason("active", "INV-2026-0042")).toMatch(/Pay invoice INV-2026-0042 first/);
    expect(renewalBlockedReason("active", undefined)).toBeUndefined();
    expect(renewalBlockedReason("expired", undefined)).toBeUndefined();
  });
});

describe("session packs", () => {
  it("prices a pack with 18% GST", () => {
    expect(sessionPackQuote(4)).toMatchObject({ sessions: 4, subtotalPaise: 320_000, taxPaise: 57_600, totalPaise: 377_600 });
    expect(sessionPackQuote(5)).toBeUndefined();
  });
});

describe("auto-renew terms (M04)", () => {
  it("charges on the last day of the membership, with a reminder three days before", () => {
    expect(autoRenewTerms({ status: "active", endsOn: "2026-12-08" }, plan())).toEqual({ chargeOn: "2026-12-08", reminderOn: "2026-12-05", amountPaise: 295_000, newEndsOn: "2027-01-08" });
  });
  it("is not offered without an end date or when the membership isn’t active", () => {
    expect(autoRenewTerms({ status: "expired", endsOn: "2026-11-01" }, plan())).toBeUndefined();
    expect(autoRenewTerms({ status: "active" }, plan())).toBeUndefined();
  });
});
