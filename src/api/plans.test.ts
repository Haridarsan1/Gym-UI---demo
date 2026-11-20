import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getMembership, startCheckout } from "@/api/membership";
import { getWizardOptions, registerMember, type RegisterInput } from "@/api/newMember";
import { getPlans, savePlan, savePtPricing, setPlanOnSale, type SavePlanInput } from "@/api/plans";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message, details: e.details } : { code: "other", message: String(e), details: undefined }; } return { code: "resolved", message: "", details: undefined }; };
const owner = as("u_owner");
let n = 0;
const key = () => `plan-key-${++n}-${Math.random().toString(36).slice(2)}`;
const draft = (over: Partial<SavePlanInput> = {}): SavePlanInput => ({ key: key(), name: "Quarterly Plus", kind: "time", pricePaise: 800_000, taxRateBp: 1800, durationDays: 90, branchIds: ["br_andheri", "br_bandra"], effectiveFrom: "2026-11-17", ...over });
const reg = (over: Partial<RegisterInput> = {}): RegisterInput => ({
  key: key(), branchId: "br_andheri", member: { name: "Kabir Anand", phone: "98765 43210", email: "kabir@example.in", dateOfBirth: "1994-05-12", gender: "male", leadSource: "Walk-in" },
  consents: { photos: true, assessments: true, marketing: false, dataProcessing: true }, planId: "pl_monthly", ...over,
});

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("the plan list", () => {
  it("lists every plan with its state, what a member pays, and how many memberships are on it", async () => {
    const v = await getPlans(owner);
    expect(v.canEdit).toBe(true);
    expect(v.plans).toHaveLength(9);
    expect(v.plans.find((p) => p.id === "pl_monthly")).toMatchObject({ state: "on_sale", totalPaise: 295_000 });
    expect(v.plans.every((p) => p.state === "on_sale")).toBe(true);
    const live = (await db.memberships.toArray()).filter((m) => m.planId === "pl_monthly" && m.status !== "expired" && m.status !== "canceled").length;
    expect(v.plans.find((p) => p.id === "pl_monthly")!.members).toBe(live);
    expect(v.branches.map((b) => b.name)).toEqual(["Andheri", "Bandra", "Powai"]);
    expect(v.ptIsDefault).toBe(true);
    expect(v.ptPricing).toEqual({ sessionPricePaise: 80_000, taxRateBp: 1800, packs: [4, 8, 12], expiryDays: 150 });
    expect(v.discountLimits).toEqual([{ role: "front_desk", label: "Front desk", bp: 500 }, { role: "branch_manager", label: "Branch manager", bp: 1000 }, { role: "owner", label: "Owner", bp: 2000 }]);
  });

  it("a branch manager reads the same list, cannot change it, and counts only their own members", async () => {
    const bm = as("u_bm_bandra");
    const v = await getPlans(bm);
    expect(v.canEdit).toBe(false);
    const all = await getPlans(owner);
    expect(v.plans.reduce((x, p) => x + p.members, 0)).toBeLessThan(all.plans.reduce((x, p) => x + p.members, 0));
    expect((await err(savePlan(bm, draft()))).code).toBe("forbidden");
    expect((await err(setPlanOnSale(bm, { planId: "pl_monthly", on: false, key: key() }))).code).toBe("forbidden");
    expect((await err(savePtPricing(bm, { key: key(), sessionPricePaise: 90_000, taxRateBp: 1800, packs: [4], expiryDays: 100 }))).code).toBe("forbidden");
    expect(await db.membershipPlans.count()).toBe(9);
  });

  it("is for the owner and branch managers only", async () => {
    for (const id of ["u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun", "u_admin"]) expect((await err(getPlans(as(id)))).code, id).toBe("forbidden");
  });
});

