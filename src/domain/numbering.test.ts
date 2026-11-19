import { describe, expect, it } from "vitest";
import { financialYear, formatNumber, prefixFor, validPrefix } from "@/domain/numbering";

describe("GST document numbers", () => {
  it("the financial year runs April to March", () => {
    expect(["2026-03-31", "2026-04-01", "2026-11-17", "2027-03-31", "2027-04-01"].map(financialYear)).toEqual(["25-26", "26-27", "26-27", "26-27", "27-28"]);
    expect(financialYear("2099-04-01")).toBe("99-00");
  });

  it("an invoice number is the branch prefix, the year and four digits, in 16 characters", () => {
    expect(formatNumber("PFAND", "26-27", 1)).toBe("PFAND/26-27/0001");
    expect(formatNumber("PFAND", "26-27", 9999)).toBe("PFAND/26-27/9999");
    expect(formatNumber("PFAND", "26-27", 1)).toHaveLength(16);
  });

  it("credit notes have their own series", () => {
    expect(prefixFor("invoice", "PFAND")).toBe("PFAND");
    expect(prefixFor("credit_note", "PFAND")).toBe("CNAND");
    expect(formatNumber(prefixFor("credit_note", "PFBAN"), "26-27", 12)).toBe("CNBAN/26-27/0012");
  });

  it("refuses what would break the 16-character rule or run out of digits", () => {
    expect(validPrefix("PF-AND")).toBe(false);
    expect(() => formatNumber("PF-AND", "26-27", 1)).toThrow(/can’t be used/);
    expect(() => formatNumber("PFANDH", "26-27", 1)).toThrow();
    expect(() => formatNumber("PFAND", "26-27", 10000)).toThrow(/9,999/);
    expect(() => formatNumber("PFAND", "26-27", 0)).toThrow();
  });
});
