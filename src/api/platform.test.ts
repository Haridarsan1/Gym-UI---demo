import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { getAuditLog } from "@/api/audit";
import { bookSession } from "@/api/bookings";
import { checkInMember } from "@/api/checkin";
import { getDashboard } from "@/api/dashboard";
import { isApiError } from "@/api/errors";
import { getMemberProfile } from "@/api/memberProfile";
import { getMe } from "@/api/me";
import { collectPayment } from "@/api/payments";
import { changeTenantPlan, createTenant, decidePlanRequest, endSupportAccess, enterSupport, getTenantDetail, issueInvoice, listSaasPlans, listSupport, listTenants, markInvoicePaid, requestSupportAccess, saveSaasPlan, setSaasPlanArchived, setSubscriptionState } from "@/api/platform";
import { savePlan } from "@/api/plans";
import { exportReport, getReport } from "@/api/reports";
import { getStaff, inviteStaff, updateStaff } from "@/api/staff";
import { getSubscription, reactivateSubscription, requestPlanChange } from "@/api/subscription";
import { getSupportBanner } from "@/api/support";
import { registerMember } from "@/api/newMember";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { defaultLimits } from "@/domain/staffRules";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? e.code : "other"; } return "resolved"; };
const msg = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? e.message : String(e); } return ""; };
const admin = as("u_admin");
const owner = as("u_owner");
const desk = as("u_desk_andheri");
const arjun = as("u_member_arjun");
let n = 0;
const key = () => `plat-${++n}-${Math.random().toString(36).slice(2)}`;
const T0 = new Date("2026-11-17T06:30:00.000Z");
const state = (tenantId: string, s: Parameters<typeof setSubscriptionState>[1]["state"]) => setSubscriptionState(admin, { key: key(), tenantId, state: s, reason: "Testing the state" });

beforeEach(async () => { setNow(T0); await resetDemo({ secondGym: true }); });
afterAll(() => setNow(null));

describe("the tenants", () => {
  it("lists both gyms with state, plan, usage against limits, onboarding and health; only a platform administrator may", async () => {
    const v = await listTenants(admin);
    expect(v.tenants.map((t) => t.name).sort()).toEqual(["Lotus Strength Club", "Pulse Fitness"]);
    const pulse = v.tenants.find((t) => t.id === "t_pulse")!;
    expect(pulse).toMatchObject({ planName: "Growth", state: "paid", effective: "paid", access: "full", onboarding: { percent: 100 }, owner: { name: "Neha Kulkarni" }, health: { level: "watch" } });
    expect(pulse.health.reasons).toEqual(["Branches are at the plan’s limit"]);
    expect(pulse.usage.map((u) => [u.key, u.used, u.limit])).toEqual([["branches", 3, 3], ["staff", 12, 20], ["activeMembers", 109, 250]]);
    const lotus = v.tenants.find((t) => t.id === "t_lotus")!;
    expect(lotus).toMatchObject({ state: "trial", planName: "Growth", usage: [{ used: 2, limit: 3 }, { used: 4, limit: 20 }, { used: expect.any(Number), limit: 250 }] });
    expect(lotus.health.reasons).toEqual(["The trial ends in 5 days"]);
    for (const id of ["u_owner", "u_bm_bandra", "u_desk_andheri", "u_member_arjun", "u_lotus_owner"]) expect(await code(listTenants(as(id))), id).toBe("forbidden");
  });

  it("shows a gym’s plan, limits, entitlements, billing dates and Ember’s invoices to it, apart from what its members pay", async () => {
    const d = await getTenantDetail(admin, "t_pulse");
    expect(d.plan).toMatchObject({ name: "Growth", limits: { branches: 3, staff: 20, activeMembers: 250 } });
    expect(d.entitlements.filter((e) => e.included).map((e) => e.key)).toEqual(["memberships", "invoices", "qr_checkin", "workouts", "pt_credits", "reports"]);
    expect(d.billing).toMatchObject({ renewsOn: "2026-12-06" });
    expect(d.invoices.map((i) => [i.number, i.status, i.amountPaise])).toEqual([["EMB/26-27/0004", "open", 530_882], ["EMB/26-27/0003", "paid", 530_882], ["EMB/26-27/0002", "paid", 530_882], ["EMB/26-27/0001", "paid", 530_882]]);
    expect(d.invoices.every((i) => i.tenantId === "t_pulse")).toBe(true);
    expect((await getTenantDetail(admin, "t_lotus")).invoices).toEqual([]);
    expect(await code(getTenantDetail(admin, "t_nope"))).toBe("not_found");
  });

  it("creates a gym on a 14-day trial with its owner invited, and onboarding shows what is still to do", async () => {
    const { id } = await createTenant(admin, { key: key(), name: "Iron Oak Gym", ownerName: "Farhan Ali", ownerEmail: "farhan@ironoak.example", planId: "sp_starter" });
    const row = (await listTenants(admin)).tenants.find((t) => t.id === id)!;
    expect(row).toMatchObject({ state: "trial", planName: "Starter", owner: { name: "Farhan Ali", status: "invited" } });
    expect(row.onboarding.percent).toBe(50);
    expect(row.onboarding.steps.map((s) => [s.key, s.done])).toEqual([["account", true], ["owner", true], ["branches", false], ["members", false]]);
    expect((await db.emailLog.toArray()).some((e) => e.userId === `u_${id}_owner` && e.template === "staff_invite")).toBe(true);
    expect(await code(createTenant(admin, { key: key(), name: "Iron Oak Gym", ownerName: "X Y", ownerEmail: "x@y.in", planId: "sp_starter" }))).toBe("conflict");
    expect(await msg(createTenant(admin, { key: key(), name: "Other Gym", ownerName: "X Y", ownerEmail: "owner@pulsefitness.in", planId: "sp_starter" }))).toBe("Someone already has this email. Use another for the owner.");
  });
});

