import { describe, expect, it } from "vitest";
import { GST_RATES_BP, planPreview, planState, rupeesToPaise, validatePlan, validatePtPricing, type PlanDraft } from "@/domain/plans";

const ctx = { branchIds: ["br_a", "br_b"], otherNames: ["Monthly", "Annual"] };
const ok: PlanDraft = { name: "Quarterly Plus", kind: "time", pricePaise: 650_000, taxRateBp: 1800, durationDays: 90, branchIds: ["br_a"], effectiveFrom: "2026-11-17" };

describe("validatePlan", () => {
  it("accepts a good plan and says nothing", () => { expect(validatePlan(ok, ctx)).toEqual({}); });

  it("says what is wrong in words that tell the owner how to fix it", () => {
    expect(validatePlan({ ...ok, name: "  " }, ctx).name).toBe("Give the plan a name.");
    expect(validatePlan({ ...ok, name: "monthly" }, ctx).name).toBe("Another plan already has this name. Choose a different one.");
    expect(validatePlan({ ...ok, name: "x".repeat(61) }, ctx).name).toBe("Use 60 characters or fewer.");
    expect(validatePlan({ ...ok, pricePaise: null }, ctx).pricePaise).toBe("Enter the price in rupees before GST, for example 2,500.");
    expect(validatePlan({ ...ok, pricePaise: 0 }, ctx).pricePaise).toBe("A paid plan needs a price above ₹0. Choose Trial for a free plan.");
    expect(validatePlan({ ...ok, taxRateBp: 1700 }, ctx).taxRateBp).toBe("Choose a GST rate from the list.");
    expect(validatePlan({ ...ok, branchIds: [] }, ctx).branchIds).toBe("Choose at least one branch.");
    expect(validatePlan({ ...ok, branchIds: ["br_zzz"] }, ctx).branchIds).toBe("Choose branches from the list.");
    expect(validatePlan({ ...ok, effectiveTo: "2026-10-01" }, ctx).effectiveTo).toBe("The last day can’t be before the first day.");
    expect(validatePlan({ ...ok, effectiveFrom: "2026-02-30" }, ctx).effectiveFrom).toBe("Choose the first day the plan is on sale.");
    expect(validatePlan({ ...ok, maxDiscountBp: 10_001 }, ctx).maxDiscountBp).toBe("Enter a percentage from 0 to 100.");
    expect(validatePlan({ ...ok, ptCredits: 101 }, ctx).ptCredits).toBe("Enter a whole number of training sessions, 0 to 100.");
  });

  it("each kind has its own rules: a trial may be free, a visit pass needs visits and a validity", () => {
    const trial: PlanDraft = { ...ok, kind: "trial", pricePaise: 0, durationDays: 3 };
    expect(validatePlan(trial, ctx)).toEqual({});
    expect(validatePlan({ ...trial, durationDays: 15 }, ctx).durationDays).toBe("A trial runs 1 to 14 days.");
    const visit: PlanDraft = { ...ok, kind: "visit", visits: 10, durationDays: 60 };
    expect(validatePlan(visit, ctx)).toEqual({});
    expect(validatePlan({ ...visit, visits: null }, ctx).visits).toBe("Enter how many visits the pass includes, from 1 to 200.");
    expect(validatePlan({ ...visit, durationDays: 3 }, ctx).durationDays).toBe("Enter how many days the visits can be used in, from 7 to 730.");
    expect(validatePlan({ ...ok, durationDays: 731 }, ctx).durationDays).toBe("Enter how many days the plan lasts, from 1 to 730.");
  });

  it("every GST rate on offer is accepted", () => { for (const bp of GST_RATES_BP) expect(validatePlan({ ...ok, taxRateBp: bp }, ctx).taxRateBp).toBeUndefined(); });
});

