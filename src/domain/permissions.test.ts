import { describe, expect, it } from "vitest";
import { ACTIONS, can, canRefund, scopeFor, type Action, type Principal, type StaffLimits } from "@/domain/permissions";
import { ROLES, type Role } from "@/domain/roles";

const limits: StaffLimits = { refundLimitPaise: 500000, canOverrideCheckIn: true, maxDiscountBp: 1000 };

const person = (role: Role, extra: Partial<Principal> = {}): Principal => ({
  userId: `u_${role}`,
  role,
  tenantId: role === "platform_admin" ? null : "t1",
  branchIds: ["b1"],
  limits,
  ...extra,
});

const owner = person("owner", { branchIds: ["b1", "b2", "b3"] });
const manager = person("branch_manager", { branchIds: ["b2"] });
const desk = person("front_desk", { branchIds: ["b1"] });
const finance = person("finance", { branchIds: ["b1"] });
const trainer = person("trainer", { userId: "u_trainer_1" });
const member = person("member", { userId: "u_member", memberId: "m1", limits: undefined });
const admin = person("platform_admin");

describe("deny by default", () => {
  it("denies everyone who is not signed in", () => {
    for (const a of ACTIONS) expect(can(null, a)).toBe(false);
    expect(can(undefined, "member.read")).toBe(false);
  });

  it("denies a role that has no entry for the action", () => {
    expect(can(desk, "pricing.manage")).toBe(false);
    expect(can(member, "refund.create")).toBe(false);
    expect(can(trainer, "report.export")).toBe(false);
  });

  it("every action is granted to at least one role, and only to real roles", () => {
    for (const a of ACTIONS) {
      const roles = ROLES.filter((r) => scopeFor(r, a));
      expect(roles.length, a).toBeGreaterThan(0);
    }
  });
});

describe("tenant isolation (S03, A05)", () => {
  it("denies another gym’s records at every scope", () => {
    const other = { tenantId: "t2", branchId: "b1", memberId: "m1", assignedTrainerId: "u_trainer_1", ownerUserId: "u_trainer_1" };
    expect(can(owner, "member.read", other)).toBe(false);
    expect(can(manager, "member.read", { ...other, branchId: "b2" })).toBe(false);
    expect(can(trainer, "member.read", other)).toBe(false);
    expect(can(member, "invoice.read", other)).toBe(false);
  });

  it("denies a record that does not say which gym it belongs to", () => {
    expect(can(owner, "member.read", { branchId: "b1" })).toBe(false);
  });

  it("gives platform administrators no access to a gym’s records", () => {
    const platformOnly: Action[] = ["tenant.read", "tenant.manage", "saasplan.manage", "support.request", "platform.audit.read"];
    for (const a of ACTIONS) expect(can(admin, a), a).toBe(platformOnly.includes(a));
    expect(can(admin, "member.read", { tenantId: "t1", branchId: "b1", memberId: "m1" })).toBe(false);
  });

  it("keeps gym staff out of platform administration", () => {
    expect(can(owner, "tenant.manage")).toBe(false);
  });
});

describe("branch scope", () => {
  const at = (branchId?: string) => ({ tenantId: "t1", branchId });

  it("lets a branch manager act only in their branches", () => {
    expect(can(manager, "member.read", at("b2"))).toBe(true);
    expect(can(manager, "member.read", at("b1"))).toBe(false);
    expect(can(manager, "report.export", at("b3"))).toBe(false);
  });

  it("denies a branch-scoped check when the record has no branch", () => {
    expect(can(manager, "member.read", at())).toBe(false);
  });

  it("lets the owner act in every branch", () => {
    expect(can(owner, "member.read", at("b3"))).toBe(true);
  });
});

