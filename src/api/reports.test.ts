import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { closeDay } from "@/api/dayClose";
import { isApiError } from "@/api/errors";
import { exportReport, getReport, REPORT_IDS } from "@/api/reports";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) }; } return { code: "resolved", message: "" }; };
const owner = as("u_owner");
const bm = as("u_bm_bandra");

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("every report is a definition with a summary, columns and rows", () => {
  it("builds all ten for the owner, each with a definition in words", async () => {
    expect(REPORT_IDS).toHaveLength(10);
    for (const id of REPORT_IDS) {
      const r = await getReport(owner, { report: id });
      expect(r.definition.length, id).toBeGreaterThan(30);
      expect(r.columns.length, id).toBeGreaterThan(3);
      expect(r.summary, id).toHaveLength(3);
      for (const row of r.rows.slice(0, 20)) for (const col of r.columns) expect(col.key in row, `${id}.${col.key}`).toBe(true);
    }
  });
  it("has no report for leads or classes yet, and refuses a name it doesn’t know", async () => {
    expect(REPORT_IDS).not.toContain("leads");
    expect((await err(getReport(owner, { report: "leads" }))).message).toBe("Choose a report from the list.");
  });
});

describe("a branch manager’s reports are made only from their own branch", () => {
  it("every row names Bandra, whichever branch is asked for", async () => {
    for (const id of REPORT_IDS) {
      const r = await getReport(bm, { report: id, branchId: "all" });
      expect(r.branches, id).toEqual(["Bandra"]);
      if (r.columns.some((c) => c.key === "branch")) for (const row of r.rows) expect(row.branch, id).toBe("Bandra");
    }
    expect((await err(getReport(bm, { report: "invoices", branchId: "br_andheri" }))).code).toBe("forbidden");
  });
  it("the gym’s rows are the branches’ rows added together", async () => {
    for (const id of ["invoices", "collections", "dues", "memberships", "renewals", "refunds"] as const) {
      const all = await getReport(owner, { report: id });
      const parts = await Promise.all(["br_andheri", "br_bandra", "br_powai"].map((b) => getReport(owner, { report: id, branchId: b })));
      expect(parts.reduce((n, p) => n + p.rows.length, 0), id).toBe(all.rows.length);
    }
    const all = await getReport(owner, { report: "invoices" });
    const parts = await Promise.all(["br_andheri", "br_bandra", "br_powai"].map((b) => getReport(owner, { report: "invoices", branchId: b })));
    expect(parts.reduce((n, p) => n + Number(p.summary[0]!.value), 0)).toBe(Number(all.summary[0]!.value));
  });
  it("the same figures as the dashboard", async () => {
    const { getDashboard } = await import("@/api/dashboard");
    const d = await getDashboard(owner, { from: "2026-10-19", to: "2026-11-17" });
    const inv = await getReport(owner, { report: "invoices", from: "2026-10-19", to: "2026-11-17" });
    const col = await getReport(owner, { report: "collections", from: "2026-10-19", to: "2026-11-17" });
    expect(inv.summary[0]!.value).toBe(d.money.billedPaise);
    expect(col.summary[0]!.value).toBe(d.money.collectedPaise);
    expect((await getReport(owner, { report: "dues" })).summary[0]!.value).toBe(d.dues.duePaise);
    const ren = await getReport(owner, { report: "renewals", from: "2026-10-19", to: "2026-11-17" });
    expect(ren.summary[0]!.value).toBe(d.renewals.due);
    expect(ren.summary[1]!.value).toBe(d.renewals.renewed);
  });
});

describe("CSV export", () => {
  it("is exactly the rows and columns on screen, in rupees with two decimals, for the branches the person may see", async () => {
    const r = await getReport(bm, { report: "invoices" });
    const f = await exportReport(bm, { report: "invoices" });
    const lines = f.csv.trim().split("\r\n");
    expect(lines[0]).toBe(r.columns.map((c) => c.header).join(","));
    expect(lines).toHaveLength(r.rows.length + 1);
    expect(f.rows).toBe(r.rows.length);
    expect(f.csv).not.toContain("Andheri");
    expect(f.csv).not.toContain("Powai");
    expect(f.filename).toBe("ember-invoices-bandra-2026-10-19-to-2026-11-17.csv");
    expect(lines[1]).toMatch(/,\d+\.\d{2},/);
  });
  it("carries no phone numbers, emails or health records, and writes an audit event", async () => {
    const f = await exportReport(owner, { report: "memberships" });
    for (const m of (await db.members.toArray()).slice(0, 60)) { expect(f.csv).not.toContain(m.phone); if (m.email) expect(f.csv).not.toContain(m.email); }
    const audit = (await db.auditEvents.toArray()).filter((e) => e.action === "export.create");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: "u_owner", entityId: "memberships" });
  });
  it("is refused to the desk, finance, trainers and members", async () => {
    for (const id of ["u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun"]) expect((await err(exportReport(as(id), { report: "invoices" }))).code, id).toBe("forbidden");
  });
});

describe("cash day closes and the owner’s reopen", () => {
  it("lists closed days with their variance; only the owner is offered the reopen", async () => {
    await closeDay(as("u_desk_andheri"), { branchId: "br_andheri", date: "2026-11-17", countedPaise: 20_000, note: "A tip left in the drawer" });
    const o = await getReport(owner, { report: "cash" });
    expect(o.rows[0]).toMatchObject({ branch: "Andheri", expected: 0, counted: 20_000, variance: 20_000, status: "Closed", note: "A tip left in the drawer" });
    expect(o.reopenable).toEqual([{ branchId: "br_andheri", date: "2026-11-17", label: "Andheri, 2026-11-17" }]);
    expect((await getReport(bm, { report: "cash" })).rows).toHaveLength(0);
    expect((await getReport(owner, { report: "cash", branchId: "br_bandra" })).rows).toHaveLength(0);
  });
});