describe("subscription states change what the gym’s app allows (S02)", () => {
  it("past due: everything works through the grace period, with a banner; then the gym is read-only", async () => {
    await state("t_pulse", "past_due");
    const sub = await getSubscription(owner);
    expect(sub.status).toMatchObject({ effective: "past_due", access: "full", graceEndsOn: "2026-11-24", banner: { tone: "warn", title: "Your payment is overdue" } });
    expect((await checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() })).result).toMatch(/^allowed/);
    setNow(new Date("2026-11-25T06:30:00.000Z"));
    const refused = await msg(checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() }));
    expect(refused).toMatch(/Pulse Fitness is read-only because its subscription is overdue past its grace period/);
    expect((await getSubscription(owner)).status).toMatchObject({ effective: "suspended", access: "readonly" });
  });

  it("suspended: everyone can look, the owner can download, and nothing can be changed, sold, booked or checked in", async () => {
    await state("t_pulse", "suspended");
    // Reads and downloads work.
    expect((await getMemberProfile(desk, "mem_arjun")).member.name).toBe("Arjun Kumar");
    expect((await getDashboard(owner)).scope).toHaveLength(3);
    expect((await exportReport(owner, { report: "invoices" })).rows).toBeGreaterThan(0);
    expect((await getReport(owner, { report: "memberships" })).rows.length).toBeGreaterThan(0);
    expect((await getSubscription(owner)).status).toMatchObject({ effective: "suspended", access: "readonly", banner: { title: "This gym is read-only" } });
    // Changes don’t, in plain words.
    const why = /^Pulse Fitness is read-only because its subscription is suspended\./;
    expect(await msg(checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() }))).toMatch(why);
    const inv = (await db.invoices.where("memberId").equals("mem_priya").toArray()).find((i) => i.status === "open")!;
    expect(await msg(collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: inv.totalPaise, key: key() }))).toMatch(why);
    expect(await msg(savePlan(owner, { key: key(), name: "X", kind: "time", pricePaise: 100_000, taxRateBp: 1800, durationDays: 30, branchIds: ["br_andheri"], effectiveFrom: "2026-11-17" }))).toMatch(why);
    expect(await msg(bookSession(arjun, { trainerId: "u_trainer_meera", startsAt: "2026-11-18T12:30:00.000Z", idempotencyKey: key() }))).toMatch(why);
    expect(await code(getMe(arjun))).toBe("resolved");
  });

  it("canceled: only downloads for 30 days, then reactivation brings everything back as it was", async () => {
    const before = await db.members.count();
    await state("t_pulse", "canceled");
    expect((await getSubscription(owner)).status).toMatchObject({ access: "export_only", exportUntil: "2026-12-17" });
    expect((await exportReport(owner, { report: "invoices" })).rows).toBeGreaterThan(0);
    expect(await msg(getMemberProfile(desk, "mem_arjun"))).toMatch(/was canceled, so only downloads are available/);
    expect(await code(getDashboard(owner))).toBe("forbidden");
    expect(await code(getStaff(owner))).toBe("forbidden");
    const r = await reactivateSubscription(owner, { key: key() });
    expect(r).toMatchObject({ state: "paid", repeated: false });
    expect((await getMemberProfile(desk, "mem_arjun")).member.name).toBe("Arjun Kumar");
    expect(await db.members.count()).toBe(before);
    expect((await db.tenants.get("t_pulse"))!.subscription.state).toBe("paid");
  });

  it("the owner pays what is overdue and the gym reopens at once; a paid gym has nothing to reactivate", async () => {
    await state("t_pulse", "suspended");
    expect(await code(reactivateSubscription(as("u_bm_bandra"), { key: key() }))).toBe("forbidden");
    const k = key();
    const r = await reactivateSubscription(owner, { key: k });
    expect(r.paidPaise).toBeGreaterThan(0);
    expect((await reactivateSubscription(owner, { key: k })).repeated).toBe(true);
    expect((await checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() })).result).toMatch(/^allowed/);
    expect(await msg(reactivateSubscription(owner, { key: key() }))).toBe("The subscription is paid and the gym is fully open. There is nothing to reactivate.");
    expect((await getSubscription(owner)).invoices.every((i) => i.status === "paid" || i.dueOn > "2026-11-17")).toBe(true);
  });

  it("a state change needs a reason, is in the platform’s log and the gym owner’s, and the same key twice is one change", async () => {
    expect(await msg(setSubscriptionState(admin, { key: key(), tenantId: "t_pulse", state: "suspended", reason: "" }))).toBe("Say why the state is changing. The gym’s owner can read it.");
    const k = key();
    await setSubscriptionState(admin, { key: k, tenantId: "t_pulse", state: "suspended", reason: "Payment not received after two reminders" });
    expect((await setSubscriptionState(admin, { key: k, tenantId: "t_pulse", state: "suspended", reason: "Payment not received after two reminders" })).repeated).toBe(true);
    expect(await msg(state("t_pulse", "suspended"))).toBe("Pulse Fitness is already suspended.");
    const mine = (await getAuditLog(owner, { group: "setup" })).rows.concat((await getAuditLog(owner)).rows).find((r) => r.label === "Subscription changed")!;
    expect(mine).toMatchObject({ actor: "Ember Admin", role: "Platform admin", reason: "Payment not received after two reminders" });
    expect(mine.details.map((d) => `${d.key}=${d.value}`)).toEqual(expect.arrayContaining(["from=Paid", "to=Suspended"]));
    expect((await db.auditEvents.toArray()).filter((e) => e.tenantId === null && e.action === "subscription.change")).toHaveLength(1);
    // Another gym is untouched.
    expect((await db.tenants.get("t_lotus"))!.subscription.state).toBe("trial");
    expect((await getAuditLog(as("u_lotus_owner"))).rows.some((r) => r.label === "Subscription changed")).toBe(false);
  });

  it("a trial that runs out becomes overdue, then read-only, on its own", async () => {
    setNow(new Date("2026-11-21T06:30:00.000Z"));
    expect((await getSubscription(as("u_lotus_owner"))).status).toMatchObject({ effective: "trial", access: "full" });
    setNow(new Date("2026-11-23T06:30:00.000Z"));
    expect((await getSubscription(as("u_lotus_owner"))).status).toMatchObject({ effective: "past_due", access: "full", banner: { title: "Your free trial has ended" } });
    setNow(new Date("2026-12-05T06:30:00.000Z"));
    expect((await getSubscription(as("u_lotus_owner"))).status).toMatchObject({ effective: "suspended", access: "readonly" });
  });

  it("software invoices: one issued for the next month, paid, and a paid overdue one reactivates the gym", async () => {
    const k = key();
    const inv = await issueInvoice(admin, { tenantId: "t_pulse", key: k });
    expect((await issueInvoice(admin, { tenantId: "t_pulse", key: k })).id).toBe(inv.id);
    expect(inv).toMatchObject({ status: "open", amountPaise: 530_882, taxPaise: 80_982 });
    await state("t_pulse", "past_due");
    const overdue = (await db.saasInvoices.where("tenantId").equals("t_pulse").toArray()).filter((i) => i.status === "open" && i.dueOn <= "2026-11-17");
    expect(overdue.length).toBeGreaterThan(0);
    let reactivated = false;
    for (const i of overdue) reactivated = (await markInvoicePaid(admin, { invoiceId: i.id })).reactivated || reactivated;
    expect(reactivated).toBe(true);
    expect((await db.tenants.get("t_pulse"))!.subscription.state).toBe("paid");
  });
});

