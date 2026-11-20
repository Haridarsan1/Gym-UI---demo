import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { openOwner } from "@/api/owner";
import { ptPricingFor } from "@/api/ptPricing";
import { buildAuditEvent } from "@/domain/audit";
import { can } from "@/domain/permissions";
import { GST_RATES_BP, planState, validatePlan, validatePtPricing, type PlanErrors, type PlanState } from "@/domain/plans";
import { DEFAULT_PT_PRICING, type PtPricing } from "@/domain/renewal";
import { invoiceTotals } from "@/domain/billing";
import type { MembershipPlan } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Plans and pricing (M01, M03). The owner makes, edits and stops selling plans and sets what personal training costs; a branch manager sees the same list and cannot change it.
 * A sale copies a plan’s terms into the membership, so nothing here ever changes a member who already bought. Every change is written to the audit log with what it was and what it became.
 */

export interface PlanRow extends MembershipPlan {
  state: PlanState;
  /** Memberships on this plan that are not over: active, frozen, pending or scheduled. For a branch manager, only members of their own branches. */
  members: number;
  /** What a member pays: the price and GST, without a discount. */
  totalPaise: number;
}

export interface PlansView {
  today: string;
  canEdit: boolean;
  plans: PlanRow[];
  branches: Array<{ id: string; name: string; stateCode: string }>;
  ptPricing: PtPricing;
  /** True when the owner has not set session pricing yet and Ember’s defaults apply. */
  ptIsDefault: boolean;
  /** The largest discount each kind of staff may give, in basis points, so the owner sees what a plan’s own cap changes. */
  discountLimits: Array<{ role: "front_desk" | "branch_manager" | "owner"; label: string; bp: number }>;
  gstRatesBp: readonly number[];
}

export async function getPlans(session: Session | null): Promise<PlansView> {
  const c = await openOwner(session, "plan.read");
  const [plans, branches, memberships, members, staff, tenant] = await Promise.all([
    db.membershipPlans.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.memberships.where("tenantId").equals(c.tenantId).toArray(),
    db.members.where("tenantId").equals(c.tenantId).filter((m) => c.branchIds.includes(m.homeBranchId)).toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray(), db.tenants.get(c.tenantId),
  ]);
  const mine = new Set(members.map((m) => m.id));
  const count = new Map<string, number>();
  for (const m of memberships) {
    if (!mine.has(m.memberId) || m.status === "expired" || m.status === "canceled") continue;
    count.set(m.planId, (count.get(m.planId) ?? 0) + 1);
  }
  const top = (role: "front_desk" | "branch_manager" | "owner") => Math.max(0, ...staff.filter((s) => s.role === role).map((s) => s.limits.maxDiscountBp));
  return {
    today: c.today,
    canEdit: can(c.principal, "pricing.manage"),
    plans: plans
      .map((p): PlanRow => ({ ...p, state: planState(p, c.today), members: count.get(p.id) ?? 0, totalPaise: invoiceTotals([{ quantity: 1, unitPaise: p.pricePaise, taxRateBp: p.taxRateBp }]).totalPaise }))
      .sort((a, b) => (a.state === "on_sale" ? 0 : 1) - (b.state === "on_sale" ? 0 : 1) || a.pricePaise - b.pricePaise || a.name.localeCompare(b.name)),
    branches: branches.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name, stateCode: b.stateCode })).sort((a, b) => a.name.localeCompare(b.name)),
    ptPricing: await ptPricingFor(c.tenantId), ptIsDefault: !tenant?.ptPricing,
    discountLimits: [{ role: "front_desk", label: "Front desk", bp: top("front_desk") }, { role: "branch_manager", label: "Branch manager", bp: top("branch_manager") }, { role: "owner", label: "Owner", bp: top("owner") }],
    gstRatesBp: GST_RATES_BP,
  };
}

const num = z.number().nullable().optional();
const Input = z.object({
  /** Absent when making a new plan. */
  planId: z.string().min(1).optional(),
  key: z.string().min(8),
  name: z.string(),
  kind: z.enum(["trial", "time", "visit"]),
  pricePaise: z.number().nullable(),
  taxRateBp: z.number(),
  durationDays: num, visits: num, classEntitlements: num, ptCredits: num, maxDiscountBp: num, graceDays: num,
  branchIds: z.array(z.string()),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
});
export type SavePlanInput = z.input<typeof Input>;

