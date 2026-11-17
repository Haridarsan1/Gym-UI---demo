import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { getMe } from "@/api/me";
import { getMember, listMembers } from "@/api/members";
import { isApiError } from "@/api/errors";
import { db } from "@/demo/db";
import { ensureSeeded, resetDemo, runOnce, writeAudit } from "@/demo";
import { configureSimulation, simulateNetwork } from "@/demo/simulate";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x: DemoAccount) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const rejects = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? e.code : "other";
  }
  return "resolved";
};

beforeAll(async () => {
  await resetDemo();
});

describe("seeding", () => {
  it("builds the demo gym on first use and in well under a second", async () => {
    const t = performance.now();
    await resetDemo();
    expect(performance.now() - t).toBeLessThan(1000);
    expect(await db.members.count()).toBe(150);
    expect(await db.tenants.count()).toBe(1);
  });

  it("does not seed twice", async () => {
    await ensureSeeded();
    await ensureSeeded();
    expect(await db.members.count()).toBe(150);
    expect(await db.trainerAssignments.count()).toBeGreaterThan(80);
  });

  it("keeps changes across calls, and reset puts the gym back", async () => {
    await db.members.update("mem_arjun", { name: "Changed" });
    await ensureSeeded();
    expect((await db.members.get("mem_arjun"))?.name).toBe("Changed");
    await resetDemo();
    expect((await db.members.get("mem_arjun"))?.name).toBe("Arjun Kumar");
  });
});

describe("who sees which members (S03)", () => {
  it("shows the owner every member and every branch", async () => {
    const page = await listMembers(as("u_owner"), { pageSize: 200 });
    expect(page.total).toBe(150);
    expect((await getMe(as("u_owner"))).branches.map((b) => b.name)).toEqual(["Andheri", "Bandra", "Powai"]);
  });

  it("shows a branch manager only their branch", async () => {
    const page = await listMembers(as("u_bm_bandra"), { pageSize: 200 });
    expect(page.total).toBeGreaterThan(20);
    expect(page.total).toBeLessThan(100);
    expect(new Set(page.rows.map((r) => r.branchName))).toEqual(new Set(["Bandra"]));
    expect((await getMe(as("u_bm_bandra"))).branches.map((b) => b.name)).toEqual(["Bandra"]);
  });

  it("shows front desk only their branch, and filters by search", async () => {
    const page = await listMembers(as("u_desk_andheri"), { pageSize: 200 });
    expect(new Set(page.rows.map((r) => r.branchName))).toEqual(new Set(["Andheri"]));
    const found = await listMembers(as("u_desk_andheri"), { search: "arjun" });
    expect(found.rows.map((r) => r.name)).toEqual(["Arjun Kumar"]);
  });

  it("shows a trainer only the members they train", async () => {
    const page = await listMembers(as("u_trainer_meera"), { pageSize: 200 });
    expect(page.total).toBeGreaterThan(3);
    expect(page.rows.every((r) => r.trainerId === "u_trainer_meera")).toBe(true);
    expect(page.rows.map((r) => r.name)).toContain("Arjun Kumar");
  });

  it("refuses members and platform admins the member list", async () => {
    expect(await rejects(listMembers(as("u_member_arjun")))).toBe("forbidden");
    expect(await rejects(listMembers(as("u_admin")))).toBe("forbidden");
  });

  it("lets a member open only their own record", async () => {
    expect((await getMember(as("u_member_arjun"), "mem_arjun")).name).toBe("Arjun Kumar");
    expect(await rejects(getMember(as("u_member_arjun"), "mem_005"))).toBe("forbidden");
  });

  it("ignores the role and branches a browser claims, and uses what the database says", async () => {
    const forged: Session = { ...as("u_desk_andheri"), role: "owner", branchIds: ["br_andheri", "br_bandra", "br_powai"] };
    const page = await listMembers(forged, { pageSize: 200 });
    expect(new Set(page.rows.map((r) => r.branchName))).toEqual(new Set(["Andheri"]));
    expect((await getMe(forged)).role).toBe("front_desk");
  });

  it("treats another gym’s member as not found, even for an owner", async () => {
    await db.members.add({ id: "mem_other", tenantId: "t_other", name: "Someone Else", phone: "9000000001", homeBranchId: "br_x", joinedOn: "2026-01-01", qrToken: "qr-other-123456" });
    expect(await rejects(getMember(as("u_owner"), "mem_other"))).toBe("not_found");
    expect((await listMembers(as("u_owner"), { search: "someone", pageSize: 200 })).total).toBe(0);
    await db.members.delete("mem_other");
  });

  it("returns not found for a member that does not exist", async () => {
    expect(await rejects(getMember(as("u_owner"), "mem_nope"))).toBe("not_found");
  });

  it("asks signed-out callers and unknown users to log in", async () => {
    expect(await rejects(listMembers(null))).toBe("unauthenticated");
    expect(await rejects(listMembers({ ...as("u_owner"), userId: "u_ghost" }))).toBe("unauthenticated");
  });

  it("turns away a switched-off account", async () => {
    await db.users.update("u_desk_bandra", { status: "disabled" });
    expect(await rejects(listMembers(as("u_desk_bandra")))).toBe("forbidden");
    await db.users.update("u_desk_bandra", { status: "active" });
  });
});