describe("plan limits and features are enforced, with a plain message and an upgrade path", () => {
  const toStarter = () => changeTenantPlan(admin, { key: key(), tenantId: "t_pulse", planId: "sp_starter" });

  it("a plan without reports refuses the Reports screen and its downloads, and says which plan has them", async () => {
    await toStarter();
    const m = "Reports and CSV downloads isn’t part of your Starter plan. It comes with Growth. Ask Ember for a larger plan on the Subscription page, or free some up.";
    expect(await msg(getReport(owner, { report: "invoices" }))).toBe(m);
    expect(await msg(exportReport(owner, { report: "invoices" }))).toBe(m);
    expect((await getDashboard(owner)).scope).toHaveLength(3);
  });

  it("staff and active members stop at the plan’s limit; the owner is told where to ask, anyone else to ask the owner", async () => {
    await toStarter();
    const person = { key: key(), name: "Ritu Verma", email: "ritu@x.in", phone: "9820055001", role: "front_desk" as const, branchIds: ["br_bandra"], limits: defaultLimits("front_desk") };
    expect(await msg(inviteStaff(owner, person))).toBe("Your Starter plan allows 5 staff accounts and 12 are in use. Ask Ember for a larger plan on the Subscription page, or free some up.");
    const r = (await getStaff(owner)).staff.find((s) => s.userId === "u_bm_bandra")!;
    await updateStaff(owner, { key: key(), userId: r.userId, name: r.name, email: r.email ?? "", phone: r.phone ?? "", role: "branch_manager", branchIds: r.branchIds, limits: { ...r.limits, canManageFrontline: true } });
    expect(await msg(inviteStaff(as("u_bm_bandra"), { ...person, key: key(), name: "Other Person", email: "o@x.in" }))).toBe("Your Starter plan allows 5 staff accounts and 12 are in use. Ask the gym’s owner to ask Ember for a larger plan.");
    expect(await msg(registerMember(desk, { key: key(), branchId: "br_andheri", member: { name: "Kabir Anand", phone: "98765 43210", gender: "male" }, consents: { photos: false, assessments: false, marketing: false, dataProcessing: true }, planId: "pl_monthly" }))).toMatch(/^Your Starter plan allows 75 active members and 109 are in use\. Ask the gym’s owner to ask Ember for a larger plan\.$/);
  });

  it("the upgrade path: the owner asks, Ember approves, and the limits change at once; one request at a time", async () => {
    await toStarter();
    const k = key();
    expect(await requestPlanChange(owner, { planId: "sp_growth", note: "We hired more trainers", key: k })).toEqual({ status: "pending" });
    expect(await msg(requestPlanChange(owner, { planId: "sp_pro", key: key() }))).toBe("You already have a request waiting for Ember. It will be answered before another can be made.");
    expect((await getSubscription(owner)).request).toMatchObject({ planName: "Growth", status: "pending" });
    const req = (await getTenantDetail(admin, "t_pulse")).requests[0]!;
    expect(req).toMatchObject({ status: "pending", planName: "Growth", requestedByName: "Neha Kulkarni", note: "We hired more trainers" });
    expect(await code(decidePlanRequest(owner, { key: key(), requestId: req.id, approve: true }))).toBe("forbidden");
    expect(await decidePlanRequest(admin, { key: key(), requestId: req.id, approve: true })).toEqual({ status: "approved" });
    expect((await getSubscription(owner)).plan.name).toBe("Growth");
    expect((await inviteStaff(owner, { key: key(), name: "Ritu Verma", email: "ritu@x.in", phone: "9820055001", role: "front_desk", branchIds: ["br_bandra"], limits: defaultLimits("front_desk") })).status).toBe("invited");
    expect((await getAuditLog(owner)).rows.map((r) => r.label)).toContain("Subscription changed");
  });

  it("Ember plans: a change to a plan’s limits applies to every gym on it from then on, and a plan with gyms can’t be withdrawn", async () => {
    const growth = (await listSaasPlans(admin)).find((p) => p.id === "sp_growth")!;
    expect(growth.gyms.map((g) => g.name).sort()).toEqual(["Lotus Strength Club", "Pulse Fitness"]);
    const saved = await saveSaasPlan(admin, { key: key(), planId: "sp_growth", name: "Growth", monthlyRupees: "4499", branches: "3", staff: "12", activeMembers: "250", features: growth.features, blurb: "" });
    expect(saved.limits.staff).toBe(12);
    expect(await msg(inviteStaff(owner, { key: key(), name: "Ritu Verma", email: "ritu@x.in", role: "front_desk", phone: "", branchIds: ["br_bandra"], limits: defaultLimits("front_desk") }))).toMatch(/^Your Growth plan allows 12 staff accounts and 12 are in use/);
    expect((await getAuditLog(owner)).rows.some((r) => r.label === "Ember plan changed" && r.details.some((d) => d.value === "your plan changed"))).toBe(true);
    expect(await msg(setSaasPlanArchived(admin, { planId: "sp_growth", archived: true }))).toBe("2 gyms are on Growth: Lotus Strength Club, Pulse Fitness. Move them to another plan first.");
    const studio = await saveSaasPlan(admin, { key: key(), name: "Studio", monthlyRupees: "1999", branches: "1", staff: "", activeMembers: "50", features: ["memberships", "invoices"], blurb: "For one small studio" });
    expect(studio).toMatchObject({ monthlyPaise: 199_900, limits: { branches: 1, staff: null, activeMembers: 50 } });
    await setSaasPlanArchived(admin, { planId: studio.id, archived: true });
    expect(await msg(changeTenantPlan(admin, { key: key(), tenantId: "t_lotus", planId: studio.id }))).toBe("Studio is no longer offered. Choose another plan.");
    expect(await code(saveSaasPlan(owner, { key: key(), name: "Mine", monthlyRupees: "1", branches: "", staff: "", activeMembers: "", features: ["memberships"], blurb: "" }))).toBe("forbidden");
    expect(await msg(saveSaasPlan(admin, { key: key(), name: "growth", monthlyRupees: "1", branches: "", staff: "", activeMembers: "", features: ["memberships"], blurb: "" }))).toBe("Another plan has this name.");
  });
});