/** Makes or changes a plan. Rule breaks come back as one message that names the first problem; `details.errors` has them all, by field, for the form. */
export async function savePlan(session: Session | null, raw: SavePlanInput): Promise<{ plan: MembershipPlan; created: boolean; repeated: boolean }> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check the plan and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "pricing.manage");
  return db.transaction("rw", db.tables, async () => {
    const auditId = `ae_plan_${input.key}`;
    const before = input.planId ? await db.membershipPlans.get(input.planId) : undefined;
    if (input.planId && (!before || before.tenantId !== c.tenantId)) throw new ApiError("not_found", "We couldn’t find that plan. It may have been removed.");
    if (await db.auditEvents.get(auditId)) {
      const done = await db.membershipPlans.get(input.planId ?? `pl_${input.key}`);
      if (done) return { plan: done, created: !input.planId, repeated: true };
    }
    const [plans, branches] = await Promise.all([db.membershipPlans.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray()]);
    const errors: PlanErrors = validatePlan({ ...input, durationDays: input.durationDays ?? null }, { branchIds: branches.map((b) => b.id), otherNames: plans.filter((p) => p.id !== input.planId).map((p) => p.name) });
    const first = Object.values(errors)[0];
    if (first) throw new ApiError("invalid", first, { errors });

    const orUndef = <T,>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);
    const plan: MembershipPlan = {
      id: before?.id ?? `pl_${input.key}`, tenantId: c.tenantId, name: input.name.trim().replace(/\s+/g, " "), kind: input.kind, pricePaise: input.pricePaise!, taxRateBp: input.taxRateBp,
      durationDays: orUndef(input.durationDays), visits: input.kind === "visit" ? orUndef(input.visits) : undefined, branchIds: [...input.branchIds].sort(),
      classEntitlements: orUndef(input.classEntitlements), ptCredits: orUndef(input.ptCredits), effectiveFrom: input.effectiveFrom, effectiveTo: orUndef(input.effectiveTo) || undefined,
      active: before?.active ?? true, maxDiscountBp: orUndef(input.maxDiscountBp), graceDays: orUndef(input.graceDays),
    };
    await db.membershipPlans.put(plan);
    const changed = before ? (Object.keys(plan) as Array<keyof MembershipPlan>).filter((k) => JSON.stringify(plan[k]) !== JSON.stringify(before[k])) : [];
    if (before && changed.length === 0) return { plan, created: false, repeated: false };
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "plan.change", entityType: "plan", entityId: plan.id, details: before ? { change: "edited", name: plan.name, changed: Object.fromEntries(changed.map((k) => [k, { from: before[k] ?? null, to: plan[k] ?? null }])) } : { change: "created", name: plan.name, kind: plan.kind, pricePaise: plan.pricePaise } }, auditId, now()));
    return { plan, created: !before, repeated: false };
  });
}

/** Stops selling a plan or sells it again. Members who already bought it are not touched. */
export async function setPlanOnSale(session: Session | null, input: { planId: string; on: boolean; key: string }): Promise<MembershipPlan> {
  if (!input.planId || typeof input.on !== "boolean" || !input.key || input.key.length < 8) throw new ApiError("invalid", "Check the plan and try again.");
  const c = await openOwner(session, "pricing.manage");
  return db.transaction("rw", db.tables, async () => {
    const plan = await db.membershipPlans.get(input.planId);
    if (!plan || plan.tenantId !== c.tenantId) throw new ApiError("not_found", "We couldn’t find that plan. It may have been removed.");
    if (plan.active === input.on) return plan;
    const next = { ...plan, active: input.on };
    await db.membershipPlans.put(next);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "plan.change", entityType: "plan", entityId: plan.id, details: { change: input.on ? "on_sale" : "off_sale", name: plan.name } }, `ae_plan_${input.key}`, now()));
    return next;
  });
}

const PtInput = z.object({ key: z.string().min(8), sessionPricePaise: z.number().nullable(), taxRateBp: z.number(), packs: z.array(z.number()), expiryDays: z.number().nullable() });
export type SavePtPricingInput = z.input<typeof PtInput>;

/** What personal training costs and which packs the member can buy. Packs already bought keep the price they were bought at; invoices already raised are not changed. */
export async function savePtPricing(session: Session | null, raw: SavePtPricingInput): Promise<PtPricing> {
  const parsed = PtInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check the session pricing and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "pricing.manage");
  const errors = validatePtPricing(input);
  const first = Object.values(errors)[0];
  if (first) throw new ApiError("invalid", first, { errors });
  return db.transaction("rw", db.tables, async () => {
    const auditId = `ae_pt_${input.key}`;
    const before = await ptPricingFor(c.tenantId);
    const next: PtPricing = { sessionPricePaise: input.sessionPricePaise!, taxRateBp: input.taxRateBp, packs: [...input.packs].sort((a, b) => a - b), expiryDays: input.expiryDays! };
    if (await db.auditEvents.get(auditId)) return next;
    if (JSON.stringify(before) === JSON.stringify(next) && (await db.tenants.get(c.tenantId))?.ptPricing) return next;
    await db.tenants.update(c.tenantId, { ptPricing: next });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "plan.change", entityType: "pt_pricing", entityId: c.tenantId, details: { change: "session pricing", from: before, to: next } }, auditId, now()));
    return next;
  });
}

export { DEFAULT_PT_PRICING };