describe("member list details", () => {
  it("shows the membership state and plan for each member", async () => {
    const { rows } = await listMembers(as("u_owner"), { pageSize: 200 });
    const states = new Set(rows.map((r) => r.membershipStatus));
    for (const s of ["active", "frozen", "expired", "canceled", "scheduled", "pending"]) expect(states.has(s as never), s).toBe(true);
    const arjun = rows.find((r) => r.id === "mem_arjun");
    expect(arjun).toMatchObject({ membershipStatus: "active", planName: "Monthly Plus", trainerName: "Meera Joshi" });
  });

  it("filters by status and pages the results", async () => {
    const frozen = await listMembers(as("u_owner"), { status: "frozen", pageSize: 200 });
    expect(frozen.total).toBe(9);
    const p1 = await listMembers(as("u_owner"), { page: 1, pageSize: 40 });
    const p4 = await listMembers(as("u_owner"), { page: 4, pageSize: 40 });
    expect(p1.rows).toHaveLength(40);
    expect(p4.rows).toHaveLength(30);
    expect(p1.total).toBe(150);
  });

  it("shows the new trainer, not the old one, for a member who moved (A02)", async () => {
    const moved = await db.trainerAssignments.filter((a) => !!a.effectiveTo).first();
    const open = await db.trainerAssignments.where("memberId").equals(moved!.memberId).filter((a) => !a.effectiveTo).first();
    const { rows } = await listMembers(as("u_owner"), { pageSize: 200 });
    expect(rows.find((r) => r.id === moved!.memberId)?.trainerId).toBe(open!.trainerId);
    expect(open!.trainerId).not.toBe(moved!.trainerId);
  });
});

describe("idempotency and audit", () => {
  it("runs an action once per key", async () => {
    let runs = 0;
    const action = () => runOnce("payment-evt-0001", async () => ({ n: ++runs }));
    const [a, b] = await Promise.all([action(), action()]);
    expect(runs).toBe(1);
    expect(a).toEqual(b);
    expect(await action()).toEqual({ n: 1 });
  });

  it("runs a different key separately", async () => {
    let runs = 0;
    await runOnce("key-aaaaaaaa", async () => ++runs);
    await runOnce("key-bbbbbbbb", async () => ++runs);
    expect(runs).toBe(2);
  });

  it("writes an audit event with the actor, and refuses a refund without a reason", async () => {
    const finance = { userId: "u_finance", role: "finance" as const, tenantId: "t_pulse", branchIds: [] };
    await writeAudit(finance, { action: "refund.create", reason: "Duplicate charge", entityType: "refund", entityId: "r1" });
    const events = await db.auditEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: "u_finance", actorRole: "finance", action: "refund.create", reason: "Duplicate charge", tenantId: "t_pulse" });
    await expect(writeAudit(finance, { action: "refund.create", entityType: "refund", entityId: "r2" })).rejects.toThrow(/reason is required/);
    expect(await db.auditEvents.count()).toBe(1);
  });
});

describe("network simulation", () => {
  it("fails with a retryable network error when failures are switched on, and recovers", async () => {
    configureSimulation({ failureRate: 1 });
    expect(await rejects(simulateNetwork())).toBe("network");
    expect(await rejects(listMembers(as("u_owner")))).toBe("network");
    configureSimulation({ failureRate: 0 });
    expect((await listMembers(as("u_owner"))).total).toBe(150);
  });
});
