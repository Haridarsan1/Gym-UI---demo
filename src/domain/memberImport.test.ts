import { describe, expect, it } from "vitest";
import { parseCsv, previewImport, TEMPLATE_CSV, type ImportContext } from "@/domain/memberImport";

const ctx: ImportContext = {
  today: "2026-11-17",
  branches: [{ id: "br_a", name: "Andheri" }, { id: "br_b", name: "Bandra" }],
  plans: [
    { id: "pl_m", name: "Monthly", kind: "time", branchIds: ["br_a", "br_b"], active: true, effectiveFrom: "2026-01-01", pricePaise: 250_000 },
    { id: "pl_v", name: "10-visit pass", kind: "visit", visits: 10, branchIds: ["br_a", "br_b"], active: true, effectiveFrom: "2026-01-01", pricePaise: 300_000 },
    { id: "pl_t", name: "3-day trial", kind: "trial", branchIds: ["br_a"], active: true, effectiveFrom: "2026-01-01", pricePaise: 0 },
    { id: "pl_x", name: "Andheri only", kind: "time", branchIds: ["br_a"], active: true, effectiveFrom: "2026-01-01", pricePaise: 100 },
  ],
  members: [{ id: "mem_040", name: "Meena Ramaswamy", phone: "9820022090", email: "meena@example.in" }],
  capacityLeft: null,
};
const H = "name,phone,email,date_of_birth,gender,branch,plan,start_date,visits_left,pt_credits,lead_source";
const file = (...lines: string[]) => [H, ...lines].join("\r\n");

