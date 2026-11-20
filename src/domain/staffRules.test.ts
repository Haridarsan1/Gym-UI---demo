import { describe, expect, it } from "vitest";
import { accessChanges, accessSummary, authorityOf, canManageStaff, cleanLimits, defaultLimits, limitsThatApply, validateStaff, type Actor, type StaffDraft } from "@/domain/staffRules";

const owner: Actor = { userId: "u_owner", role: "owner", branchIds: ["a", "b", "c"], limits: defaultLimits("owner") };
const bm = (grant: boolean): Actor => ({ userId: "u_bm", role: "branch_manager", branchIds: ["b"], limits: { ...defaultLimits("branch_manager"), canManageFrontline: grant } });
const desk: Actor = { userId: "u_desk", role: "front_desk", branchIds: ["a"], limits: defaultLimits("front_desk") };
const ctx = { emailsTaken: ["pooja@pulse.in"], allBranchIds: ["a", "b", "c"] };
const draft = (over: Partial<StaffDraft> = {}): StaffDraft => ({ name: "Ritu Verma", email: "ritu@pulse.in", phone: "98200 55001", role: "front_desk", branchIds: ["b"], limits: defaultLimits("front_desk"), ...over });

describe("who may manage staff", () => {
  it("the owner may do everything; a branch manager only what the owner has allowed; everyone else nothing", () => {
    expect(authorityOf(owner)).toMatchObject({ scope: "all", ceiling: { refundLimitPaise: null, canOverrideCheckIn: true } });
    expect(authorityOf(bm(false))).toMatchObject({ scope: "none", why: "Only the owner can invite or change staff. Ask them to allow you to manage front desk and trainers." });
    expect(authorityOf(bm(true))).toMatchObject({ scope: "frontline", roles: ["front_desk", "trainer"], ceiling: { refundLimitPaise: 5_000_000, maxDiscountBp: 1000, canOverrideCheckIn: true } });
    expect(authorityOf(desk)).toMatchObject({ scope: "none", why: "Only the owner can invite or change staff." });
  });

  it("an allowed branch manager changes front desk and trainers whose branches are all their own, and nobody else", () => {
    const m = bm(true);
    expect(canManageStaff(m, { role: "front_desk", branchIds: ["b"] })).toEqual({ ok: true });
    expect(canManageStaff(m, { role: "trainer", branchIds: ["b"] })).toEqual({ ok: true });
    expect(canManageStaff(m, { role: "trainer", branchIds: ["a", "b"] })).toEqual({ ok: false, reason: "They also work at a branch you don’t manage. Ask the owner to change them." });
    expect(canManageStaff(m, { role: "front_desk", branchIds: ["a"] }).ok).toBe(false);
    expect(canManageStaff(m, { role: "finance", branchIds: ["b"] })).toEqual({ ok: false, reason: "Only the owner can change a finance." });
    expect(canManageStaff(m, { role: "branch_manager", branchIds: ["b"] }).ok).toBe(false);
    expect(canManageStaff(m, { role: "owner", branchIds: ["a", "b", "c"] }).ok).toBe(false);
    expect(canManageStaff(bm(false), { role: "front_desk", branchIds: ["b"] }).ok).toBe(false);
    expect(canManageStaff(owner, { role: "owner", branchIds: ["a"] })).toEqual({ ok: true });
  });
});

