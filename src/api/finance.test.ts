import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { createExport, getFinanceList, getReconciliation, reviewIssue, runReconciliation } from "@/api/finance";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) }; } return { code: "resolved", message: "" }; };
const finance = as("u_finance");
const desk = as("u_desk_andheri");

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("invoices and payments", () => {
  it("shows billed and collected apart, and what is still due", async () => {
    const r = await getFinanceList(finance, { view: "invoices" });
    expect(r.totals.billedPaise).toBeGreaterThan(0);
    expect(r.totals.collectedPaise).toBeGreaterThan(0);
    expect(r.totals.duePaise).toBeGreaterThan(0);
    expect(r.totals.billedPaise).not.toBe(r.totals.collectedPaise);
    expect(r.invoices.length).toBeLessThanOrEqual(25);
  });
  it("filters by branch and status, and the totals follow the filter", async () => {
    const all = await getFinanceList(finance, { view: "invoices" });
    const one = await getFinanceList(finance, { view: "invoices", branchId: "br_andheri" });
    expect(one.total).toBeLessThan(all.total);
    expect(one.invoices.every((i) => i.branchName === "Andheri")).toBe(true);
    const open = await getFinanceList(finance, { view: "invoices", status: "open" });
    expect(open.invoices.every((i) => i.status === "open")).toBe(true);
    expect(open.totals.billedPaise).toBeLessThan(all.totals.billedPaise);
  });
  it("finds an invoice by number or member name, and lists payments with their reconciliation", async () => {
    const first = (await getFinanceList(finance, { view: "invoices" })).invoices[0]!;
    expect((await getFinanceList(finance, { view: "invoices", q: first.number })).invoices.map((i) => i.id)).toContain(first.id);
    expect((await getFinanceList(finance, { view: "invoices", q: first.memberName.split(" ")[0] })).invoices.some((i) => i.memberId === first.memberId)).toBe(true);
    const p = await getFinanceList(finance, { view: "payments" });
    expect(p.payments.length).toBeGreaterThan(0);
    expect(p.payments.every((x) => ["unmatched", "matched", "flagged"].includes(x.reconciliation))).toBe(true);
  });
  it("refuses a branch the person doesn’t work in, and the front desk (who has no reports)", async () => {
    expect((await err(getFinanceList(as("u_desk_andheri"), { view: "invoices" }))).code).toBe("forbidden");
    expect((await err(getFinanceList(as("u_bm_bandra"), { view: "invoices", branchId: "br_andheri" }))).code).toBe("forbidden");
  });
});

describe("reconciliation", () => {
  it("shows the three kinds of mismatch in the seed and the repeated event", async () => {
    const r = await getReconciliation(finance);
    expect(r.issues.map((i) => i.kind).sort()).toEqual(["amount_differs", "duplicate_event", "not_in_ember", "not_settled"]);
    expect(r.totals.matchedPaise).toBeGreaterThan(0);
    expect(r.settlements.length).toBeGreaterThan(0);
  });
  it("running the match again changes nothing and writes the status onto the payments", async () => {
    const a = await runReconciliation(finance);
    const b = await runReconciliation(finance);
    expect(b).toEqual(a);
    const flagged = (await db.payments.toArray()).filter((p) => p.reconciliation.status === "flagged");
    expect(flagged).toHaveLength(2);
  });
  it("accepting a repeated event needs a note, is audited, and clears it from the list", async () => {
    const dup = (await getReconciliation(finance)).issues.find((i) => i.kind === "duplicate_event")!;
    expect((await err(reviewIssue(finance, { kind: "event", id: dup.target!.id, note: "" }))).code).toBe("invalid");
    await reviewIssue(finance, { kind: "event", id: dup.target!.id, note: "Gateway retried after a timeout" });
    expect((await getReconciliation(finance)).issues.some((i) => i.kind === "duplicate_event")).toBe(false);
    const audit = (await db.auditEvents.toArray()).filter((e) => e.entityId === dup.target!.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "record.edit", reason: "Gateway retried after a timeout", actorId: "u_finance" });
  });
  it("accepting a flagged payment keeps it accepted when matching runs again", async () => {
    const diff = (await getReconciliation(finance)).issues.find((i) => i.kind === "amount_differs")!;
    await reviewIssue(finance, { kind: "payment", id: diff.target!.id, note: "Gateway fee taken out of the payout" });
    await runReconciliation(finance);
    expect((await db.payments.get(diff.target!.id))?.reconciliation).toMatchObject({ status: "matched", reviewedBy: "u_finance" });
    expect((await getReconciliation(finance)).issues.some((i) => i.kind === "amount_differs")).toBe(false);
  });
  it("is for finance and the owner: the front desk is refused", async () => {
    expect((await err(getReconciliation(desk))).code).toBe("forbidden");
  });
});

describe("exports", () => {
  it("makes a CSV for the person’s branches, audited, with names and money but no contact details", async () => {
    const f = await createExport(finance, { kind: "payments" });
    expect(f.filename).toBe("ember-payments-all-branches-2026-11-17.csv");
    expect(f.csv.split("\r\n")[0]).toBe("Receipt,Date,Invoice number,Member id,Member,Branch,Method,Amount,Status,Reference,Reconciliation");
    expect(f.rows).toBeGreaterThan(0);
    const members = await db.members.toArray();
    for (const m of members.slice(0, 40)) { expect(f.csv).not.toContain(m.phone); if (m.email) expect(f.csv).not.toContain(m.email); }
    const audit = (await db.auditEvents.toArray()).filter((e) => e.action === "export.create");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: "u_finance" });
  });
  it("one branch only when asked, and only the branches the person has", async () => {
    const f = await createExport(finance, { kind: "invoices", branchId: "br_andheri" });
    expect(f.branchNames).toEqual(["Andheri"]);
    expect(f.csv).toContain("Andheri");
    expect(f.csv).not.toContain("Bandra");
    expect((await err(createExport(as("u_bm_bandra"), { kind: "invoices", branchId: "br_andheri" }))).code).toBe("forbidden");
  });
  it("covers refunds, credit notes and dues, and refuses the front desk and an inverted range", async () => {
    for (const kind of ["refunds", "credit_notes", "dues"] as const) expect((await createExport(finance, { kind })).csv.length).toBeGreaterThan(20);
    expect((await err(createExport(desk, { kind: "invoices" }))).code).toBe("forbidden");
    expect((await err(createExport(finance, { kind: "invoices", from: "2026-11-10", to: "2026-11-01" }))).code).toBe("invalid");
  });
});
