import { db } from "@/demo/db";
import { ApiError } from "@/api/errors";
import { openOwner } from "@/api/owner";
import { buildAuditEvent } from "@/domain/audit";
import { addDays } from "@/domain/dates";
import { daysBetween } from "@/domain/dates";
import { STATE_RULES, subscriptionStatus, usageLevel, type Level, type SubscriptionStatus } from "@/domain/subscription";
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
  invoices: Array<{ id: string; number: string; issuedOn: string; dueOn: string; description: string; amountPaise: number; status: string; paidOn?: string }>;
  /** What the state means for the gym today, with a banner to show and whether the owner can pay and reactivate. */
  status: SubscriptionStatus;
  /** The owner’s open request for another plan, and the last answer. */
  request?: { planId: string; planName: string; status: string; at: string; decisionNote?: string };
}

export async function getSubscription(session: Session | null): Promise<SubscriptionView> {
  const c = await openOwner(session, "subscription.view");
  const [tenant, plans, branches, roles, users, memberships, invoices, requests] = await Promise.all([db.tenants.get(c.tenantId), db.saasPlans.toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray(), db.memberships.where("tenantId").equals(c.tenantId).toArray(), db.saasInvoices.where("tenantId").equals(c.tenantId).toArray(), db.planRequests.where("tenantId").equals(c.tenantId).toArray()]);
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
    usage: [row("branches", "Branches"), row("staff", "Staff accounts"), row("activeMembers", "Active members")], plans: [...plans].sort((a, b) => (a.monthlyPaise ?? Infinity) - (b.monthlyPaise ?? Infinity)), rule: STATE_RULES[sub.state],
    invoices: invoices.sort((a, b) => b.issuedOn.localeCompare(a.issuedOn)).map((i) => ({ id: i.id, number: i.number, issuedOn: i.issuedOn, dueOn: i.dueOn, description: i.description, amountPaise: i.amountPaise, status: i.status, paidOn: i.paidOn })),
    status: subscriptionStatus(sub, tenant!.name, c.today),
    request: ((r) => r && { planId: r.planId, planName: plans.find((p) => p.id === r.planId)?.name ?? r.planId, status: r.status, at: r.at, decisionNote: r.decisionNote })([...requests].sort((a, b) => b.at.localeCompare(a.at))[0]),
  };
}

// ── What the owner can do about it ──────────────────────────────────────────────────────────────

const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

/** Asks Ember for another plan (the upgrade path when a limit or a feature is in the way). The platform approves or declines; nothing changes until it does. */
export async function requestPlanChange(session: Session | null, input: { planId: string; note?: string; key: string }): Promise<{ status: "pending" }> {
  if (!input.planId || !input.key || input.key.length < 8) throw new ApiError("invalid", "Choose a plan.");
  const c = await openOwner(session, "subscription.view");
  return db.transaction("rw", db.tables, async () => {
    const id = `pr_${input.key}`;
    if (await db.planRequests.get(id)) return { status: "pending" as const };
    const [t, plan, pending] = await Promise.all([db.tenants.get(c.tenantId), db.saasPlans.get(input.planId), db.planRequests.where("tenantId").equals(c.tenantId).filter((r) => r.status === "pending").toArray()]);
    if (!plan || plan.archived) throw new ApiError("invalid", "That plan isn’t on offer. Choose another.");
    if (plan.id === t!.subscription.saasPlanId) throw new ApiError("conflict", `You are already on ${plan.name}.`);
    if (pending.length) throw new ApiError("conflict", "You already have a request waiting for Ember. It will be answered before another can be made.");
    await db.planRequests.add({ id, tenantId: c.tenantId, planId: plan.id, requestedBy: c.principal.userId, note: input.note?.trim() || undefined, at: c.nowIso, status: "pending" });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "subscription.change", reason: input.note?.trim() || undefined, entityType: "plan_request", entityId: id, details: { change: "asked Ember for another plan", to: plan.name } }, rid("ae"), new Date(c.nowIso)));
    return { status: "pending" as const };
  });
}

/** Pays what is overdue (simulated in demo mode) and reopens the gym at once. A canceled gym can be reactivated until its download window has closed. */
export async function reactivateSubscription(session: Session | null, input: { key: string }): Promise<{ state: "paid"; paidPaise: number; repeated: boolean }> {
  if (!input.key || input.key.length < 8) throw new ApiError("invalid", "Try again.");
  const c = await openOwner(session, "subscription.view");
  return db.transaction("rw", db.tables, async () => {
    const auditId = `ae_react_${input.key}`;
    if (await db.auditEvents.get(auditId)) return { state: "paid" as const, paidPaise: 0, repeated: true };
    const t = (await db.tenants.get(c.tenantId))!;
    const st = subscriptionStatus(t.subscription, t.name, c.today);
    if (t.subscription.state === "paid" && st.effective === "paid") throw new ApiError("conflict", "The subscription is paid and the gym is fully open. There is nothing to reactivate.");
    if (st.effective === "trial") throw new ApiError("conflict", "The free trial is still running. Everything is open.");
    if (st.effective === "canceled" && st.exportUntil && c.today > st.exportUntil) throw new ApiError("conflict", "The 30 days to download ended on the canceled date plus 30. Ask Ember to restore the gym.");
    const open = await db.saasInvoices.where("tenantId").equals(c.tenantId).filter((i) => i.status === "open" && i.dueOn <= c.today).toArray();
    let paid = 0;
    for (const i of open) { await db.saasInvoices.update(i.id, { status: "paid", paidOn: c.today }); paid += i.amountPaise; }
    await db.tenants.put({ ...t, subscription: { state: "paid", saasPlanId: t.subscription.saasPlanId, renewsOn: addDays(c.today, 30) } });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "subscription.change", entityType: "tenant", entityId: c.tenantId, details: { change: "reactivated by the owner", from: st.effective, paidPaise: paid } }, auditId, new Date(c.nowIso)));
    return { state: "paid" as const, paidPaise: paid, repeated: false };
  });
}