describe("support access (R01, S05)", () => {
  const ask = (over: Partial<Parameters<typeof requestSupportAccess>[1]> = {}) => requestSupportAccess(admin, { key: key(), tenantId: "t_pulse", reason: "Help the owner fix the member import", minutes: 30, ...over });

  it("needs a reason and one of the durations, and is announced to everyone in that gym and nobody in the other", async () => {
    expect(await msg(ask({ reason: "help" }))).toBe("Say why you need access, in at least 10 characters. The gym’s owner can read it.");
    expect(await msg(ask({ minutes: 45 }))).toBe("Choose 15, 30, 60, 120 minutes.");
    expect(await code(requestSupportAccess(owner, { key: key(), tenantId: "t_pulse", reason: "Looking around", minutes: 30 }))).toBe("forbidden");
    const s = await ask();
    expect(s).toMatchObject({ tenantId: "t_pulse", minutes: 30, reason: "Help the owner fix the member import", expiresAt: "2026-11-17T07:00:00.000Z" });
    for (const id of ["u_owner", "u_desk_andheri", "u_member_arjun", "u_trainer_meera", "u_bm_bandra"]) expect((await getSupportBanner(as(id))).sessions, id).toEqual([{ id: s.id, reason: s.reason, expiresAt: s.expiresAt, minutesLeft: 30, mine: false }]);
    expect((await getSupportBanner(as("u_lotus_owner"))).sessions).toEqual([]);
    expect((await ask()).id).toBe(s.id);
  });

  it("inside the gym the administrator has the owner’s views and nothing more: no changes, no downloads, no health records; each screen is a line in the gym’s audit log", async () => {
    const s = await ask();
    const inside = await enterSupport(admin, { sessionId: s.id });
    expect(inside).toMatchObject({ role: "owner", tenantId: "t_pulse", support: { sessionId: s.id } });
    expect((await getDashboard(inside)).scope).toHaveLength(3);
    expect((await getReport(inside, { report: "memberships" })).rows.length).toBeGreaterThan(0);
    expect((await getMemberProfile(inside, "mem_arjun")).member.name).toBe("Arjun Kumar");
    expect((await getSupportBanner(inside)).sessions[0]).toMatchObject({ mine: true });
    expect(await msg(savePlan(inside, { key: key(), name: "X", kind: "time", pricePaise: 100_000, taxRateBp: 1800, durationDays: 30, branchIds: ["br_andheri"], effectiveFrom: "2026-11-17" }))).toBe("Support access is read-only. You can look, and nothing here can be changed or downloaded.");
    expect(await code(exportReport(inside, { report: "invoices" }))).toBe("forbidden");
    expect(await code(checkInMember(inside, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() }))).toBe("forbidden");
    expect(await code(getStaff(as("u_admin")))).toBe("forbidden");
    const log = await getAuditLog(owner, { group: "access", limit: 100 });
    const labels = log.rows.map((r) => r.label);
    expect(labels).toContain("Support access started");
    expect(labels.filter((l) => l === "Support looked at a screen").length).toBeGreaterThanOrEqual(3);
    const started = log.rows.find((r) => r.label === "Support access started")!;
    expect(started).toMatchObject({ actor: "Ember Admin", reason: "Help the owner fix the member import" });
    expect(log.rows.find((r) => r.label === "Support looked at a screen")!.details.map((d) => d.value)).toContain(s.id);
    // Another gym’s owner sees none of it.
    expect((await getAuditLog(as("u_lotus_owner"), { limit: 100 })).rows.some((r) => r.label.startsWith("Support"))).toBe(false);
  });

  it("ends by itself when its time runs out, and the gym’s owner is told so; the administrator can also end it early", async () => {
    const s = await ask({ minutes: 15 });
    const inside = await enterSupport(admin, { sessionId: s.id });
    setNow(new Date(T0.getTime() + 14 * 60_000));
    expect((await getDashboard(inside)).scope).toHaveLength(3);
    expect((await getSupportBanner(owner)).sessions[0]!.minutesLeft).toBe(1);
    setNow(new Date(T0.getTime() + 16 * 60_000));
    expect(await msg(getDashboard(inside))).toBe("Your support access has ended. Ask for access again if you still need it.");
    expect((await getSupportBanner(owner)).sessions).toEqual([]);
    expect((await db.supportSessions.get(s.id))).toMatchObject({ endedBy: "time", endedAt: s.expiresAt });
    const ended = (await getAuditLog(owner, { group: "access" })).rows.find((r) => r.label === "Support access ended")!;
    expect(ended.details.map((d) => d.value)).toContain("by itself, when its time ran out");
    expect(await msg(enterSupport(admin, { sessionId: s.id }))).toBe("That support session has ended. Ask for access again.");
    const again = await ask({ minutes: 60 });
    await endSupportAccess(admin, { sessionId: again.id });
    expect((await getSupportBanner(owner)).sessions).toEqual([]);
    expect((await getAuditLog(owner, { group: "access" })).rows.filter((r) => r.label === "Support access ended")).toHaveLength(2);
    expect(await code(endSupportAccess(owner, { sessionId: again.id }))).toBe("forbidden");
  });

  it("lists sessions for the administrator, active first with who and why", async () => {
    const s = await ask();
    const v = await listSupport(admin);
    expect(v.sessions[0]).toMatchObject({ id: s.id, tenantName: "Pulse Fitness", active: true, mine: true });
    expect(v.tenants.map((t) => t.name)).toEqual(["Lotus Strength Club", "Pulse Fitness"]);
    expect(await code(listSupport(owner))).toBe("forbidden");
  });
});