describe("reading CSV", () => {
  it("handles quotes, commas and line breaks inside quotes, a byte-order mark, CRLF and blank lines", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n\n"two\nlines",z\n')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("the file as a whole", () => {
  it("says what is wrong with an empty file, missing columns, no rows or too many rows", () => {
    expect(previewImport("", ctx).fileErrors[0]).toMatch(/file is empty/);
    expect(previewImport("name,phone\r\nA B,9820011122", ctx).fileErrors[0]).toBe("The first line has to name the columns. Missing: branch. Use the template to see them all.");
    expect(previewImport(H, ctx).fileErrors[0]).toMatch(/no members/);
    expect(previewImport(file(...Array.from({ length: 501 }, (_, i) => `P ${i},9820${String(100000 + i)},,,,Bandra,,,,,`)), ctx).fileErrors[0]).toMatch(/Import up to 500 at a time/);
  });
  it("the template is itself a clean file, and extra columns are noted and ignored", () => {
    const p = previewImport(TEMPLATE_CSV, ctx);
    expect(p.fileErrors).toEqual([]);
    expect(p.counts).toEqual({ ok: 2, shared: 0, error: 0 });
    expect(previewImport("name,phone,branch,nickname\r\nA B,9820011122,Bandra,Bee", ctx).ignoredColumns).toEqual(["nickname"]);
  });
});

describe("each row", () => {
  it("a good row says what will be made; the line counts the header as line 1", () => {
    const p = previewImport(file("Asha Menon,+91 98200 11122,ASHA@example.in,09/04/1992,Female,bandra,monthly,01/11/2026,,2,Walk-in"), ctx);
    expect(p.rows[0]).toMatchObject({ line: 2, status: "ok", name: "Asha Menon", phone: "9820011122", email: "asha@example.in", dateOfBirth: "1992-04-09", gender: "female", branchId: "br_b", planId: "pl_m", startsOn: "2026-11-01", ptCredits: 2, summary: "Monthly from 1 Nov 2026, 2 training sessions" });
  });

  it("says each problem with its column, in words that tell the owner how to fix it", () => {
    const r = (line: string) => previewImport(file(line), ctx).rows[0]!.errors;
    expect(r(",98200,,,,Pune,,,,,")).toEqual(["name: Enter the member’s name.", "phone: Enter a 10-digit mobile number.", "branch: “Pune” isn’t one of your branches (Andheri, Bandra)."]);
    expect(r("A B,9820011122,not-an-email,31/02/2020,robot,Bandra,Gold,,,,")).toEqual(["email: Enter an email like name@example.in, or leave it empty.", "date_of_birth: Use the date as 17/11/2026 or 2026-11-17.", "gender: Use female, male, other or undisclosed.", "plan: “Gold” isn’t one of your plans."]);
    expect(r("A B,9820011122,,2030-01-01,,Bandra,,,,,")).toEqual(["date_of_birth: Enter a date of birth in the past, after 1920."]);
    expect(r("A B,9820011122,,,,Bandra,Andheri only,,,,")).toEqual(["plan: Andheri only isn’t sold at Bandra."]);
    expect(r("A B,9820011122,,,,Andheri,3-day trial,,,,")).toEqual(["plan: A free trial can’t be imported. Leave the plan empty."]);
    expect(r("A B,9820011122,,,,Bandra,,01/11/2026,,,")).toEqual(["start_date: A start date needs a plan."]);
    expect(r("A B,9820011122,,,,Bandra,Monthly,2027-06-01,,,")).toEqual(["start_date: A membership can start up to 60 days ahead."]);
    expect(r("A B,9820011122,,,,Bandra,Monthly,,5,,")).toEqual(["visits_left: Only a visit pass has visits left."]);
    expect(r("A B,9820011122,,,,Bandra,10-visit pass,,12,,")).toEqual(["visits_left: 10-visit pass has 10 visits, so 12 can’t be left."]);
    expect(r("A B,9820011122,,,,Bandra,,,,500,")).toEqual(["pt_credits: Enter a whole number of sessions, 0 to 200."]);
  });

  it("a person who is already a member is an error, so a file run twice adds nobody twice", () => {
    const p = previewImport(file("Meena Ramaswamy,9820022090,,,,Andheri,,,,,", "meena ramaswamy,98200 22090,,,,Andheri,,,,,"), ctx);
    expect(p.rows.map((r) => r.status)).toEqual(["error", "error"]);
    expect(p.rows[0]!.errors).toEqual(["name: Meena Ramaswamy is already a member with this phone number. Nobody is added twice."]);
  });

  it("a number or email another member has is not an error: a separate member who shares it, flagged, and who they share it with", () => {
    const p = previewImport(file("Aarav Ramaswamy,9820022090,,2010-03-14,male,Andheri,,,,,"), ctx);
    expect(p.rows[0]).toMatchObject({ status: "shared", errors: [], sharedWith: [{ name: "Meena Ramaswamy", source: "existing", id: "mem_040" }] });
    expect(previewImport(file("Aarav R,9820055555,meena@example.in,,,Andheri,,,,,"), ctx).rows[0]!.sharedWith).toHaveLength(1);
  });

  it("two rows in the file that share a number are shared with each other; the same person twice is an error", () => {
    const p = previewImport(file("Ravi Kale,9820011100,,,,Bandra,,,,,", "Sita Kale,9820011100,,,,Bandra,,,,,", "ravi kale,9820011100,,,,Bandra,,,,,"), ctx);
    expect(p.rows.map((r) => r.status)).toEqual(["ok", "shared", "error"]);
    expect(p.rows[1]!.sharedWith).toEqual([{ name: "Ravi Kale", source: "file", line: 2 }]);
    expect(p.rows[2]!.errors).toEqual(["name: Same person as line 2 of this file."]);
    expect(p.counts).toEqual({ ok: 1, shared: 1, error: 1 });
  });

  it("rows past the subscription’s member limit are refused, in order", () => {
    const p = previewImport(file("A One,9820011101,,,,Bandra,Monthly,,,,", "B Two,9820011102,,,,Bandra,Monthly,,,,", "C Three,9820011103,,,,Bandra,Monthly,,,,"), { ...ctx, capacityLeft: 2 });
    expect(p.rows.map((r) => r.status)).toEqual(["ok", "ok", "error"]);
    expect(p.rows[2]!.errors[0]).toMatch(/limit on active members is reached/);
  });
});
