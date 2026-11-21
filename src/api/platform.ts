import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { assertCan, open } from "@/api/context";
import { endExpiredSupport } from "@/api/supportAccess";
import { ApiError } from "@/api/errors";
import { usageOf, type LimitKey } from "@/api/usage";
import { buildAuditEvent, type AuditInput } from "@/domain/audit";
import { addDays, istDateOf, todayIST } from "@/domain/dates";
import { onboardingSteps, tenantHealth, validateSaasPlan, validateSupportRequest, type HealthLevel, type OnboardingStep } from "@/domain/platform";
import type { Action, Principal } from "@/domain/permissions";
import { STATE_LABEL, subscriptionStatus, usageLevel, type Level, type SubscriptionStatus } from "@/domain/subscription";
import type { PlanRequest, SaasInvoice, SaasPlan, SubscriptionState as StateEnum, SupportSession, Tenant } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Ember’s own console (R01, S01, S02, S05). A platform administrator sees gyms as accounts: their plan, state, use against limits and onboarding, never their members or money. The only way into a gym’s
 * records is a support session: asked for with a reason and a time, read-only, announced to everyone in the gym, ended on its own, and written to the gym’s audit log. Every change here is audited
 * twice: in the platform’s log, and in the gym’s own log where its owner can read it.
 */
type StateName = z.infer<typeof StateEnum>;
const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
const hash = (t: string) => [...t].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36);

async function admin(session: Session | null, action: Action): Promise<{ principal: Principal; today: string; nowIso: string }> {
  const { principal } = await open(session);
  assertCan(principal, action);
  const n = now();
  return { principal, today: todayIST(n), nowIso: n.toISOString() };
}

/** An audit event in the platform’s log (no gym) and, for a change to one gym, the same in that gym’s log. */
async function audit(a: { principal: Principal }, input: AuditInput, tenantId?: string, tenantEventId?: string): Promise<void> {
  const at = now();
  await db.auditEvents.add(buildAuditEvent({ ...a.principal, tenantId: null }, input, rid("ae"), at));
  if (tenantId) await db.auditEvents.add(buildAuditEvent({ ...a.principal, tenantId }, input, tenantEventId ?? rid("ae"), at));
}

// ── Tenants ─────────────────────────────────────────────────────────────────────────────────────

export interface UsageRow { key: LimitKey; label: string; used: number; limit: number | null; level: Level }
export interface TenantRow {
  id: string; name: string; slug: string; city?: string; planId: string; planName: string; monthlyPaise: number | null; state: StateName; effective: StateName; stateLabel: string; access: SubscriptionStatus["access"];
  health: { level: HealthLevel; reasons: string[] }; usage: UsageRow[]; onboarding: { percent: number; steps: OnboardingStep[] }; owner?: { name: string; email?: string; status: string }; createdOn: string; lastActivityOn?: string; renewsOn?: string; trialEndsOn?: string;
}

