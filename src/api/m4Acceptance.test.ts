import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { exportAuditLog, getAuditLog } from "@/api/audit";
import { getBranches, saveBranch } from "@/api/branches";
import { bookSession, cancelBooking } from "@/api/bookings";
import { getCommunications, retryAllFailed, saveTemplate, sendToGroup } from "@/api/communications";
import { getDashboard } from "@/api/dashboard";
import { reopenDay } from "@/api/dayClose";
import { isApiError } from "@/api/errors";
import { freezeMembership } from "@/api/lifecycle";
import { previewMemberImport, runMemberImport } from "@/api/memberImport";
import { collectPayment } from "@/api/payments";
import { getPlans, savePlan, savePtPricing, setPlanOnSale } from "@/api/plans";
import { getPolicies, savePolicies } from "@/api/policyScreen";
import { exportReport, getReport, REPORT_IDS } from "@/api/reports";
import { getSettings, saveSettings } from "@/api/settings";
import { getStaff, inviteStaff, setStaffActive, updateStaff } from "@/api/staff";
import { getSubscription } from "@/api/subscription";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { defaultLimits } from "@/domain/staffRules";

/**
 * M4 acceptance (R02): a branch manager sees only their branches everywhere (every screen’s API, every report and export, the audit log), the actions that are the owner’s alone are refused to
 * everyone else and write nothing, a policy change made on the Policies screen changes what the rest of the app does at once, and an import sent twice makes nobody twice.
 */