describe("making and changing a plan", () => {
  it("makes a plan, which can be sold at once at the branches it covers and nowhere else, and audits it", async () => {
    const { plan, created } = await savePlan(owner, draft({ ptCredits: 4, maxDiscountBp: 500 }));
    expect(created).toBe(true);
    expect(plan).toMatchObject({ name: "Quarterly Plus", pricePaise: 800_000, branchIds: ["br_andheri", "br_bandra"], ptCredits: 4, maxDiscountBp: 500, active: true });
    expect((await getWizardOptions(as("u_desk_andheri"), "br_andheri")).plans.some((p) => p.id === plan.id)).toBe(true);
    expect((await getWizardOptions(as("u_bm_bandra"), "br_bandra")).plans.some((p) => p.id === plan.id)).toBe(true);
    const events = await db.auditEvents.where("action").equals("plan.change").toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: "u_owner", entityType: "plan", entityId: plan.id, details: { change: "created", name: "Quarterly Plus", pricePaise: 800_000 } });
  });

  it("sending the same form twice makes one plan and one audit entry", async () => {
    const d = draft();
    const a = await savePlan(owner, d);
    const b = await savePlan(owner, d);
    expect(b.repeated).toBe(true);
    expect(b.plan.id).toBe(a.plan.id);
    expect(await db.membershipPlans.count()).toBe(10);
    expect(await db.auditEvents.where("action").equals("plan.change").count()).toBe(1);
  });

  it("says what is wrong, field by field, and writes nothing", async () => {
    const r = await err(savePlan(owner, draft({ name: "Monthly" })));
    expect(r).toMatchObject({ code: "invalid", message: "Another plan already has this name. Choose a different one." });
    const bad = await err(savePlan(owner, draft({ pricePaise: 0, branchIds: [] })));
    expect(bad.message).toBe("A paid plan needs a price above ₹0. Choose Trial for a free plan.");
    expect((bad.details as { errors: Record<string, string> }).errors).toEqual({ pricePaise: "A paid plan needs a price above ₹0. Choose Trial for a free plan.", branchIds: "Choose at least one branch." });
    expect(await db.membershipPlans.count()).toBe(9);
    expect(await db.auditEvents.where("action").equals("plan.change").count()).toBe(0);
  });

  it("an edit changes what is sold from now on, and never a membership already sold", async () => {
    const before = (await db.memberships.toArray()).filter((m) => m.planId === "pl_monthly").map((m) => ({ id: m.id, terms: m.terms }));
    expect(before.length).toBeGreaterThan(5);
    const monthly = (await db.membershipPlans.get("pl_monthly"))!;
    await savePlan(owner, { ...monthly, planId: "pl_monthly", key: key(), pricePaise: 300_000, effectiveTo: null });
    expect((await getWizardOptions(as("u_desk_andheri"), "br_andheri")).plans.find((p) => p.id === "pl_monthly")).toMatchObject({ pricePaise: 300_000, totalPaise: 354_000 });
    const after = (await db.memberships.toArray()).filter((m) => m.planId === "pl_monthly").map((m) => ({ id: m.id, terms: m.terms }));
    expect(after).toEqual(before);
    expect(after.every((m) => m.terms.pricePaise === 250_000)).toBe(true);
    const e = (await db.auditEvents.where("action").equals("plan.change").toArray())[0]!;
    expect(e.details).toMatchObject({ change: "edited", changed: { pricePaise: { from: 250_000, to: 300_000 } } });
  });

  it("saving with nothing changed writes no audit entry", async () => {
    const monthly = (await db.membershipPlans.get("pl_monthly"))!;
    await savePlan(owner, { ...monthly, planId: "pl_monthly", key: key(), effectiveTo: null });
    expect(await db.auditEvents.where("action").equals("plan.change").count()).toBe(0);
  });

  it("a plan can be limited to some branches, and a branch it leaves can no longer sell it", async () => {
    const half = (await db.membershipPlans.get("pl_half"))!;
    expect((await getWizardOptions(as("u_bm_bandra"), "br_bandra")).plans.some((p) => p.id === "pl_half")).toBe(true);
    await savePlan(owner, { ...half, planId: "pl_half", key: key(), branchIds: ["br_andheri"], effectiveTo: null });
    expect((await getWizardOptions(as("u_bm_bandra"), "br_bandra")).plans.some((p) => p.id === "pl_half")).toBe(false);
    expect((await err(registerMember(as("u_bm_bandra"), reg({ branchId: "br_bandra", planId: "pl_half" })))).message).toBe("That plan isn’t on sale at this branch. Choose another.");
  });
});

describe("selling and not selling", () => {
  it("stopping a plan takes it off the desk’s list and off renewals, and leaves the members who have it alone", async () => {
    const live = (await db.memberships.toArray()).filter((m) => m.planId === "pl_annual" && m.status === "active").length;
    expect((await setPlanOnSale(owner, { planId: "pl_annual", on: false, key: key() })).active).toBe(false);
    expect((await getWizardOptions(as("u_desk_andheri"), "br_andheri")).plans.some((p) => p.id === "pl_annual")).toBe(false);
    expect((await getPlans(owner)).plans.find((p) => p.id === "pl_annual")).toMatchObject({ state: "off" });
    expect((await db.memberships.toArray()).filter((m) => m.planId === "pl_annual" && m.status === "active")).toHaveLength(live);
    expect((await err(registerMember(as("u_desk_andheri"), reg({ planId: "pl_annual" })))).code).toBe("invalid");
    await setPlanOnSale(owner, { planId: "pl_annual", on: true, key: key() });
    expect((await getWizardOptions(as("u_desk_andheri"), "br_andheri")).plans.some((p) => p.id === "pl_annual")).toBe(true);
    const events = await db.auditEvents.where("action").equals("plan.change").toArray();
    expect(events.map((e) => (e.details as { change: string }).change)).toEqual(["off_sale", "on_sale"]);
  });

  it("a plan that starts later is listed as such and is not sold before its first day", async () => {
    const { plan } = await savePlan(owner, draft({ effectiveFrom: "2026-12-01" }));
    expect((await getPlans(owner)).plans.find((p) => p.id === plan.id)!.state).toBe("scheduled");
    expect((await getWizardOptions(as("u_desk_andheri"), "br_andheri")).plans.some((p) => p.id === plan.id)).toBe(false);
  });
});

