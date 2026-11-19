import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { getDashboard } from "@/api/dashboard";
import { isApiError } from "@/api/errors";
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

describe("the dashboard", () => {
  it("gives the owner the whole gym and the last 30 days by default", async () => {
    const d = await getDashboard(owner);
    expect(d).toMatchObject({ from: "2026-10-19", to: "2026-11-17", scope: ["br_andheri", "br_bandra", "br_powai"] });
    expect(d.branches.map((b) => b.name)).toEqual(["Andheri", "Bandra", "Powai"]);
    expect(d.money.billedPaise).toBeGreaterThan(0);
    expect(d.money.collectedPaise).toBeGreaterThan(0);
    expect(d.dues.duePaise).toBeGreaterThan(0);
    expect(d.memberships.active).toBeGreaterThan(50);
    expect(d.heat.total).toBeGreaterThan(0);
    expect(d.utilisation.availableHours).toBeGreaterThan(0);
    expect(d.weekly.length).toBeGreaterThanOrEqual(4);
  });

  it("branch figures add up to the gym’s, for every figure that can be added", async () => {
    const all = await getDashboard(owner);
    const parts = await Promise.all(["br_andheri", "br_bandra", "br_powai"].map((b) => getDashboard(owner, { branchId: b })));
    const sum = (f: (d: typeof all) => number) => parts.reduce((n, p) => n + f(p), 0);
    expect(sum((d) => d.money.billedPaise)).toBe(all.money.billedPaise);
    expect(sum((d) => d.money.collectedPaise)).toBe(all.money.collectedPaise);
    expect(sum((d) => d.money.refundedPaise)).toBe(all.money.refundedPaise);
    expect(sum((d) => d.dues.duePaise)).toBe(all.dues.duePaise);
    expect(sum((d) => d.memberships.active)).toBe(all.memberships.active);
    expect(sum((d) => d.memberships.expiring)).toBe(all.memberships.expiring);
    expect(sum((d) => d.renewals.due)).toBe(all.renewals.due);
    expect(sum((d) => d.heat.total)).toBe(all.heat.total);
  });

  it("a branch manager’s dashboard is made only from their own branch, however it is asked", async () => {
    const bandra = await getDashboard(owner, { branchId: "br_bandra" });
    const mine = await getDashboard(bm);
    expect(mine.scope).toEqual(["br_bandra"]);
    expect(mine.branches.map((b) => b.name)).toEqual(["Bandra"]);
    expect(mine.money).toEqual(bandra.money);
    expect(mine.memberships).toEqual(bandra.memberships);
    expect(mine.heat).toEqual(bandra.heat);
    expect((await getDashboard(bm, { branchId: "all" })).scope).toEqual(["br_bandra"]);
    expect((await err(getDashboard(bm, { branchId: "br_andheri" }))).code).toBe("forbidden");
    expect((await err(getDashboard(bm, { branchId: "br_powai" }))).message).toBe("That branch isn’t one you manage.");
  });

  it("is for the owner and branch managers: desk, finance, trainers and members are refused", async () => {
    for (const id of ["u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun", "u_admin"]) expect((await err(getDashboard(as(id)))).code, id).toBe("forbidden");
  });

  it("checks the dates, and the range follows them", async () => {
    expect((await err(getDashboard(owner, { from: "2026-11-10", to: "2026-11-01" }))).message).toBe("The first date is after the last. Swap them.");
    expect((await err(getDashboard(owner, { from: "2024-01-01", to: "2026-11-01" }))).message).toBe("Choose a range of a year or less.");
    const week = await getDashboard(owner, { from: "2026-11-11", to: "2026-11-17" });
    const month = await getDashboard(owner);
    expect(week.money.collectedPaise).toBeLessThanOrEqual(month.money.collectedPaise);
    expect(week.heat.total).toBeLessThanOrEqual(month.heat.total);
  });

  it("alerts say what needs attention and where to look, and appear only when there is something", async () => {
    const d = await getDashboard(owner);
    const kinds = d.alerts.map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["expiring", "overdue", "refunds_waiting", "flagged_payments"]));
    expect(d.alerts.every((a) => a.report && a.text && a.detail)).toBe(true);
    expect(kinds).not.toContain("cash_variance");
    await db.dayCloses.add({ id: "dc_x", tenantId: "t_pulse", branchId: "br_bandra", date: "2026-11-16", status: "closed", expectedPaise: 100_000, countedPaise: 98_000, variancePaise: -2_000, closedBy: "u_desk_bandra", closedAt: "2026-11-16T16:00:00.000Z" });
    expect((await getDashboard(owner)).alerts.map((a) => a.kind)).toContain("cash_variance");
    expect((await getDashboard(as("u_bm_bandra"))).alerts.map((a) => a.kind)).toContain("cash_variance");
    expect((await getDashboard(owner, { branchId: "br_andheri" })).alerts.map((a) => a.kind)).not.toContain("cash_variance");
  });
});