describe("assigned and own scope", () => {
  const record = (assignedTrainerId?: string) => ({ tenantId: "t1", memberId: "m1", branchId: "b1", assignedTrainerId });

  it("lets a trainer see only the members they train", () => {
    expect(can(trainer, "workoutlog.read", record("u_trainer_1"))).toBe(true);
    expect(can(trainer, "workoutlog.read", record("u_trainer_2"))).toBe(false);
    expect(can(trainer, "workoutlog.read", record())).toBe(false);
  });

  it("removes the old trainer’s access when a member moves to a new trainer (A02)", () => {
    const afterTransfer = record("u_trainer_2");
    expect(can(trainer, "member.read", afterTransfer)).toBe(false);
    expect(can(person("trainer", { userId: "u_trainer_2" }), "member.read", afterTransfer)).toBe(true);
  });

  it("lets a member see only their own records", () => {
    expect(can(member, "invoice.read", { tenantId: "t1", memberId: "m1" })).toBe(true);
    expect(can(member, "invoice.read", { tenantId: "t1", memberId: "m2" })).toBe(false);
    expect(can(member, "workoutlog.read", { tenantId: "t1", memberId: "m2", assignedTrainerId: "u_member" })).toBe(false);
  });

  it("lets a trainer manage their own bookings but not another trainer’s", () => {
    expect(can(trainer, "booking.manage", { tenantId: "t1", ownerUserId: "u_trainer_1" })).toBe(true);
    expect(can(trainer, "booking.manage", { tenantId: "t1", ownerUserId: "u_trainer_2" })).toBe(false);
  });
});

describe("sensitive data (R03, S04)", () => {
  const sensitive = ACTIONS.filter((a) => a.startsWith("assessment.") || a.startsWith("photo.") || a === "note.private");

  it("never gives front desk, finance, owners, branch managers or platform admins assessments, photos or private notes", () => {
    expect(sensitive.length).toBeGreaterThan(0);
    for (const p of [desk, finance, owner, manager, admin]) {
      for (const a of sensitive) expect(can(p, a), `${p.role} ${a}`).toBe(false);
    }
  });

  it("denies a trainer progress photos without the member’s photo consent", () => {
    const r = { tenantId: "t1", memberId: "m1", assignedTrainerId: "u_trainer_1" };
    expect(can(trainer, "photo.read", r)).toBe(false);
    expect(can(trainer, "photo.read", { ...r, photoConsent: false })).toBe(false);
    expect(can(trainer, "photo.read", { ...r, photoConsent: true })).toBe(true);
  });

  it("always lets a member open their own photos", () => {
    expect(can(member, "photo.read", { tenantId: "t1", memberId: "m1" })).toBe(true);
  });
});

describe("staff limits (R02)", () => {
  const r = { tenantId: "t1", branchId: "b1", memberId: "m1" };

  it("allows a refund up to the person’s limit and no more", () => {
    expect(canRefund(finance, r, 500000)).toBe(true);
    expect(canRefund(finance, r, 500001)).toBe(false);
  });

  it("allows any amount when the limit is empty", () => {
    expect(canRefund({ ...owner, limits: { ...limits, refundLimitPaise: null } }, { ...r }, 99_999_999)).toBe(true);
  });

  it("denies refunds to front desk and to anyone with no limits record", () => {
    expect(canRefund(desk, r, 100)).toBe(false);
    expect(canRefund({ ...finance, limits: undefined }, r, 100)).toBe(false);
  });

  it("needs the override permission to override a check-in", () => {
    expect(can(desk, "checkin.override", r)).toBe(true);
    expect(can({ ...desk, limits: { ...limits, canOverrideCheckIn: false } }, "checkin.override", r)).toBe(false);
    expect(can({ ...desk, limits: undefined }, "checkin.override")).toBe(false);
  });
});

describe("feature-level checks for navigation", () => {
  it("lets only staff browse the member list, never a member", () => {
    expect(can(member, "member.list")).toBe(false);
    expect(can(member, "member.read", { tenantId: "t1", memberId: "m1" })).toBe(true);
    for (const p of [owner, manager, desk, finance, trainer]) expect(can(p, "member.list"), p.role).toBe(true);
  });

  it("answers without a record", () => {
    expect(can(desk, "checkin.record")).toBe(true);
    expect(can(member, "checkin.record")).toBe(false);
    expect(can(finance, "reconciliation.manage")).toBe(true);
    expect(can(desk, "reconciliation.manage")).toBe(false);
  });

  it("denies a gym role that has no gym", () => {
    expect(can({ ...owner, tenantId: null }, "member.read")).toBe(false);
  });
});