const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? e.code : "other"; } return "resolved"; };
const owner = as("u_owner");
const bm = as("u_bm_bandra");
let n = 0;
const key = () => `m4-${++n}-${Math.random().toString(36).slice(2)}`;

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("a branch manager sees only their own branch, everywhere", () => {
  it("every report, and its download, is the owner’s view of that branch and nothing more, whatever branch is asked for", async () => {
    for (const id of REPORT_IDS) {
      const mine = await getReport(bm, { report: id });
      const theirs = await getReport(owner, { report: id, branchId: "br_bandra" });
      expect(mine.branches, id).toEqual(["Bandra"]);
      expect(mine.rows, id).toEqual(theirs.rows);
      expect(mine.summary, id).toEqual(theirs.summary);
      expect((await getReport(bm, { report: id, branchId: "all" })).rows, id).toEqual(theirs.rows);
      for (const other of ["br_andheri", "br_powai"]) expect(await code(getReport(bm, { report: id, branchId: other })), `${id} ${other}`).toBe("forbidden");
      const file = await exportReport(bm, { report: id });
      const ownerFile = await exportReport(owner, { report: id, branchId: "br_bandra" });
      expect(file.csv, id).toBe(ownerFile.csv);
      const whole = await exportReport(owner, { report: id });
      expect(whole.rows, id).toBeGreaterThanOrEqual(file.rows);
    }
  });

  it("the dashboard, the staff list, the branches and the plan counts are limited to their branch, and another branch is refused", async () => {
    expect((await getDashboard(bm)).scope).toEqual(["br_bandra"]);
    expect(await code(getDashboard(bm, { branchId: "br_andheri" }))).toBe("forbidden");
    const staff = await getStaff(bm);
    for (const s of staff.staff) expect(s.role === "owner" || s.branchIds.includes("br_bandra"), s.name).toBe(true);
    expect(staff.staff.map((s) => s.name)).not.toContain("Aditya Rao");
    expect(staff.branches.map((b) => b.id)).toEqual(["br_bandra"]);
    expect((await getBranches(bm)).branches.map((b) => b.id)).toEqual(["br_bandra"]);
    expect(await code(saveBranch(bm, { key: key(), branchId: "br_andheri", address: "x", hours: [{ weekday: 1, open: "06:00", close: "20:00" }], rooms: [] }))).toBe("forbidden");
    const all = (await getPlans(owner)).plans.reduce((x, p) => x + p.members, 0);
    expect((await getPlans(bm)).plans.reduce((x, p) => x + p.members, 0)).toBeLessThan(all);
    for (const b of ["br_andheri", "br_powai"]) expect(await code(getCommunications(bm, { branchId: b })), b).toBe("forbidden");
  });

  it("the delivery log and group sends reach only their branch’s members", async () => {
    const bandra = new Set((await db.members.toArray()).filter((m) => m.homeBranchId === "br_bandra").map((m) => m.id));
    await sendToGroup(owner, { audience: "offers", key: key() });
    for (const r of (await getCommunications(bm, { limit: 200 })).rows) { const e = (await db.emailLog.get(r.id))!; if (e.memberId) expect(bandra.has(e.memberId), r.id).toBe(true); }
    const sent = await sendToGroup(bm, { audience: "offers", key: key() });
    for (const e of (await db.emailLog.toArray()).filter((x) => x.campaign === sent.campaign)) expect(bandra.has(e.memberId!), e.id).toBe(true);
  });

  it("the audit log and its download hold only events about their branch’s members and people who work there", async () => {
    await freezeMembership(as("u_desk_andheri"), { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-23", reason: "Travel", key: key() });
    await freezeMembership(as("u_desk_bandra"), { memberId: "mem_rahul", from: "2026-11-17", to: "2026-11-23", reason: "Travel", key: key() }).catch(() => undefined);
    const view = await getAuditLog(bm, { limit: 500 });
    const members = new Map((await db.members.toArray()).map((m) => [m.id, m.homeBranchId]));
    for (const r of view.rows) { const e = (await db.auditEvents.get(r.id))!; if (e.memberId) expect(members.get(e.memberId), `${r.label} ${r.id}`).toBe("br_bandra"); }
    expect(view.rows.some((r) => r.member === "Arjun Kumar")).toBe(false);
    const file = await exportAuditLog(bm, {}).catch(() => ({ csv: "" }));
    expect(file.csv).not.toContain("Arjun Kumar");
    expect((await getAuditLog(owner, { limit: 500 })).rows.some((r) => r.member === "Arjun Kumar")).toBe(true);
    expect(await code(getAuditLog(bm, { branchId: "br_andheri" }))).toBe("forbidden");
  });
});

describe("actions that are the owner’s alone", () => {
  const anyone = ["u_bm_bandra", "u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun", "u_admin"];
  const csv = "name,phone,branch\r\nAsha Menon,9820011122,Bandra";
  const calls: Array<[string, (s: Session) => Promise<unknown>]> = [
    ["make a plan", (s) => savePlan(s, { key: key(), name: "X Plan", kind: "time", pricePaise: 100_000, taxRateBp: 1800, durationDays: 30, branchIds: ["br_bandra"], effectiveFrom: "2026-11-17" })],
    ["stop selling a plan", (s) => setPlanOnSale(s, { planId: "pl_monthly", on: false, key: key() })],
    ["set session pricing", (s) => savePtPricing(s, { key: key(), sessionPricePaise: 90_000, taxRateBp: 1800, packs: [4], expiryDays: 100 })],
    ["change a policy", (s) => savePolicies(s, { key: key(), changes: { graceDays: 5 } })],
    ["change someone’s access", (s) => updateStaff(s, { key: key(), userId: "u_desk_bandra", name: "Imran Qureshi", email: "imran.qureshi@pulsefitness.in", phone: "9820011004", role: "front_desk", branchIds: ["br_bandra"], limits: { ...defaultLimits("front_desk"), maxDiscountBp: 100 } })],
    ["switch off an account", (s) => setStaffActive(s, { key: key(), userId: "u_desk_bandra", active: false, reason: "Left" })],
    ["change the email wording", (s) => saveTemplate(s, { id: "payment_reminder", subject: "Hello {{first_name}}", body: "Pay {{amount_due}}", key: key() })],
    ["preview an import", (s) => previewMemberImport(s, { csv })],
    ["run an import", (s) => runMemberImport(s, { key: key(), csv, leaveOut: [], consentConfirmed: true })],
    ["read the settings", (s) => getSettings(s)],
    ["save the settings", (s) => saveSettings(s, { key: key(), name: "X Gym", legalName: "", gstin: "", address: "" })],
    ["read the subscription", (s) => getSubscription(s)],
    ["reopen a closed cash day", (s) => reopenDay(s, { branchId: "br_bandra", date: "2026-11-10", reason: "A payment was missed" })],
  ];

  it("everyone else is refused every one of them, and nothing is written", async () => {
    const counts = async () => [await db.auditEvents.count(), await db.membershipPlans.count(), await db.members.count(), await db.users.count(), await db.importBatches.count(), (await db.gymPolicies.toArray())[0]!.graceDays, (await db.tenants.toArray())[0]!.name];
    const before = await counts();
    for (const [what, call] of calls) for (const id of anyone) expect(await code(call(as(id))), `${what} as ${id}`).toBe("forbidden");
    expect(await counts()).toEqual(before);
  });

  it("a branch manager without the owner’s permission can’t invite, and with it can’t go beyond front desk, trainers, their own branch and their own limits", async () => {
    const person = { key: key(), name: "Ritu Verma", email: "ritu.verma@pulsefitness.in", phone: "9820055001", role: "front_desk" as const, branchIds: ["br_bandra"], limits: defaultLimits("front_desk") };
    expect(await code(inviteStaff(bm, person))).toBe("forbidden");
    const r = (await getStaff(owner)).staff.find((s) => s.userId === "u_bm_bandra")!;
    await updateStaff(owner, { key: key(), userId: r.userId, name: r.name, email: r.email ?? "", phone: r.phone ?? "", role: "branch_manager", branchIds: r.branchIds, limits: { ...r.limits, canManageFrontline: true } });
    expect(await code(inviteStaff(bm, person))).toBe("resolved");
    for (const bad of [{ branchIds: ["br_andheri"] }, { role: "finance" as const, limits: defaultLimits("finance") }, { role: "owner" as const, limits: defaultLimits("owner") }, { limits: { ...defaultLimits("front_desk"), maxDiscountBp: 5000 } }]) expect(await code(inviteStaff(bm, { ...person, key: key(), name: "Other Person", email: `o${n}@x.in`, ...bad })), JSON.stringify(bad)).toBe("invalid");
    expect(await code(setStaffActive(bm, { key: key(), userId: "u_trainer_meera", active: false, reason: "Left" }))).toBe("forbidden");
    expect(await code(setStaffActive(bm, { key: key(), userId: "u_owner", active: false, reason: "Left" }))).toBe("forbidden");
  });
});

describe("a policy change changes what the app does, from the moment it is saved", () => {
  it("freezing: the longest freeze the desk may make follows the owner’s setting", async () => {
    const desk = as("u_desk_andheri");
    const to = "2026-12-31";
    expect(await code(freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to, reason: "Travel", key: key() }))).toBe("conflict");
    await savePolicies(owner, { key: key(), changes: { freezeMaxDays: 60 } });
    expect(await code(freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to, reason: "Travel", key: key() }))).toBe("resolved");
  });

  it("part payments: the desk can take less than the full amount only once the owner allows it", async () => {
    const desk = as("u_desk_andheri");
    const inv = (await db.invoices.where("memberId").equals("mem_priya").toArray()).find((i) => i.status === "open" && i.purpose?.kind === "renewal")!;
    expect(await code(collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: 100_000, key: key() }))).toBe("invalid");
    await savePolicies(owner, { key: key(), changes: { partialPaymentsEnabled: true } });
    expect((await collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: 100_000, key: key() })).invoice).toMatchObject({ status: "partially_paid" });
  });

  it("canceling a session: what a late cancel does to the credit follows the owner’s setting, and so does the free-cancellation time", async () => {
    const arjun = as("u_member_arjun");
    await db.gymPolicies.toCollection().modify({ membersMayChooseTrainer: true });
    const WED_6PM = "2026-11-18T12:30:00.000Z";
    const b = await bookSession(arjun, { trainerId: "u_trainer_meera", startsAt: WED_6PM, idempotencyKey: key() });
    setNow(new Date("2026-11-18T01:30:00.000Z")); // 7 am: after the 6 am deadline at 12 hours
    await savePolicies(owner, { key: key(), changes: { cancellationCutoffHours: 6 } }); // free until noon: now it is free again
    expect(await cancelBooking(arjun, { bookingId: b.bookingId, expectedOutcome: "released" })).toMatchObject({ outcome: "released" });
    const b2 = await bookSession(arjun, { trainerId: "u_trainer_meera", startsAt: "2026-11-18T13:30:00.000Z", idempotencyKey: key() });
    await savePolicies(owner, { key: key(), changes: { cancellationCutoffHours: 12, lateCancelConsumesCredit: false } });
    setNow(new Date("2026-11-18T02:00:00.000Z")); // 7:30 am: past the 7:00 am deadline for the 7 pm session
    expect(await cancelBooking(arjun, { bookingId: b2.bookingId, expectedOutcome: "kept" })).toMatchObject({ outcome: "kept" });
  });

  it("the screen and the rest of the app read the same values, and the change is in the audit log with who made it", async () => {
    await savePolicies(owner, { key: key(), changes: { graceDays: 4, repeatScanWindowMinutes: 20 }, reason: "Busy mornings" });
    expect((await getPolicies(bm)).values).toMatchObject({ graceDays: 4, repeatScanWindowMinutes: 20 });
    expect((await db.gymPolicies.toArray())[0]).toMatchObject({ graceDays: 4, repeatScanWindowMinutes: 20 });
    expect((await getAuditLog(owner, { group: "setup" })).rows[0]).toMatchObject({ label: "Policy changed", actor: "Neha Kulkarni", role: "Owner", reason: "Busy mornings" });
  });
});