describe("what a person can be given", () => {
  it("accepts a complete, ordinary front desk invitation", () => { expect(validateStaff(draft(), owner, ctx)).toEqual({}); });

  it("says what is wrong with the details", () => {
    expect(validateStaff(draft({ name: " " }), owner, ctx).name).toBe("Enter the person’s name.");
    expect(validateStaff(draft({ email: "ritu" }), owner, ctx).email).toBe("Enter an email like name@example.in. The invitation goes there.");
    expect(validateStaff(draft({ email: "POOJA@pulse.in" }), owner, ctx).email).toBe("Someone at this gym already has this email. Use another, or open their account.");
    expect(validateStaff(draft({ phone: "12345" }), owner, ctx).phone).toBe("Enter a 10-digit mobile number, or leave it empty.");
    expect(validateStaff(draft({ phone: "+91 98200 55001" }), owner, ctx).phone).toBeUndefined();
    expect(validateStaff(draft({ phone: "" }), owner, ctx).phone).toBeUndefined();
    expect(validateStaff(draft({ role: "" }), owner, ctx).role).toBe("Choose a role.");
    expect(validateStaff(draft({ branchIds: [] }), owner, ctx).branchIds).toBe("Choose at least one branch.");
    expect(validateStaff(draft({ branchIds: ["z"] }), owner, ctx).branchIds).toBe("Choose branches from the list.");
  });

  it("an owner has every branch, so none need choosing", () => { expect(validateStaff(draft({ role: "owner", branchIds: [], limits: defaultLimits("owner") }), owner, ctx)).toEqual({}); });

  it("an allowed branch manager can invite only front desk and trainers, at their own branches, within their own limits", () => {
    const m = bm(true);
    expect(validateStaff(draft(), m, ctx)).toEqual({});
    expect(validateStaff(draft({ role: "finance", limits: defaultLimits("finance") }), m, ctx).role).toBe("You can invite front desk and trainer accounts. Ask the owner for anything else.");
    expect(validateStaff(draft({ branchIds: ["a"] }), m, ctx).branchIds).toBe("You can add people only at your own branches.");
    expect(validateStaff(draft({ limits: { ...defaultLimits("front_desk"), maxDiscountBp: 1500 } }), m, ctx).maxDiscountBp).toBe("You can give up to 10%, your own limit.");
    expect(validateStaff(draft({ limits: { ...defaultLimits("front_desk"), maxDiscountBp: 1000 } }), m, ctx)).toEqual({});
  });

  it("nobody is given more than the person giving it has: refund and discount limits and overrides", () => {
    const m = { ...bm(true), limits: { ...defaultLimits("branch_manager"), canManageFrontline: true, canOverrideCheckIn: false } };
    expect(validateStaff(draft({ limits: { ...defaultLimits("front_desk"), canOverrideCheckIn: true } }), m, ctx).canOverrideCheckIn).toBe("You can’t let someone override a check-in when you can’t yourself.");
    const lowRefund = { ...bm(true), limits: { ...defaultLimits("branch_manager"), canManageFrontline: true, refundLimitPaise: 100_000 } };
    // Front desk and trainers have no refund limit to give, so it never blocks them.
    expect(validateStaff(draft({ limits: { ...defaultLimits("front_desk"), refundLimitPaise: 999_999_999 } }), lowRefund, ctx).refundLimitPaise).toBeUndefined();
    // The owner can give a finance person any limit, and “no limit” is the owner’s to give.
    expect(validateStaff(draft({ role: "finance", limits: { ...defaultLimits("finance"), refundLimitPaise: 9_000_000 } }), owner, ctx)).toEqual({});
    expect(validateStaff(draft({ role: "finance", limits: { ...defaultLimits("finance"), refundLimitPaise: -5 } }), owner, ctx).refundLimitPaise).toBe("Enter the most they can refund in rupees, for example 25,000.");
    expect(validateStaff(draft({ role: "finance", limits: { ...defaultLimits("finance"), maxDiscountBp: 12_000 } }), owner, ctx).maxDiscountBp).toBe("Enter a percentage from 0 to 100.");
    expect(validateStaff(draft({ role: "branch_manager", limits: { ...defaultLimits("branch_manager"), refundLimitPaise: null } }), owner, ctx)).toEqual({});
  });

  it("health access is the owner’s to give, and only to an owner or a branch manager; the staff-management switch only to a branch manager", () => {
    expect(validateStaff(draft({ role: "branch_manager", limits: { ...defaultLimits("branch_manager"), canViewClientHealth: true } }), owner, ctx)).toEqual({});
    expect(validateStaff(draft({ role: "front_desk", limits: { ...defaultLimits("front_desk"), canViewClientHealth: true } }), owner, ctx).canViewClientHealth).toBe("Only an owner or a branch manager can be given access to client health and progress photos.");
    expect(validateStaff(draft({ role: "finance", limits: { ...defaultLimits("finance"), canViewClientHealth: true } }), owner, ctx).canViewClientHealth).toBeDefined();
    expect(validateStaff(draft({ limits: { ...defaultLimits("front_desk"), canViewClientHealth: true } }), bm(true), ctx).canViewClientHealth).toBeDefined();
    expect(validateStaff(draft({ role: "branch_manager", limits: { ...defaultLimits("branch_manager"), canManageFrontline: true } }), owner, ctx)).toEqual({});
    expect(validateStaff(draft({ role: "trainer", limits: { ...defaultLimits("trainer"), canManageFrontline: true } }), owner, ctx).canManageFrontline).toBe("Only a branch manager can be allowed to manage front desk and trainers.");
  });

  it("the override cap is a whole number a day, or nothing for no limit", () => {
    expect(validateStaff(draft({ limits: { ...defaultLimits("front_desk"), maxOverridesPerDay: 2.5 } }), owner, ctx).maxOverridesPerDay).toBe("Enter 0 to 100 a day, or leave it empty for no limit.");
    expect(validateStaff(draft({ limits: { ...defaultLimits("front_desk"), maxOverridesPerDay: null } }), owner, ctx)).toEqual({});
  });
});