describe("a plan’s own discount cap", () => {
  it("holds the desk to the lower of its own limit and the plan’s", async () => {
    // The front desk may give 5%. This plan allows 2%.
    const { plan } = await savePlan(owner, draft({ name: "Launch offer", maxDiscountBp: 200 }));
    const o = await getWizardOptions(as("u_desk_andheri"), "br_andheri");
    expect(o.maxDiscountBp).toBe(500);
    expect(o.plans.find((p) => p.id === plan.id)!.maxDiscountBp).toBe(200);
    const over = await err(registerMember(as("u_desk_andheri"), reg({ planId: plan.id, discountPaise: 24_000 })));
    expect(over).toMatchObject({ code: "forbidden", message: "This plan can be discounted by at most 2%." });
    const ok = await registerMember(as("u_desk_andheri"), reg({ planId: plan.id, discountPaise: 16_000 }));
    const inv = (await db.invoices.get(ok.invoice!.id))!;
    expect(inv.discountPaise).toBe(16_000);
    // A plan with no cap leaves the person’s own limit.
    expect((await err(registerMember(as("u_desk_andheri"), reg({ key: key(), member: { name: "Anita Rao", phone: "98765 43211", gender: "female" }, planId: "pl_monthly", discountPaise: 12_500 })))).code).toBe("resolved");
    expect((await err(registerMember(as("u_desk_andheri"), reg({ key: key(), member: { name: "Dev Rao", phone: "98765 43212", gender: "male" }, planId: "pl_monthly", discountPaise: 12_501 })))).message).toBe("You can give up to 5% off. Ask a manager for more.");
  });
});

describe("personal training pricing", () => {
  it("is what a member is charged for a pack and how long the pack lasts, from the moment it is saved", async () => {
    const priya = as("u_member_priya");
    expect((await getMembership(priya)).sessions).toMatchObject({ pricePaise: 80_000 });
    const saved = await savePtPricing(owner, { key: key(), sessionPricePaise: 90_000, taxRateBp: 1200, packs: [12, 6, 3], expiryDays: 90 });
    expect(saved).toEqual({ sessionPricePaise: 90_000, taxRateBp: 1200, packs: [3, 6, 12], expiryDays: 90 });
    const view = await getMembership(priya);
    expect(view.sessions.pricePaise).toBe(90_000);
    expect(view.sessions.packs.map((p) => p.sessions)).toEqual([3, 6, 12]);
    expect(view.sessions.packs[0]).toMatchObject({ subtotalPaise: 270_000, taxPaise: 32_400, totalPaise: 302_400 });
    const co = await startCheckout(priya, { kind: "sessions", sessions: 6 });
    expect(co).toMatchObject({ totalPaise: 604_800 });
    expect(co.effects[0]).toBe("6 training sessions are added to your balance, good for 90 days.");
    expect((await err(startCheckout(priya, { kind: "sessions", sessions: 4 }))).message).toBe("Choose one of the packs shown.");
    expect((await getPlans(owner)).ptIsDefault).toBe(false);
  });

  it("audits what it was and what it became, and a second identical save adds nothing", async () => {
    const input = { key: key(), sessionPricePaise: 90_000, taxRateBp: 1800, packs: [4, 8, 12], expiryDays: 150 };
    await savePtPricing(owner, input);
    await savePtPricing(owner, input);
    await savePtPricing(owner, { ...input, key: key() });
    const e = await db.auditEvents.where("action").equals("plan.change").toArray();
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ entityType: "pt_pricing", details: { from: { sessionPricePaise: 80_000 }, to: { sessionPricePaise: 90_000 } } });
  });

  it("refuses a price or pack that makes no sense, and says why", async () => {
    expect((await err(savePtPricing(owner, { key: key(), sessionPricePaise: null, taxRateBp: 1800, packs: [4], expiryDays: 150 }))).message).toBe("Enter the price of one session in rupees before GST, for example 800.");
    expect((await err(savePtPricing(owner, { key: key(), sessionPricePaise: 80_000, taxRateBp: 1800, packs: [], expiryDays: 150 }))).message).toBe("Offer at least one pack, for example 4, 8 and 12.");
    expect((await db.tenants.get("t_powerhouse"))?.ptPricing ?? (await db.tenants.toArray())[0]?.ptPricing).toBeUndefined();
  });
});