async function rowFor(t: Tenant, plans: SaasPlan[], today: string): Promise<TenantRow> {
  const plan = plans.find((p) => p.id === t.subscription.saasPlanId)!;
  const [used, users, roles, branches, members, checkIns, events] = await Promise.all([
    usageOf(t.id), db.users.where("tenantId").equals(t.id).toArray(), db.staffRoles.where("tenantId").equals(t.id).toArray(), db.branches.where("tenantId").equals(t.id).toArray(),
    db.members.where("tenantId").equals(t.id).count(), db.checkIns.where("tenantId").equals(t.id).toArray(), db.auditEvents.where("tenantId").equals(t.id).toArray(),
  ]);
  const ownerRole = roles.find((r) => r.role === "owner");
  const owner = users.find((u) => u.id === ownerRole?.userId);
  const status = subscriptionStatus(t.subscription, t.name, today);
  const usage: UsageRow[] = (["branches", "staff", "activeMembers"] as const).map((k) => ({ key: k, label: ({ branches: "Branches", staff: "Staff accounts", activeMembers: "Active members" })[k], used: used[k], limit: plan.limits[k], level: usageLevel(used[k], plan.limits[k]) }));
  const onboarding = onboardingSteps({ ownerInvited: !!owner, branchesConfigured: branches.length > 0 && branches.every((b) => b.hours.length > 0), membersImported: members > 0 });
  const last = [...checkIns.map((c) => istDateOf(c.at)), ...events.filter((e) => !e.action.startsWith("support.") && e.actorRole !== "platform_admin").map((e) => istDateOf(e.at))].sort().at(-1);
  const createdOn = t.createdAt.slice(0, 10);
  return {
    id: t.id, name: t.name, slug: t.slug, city: branches[0]?.city, planId: plan.id, planName: plan.name, monthlyPaise: plan.monthlyPaise, state: t.subscription.state, effective: status.effective, stateLabel: STATE_LABEL[status.effective], access: status.access,
    health: tenantHealth({ status, trialEndsOn: t.subscription.trialEndsAt?.slice(0, 10), usage: usage.map((u) => ({ label: u.label, level: u.level })), lastActivityOn: last, onboardingPercent: onboarding.percent, createdOn, today }),
    usage, onboarding, owner: owner && { name: owner.name, email: owner.email, status: owner.status }, createdOn, lastActivityOn: last, renewsOn: t.subscription.renewsOn, trialEndsOn: t.subscription.trialEndsAt?.slice(0, 10),
  };
}

export async function listTenants(session: Session | null): Promise<{ today: string; tenants: TenantRow[]; plans: Array<Pick<SaasPlan, "id" | "name">> }> {
  const a = await admin(session, "tenant.read");
  const [tenants, plans] = await Promise.all([db.tenants.toArray(), db.saasPlans.toArray()]);
  const rows = await Promise.all(tenants.map((t) => rowFor(t, plans, a.today)));
  const order: Record<HealthLevel, number> = { risk: 0, watch: 1, good: 2 };
  return { today: a.today, tenants: rows.sort((x, y) => order[x.health.level] - order[y.health.level] || x.name.localeCompare(y.name)), plans: plans.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name })) };
}

export interface TenantDetail extends TenantRow {
  plan: SaasPlan;
  status: SubscriptionStatus;
  entitlements: Array<{ key: string; included: boolean }>;
  billing: { trialEndsOn?: string; renewsOn?: string; pastDueSince?: string; suspendedOn?: string; canceledOn?: string };
  invoices: SaasInvoice[];
  requests: Array<PlanRequest & { planName: string; requestedByName: string }>;
  support: Array<{ id: string; adminName: string; reason: string; minutes: number; startedAt: string; expiresAt: string; endedAt?: string; endedBy?: string }>;
  plans: SaasPlan[];
}

export async function getTenantDetail(session: Session | null, tenantId: string): Promise<TenantDetail> {
  const a = await admin(session, "tenant.read");
  await endExpiredSupport(tenantId);
  const [t, plans, invoices, requests, support, users] = await Promise.all([db.tenants.get(tenantId), db.saasPlans.toArray(), db.saasInvoices.where("tenantId").equals(tenantId).toArray(), db.planRequests.where("tenantId").equals(tenantId).toArray(), db.supportSessions.where("tenantId").equals(tenantId).toArray(), db.users.toArray()]);
  if (!t) throw new ApiError("not_found", "We couldn’t find that gym.");
  const row = await rowFor(t, plans, a.today);
  const plan = plans.find((p) => p.id === t.subscription.saasPlanId)!;
  const all = ["memberships", "invoices", "qr_checkin", "workouts", "pt_credits", "reports", "analytics", "branch_permissions"];
  const name = new Map(users.map((u) => [u.id, u.name]));
  return {
    ...row, plan, status: subscriptionStatus(t.subscription, t.name, a.today), entitlements: all.map((key) => ({ key, included: plan.features.includes(key) || plan.features.includes("everything") })),
    billing: { trialEndsOn: t.subscription.trialEndsAt?.slice(0, 10), renewsOn: t.subscription.renewsOn, pastDueSince: t.subscription.pastDueSince, suspendedOn: t.subscription.suspendedOn, canceledOn: t.subscription.canceledOn },
    invoices: invoices.sort((x, y) => y.issuedOn.localeCompare(x.issuedOn)), plans: plans.filter((p) => !p.archived || p.id === plan.id),
    requests: requests.sort((x, y) => y.at.localeCompare(x.at)).map((r) => ({ ...r, planName: plans.find((p) => p.id === r.planId)?.name ?? r.planId, requestedByName: name.get(r.requestedBy) ?? "The owner" })),
    support: support.sort((x, y) => y.startedAt.localeCompare(x.startedAt)).map((s) => ({ id: s.id, adminName: name.get(s.adminId) ?? "Ember support", reason: s.reason, minutes: s.minutes, startedAt: s.startedAt, expiresAt: s.expiresAt, endedAt: s.endedAt, endedBy: s.endedBy })),
  };
}

