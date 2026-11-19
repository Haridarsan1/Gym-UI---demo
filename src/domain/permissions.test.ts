import { describe, expect, it } from "vitest";
import { ACTIONS, HEALTH_GRANTABLE_ROLES, can, canRefund, scopeFor, type Action, type Principal, type StaffLimits } from "@/domain/permissions";
import { ROLES, type Role } from "@/domain/roles";

const limits: StaffLimits = { refundLimitPaise: 500000, canOverrideCheckIn: true, maxDiscountBp: 1000, canViewClientHealth: false };
const withHealth: StaffLimits = { ...limits, canViewClientHealth: true };

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
  const sensitive = ACTIONS.filter((a) => a.startsWith("assessment.read") || a.startsWith("photo.") || a === "note.private" || a === "assessment.write");
  const record = { tenantId: "t1", branchId: "b1", memberId: "m1", assignedTrainerId: "u_trainer_1", photoConsent: true };

  it("denies owners and branch managers assessments and photos by default", () => {
    for (const p of [owner, manager]) {
      for (const a of ["assessment.read", "photo.read"] as const) expect(can(p, a, { ...record, branchId: "b2" }), `${p.role} ${a}`).toBe(false);
    }
  });

  it("lets an owner or branch manager see them once “Can view client health and progress photos” is on", () => {
    const ownerOn = { ...owner, limits: withHealth };
    const managerOn = { ...manager, limits: withHealth };
    expect(can(ownerOn, "assessment.read", record)).toBe(true);
    expect(can(ownerOn, "photo.read", record)).toBe(true);
    expect(can(managerOn, "assessment.read", { ...record, branchId: "b2" })).toBe(true);
    expect(can(managerOn, "assessment.read", { ...record, branchId: "b1" })).toBe(false); // still limited to their branches
  });

  it("still needs the member’s photo consent for photos, even with the switch on", () => {
    const ownerOn = { ...owner, limits: withHealth };
    expect(can(ownerOn, "photo.read", { ...record, photoConsent: false })).toBe(false);
    expect(can(ownerOn, "assessment.read", { ...record, photoConsent: false })).toBe(true);
  });

  it("never gives front desk, finance or platform admins assessments, photos or private notes, whatever their limits say", () => {
    for (const base of [desk, finance, admin]) {
      for (const p of [base, { ...base, limits: withHealth }]) {
        for (const a of sensitive) expect(can(p, a), `${p.role} ${a}`).toBe(false);
        for (const a of ["assessment.read", "photo.read"] as const) expect(can(p, a, record), `${p.role} ${a} with record`).toBe(false);
      }
    }
  });

  it("never lets owners or managers read private trainer notes or write assessments, even with the switch on", () => {
    for (const p of [{ ...owner, limits: withHealth }, { ...manager, limits: withHealth }]) {
      expect(can(p, "note.private")).toBe(false);
      expect(can(p, "assessment.write")).toBe(false);
    }
  });

  it("can only be given to owners and branch managers", () => {
    expect(HEALTH_GRANTABLE_ROLES).toEqual(["owner", "branch_manager"]);
  });

  it("lets owners and branch managers see that an assessment exists and each goal’s status, but not front desk or finance", () => {
    expect(can(owner, "assessment.exists", { tenantId: "t1", branchId: "b3" })).toBe(true);
    expect(can(manager, "goal.status", { tenantId: "t1", branchId: "b2" })).toBe(true);
    expect(can(manager, "goal.status", { tenantId: "t1", branchId: "b1" })).toBe(false);
    for (const p of [desk, finance, admin]) {
      expect(can(p, "assessment.exists"), p.role).toBe(false);
      expect(can(p, "goal.status"), p.role).toBe(false);
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

describe("the branch manager’s limits in M4", () => {
  it("can read policies and staff at their branches, and change neither", () => {
    expect(can(manager, "policy.read")).toBe(true);
    expect(can(manager, "policy.manage")).toBe(false);
    expect(can(manager, "staff.read", { tenantId: "t1", branchId: "b2" })).toBe(true);
    expect(can(manager, "staff.read", { tenantId: "t1", branchId: "b1" })).toBe(false);
    expect(can(manager, "staff.manage")).toBe(false);
  });
  it("has no access to settings, subscription or import", () => {
    for (const a of ["settings.manage", "subscription.view", "import.run"] as const) expect(can(manager, a), a).toBe(false);
    for (const a of ["settings.manage", "subscription.view", "import.run"] as const) expect(can(owner, a), a).toBe(true);
  });
  it("manages front desk and trainer accounts only when the owner has granted it, and only at their own branches", () => {
    expect(can(manager, "staff.manage.frontline")).toBe(false);
    const granted = { ...manager, limits: { ...limits, canManageFrontline: true } };
    expect(can(granted, "staff.manage.frontline")).toBe(true);
    expect(can(granted, "staff.manage.frontline", { tenantId: "t1", branchId: "b2" })).toBe(true);
    expect(can(granted, "staff.manage.frontline", { tenantId: "t1", branchId: "b1" })).toBe(false);
    expect(can(owner, "staff.manage.frontline")).toBe(true);
    expect(can(desk, "staff.manage.frontline")).toBe(false);
  });
  it("only the owner reopens a closed cash day", () => {
    expect(can(owner, "cash.reopen")).toBe(true);
    for (const p of [manager, desk, finance]) expect(can(p, "cash.reopen")).toBe(false);
  });
});