describe("limits a role can carry", () => {
  it("only asks what applies: a front desk can’t refund and a trainer can’t discount", () => {
    expect(limitsThatApply("front_desk")).toEqual({ refund: false, discount: true, override: true, health: false, frontline: false });
    expect(limitsThatApply("trainer")).toEqual({ refund: false, discount: false, override: false, health: false, frontline: false });
    expect(limitsThatApply("finance")).toMatchObject({ refund: true, override: false });
    expect(limitsThatApply("branch_manager")).toEqual({ refund: true, discount: true, override: true, health: true, frontline: true });
  });

  it("a hidden box can never keep a permission: changing role clears what no longer applies", () => {
    const wide = { refundLimitPaise: 5_000_000, canOverrideCheckIn: true, maxDiscountBp: 1000, canViewClientHealth: true, canManageFrontline: true, maxOverridesPerDay: 3 };
    expect(cleanLimits("trainer", wide)).toEqual({ refundLimitPaise: 0, canOverrideCheckIn: false, maxDiscountBp: 0, canViewClientHealth: false });
    expect(cleanLimits("front_desk", wide)).toEqual({ refundLimitPaise: 0, canOverrideCheckIn: true, maxDiscountBp: 1000, canViewClientHealth: false, maxOverridesPerDay: 3 });
    expect(cleanLimits("branch_manager", wide)).toEqual({ ...wide });
    expect(cleanLimits("finance", wide)).toEqual({ refundLimitPaise: 5_000_000, canOverrideCheckIn: false, maxDiscountBp: 1000, canViewClientHealth: false });
  });
});

describe("saying what access means", () => {
  it("summarises role, branches and limits in plain words", () => {
    expect(accessSummary("front_desk", ["Andheri"], { ...defaultLimits("front_desk"), maxOverridesPerDay: 2 })).toEqual(["Front desk at Andheri.", "Can give discounts up to 5%.", "Can let a member in by override, with a reason, 2 a day."]);
    expect(accessSummary("branch_manager", ["Bandra"], { ...defaultLimits("branch_manager"), canManageFrontline: true, canViewClientHealth: true })).toEqual([
      "Branch manager at Bandra.", "Can approve refunds up to ₹50,000.", "Can give discounts up to 10%.", "Can let a member in by override, with a reason.", "Can open client health records and progress photos; every view is logged.", "Can invite and manage front desk and trainers at their branches.",
    ]);
    expect(accessSummary("trainer", ["Andheri", "Bandra"], defaultLimits("trainer"))).toEqual(["Trainer at Andheri, Bandra."]);
    expect(accessSummary("owner", [], defaultLimits("owner"))[0]).toBe("Owner at every branch.");
    expect(accessSummary("finance", [], defaultLimits("finance"))[0]).toBe("Finance at no branch yet.");
  });

  it("lists only what changed, from and to", () => {
    const before = { role: "branch_manager" as const, branchNames: ["Bandra"], limits: defaultLimits("branch_manager") };
    expect(accessChanges(before, before)).toEqual([]);
    expect(accessChanges(before, { ...before, branchNames: ["Bandra", "Powai"], limits: { ...before.limits, refundLimitPaise: 7_500_000, canManageFrontline: true, canViewClientHealth: true } })).toEqual([
      { field: "Branches", from: "Bandra", to: "Bandra, Powai" },
      { field: "Refund limit", from: "₹50,000", to: "₹75,000" },
      { field: "Can view client health and progress photos", from: "No", to: "Yes" },
      { field: "Can invite and manage front desk and trainers", from: "No", to: "Yes" },
    ]);
    expect(accessChanges({ role: "front_desk", branchNames: ["Andheri"], limits: defaultLimits("front_desk") }, { role: "trainer", branchNames: ["Andheri"], limits: defaultLimits("trainer") })[0]).toEqual({ field: "Role", from: "Front desk", to: "Trainer" });
  });
});