const NewTenant = z.object({ key: z.string().min(8), name: z.string(), ownerName: z.string(), ownerEmail: z.string(), planId: z.string() });
export type NewTenantInput = z.input<typeof NewTenant>;

/** S01: creates the gym account on a 14-day trial and invites its owner. The gym has no branches or members until its owner sets them up, which the onboarding steps show. */
export async function createTenant(session: Session | null, raw: NewTenantInput): Promise<{ id: string }> {
  const p = NewTenant.safeParse(raw);
  if (!p.success) throw new ApiError("invalid", "Check the details and try again.");
  const input = p.data;
  const a = await admin(session, "tenant.manage");
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.ownerEmail.trim().toLowerCase();
  if (name.length < 2) throw new ApiError("invalid", "Enter the gym’s name.");
  if (input.ownerName.trim().length < 2) throw new ApiError("invalid", "Enter the owner’s name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError("invalid", "Enter the owner’s email, like name@example.in. The invitation goes there.");
  const { POLICY_DEFAULTS } = await import("@/domain/policyDefaults");
  return db.transaction("rw", db.tables, async () => {
    const id = `t_${slug(name).replace(/-/g, "_").slice(0, 16)}_${hash(input.key).slice(0, 4)}`;
    if (await db.tenants.get(id)) return { id };
    const [tenants, users, plan] = await Promise.all([db.tenants.toArray(), db.users.toArray(), db.saasPlans.get(input.planId)]);
    if (!plan || plan.archived) throw new ApiError("invalid", "Choose a plan that is on offer.");
    if (tenants.some((t) => t.name.toLowerCase() === name.toLowerCase())) throw new ApiError("conflict", "A gym with this name already exists.");
    if (users.some((u) => u.email?.toLowerCase() === email)) throw new ApiError("conflict", "Someone already has this email. Use another for the owner.");
    const ownerId = `u_${id}_owner`;
    await db.tenants.add({ id, name, slug: slug(name), currency: "INR", timeZone: "Asia/Kolkata", subscription: { state: "trial", saasPlanId: plan.id, trialEndsAt: `${addDays(a.today, 14)}T04:30:00.000Z`, renewsOn: addDays(a.today, 14) }, createdAt: a.nowIso });
    await db.users.add({ id: ownerId, tenantId: id, name: input.ownerName.trim(), email, role: "owner", status: "invited", mfaEnabled: false, createdAt: a.nowIso });
    await db.staffRoles.add({ id: `sr_${ownerId}`, tenantId: id, userId: ownerId, role: "owner", branchIds: [], limits: { refundLimitPaise: null, canOverrideCheckIn: true, maxDiscountBp: 2000, canViewClientHealth: false } });
    await db.gymPolicies.add({ id: `pol_${id}`, tenantId: id, ...POLICY_DEFAULTS });
    await db.emailLog.add({ id: rid("em"), tenantId: id, userId: ownerId, template: "staff_invite", to: email, subject: `${name} is ready on Ember`, body: `Hi ${input.ownerName.trim().split(" ")[0]},\n\nYour gym, ${name}, has been set up on Ember with a 14-day free trial. Open the link to set your password, then add your branches and import your members.\n\nhttps://app.ember.example/invite/${ownerId}`, status: "sent", sentAt: a.nowIso });
    await audit(a, { action: "subscription.change", entityType: "tenant", entityId: id, details: { change: "gym created", name, plan: plan.name, owner: input.ownerName.trim() } }, id);
    return { id };
  });
}

const StateInput = z.object({ key: z.string().min(8), tenantId: z.string().min(1), state: z.enum(["trial", "paid", "past_due", "suspended", "canceled"]), reason: z.string().trim().min(3, "Say why the state is changing. The gym’s owner can read it.") });
export type SetStateInput = z.input<typeof StateInput>;

/** Moves a gym to another subscription state, which changes what its app allows at once (S02). The reason is shown to the gym’s owner in their audit log. */
export async function setSubscriptionState(session: Session | null, raw: SetStateInput): Promise<{ from: StateName; to: StateName; repeated: boolean }> {
  const p = StateInput.safeParse(raw);
  if (!p.success) throw new ApiError("invalid", p.error.issues[0]?.message ?? "Check the details and try again.");
  const input = p.data;
  const a = await admin(session, "tenant.manage");
  return db.transaction("rw", db.tables, async () => {
    const t = await db.tenants.get(input.tenantId);
    if (!t) throw new ApiError("not_found", "We couldn’t find that gym.");
    const auditId = `ae_sub_${input.key}`;
    if (await db.auditEvents.get(auditId)) return { from: t.subscription.state, to: t.subscription.state, repeated: true };
    const from = t.subscription.state;
    if (from === input.state) throw new ApiError("conflict", `${t.name} is already ${STATE_LABEL[from].toLowerCase()}.`);
    const sub: Tenant["subscription"] = { state: input.state, saasPlanId: t.subscription.saasPlanId, renewsOn: t.subscription.renewsOn };
    if (input.state === "trial") { sub.trialEndsAt = `${addDays(a.today, 14)}T04:30:00.000Z`; sub.renewsOn = addDays(a.today, 14); }
    if (input.state === "paid") { sub.renewsOn = t.subscription.renewsOn && t.subscription.renewsOn > a.today ? t.subscription.renewsOn : addDays(a.today, 30); }
    if (input.state === "past_due") sub.pastDueSince = a.today;
    if (input.state === "suspended") { sub.suspendedOn = a.today; sub.pastDueSince = t.subscription.pastDueSince; }
    if (input.state === "canceled") sub.canceledOn = a.today;
    await db.tenants.put({ ...t, subscription: sub });
    if (input.state === "paid") for (const i of await db.saasInvoices.where("tenantId").equals(t.id).filter((x) => x.status === "open" && x.dueOn <= a.today).toArray()) await db.saasInvoices.update(i.id, { status: "paid", paidOn: a.today });
    if (input.state === "past_due" || input.state === "suspended") if (!(await db.saasInvoices.where("tenantId").equals(t.id).filter((x) => x.status === "open" && x.dueOn <= a.today).count())) await makeInvoice(t.id, a.today, `si_${input.key}`, true);
    await audit(a, { action: "subscription.change", reason: input.reason, entityType: "tenant", entityId: t.id, details: { name: t.name, from: STATE_LABEL[from], to: STATE_LABEL[input.state] } }, t.id, auditId);
    return { from, to: input.state, repeated: false };
  });
}

async function makeInvoice(tenantId: string, today: string, id: string, overdue = false): Promise<SaasInvoice> {
  const [t, plans, all] = await Promise.all([db.tenants.get(tenantId), db.saasPlans.toArray(), db.saasInvoices.toArray()]);
  const plan = plans.find((p) => p.id === t!.subscription.saasPlanId)!;
  const price = plan.monthlyPaise ?? 0;
  const tax = Math.round((price * 18) / 100);
  const mine = all.filter((i) => i.tenantId === tenantId).sort((x, y) => y.periodTo.localeCompare(x.periodTo));
  const periodFrom = overdue ? addDays(today, -3) : mine[0] ? addDays(mine[0].periodTo, 1) : today;
  const periodTo = addDays(periodFrom, 29);
  const inv: SaasInvoice = { id, tenantId, number: `EMB/26-27/${String(all.length + 1).padStart(4, "0")}`, issuedOn: overdue ? addDays(today, -8) : today, dueOn: overdue ? addDays(today, -3) : periodFrom, periodFrom, periodTo, planId: plan.id, description: `${plan.name} plan, ${periodFrom} to ${periodTo}`, amountPaise: price + tax, taxPaise: tax, status: "open" };
  await db.saasInvoices.add(inv);
  return inv;
}

/** The next month’s software invoice for a gym. The same key twice makes one. */
export async function issueInvoice(session: Session | null, input: { tenantId: string; key: string }): Promise<SaasInvoice> {
  if (!input.tenantId || !input.key || input.key.length < 8) throw new ApiError("invalid", "Check the details and try again.");
  const a = await admin(session, "tenant.manage");
  return db.transaction("rw", db.tables, async () => {
    const existing = await db.saasInvoices.get(`si_${input.key}`);
    if (existing) return existing;
    const t = await db.tenants.get(input.tenantId);
    if (!t) throw new ApiError("not_found", "We couldn’t find that gym.");
    const plan = await db.saasPlans.get(t.subscription.saasPlanId);
    if (!plan?.monthlyPaise) throw new ApiError("conflict", `${plan?.name ?? "This plan"} is agreed with the gym, so it has no monthly invoice to issue here.`);
    const inv = await makeInvoice(t.id, a.today, `si_${input.key}`);
    await audit(a, { action: "subscription.change", entityType: "saas_invoice", entityId: inv.id, details: { name: t.name, change: "invoice issued", number: inv.number, amountPaise: inv.amountPaise } }, t.id);
    return inv;
  });
}

/** Marks a software invoice paid. When that clears what made the gym overdue or suspended, it is reactivated. */
export async function markInvoicePaid(session: Session | null, input: { invoiceId: string }): Promise<{ reactivated: boolean }> {
  if (!input.invoiceId) throw new ApiError("invalid", "Choose an invoice.");
  const a = await admin(session, "tenant.manage");
  return db.transaction("rw", db.tables, async () => {
    const inv = await db.saasInvoices.get(input.invoiceId);
    if (!inv) throw new ApiError("not_found", "We couldn’t find that invoice.");
    if (inv.status === "paid") return { reactivated: false };
    await db.saasInvoices.update(inv.id, { status: "paid", paidOn: a.today });
    const t = (await db.tenants.get(inv.tenantId))!;
    const still = await db.saasInvoices.where("tenantId").equals(t.id).filter((x) => x.status === "open" && x.dueOn < a.today).count();
    const reactivate = !still && (t.subscription.state === "past_due" || t.subscription.state === "suspended");
    if (reactivate) await db.tenants.put({ ...t, subscription: { state: "paid", saasPlanId: t.subscription.saasPlanId, renewsOn: addDays(a.today, 30) } });
    await audit(a, { action: "subscription.change", entityType: "saas_invoice", entityId: inv.id, details: { name: t.name, change: reactivate ? "invoice paid, gym reactivated" : "invoice paid", number: inv.number } }, t.id);
    return { reactivated: reactivate };
  });
}

const PlanChange = z.object({ key: z.string().min(8), tenantId: z.string().min(1), planId: z.string().min(1) });
/** Moves a gym to another Ember plan. Its limits and features change at once; nothing it already has is removed. */
export async function changeTenantPlan(session: Session | null, raw: z.input<typeof PlanChange>): Promise<{ from: string; to: string }> {
  const p = PlanChange.safeParse(raw);
  if (!p.success) throw new ApiError("invalid", "Check the details and try again.");
  const input = p.data;
  const a = await admin(session, "tenant.manage");
  return db.transaction("rw", db.tables, async () => {
    const [t, plan] = await Promise.all([db.tenants.get(input.tenantId), db.saasPlans.get(input.planId)]);
    if (!t || !plan) throw new ApiError("not_found", "We couldn’t find that gym or plan.");
    if (plan.archived) throw new ApiError("invalid", `${plan.name} is no longer offered. Choose another plan.`);
    const from = (await db.saasPlans.get(t.subscription.saasPlanId))!.name;
    if (plan.id === t.subscription.saasPlanId) return { from, to: plan.name };
    await db.tenants.put({ ...t, subscription: { ...t.subscription, saasPlanId: plan.id } });
    await audit(a, { action: "subscription.change", entityType: "tenant", entityId: t.id, details: { name: t.name, change: "plan changed", from, to: plan.name } }, t.id);
    return { from, to: plan.name };
  });
}

const Decide = z.object({ key: z.string().min(8), requestId: z.string().min(1), approve: z.boolean(), note: z.string().trim().optional() });
/** Answers a gym’s request for another plan. Approving changes the plan. */
export async function decidePlanRequest(session: Session | null, raw: z.input<typeof Decide>): Promise<{ status: "approved" | "declined" }> {
  const p = Decide.safeParse(raw);
  if (!p.success) throw new ApiError("invalid", "Check the details and try again.");
  const input = p.data;
  const a = await admin(session, "tenant.manage");
  return db.transaction("rw", db.tables, async () => {
    const r = await db.planRequests.get(input.requestId);
    if (!r) throw new ApiError("not_found", "We couldn’t find that request.");
    if (r.status !== "pending") return { status: r.status };
    const t = (await db.tenants.get(r.tenantId))!;
    const plan = (await db.saasPlans.get(r.planId))!;
    const from = (await db.saasPlans.get(t.subscription.saasPlanId))!.name;
    if (input.approve) { if (plan.archived) throw new ApiError("invalid", `${plan.name} is no longer offered.`); await db.tenants.put({ ...t, subscription: { ...t.subscription, saasPlanId: plan.id } }); }
    await db.planRequests.update(r.id, { status: input.approve ? "approved" : "declined", decidedAt: a.nowIso, decidedBy: a.principal.userId, decisionNote: input.note || undefined });
    await audit(a, { action: "subscription.change", reason: input.note || undefined, entityType: "plan_request", entityId: r.id, details: { name: t.name, change: input.approve ? "plan request approved" : "plan request declined", from, to: plan.name } }, t.id);
    return { status: input.approve ? "approved" : "declined" };
  });
}

// ── Ember plans ─────────────────────────────────────────────────────────────────────────────────

export interface SaasPlanRow extends SaasPlan { gyms: Array<{ id: string; name: string }> }
export async function listSaasPlans(session: Session | null): Promise<SaasPlanRow[]> {
  await admin(session, "saasplan.manage");
  const [plans, tenants] = await Promise.all([db.saasPlans.toArray(), db.tenants.toArray()]);
  return plans.sort((x, y) => (x.monthlyPaise ?? Infinity) - (y.monthlyPaise ?? Infinity)).map((p) => ({ ...p, gyms: tenants.filter((t) => t.subscription.saasPlanId === p.id).map((t) => ({ id: t.id, name: t.name })) }));
}

const PlanIn = z.object({ key: z.string().min(8), planId: z.string().optional(), name: z.string(), monthlyRupees: z.string(), branches: z.string(), staff: z.string(), activeMembers: z.string(), features: z.array(z.string()), blurb: z.string() });
export type SaveSaasPlanInput = z.input<typeof PlanIn>;
const lim = (s: string) => (s.trim() === "" ? null : Number(s.trim()));

/** Makes or changes an Ember plan: its price, its limits on branches, staff and active members, and the features it includes. A change applies to every gym on it from now. */
export async function saveSaasPlan(session: Session | null, raw: SaveSaasPlanInput): Promise<SaasPlan> {
  const p = PlanIn.safeParse(raw);
  if (!p.success) throw new ApiError("invalid", "Check the plan and try again.");
  const input = p.data;
  const a = await admin(session, "saasplan.manage");
  return db.transaction("rw", db.tables, async () => {
    const plans = await db.saasPlans.toArray();
    const before = input.planId ? plans.find((x) => x.id === input.planId) : undefined;
    if (input.planId && !before) throw new ApiError("not_found", "We couldn’t find that plan.");
    const errors = validateSaasPlan(input, plans.filter((x) => x.id !== before?.id).map((x) => x.name));
    const first = Object.values(errors)[0];
    if (first) throw new ApiError("invalid", first, { errors });
    const plan: SaasPlan = {
      id: before?.id ?? `sp_${slug(input.name).replace(/-/g, "_")}_${hash(input.key).slice(0, 3)}`, name: input.name.trim(), monthlyPaise: input.monthlyRupees.trim() === "" ? null : Math.round(Number(input.monthlyRupees) * 100),
      limits: { branches: lim(input.branches), staff: lim(input.staff), activeMembers: lim(input.activeMembers) }, features: [...input.features], blurb: input.blurb.trim() || undefined, archived: before?.archived,
    };
    if (before && JSON.stringify(before) === JSON.stringify(plan)) return before;
    await db.saasPlans.put(plan);
    const gyms = (await db.tenants.toArray()).filter((t) => t.subscription.saasPlanId === plan.id);
    const details = before ? { name: plan.name, change: "edited", from: { price: before.monthlyPaise, limits: before.limits, features: before.features }, to: { price: plan.monthlyPaise, limits: plan.limits, features: plan.features } } : { name: plan.name, change: "created" };
    await audit(a, { action: "saasplan.change", entityType: "saas_plan", entityId: plan.id, details }, undefined);
    for (const t of gyms) await audit(a, { action: "saasplan.change", entityType: "saas_plan", entityId: plan.id, details: { ...details, change: "your plan changed" } }, t.id);
    return plan;
  });
}

/** Stops offering a plan to new gyms, or offers it again. A plan with gyms on it can’t be withdrawn: move them first. */
export async function setSaasPlanArchived(session: Session | null, input: { planId: string; archived: boolean }): Promise<void> {
  const a = await admin(session, "saasplan.manage");
  await db.transaction("rw", db.tables, async () => {
    const plan = await db.saasPlans.get(input.planId);
    if (!plan) throw new ApiError("not_found", "We couldn’t find that plan.");
    const gyms = (await db.tenants.toArray()).filter((t) => t.subscription.saasPlanId === plan.id);
    if (input.archived && gyms.length) throw new ApiError("conflict", `${gyms.length} ${gyms.length === 1 ? "gym is" : "gyms are"} on ${plan.name}: ${gyms.map((g) => g.name).sort().join(", ")}. Move ${gyms.length === 1 ? "it" : "them"} to another plan first.`);
    if (!!plan.archived === input.archived) return;
    await db.saasPlans.put({ ...plan, archived: input.archived || undefined });
    await audit(a, { action: "saasplan.change", entityType: "saas_plan", entityId: plan.id, details: { name: plan.name, change: input.archived ? "withdrawn from sale" : "offered again" } });
  });
}

// ── Support access ──────────────────────────────────────────────────────────────────────────────

export interface SupportRow { id: string; tenantId: string; tenantName: string; reason: string; minutes: number; startedAt: string; expiresAt: string; endedAt?: string; endedBy?: string; active: boolean; mine: boolean }

export async function listSupport(session: Session | null): Promise<{ sessions: SupportRow[]; tenants: Array<{ id: string; name: string }>; log: Array<{ id: string; at: string; label: string; actor: string }> }> {
  const a = await admin(session, "support.request");
  const tenants = await db.tenants.toArray();
  for (const t of tenants) await endExpiredSupport(t.id);
  const [sessions, users, events] = await Promise.all([db.supportSessions.toArray(), db.users.toArray(), db.auditEvents.filter((e) => e.tenantId === null).toArray()]);
  const name = new Map(tenants.map((t) => [t.id, t.name]));
  const who = new Map(users.map((u) => [u.id, u.name]));
  return {
    sessions: sessions.sort((x, y) => y.startedAt.localeCompare(x.startedAt)).map((s) => ({ ...s, tenantName: name.get(s.tenantId) ?? s.tenantId, active: !s.endedAt, mine: s.adminId === a.principal.userId })),
    tenants: tenants.map((t) => ({ id: t.id, name: t.name })).sort((x, y) => x.name.localeCompare(y.name)),
    log: events.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 15).map((e) => ({ id: e.id, at: e.at, label: `${e.action}${(e.details as { name?: string } | undefined)?.name ? `: ${(e.details as { name: string }).name}` : ""}`, actor: who.get(e.actorId) ?? "Ember" })),
  };
}