describe("planState", () => {
  const p = { active: true, effectiveFrom: "2026-11-01", effectiveTo: "2026-12-31" };
  it("on sale between its dates, scheduled before, ended after, off when switched off", () => {
    expect(planState(p, "2026-11-17")).toBe("on_sale");
    expect(planState(p, "2026-10-31")).toBe("scheduled");
    expect(planState(p, "2027-01-01")).toBe("ended");
    expect(planState({ ...p, active: false }, "2026-11-17")).toBe("off");
    expect(planState({ active: true, effectiveFrom: "2026-01-01" }, "2030-01-01")).toBe("on_sale");
    expect(planState(p, "2026-11-01")).toBe("on_sale");
    expect(planState(p, "2026-12-31")).toBe("on_sale");
  });
});

describe("planPreview: what the member pays", () => {
  it("works out the bill the way an invoice does: price, GST split in two, total, and the period it covers", () => {
    const v = planPreview({ kind: "time", pricePaise: 250_000, taxRateBp: 1800, durationDays: 30 }, { startsOn: "2026-11-17", stateCode: "27" });
    expect(v).toMatchObject({ pricePaise: 250_000, taxPaise: 45_000, totalPaise: 295_000, cgstPaise: 22_500, sgstPaise: 22_500, taxSplit: "CGST 9% and SGST 9%" });
    expect(v.covers).toBe("17 Nov 2026 to 17 Dec 2026 (30 days)");
  });
  it("shows what a discount does to the bill, and tax is charged on the discounted price", () => {
    const v = planPreview({ kind: "time", pricePaise: 250_000, taxRateBp: 1800, durationDays: 30 }, { startsOn: "2026-11-17", stateCode: "27", discountBp: 1000 });
    expect(v.atDiscount).toEqual({ bp: 1000, discountPaise: 25_000, totalPaise: 265_500 });
  });
  it("describes a visit pass, a free trial without tax, and what is included", () => {
    const visit = planPreview({ kind: "visit", pricePaise: 300_000, taxRateBp: 1800, durationDays: 60, visits: 10, ptCredits: 2, classEntitlements: 1 }, { startsOn: "2026-11-17", stateCode: "27" });
    expect(visit.covers).toBe("10 visits to use between 17 Nov 2026 and 16 Jan 2027 (60 days)");
    expect(visit.includes).toEqual(["2 personal training sessions", "1 class booking"]);
    const trial = planPreview({ kind: "trial", pricePaise: 0, taxRateBp: 1800, durationDays: 3 }, { startsOn: "2026-11-17", stateCode: "27" });
    expect(trial).toMatchObject({ totalPaise: 0, taxPaise: 0 });
    expect(planPreview({ kind: "time", pricePaise: 100_000, taxRateBp: 0, durationDays: 30 }, { startsOn: "2026-11-17", stateCode: "27" }).taxSplit).toBe("");
  });
  it("an odd paisa of tax goes to SGST, so the two halves always add up", () => {
    const v = planPreview({ kind: "time", pricePaise: 100_001, taxRateBp: 500, durationDays: 30 }, { startsOn: "2026-11-17", stateCode: "27" });
    expect(v.cgstPaise + v.sgstPaise).toBe(v.taxPaise);
  });
});

describe("amounts and session pricing", () => {
  it("reads rupees as people type them", () => {
    expect(rupeesToPaise("2,500")).toBe(250_000);
    expect(rupeesToPaise("₹ 2500.5")).toBe(250_050);
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("12.345")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
  });
  it("checks session pricing", () => {
    expect(validatePtPricing({ sessionPricePaise: 80_000, taxRateBp: 1800, packs: [4, 8, 12], expiryDays: 150 })).toEqual({});
    expect(validatePtPricing({ sessionPricePaise: null, taxRateBp: 1700, packs: [4, 4], expiryDays: 10 })).toEqual({
      sessionPricePaise: "Enter the price of one session in rupees before GST, for example 800.", taxRateBp: "Choose a GST rate from the list.",
      packs: "Enter each pack as a whole number of sessions from 1 to 100, with no repeats.", expiryDays: "Enter how many days a pack lasts, from 30 to 730.",
    });
    expect(validatePtPricing({ sessionPricePaise: 80_000, taxRateBp: 1800, packs: [], expiryDays: 150 }).packs).toBe("Offer at least one pack, for example 4, 8 and 12.");
  });
});
