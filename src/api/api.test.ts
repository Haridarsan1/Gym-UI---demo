import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { getMe } from "@/api/me";
import { getMember, listMembers } from "@/api/members";
import { viewSensitive } from "@/api/sensitive";
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

describe("client health data: assessments and progress photos (S04, A05)", () => {
  const photoFor = (memberId: string, id = `ph_${memberId}`) =>
    db.measurements.put({ id, tenantId: "t_pulse", memberId, kind: "progress_photo", measuredOn: "2026-11-01", mediaRef: "blob:x", source: "member", recordedBy: "u_member_arjun", createdAt: "2026-11-01T04:30:00.000Z" });
  const setHealth = (userId: string, on: boolean) =>
    db.staffRoles.where("userId").equals(userId).modify((r) => void (r.limits.canViewClientHealth = on));
  const events = () => db.auditEvents.where("action").anyOf("assessment.view", "photo.view").toArray();

  beforeAll(async () => {
    await resetDemo();
  });

  it("starts with the switch off for every staff role in the sample gym", async () => {
    expect((await db.staffRoles.toArray()).every((r) => r.limits.canViewClientHealth === false)).toBe(true);
  });

  it("refuses an owner by default and writes no audit event for the refusal", async () => {
    await photoFor("mem_arjun");
    const before = (await events()).length;
    expect(await rejects(viewSensitive(as("u_owner"), { kind: "assessment", memberId: "mem_arjun", entityId: "asm_1" }))).toBe("forbidden");
    expect(await rejects(viewSensitive(as("u_owner"), { kind: "photo", memberId: "mem_arjun", entityId: "ph_mem_arjun" }))).toBe("forbidden");
    expect((await events()).length).toBe(before);
  });

  it("lets an owner view once the switch is on, and logs every view, repeats included", async () => {
    await setHealth("u_owner", true);
    const before = (await events()).length;
    await viewSensitive(as("u_owner"), { kind: "assessment", memberId: "mem_arjun", entityId: "asm_1" });
    await viewSensitive(as("u_owner"), { kind: "assessment", memberId: "mem_arjun", entityId: "asm_1" });
    await viewSensitive(as("u_owner"), { kind: "photo", memberId: "mem_arjun", entityId: "ph_mem_arjun" });
    const all = await events();
    expect(all.length).toBe(before + 3);
    const mine = all.filter((e) => e.actorId === "u_owner");
    expect(mine.filter((e) => e.action === "assessment.view" && e.entityId === "asm_1")).toHaveLength(2);
    expect(mine.filter((e) => e.action === "photo.view")).toHaveLength(1);
    expect(mine[0]).toMatchObject({ actorRole: "owner", tenantId: "t_pulse", memberId: "mem_arjun" });
    expect(mine.every((e) => !Number.isNaN(Date.parse(e.at)))).toBe(true);
    expect(mine.find((e) => e.action === "photo.view")).toMatchObject({ entityId: "ph_mem_arjun", entityType: "photo" });
    await setHealth("u_owner", false);
    expect(await rejects(viewSensitive(as("u_owner"), { kind: "assessment", memberId: "mem_arjun", entityId: "asm_1" }))).toBe("forbidden");
  });

  it("keeps a branch manager to their branch even with the switch on", async () => {
    await setHealth("u_bm_bandra", true);
    expect(await rejects(viewSensitive(as("u_bm_bandra"), { kind: "assessment", memberId: "mem_arjun", entityId: "asm_1" }))).toBe("forbidden"); // Andheri
    const bandra = (await db.members.where("homeBranchId").equals("br_bandra").first())!;
    await viewSensitive(as("u_bm_bandra"), { kind: "assessment", memberId: bandra.id, entityId: "asm_2" });
    await setHealth("u_bm_bandra", false);
  });

  it("still needs photo consent for an owner’s photo view", async () => {
    await setHealth("u_owner", true);
    const noConsent = (await db.members.toArray()).find((m) => m.id !== "mem_arjun" && !m.id.endsWith("x"))!;
    await db.consents.where("memberId").equals(noConsent.id).filter((c) => c.scope === "photos").delete();
    await photoFor(noConsent.id);
    expect(await rejects(viewSensitive(as("u_owner"), { kind: "photo", memberId: noConsent.id, entityId: `ph_${noConsent.id}` }))).toBe("forbidden");
    await viewSensitive(as("u_owner"), { kind: "assessment", memberId: noConsent.id, entityId: "asm_3" }); // assessments need no photo consent
    await setHealth("u_owner", false);
  });

  it("never lets front desk or finance in, even if the switch is forced on in the database", async () => {
    for (const userId of ["u_desk_andheri", "u_finance"]) await setHealth(userId, true);
    const before = (await events()).length;
    for (const userId of ["u_desk_andheri", "u_finance"]) {
      expect(await rejects(viewSensitive(as(userId), { kind: "assessment", memberId: "mem_arjun", entityId: "asm_1" })), userId).toBe("forbidden");
      expect(await rejects(viewSensitive(as(userId), { kind: "photo", memberId: "mem_arjun", entityId: "ph_mem_arjun" })), userId).toBe("forbidden");
    }
    // A platform admin has no gym, so a gym’s members do not exist for them.
    expect(await rejects(viewSensitive(as("u_admin"), { kind: "assessment", memberId: "mem_arjun", entityId: "asm_1" }))).toBe("not_found");
    expect((await events()).length).toBe(before);
    for (const userId of ["u_desk_andheri", "u_finance"]) await setHealth(userId, false);
  });

  it("lets the assigned trainer and the member view, and logs the trainer’s view but not the member’s own", async () => {
    const before = (await events()).length;
    await viewSensitive(as("u_trainer_meera"), { kind: "assessment", memberId: "mem_arjun", entityId: "asm_1" });
    await viewSensitive(as("u_member_arjun"), { kind: "photo", memberId: "mem_arjun", entityId: "ph_mem_arjun" });
    const all = await events();
    expect(all.length).toBe(before + 1);
    expect(all.filter((e) => e.actorId === "u_trainer_meera").map((e) => e.action)).toEqual(["assessment.view"]);
    expect(all.filter((e) => e.actorRole === "member")).toEqual([]);
  });

  it("refuses a trainer who does not train the member, and a member looking at someone else", async () => {
    expect(await rejects(viewSensitive(as("u_trainer_aditya"), { kind: "assessment", memberId: "mem_arjun", entityId: "asm_1" }))).toBe("forbidden");
    expect(await rejects(viewSensitive(as("u_member_arjun"), { kind: "assessment", memberId: "mem_005", entityId: "asm_9" }))).toBe("forbidden");
  });

  it("treats another gym’s member and a missing photo as not found", async () => {
    await db.members.add({ id: "mem_other2", tenantId: "t_other", name: "Someone Else", phone: "9000000002", homeBranchId: "br_x", joinedOn: "2026-01-01", qrToken: "qr-other2-123456" });
    expect(await rejects(viewSensitive(as("u_owner"), { kind: "assessment", memberId: "mem_other2", entityId: "asm_1" }))).toBe("not_found");
    expect(await rejects(viewSensitive(as("u_trainer_meera"), { kind: "photo", memberId: "mem_arjun", entityId: "ph_missing" }))).toBe("not_found");
    await db.members.delete("mem_other2");
  });
});