const Support = z.object({ key: z.string().min(8), tenantId: z.string(), reason: z.string(), minutes: z.number() });
export type RequestSupportInput = z.input<typeof Support>;

/** Starts a support session: a reason and a time, announced inside the gym and written to its audit log. Asking again while one is running for the same gym returns that one. */
export async function requestSupportAccess(session: Session | null, raw: RequestSupportInput): Promise<SupportSession> {
  const p = Support.safeParse(raw);
  if (!p.success) throw new ApiError("invalid", "Check the request and try again.");
  const input = p.data;
  const a = await admin(session, "support.request");
  const errors = validateSupportRequest(input);
  const first = Object.values(errors)[0];
  if (first) throw new ApiError("invalid", first, { errors });
  return db.transaction("rw", db.tables, async () => {
    const t = await db.tenants.get(input.tenantId);
    if (!t) throw new ApiError("not_found", "We couldn’t find that gym.");
    await endExpiredSupport(t.id);
    const running = (await db.supportSessions.where("tenantId").equals(t.id).toArray()).find((s) => s.adminId === a.principal.userId && !s.endedAt);
    if (running) return running;
    const s: SupportSession = { id: `sup_${hash(input.key)}${hash(`${input.key}x`)}`, tenantId: t.id, adminId: a.principal.userId, reason: input.reason.trim(), minutes: input.minutes, startedAt: a.nowIso, expiresAt: new Date(Date.parse(a.nowIso) + input.minutes * 60_000).toISOString() };
    await db.supportSessions.add(s);
    await audit(a, { action: "support.access.start", reason: s.reason, entityType: "support_session", entityId: s.id, details: { name: t.name, minutes: s.minutes, until: s.expiresAt } }, t.id);
    return s;
  });
}