describe("an import sent twice makes nobody twice", () => {
  const FILE = ["name,phone,email,date_of_birth,gender,branch,plan,start_date,visits_left,pt_credits,lead_source", "Asha Menon,9820011122,asha@example.in,,female,Bandra,Monthly,2026-11-10,,4,Walk-in", "Vikram Shah,9820033344,,,male,Andheri,10-visit pass,2026-11-01,6,,", "Ravi Kale,9820011100,,,,Bandra,,,,,", "Sita Kale,9820011100,,,,Bandra,,,,,"].join("\r\n");
  const tables = async () => [await db.members.count(), await db.memberships.count(), await db.creditLedger.count(), await db.consents.count(), await db.importBatches.count()];

  it("the same request twice, then the same file under a new key, adds nobody; the counts are the same after each", async () => {
    const k = key();
    const first = await runMemberImport(owner, { key: k, csv: FILE, leaveOut: [], fileName: "m.csv", consentConfirmed: true });
    const after = await tables();
    expect(first).toMatchObject({ created: 4, repeated: false });
    expect(await runMemberImport(owner, { key: k, csv: FILE, leaveOut: [], fileName: "m.csv", consentConfirmed: true })).toMatchObject({ created: 4, repeated: true });
    expect(await tables()).toEqual(after);
    expect(await code(runMemberImport(owner, { key: key(), csv: FILE, leaveOut: [], consentConfirmed: true }))).toBe("conflict");
    expect(await tables()).toEqual(after);
    const people = (await db.members.toArray()).filter((m) => m.name === "Asha Menon");
    expect(people).toHaveLength(1);
    expect((await db.auditEvents.where("action").equals("import.run").toArray())).toHaveLength(1);
  });

  it("a request that fails after it began leaves nothing, and sending it again then makes each person once", async () => {
    const k = key();
    const id = (line: number) => `mem_imp_${[...k].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7).toString(36)}_${line}`;
    await db.members.add({ id: id(3), tenantId: "t_pulse", name: "Blocker", phone: "9000000002", homeBranchId: "br_andheri", joinedOn: "2026-11-01", qrToken: "qr-b" });
    const before = await tables();
    expect(await code(runMemberImport(owner, { key: k, csv: FILE, leaveOut: [], consentConfirmed: true }))).toBe("other");
    expect(await tables()).toEqual(before);
    await db.members.delete(id(3));
    expect(await runMemberImport(owner, { key: k, csv: FILE, leaveOut: [], consentConfirmed: true })).toMatchObject({ created: 4, repeated: false });
    expect((await db.members.toArray()).filter((m) => m.name === "Vikram Shah")).toHaveLength(1);
  });
});

describe("failed emails: retrying twice sends once", () => {
  it("retry-all on mail that already went does nothing more", async () => {
    const { configureSimulation } = await import("@/demo/simulate");
    configureSimulation({ emailFails: true });
    await sendToGroup(owner, { audience: "offers", key: key() });
    configureSimulation({ emailFails: false });
    const first = await retryAllFailed(owner);
    expect(first.sent).toBeGreaterThan(0);
    expect(await retryAllFailed(owner)).toEqual({ sent: 0, failed: 0 });
    expect((await getCommunications(owner)).counts.failed).toBe(0);
  });
});

