import { db } from "@/demo/db";
import { ApiError } from "@/api/errors";
import { usageLevel, FEATURE_LABEL } from "@/domain/subscription";
import type { Principal } from "@/domain/permissions";
import type { SaasPlan, Tenant } from "@/domain/types";

/**
 * What a gym uses against its Ember plan (S02), and the checks that stop it going past: staff accounts and active members have limits, and some plans don’t include some features. Counts are made from
 * the gym’s own records and never leave this module as anything but numbers. A refusal says what the plan allows, what is in use, and how to get more (the owner asks Ember on the Subscription page; anyone else asks the owner).
 */
export type LimitKey = "branches" | "staff" | "activeMembers";
export const LIMIT_WORDS: Record<LimitKey, [one: string, many: string]> = { branches: ["branch", "branches"], staff: ["staff account", "staff accounts"], activeMembers: ["active member", "active members"] };

export async function usageOf(tenantId: string): Promise<Record<LimitKey, number>> {
  const [branches, roles, users, memberships] = await Promise.all([db.branches.where("tenantId").equals(tenantId).toArray(), db.staffRoles.where("tenantId").equals(tenantId).toArray(), db.users.where("tenantId").equals(tenantId).toArray(), db.memberships.where("tenantId").equals(tenantId).toArray()]);
  const active = new Set(users.filter((u) => u.status !== "disabled").map((u) => u.id));
  return {
    branches: branches.filter((b) => b.active).length,
    staff: roles.filter((r) => active.has(r.userId)).length,
    activeMembers: new Set(memberships.filter((m) => m.status === "active" || m.status === "frozen").map((m) => m.memberId)).size,
  };
}

export async function planOf(tenantId: string): Promise<{ tenant: Tenant; plan: SaasPlan }> {
  const tenant = (await db.tenants.get(tenantId))!;
  const plan = (await db.saasPlans.get(tenant.subscription.saasPlanId))!;
  return { tenant, plan };
}

const askFor = (p: Pick<Principal, "role">) => (p.role === "owner" ? "Ask Ember for a larger plan on the Subscription page, or free some up." : "Ask the gym’s owner to ask Ember for a larger plan.");

/** Refuses adding `adding` more of something when the plan’s limit would be passed. */
export async function requireRoom(principal: Pick<Principal, "role" | "tenantId">, key: LimitKey, adding = 1): Promise<void> {
  if (!principal.tenantId) return;
  const [{ plan }, used] = await Promise.all([planOf(principal.tenantId), usageOf(principal.tenantId)]);
  const limit = plan.limits[key];
  if (limit === null || used[key] + adding <= limit) return;
  const [one, many] = LIMIT_WORDS[key];
  throw new ApiError("forbidden", `Your ${plan.name} plan allows ${limit} ${limit === 1 ? one : many} and ${used[key]} ${used[key] === 1 ? "is" : "are"} in use. ${askFor(principal)}`, { upgrade: principal.role === "owner" ? "/owner/subscription" : undefined, limit: key });
}

/** Refuses a feature the gym’s plan doesn’t include, and says which plan does. */
export async function requireFeature(principal: Pick<Principal, "role" | "tenantId">, feature: string): Promise<void> {
  if (!principal.tenantId) return;
  const { plan } = await planOf(principal.tenantId);
  if (plan.features.includes(feature) || plan.features.includes("everything")) return;
  const plans = (await db.saasPlans.toArray()).filter((p) => !p.archived && (p.features.includes(feature) || p.features.includes("everything"))).sort((a, b) => (a.monthlyPaise ?? Infinity) - (b.monthlyPaise ?? Infinity));
  throw new ApiError("forbidden", `${FEATURE_LABEL[feature] ?? feature} isn’t part of your ${plan.name} plan${plans[0] ? `. It comes with ${plans[0].name}` : ""}. ${askFor(principal)}`, { upgrade: principal.role === "owner" ? "/owner/subscription" : undefined, feature });
}

export { usageLevel };