/** Ends a support session now. The administrator (inside the gym or not) can; so can no one else. */
export async function endSupportAccess(session: Session | null, input: { sessionId: string }): Promise<void> {
  const { principal } = await open(session);
  await db.transaction("rw", db.tables, async () => {
    const s = await db.supportSessions.get(input.sessionId);
    if (!s || (principal.support ? principal.support.sessionId !== s.id : principal.role !== "platform_admin" || principal.userId !== s.adminId)) throw new ApiError("forbidden", "That support session isn’t yours to end.");
    if (s.endedAt) return;
    const at = now().toISOString();
    await db.supportSessions.update(s.id, { endedAt: at, endedBy: s.adminId });
    const t = await db.tenants.get(s.tenantId);
    await db.auditEvents.add({ id: rid("ae"), tenantId: s.tenantId, actorId: s.adminId, actorRole: "platform_admin", at, action: "support.access.end", entityType: "support_session", entityId: s.id, details: { ended: "by the administrator", name: t?.name } });
  });
}

/** The session to sign in with to look inside the gym: the owner’s read-only view, for as long as the support session lasts. */
export async function enterSupport(session: Session | null, input: { sessionId: string }): Promise<Session> {
  const a = await admin(session, "support.request");
  await db.supportSessions.toArray().then((l) => Promise.all([...new Set(l.map((x) => x.tenantId))].map((t) => endExpiredSupport(t))));
  const s = await db.supportSessions.get(input.sessionId);
  if (!s || s.adminId !== a.principal.userId) throw new ApiError("forbidden", "That support session isn’t yours.");
  if (s.endedAt) throw new ApiError("conflict", "That support session has ended. Ask for access again.");
  const [branches, me] = await Promise.all([db.branches.where("tenantId").equals(s.tenantId).toArray(), db.users.get(a.principal.userId)]);
  return { userId: a.principal.userId, name: `${me?.name ?? "Ember support"} (support)`, role: "owner", tenantId: s.tenantId, branchIds: branches.map((b) => b.id), limits: { refundLimitPaise: 0, canOverrideCheckIn: false, maxDiscountBp: 0, canViewClientHealth: false }, support: { sessionId: s.id, adminId: a.principal.userId, expiresAt: s.expiresAt } };
}

