import { describe, expect, it } from "vitest";
import { SAC_FITNESS, placeOfSupplyFor, STATE_NAMES, amountDuePaise, amountInWords, invoiceTotals, isOverdue, paidPaise, stateOfGstin, taxBreakup } from "@/domain/billing";

describe("invoice totals", () => {
  it("adds 18% GST to a monthly plan: ₹2,500 + ₹450 = ₹2,950", () => {
    expect(invoiceTotals([{ quantity: 1, unitPaise: 250_000, taxRateBp: 1800 }])).toEqual({ subtotalPaise: 250_000, discountPaise: 0, taxPaise: 45_000, totalPaise: 295_000 });
  });
  it("charges tax on what is paid after a discount", () => {
    expect(invoiceTotals([{ quantity: 1, unitPaise: 250_000, taxRateBp: 1800 }], 50_000)).toEqual({ subtotalPaise: 250_000, discountPaise: 50_000, taxPaise: 36_000, totalPaise: 236_000 });
  });
  it("spreads a discount over several lines without losing a paisa", () => {
    const t = invoiceTotals([{ quantity: 1, unitPaise: 100_001, taxRateBp: 1800 }, { quantity: 2, unitPaise: 33_333, taxRateBp: 1800 }], 7);
    expect(t.discountPaise).toBe(7);
    expect(t.totalPaise).toBe(t.subtotalPaise - 7 + t.taxPaise);
  });
  it("never discounts below zero", () => {
    expect(invoiceTotals([{ quantity: 1, unitPaise: 1000, taxRateBp: 0 }], 5000).totalPaise).toBe(0);
  });
});

describe("place of supply", () => {
  it("is the branch’s state for in-gym services, whatever the member’s address", () => {
    expect(placeOfSupplyFor("27")).toBe("27");
    expect(taxBreakup(45_000, "27", placeOfSupplyFor("27"))).toEqual({ cgstPaise: 22_500, sgstPaise: 22_500, igstPaise: 0 });
  });
  it("is another state only when the service is delivered there", () => {
    expect(placeOfSupplyFor("27", "29")).toBe("29");
    expect(taxBreakup(45_000, "27", placeOfSupplyFor("27", "29")).igstPaise).toBe(45_000);
  });
});

describe("GST split", () => {
  it("splits into equal CGST and SGST inside the gym’s state", () => {
    expect(taxBreakup(45_000, "27", "27")).toEqual({ cgstPaise: 22_500, sgstPaise: 22_500, igstPaise: 0 });
  });
  it("gives an odd paisa to SGST so the parts add up", () => {
    const b = taxBreakup(45_001, "27", "27");
    expect(b.cgstPaise + b.sgstPaise).toBe(45_001);
    expect(b.sgstPaise).toBe(b.cgstPaise + 1);
  });
  it("charges IGST when the place of supply is another state", () => {
    expect(taxBreakup(45_000, "27", "29")).toEqual({ cgstPaise: 0, sgstPaise: 0, igstPaise: 45_000 });
  });
  it("reads the state from the GSTIN", () => {
    expect(stateOfGstin("27AABCP1234F1Z5")).toBe("27");
    expect(STATE_NAMES["27"]).toBe("Maharashtra");
    expect(STATE_NAMES["29"]).toBe("Karnataka");
    expect(SAC_FITNESS).toBe("999723");
  });
});

describe("amount in words", () => {
  const w = amountInWords;
  it("spells rupees with Indian grouping", () => {
    expect(w(295_000)).toBe("Rupees Two Thousand Nine Hundred Fifty Only");
    expect(w(0)).toBe("Rupees Zero Only");
    expect(w(100)).toBe("Rupees One Only");
    expect(w(1_900_000)).toBe("Rupees Nineteen Thousand Only");
    expect(w(24_860_000)).toBe("Rupees Two Lakh Forty Eight Thousand Six Hundred Only");
    expect(w(1_000_000_000)).toBe("Rupees One Crore Only");
    expect(w(123_456_789_00)).toBe("Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only");
  });
  it("adds paise", () => {
    expect(w(295_050)).toBe("Rupees Two Thousand Nine Hundred Fifty and Fifty Paise Only");
    expect(w(5)).toBe("Rupees Zero and Five Paise Only");
  });
});

describe("dues", () => {
  const inv = { totalPaise: 295_000, status: "open" as const, dueOn: "2026-11-13" };
  const pay = (amountPaise: number, status: "succeeded" | "failed" | "pending" = "succeeded") => ({ amountPaise, status });
  it("counts only successful payments", () => {
    expect(paidPaise([pay(100_000), pay(50_000, "failed"), pay(10_000, "pending")])).toBe(100_000);
    expect(amountDuePaise(inv, [pay(100_000), pay(50_000, "failed")])).toBe(195_000);
  });
  it("is overdue when money is owed and the due date has passed — but not when paid, void or not yet due", () => {
    expect(isOverdue(inv, [], "2026-11-17")).toBe(true);
    expect(isOverdue(inv, [], "2026-11-13")).toBe(false);
    expect(isOverdue(inv, [pay(295_000)], "2026-11-17")).toBe(false);
    expect(isOverdue({ ...inv, status: "void" }, [], "2026-11-17")).toBe(false);
  });
});
