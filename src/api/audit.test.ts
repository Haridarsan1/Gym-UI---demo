import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { exportAuditLog, getAuditLog } from "@/api/audit";
import { isApiError } from "@/api/errors";
import { savePolicies } from "@/api/policyScreen";
import { setMembershipGrace } from "@/api/lifecycle";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { UNLABELED } from "@/domain/auditLabels";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) }; } return { code: "resolved", message: "" }; };
const owner = as("u_owner");
const bm = as("u_bm_bandra");
let n = 0;
const key = () => `aud-key-${++n}-${Math.random().toString(36).slice(2)}`;

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("labels", () => {
  it("every action the system can write has a plain label and a group", () => { expect(UNLABELED).toEqual([]); });
});

describe("the audit log", () => {
  it("shows the owner every event, newest first, with who, what, to which record and why", async () => {
    await savePolicies(owner, { key: key(), changes: { graceDays: 3 }, reason: "Members asked" });
    setNow(new Date("2026-11-17T06:31:00.000Z"));
    await setMembershipGrace(as("u_desk_andheri"), { memberId: "mem_arjun", graceDays: 5, reason: "Away on work", key: key() });
    const v = await getAuditLog(owner);
    expect(v.rows[0]).toMatchObject({ label: "Grace period changed", actor: "Pooja Nair", role: "Front desk", record: "membership of Arjun Kumar", member: "Arjun Kumar", reason: "Away on work" });
    expect(v.rows[1]).toMatchObject({ label: "Policy changed", actor: "Neha Kulkarni", reason: "Members asked" });
    expect(v.rows[1]!.details.some((d) => d.value.includes("3 days"))).toBe(true);
    expect(v.total).toBe(v.matching);
    expect(v.scopeNote).toBe("Everything in the gym.");
  });

  it("filters by who did it, by kind and by date", async () => {
    await savePolicies(owner, { key: key(), changes: { graceDays: 3 } });
    await setMembershipGrace(as("u_desk_andheri"), { memberId: "mem_arjun", graceDays: 5, reason: "Away on work", key: key() });
    const byActor = await getAuditLog(owner, { actorId: "u_desk_andheri" });
    expect(byActor.rows.length).toBeGreaterThan(0);
    expect(byActor.rows.every((r) => r.actorId === "u_desk_andheri")).toBe(true);
    expect(byActor.matching).toBeLessThan(byActor.total);
    const setup = await getAuditLog(owner, { group: "setup" });
    expect(setup.rows.map((r) => r.label)).toEqual(["Policy changed"]);
    expect((await getAuditLog(owner, { from: "2026-11-18" })).matching).toBe(0);
    expect((await getAuditLog(owner, { from: "2026-11-17", to: "2026-11-17", group: "memberships" })).rows[0]!.label).toBe("Grace period changed");
    expect((await getAuditLog(owner, { limit: 1 })).rows).toHaveLength(1);
  });

  it("a branch manager reads only what concerns their own branch, never another branch’s members", async () => {
    await setMembershipGrace(as("u_desk_andheri"), { memberId: "mem_arjun", graceDays: 5, reason: "Away on work", key: key() });
    await setMembershipGrace(as("u_desk_bandra"), { memberId: "mem_rahul", graceDays: 2, reason: "Waiting for salary", key: key() });
    const v = await getAuditLog(bm);
    expect(v.rows.some((r) => r.member === "Rahul Mehta")).toBe(true);
    expect(v.rows.some((r) => r.member === "Arjun Kumar")).toBe(false);
    const members = new Map((await db.members.toArray()).map((m) => [m.id, m.homeBranchId]));
    for (const r of v.rows) { const e = (await db.auditEvents.get(r.id))!; if (e.memberId) expect(members.get(e.memberId), r.id).toBe("br_bandra"); }
    expect(v.total).toBeLessThan((await getAuditLog(owner)).total);
    expect(v.actors.map((a) => a.name)).not.toContain("Pooja Nair");
    expect((await err(getAuditLog(bm, { branchId: "br_andheri" }))).code).toBe("forbidden");
    for (const id of ["u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun", "u_admin"]) expect((await err(getAuditLog(as(id)))).code, id).toBe("forbidden");
  });

  it("downloads exactly what the person may see for the filters, and the download is itself logged", async () => {
    await setMembershipGrace(as("u_desk_andheri"), { memberId: "mem_arjun", graceDays: 5, reason: "Away on work", key: key() });
    await setMembershipGrace(as("u_desk_bandra"), { memberId: "mem_rahul", graceDays: 2, reason: "Waiting for salary", key: key() });
    const mine = await exportAuditLog(bm, { group: "memberships" });
    expect(mine.csv).toContain("Rahul Mehta");
    expect(mine.csv).not.toContain("Arjun Kumar");
    expect(mine.csv.split("\r\n")[0]).toBe("When (India time),Who,Role,What,Record,Member,Reason");
    expect(mine.filename).toBe("ember-audit-log-br_bandra-2026-11-17.csv");
    const all = await exportAuditLog(owner, { group: "memberships" });
    expect(all.csv).toContain("Arjun Kumar");
    expect((await db.auditEvents.where("action").equals("export.create").toArray()).filter((e) => e.entityId === "audit")).toHaveLength(2);
    expect((await err(exportAuditLog(owner, { actorId: "u_finance", group: "setup" }))).message).toBe("There is nothing to download for these filters.");
  });
});
