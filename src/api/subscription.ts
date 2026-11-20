import { db } from "@/demo/db";
import { openOwner } from "@/api/owner";
import { daysBetween } from "@/domain/dates";
import { STATE_RULES, usageLevel, type Level } from "@/domain/subscription";
import type { SaasPlan } from "@/domain/types";
import type { SubscriptionStateName } from "@/domain/subscription";
import type { Session } from "@/app/session";

/** The gym’s Ember subscription (S02), owner only: its plan and state, what it uses against each limit, what each plan includes and what each state means. Separate from member billing. */
export interface SubscriptionView {
  today: string;
  gym: string;
  plan: SaasPlan;
  state: SubscriptionStateName;
  trialEndsAt?: string;
  renewsOn?: string;
  daysLeft?: number;
  usage: Array<{ key: "branches" | "staff" | "activeMembers"; label: string; used: number; limit: number | null; level: Level }>;
  plans: SaasPlan[];
  rule: { now: string; ends: string };
  invoices: Array<{ id: string; number: string; on: string; amountPaise: number; status: string }>;
}

export async function getSubscription(session: Session | null): Promise<SubscriptionView> {
  const c = await openOwner(session, "subscription.view");
  const [tenant, plans, branches, roles, users, memberships] = await Promise.all([db.tenants.get(c.tenantId), db.saasPlans.toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray(), db.memberships.where("tenantId").equals(c.tenantId).toArray()]);
  const sub = tenant!.subscription;
  const plan = plans.find((p) => p.id === sub.saasPlanId)!;
  const active = users.filter((u) => u.status !== "disabled");
  const used = {
    branches: branches.filter((b) => b.active).length,
    staff: roles.filter((r) => active.some((u) => u.id === r.userId)).length,
    activeMembers: new Set(memberships.filter((m) => m.status === "active" || m.status === "frozen").map((m) => m.memberId)).size,
  };
  const row = (key: "branches" | "staff" | "activeMembers", label: string) => ({ key, label, used: used[key], limit: plan.limits[key], level: usageLevel(used[key], plan.limits[key]) });
  return {
    today: c.today, gym: tenant!.name, plan, state: sub.state, trialEndsAt: sub.trialEndsAt?.slice(0, 10), renewsOn: sub.renewsOn, daysLeft: sub.trialEndsAt ? Math.max(0, daysBetween(c.today, sub.trialEndsAt.slice(0, 10))) : sub.renewsOn ? Math.max(0, daysBetween(c.today, sub.renewsOn)) : undefined,
    usage: [row("branches", "Branches"), row("staff", "Staff accounts"), row("activeMembers", "Active members")], plans: [...plans].sort((a, b) => (a.monthlyPaise ?? Infinity) - (b.monthlyPaise ?? Infinity)), rule: STATE_RULES[sub.state], invoices: [],
  };
}
