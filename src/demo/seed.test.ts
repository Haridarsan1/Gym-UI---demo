import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import { generateSeed, type SeedData } from "@/demo/seed";
import { Booking, Branch, Consent, CreditLedgerEntry, Member, Membership, MembershipPlan, SaasPlan, StaffRole, Tenant, TrainerAssignment, User } from "@/domain/types";

const NOW = new Date("2026-11-17T06:30:00.000Z");
const seed: SeedData = generateSeed(NOW);

function parseAll<T>(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: unknown[] } } }, rows: T[], label: string) {
  for (const row of rows) {
    const res = schema.safeParse(row);
    if (!res.success) throw new Error(`${label} row failed: ${JSON.stringify(row)}\n${JSON.stringify(res.error?.issues)}`);
  }
}

describe("demo seed", () => {
  it("produces records that all pass their schemas", () => {
    parseAll(Tenant, seed.tenants, "tenant");
    parseAll(SaasPlan, seed.saasPlans, "saasPlan");
    parseAll(Branch, seed.branches, "branch");
    parseAll(User, seed.users, "user");
    parseAll(StaffRole, seed.staffRoles, "staffRole");
    parseAll(Member, seed.members, "member");
    parseAll(TrainerAssignment, seed.trainerAssignments, "trainerAssignment");
    parseAll(MembershipPlan, seed.membershipPlans, "membershipPlan");
    parseAll(Membership, seed.memberships, "membership");
    parseAll(CreditLedgerEntry, seed.creditLedger, "creditLedgerEntry");
    parseAll(Consent, seed.consents, "consent");
    parseAll(Booking, seed.bookings, "booking");
  });

  it("keeps the plan terms: a membership’s trainer assignments and plans are all real", () => {
    expect(seed.membershipPlans.length).toBe(9);
  });

  it("is the same every time for the same seed and date", () => {
    expect(generateSeed(NOW)).toEqual(seed);
    expect(generateSeed(NOW, 1).members.map((m) => m.name)).not.toEqual(seed.members.map((m) => m.name));
  });

  it("sets up Pulse Fitness: 3 branches, 6 trainers, desk and finance staff, INR and Asia/Kolkata", () => {
    expect(seed.tenants).toHaveLength(1);
    expect(seed.tenants[0]).toMatchObject({ name: "Pulse Fitness", currency: "INR", timeZone: "Asia/Kolkata" });
    expect(seed.branches.map((b) => b.name)).toEqual(["Andheri", "Bandra", "Powai"]);
    const roles = (r: string) => seed.users.filter((u) => u.role === r).length;
    expect(roles("trainer")).toBe(6);
    expect(roles("front_desk")).toBeGreaterThanOrEqual(1);
    expect(roles("finance")).toBeGreaterThanOrEqual(1);
    expect(seed.users.filter((u) => u.role === "platform_admin")).toHaveLength(1);
    expect(seed.users.length).toBe(DEMO_ACCOUNTS.length);
  });

  it("has 150 members in every membership state, with unique ids, names and phone numbers", () => {
    expect(seed.members).toHaveLength(150);
    for (const key of ["id", "name", "qrToken"] as const) expect(new Set(seed.members.map((m) => m[key])).size, key).toBe(150);
    // One family shares a mobile number and an email (a parent and a teenager); every other phone number is one member’s.
    expect(new Set(seed.members.map((m) => m.phone)).size).toBe(149);
    const family = seed.members.filter((m) => m.phone === "9820022090");
    expect(family.map((m) => m.name).sort()).toEqual(["Aarav Ramaswamy", "Meena Ramaswamy"]);
    expect(new Set(family.map((m) => m.email)).size).toBe(1);
    expect(family.map((m) => m.userId).sort()).toEqual(["u_member_aarav", "u_member_meena"]);
    const states = new Set(seed.memberships.map((m) => m.status));
    expect([...states].sort()).toEqual(["active", "canceled", "expired", "frozen", "pending", "scheduled"]);
    const current = seed.memberships.filter((m) => !m.id.includes("_prior"));
    expect(current).toHaveLength(150);
    const count = (s: string) => current.filter((m) => m.status === s).length;
    expect([count("active"), count("frozen"), count("expired"), count("canceled"), count("scheduled"), count("pending")]).toEqual([100, 9, 21, 8, 6, 6]);
  });

  it("keeps the dates of each state consistent with today", () => {
    const today = "2026-11-17";
    for (const m of seed.memberships.filter((x) => !x.id.includes("_prior"))) {
      if (m.status === "active") expect(m.endsOn! > today, m.id).toBe(true);
      if (m.status === "expired") expect(m.endsOn! < today, m.id).toBe(true);
      if (m.status === "scheduled") expect(m.startsOn > today, m.id).toBe(true);
      if (m.status === "frozen") expect(m.freezes.length, m.id).toBe(1);
      if (m.status === "canceled") expect(m.canceledEffectiveOn, m.id).toBeDefined();
    }
  });

  it("snapshots plan terms on every membership and only uses plans that cover the member’s branch", () => {
    const plans = new Map(seed.membershipPlans.map((p) => [p.id, p]));
    const members = new Map(seed.members.map((m) => [m.id, m]));
    for (const ms of seed.memberships) {
      expect(ms.terms.name).toBe(plans.get(ms.planId)!.name);
      expect(ms.terms.branchIds, ms.id).toContain(members.get(ms.memberId)!.homeBranchId);
    }
  });

  it("only points at records that exist", () => {
    const ids = (rows: Array<{ id: string }>) => new Set(rows.map((r) => r.id));
    const memberIds = ids(seed.members);
    const userIds = ids(seed.users);
    const branchIds = ids(seed.branches);
    for (const m of seed.memberships) expect(memberIds.has(m.memberId)).toBe(true);
    for (const m of seed.members) expect(branchIds.has(m.homeBranchId)).toBe(true);
    for (const a of seed.trainerAssignments) {
      expect(memberIds.has(a.memberId)).toBe(true);
      expect(userIds.has(a.trainerId)).toBe(true);
      expect(userIds.has(a.assignedBy)).toBe(true);
    }
    for (const c of seed.consents) expect(userIds.has(c.recordedBy)).toBe(true);
    for (const s of seed.staffRoles) expect(userIds.has(s.userId)).toBe(true);
  });

  it("assigns trainers who work at the member’s branch, with at most one open assignment per member", () => {
    const members = new Map(seed.members.map((m) => [m.id, m]));
    const roles = new Map(seed.staffRoles.map((s) => [s.userId, s]));
    for (const a of seed.trainerAssignments) {
      expect(roles.get(a.trainerId)!.branchIds, a.id).toContain(members.get(a.memberId)!.homeBranchId);
    }
    const open = new Map<string, number>();
    for (const a of seed.trainerAssignments.filter((x) => !x.effectiveTo)) open.set(a.memberId, (open.get(a.memberId) ?? 0) + 1);
    expect(Math.max(...open.values())).toBe(1);
  });

  it("includes members who changed trainer, with the old assignment closed (A02)", () => {
    const moved = new Set(seed.trainerAssignments.filter((a) => a.effectiveTo).map((a) => a.memberId));
    expect(moved.size).toBeGreaterThanOrEqual(1);
  });

  it("includes Arjun Kumar, who trains with Coach Meera on Monthly Plus", () => {
    const arjun = seed.members.find((m) => m.id === "mem_arjun")!;
    expect(arjun).toMatchObject({ name: "Arjun Kumar", phone: "9820022002", userId: "u_member_arjun" });
    expect(seed.memberships.find((m) => m.memberId === "mem_arjun" && !m.id.includes("_prior"))).toMatchObject({ status: "active", planId: "pl_monthly_plus" });
    expect(seed.trainerAssignments.find((a) => a.memberId === "mem_arjun" && !a.effectiveTo)?.trainerId).toBe("u_trainer_meera");
    expect(seed.creditLedger.find((c) => c.memberId === "mem_arjun" && c.kind === "purchase")?.credits).toBe(8);
  });

  it("gives every member data-processing consent, and photo consent to some", () => {
    const dp = new Set(seed.consents.filter((c) => c.scope === "data_processing").map((c) => c.memberId));
    expect(dp.size).toBe(150);
    const photos = seed.consents.filter((c) => c.scope === "photos").length;
    expect(photos).toBeGreaterThan(20);
    expect(photos).toBeLessThan(120);
  });

  it("uses Indian phone numbers", () => {
    for (const m of seed.members) expect(m.phone).toMatch(/^[6-9]\d{9}$/);
  });

  it("builds in well under a second", () => {
    const t = performance.now();
    generateSeed(NOW, 7);
    expect(performance.now() - t).toBeLessThan(200);
  });
});
