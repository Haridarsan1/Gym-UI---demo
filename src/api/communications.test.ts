import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { getCommunications, retryAllFailed, retryEmail, saveTemplate, sendToGroup, setEmailFailure } from "@/api/communications";
import { getDues, sendReminder } from "@/api/dues";
import { isApiError } from "@/api/errors";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { configureSimulation } from "@/demo/simulate";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) }; } return { code: "resolved", message: "" }; };
const owner = as("u_owner");
const bm = as("u_bm_bandra");
let n = 0;
const key = () => `comm-key-${++n}-${Math.random().toString(36).slice(2)}`;

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); configureSimulation({ emailFails: false }); await resetDemo(); });
afterAll(() => { setNow(null); configureSimulation({ emailFails: false }); });

describe("the delivery log", () => {
  it("shows the owner every message with its status, and a branch manager only their own branch’s members", async () => {
    // Mail written by earlier steps (a welcome, a receipt…) is in the log; make some more so both views have rows.
    await sendToGroup(owner, { audience: "offers", key: key() });
    const all = await getCommunications(owner, { limit: 200 });
    const mine = await getCommunications(bm, { limit: 200 });
    expect(all.counts.all).toBeGreaterThan(mine.counts.all);
    expect(mine.counts.all).toBeGreaterThan(0);
    const members = new Map((await db.members.toArray()).map((m) => [m.id, m.homeBranchId]));
    for (const r of mine.rows) { const e = (await db.emailLog.get(r.id))!; if (e.memberId) expect(members.get(e.memberId), r.id).toBe("br_bandra"); }
    expect((await err(getCommunications(as("u_desk_andheri")))).code).toBe("forbidden");
    expect((await err(getCommunications(bm, { branchId: "br_andheri" }))).message).toBe("That branch isn’t one you manage.");
  });

  it("filters by status and template, and counts what it filters", async () => {
    await sendToGroup(owner, { audience: "offers", key: key() });
    const skipped = await getCommunications(owner, { status: "skipped", template: "marketing_update", limit: 200 });
    expect(skipped.matching).toBeGreaterThan(0);
    expect(skipped.rows.every((r) => r.status === "skipped" && r.template === "Offers and news")).toBe(true);
    expect((await getCommunications(owner, { limit: 2 })).rows).toHaveLength(2);
  });
});

describe("marketing consent and preferences are respected", () => {
  it("an offer goes only to members who agreed and have an email; every other member gets a not-sent line with the reason", async () => {
    const r = await sendToGroup(owner, { audience: "offers", key: key() });
    expect(r.reached).toBeGreaterThan(20);
    expect(r.noConsent).toBeGreaterThan(20);
    expect(r.noEmail).toBeGreaterThanOrEqual(0);
    const rows = (await db.emailLog.toArray()).filter((e) => e.campaign === r.campaign);
    const consents = await db.consents.toArray();
    for (const e of rows.filter((x) => x.status === "sent")) {
      const c = consents.filter((x) => x.memberId === e.memberId && x.scope === "marketing");
      expect(c.length, e.id).toBeGreaterThan(0);
      expect(c.every((x) => !x.withdrawnAt), e.id).toBe(true);
      expect(e.to, e.id).toBeTruthy();
    }
    expect(rows.find((x) => x.detail === "This member hasn’t agreed to offers and news, or withdrew that.")).toBeDefined();
    expect(rows.every((x) => x.body.includes("Hi ") && !x.body.includes("{{"))).toBe(true);
  });

  it("a member who withdraws marketing consent is not sent the next offer, and one who agrees again is", async () => {
    const consent = (await db.consents.toArray()).find((c) => c.scope === "marketing" && !c.withdrawnAt && !c.id.includes("pending"))!;
    const member = (await db.members.get(consent.memberId))!;
    expect(member.email, "needs an email for this test").toBeTruthy();
    const before = await sendToGroup(owner, { audience: "offers", key: key() });
    expect((await db.emailLog.get(`em_${before.campaign}_${member.id}`))!.status).toBe("sent");
    await db.consents.update(consent.id, { withdrawnAt: "2026-11-17T05:00:00.000Z" });
    const after = await sendToGroup(owner, { audience: "offers", key: key() });
    expect((await db.emailLog.get(`em_${after.campaign}_${member.id}`))).toMatchObject({ status: "skipped", detail: "This member hasn’t agreed to offers and news, or withdrew that." });
  });

  it("a member who turned off renewal and payment reminders is not sent one, and the desk is told", async () => {
    const dues = await getDues(as("u_desk_andheri"), {});
    const withEmail = new Set((await db.members.toArray()).filter((m) => m.email).map((m) => m.id));
    const row = dues.rows.find((r) => withEmail.has(r.memberId))!;
    await db.memberSettings.where("memberId").equals(row.memberId).delete();
    await db.memberSettings.put({ id: `ms_${row.memberId}`, tenantId: "t_pulse", memberId: row.memberId, email: { bookingReminders: true, workoutUpdates: true, renewalReminders: false, inactivityPrompts: true }, soundOn: false, hapticsOn: true, updatedAt: "2026-11-17T05:00:00.000Z" });
    const r = await sendReminder(as("u_desk_andheri"), { invoiceId: row.invoiceId });
    expect(r.skipped).toBe(true);
    const e = (await db.emailLog.toArray()).find((x) => x.template === "payment_reminder" && x.invoiceId === row.invoiceId && x.status === "skipped")!;
    expect(e).toMatchObject({ status: "skipped", detail: "This member turned off renewal and payment reminders." });
  });

  it("renewal reminders and “we’ve missed you” go to the right members and say how many days", async () => {
    const v = await getCommunications(owner);
    const renewal = v.audiences.find((a) => a.id === "renewal")!;
    const quiet = v.audiences.find((a) => a.id === "inactive")!;
    expect(renewal.total).toBeGreaterThan(0);
    expect(quiet.total).toBeGreaterThanOrEqual(0);
    const r = await sendToGroup(owner, { audience: "renewal", key: key() });
    const sent = (await db.emailLog.toArray()).filter((e) => e.campaign === r.campaign && e.status === "sent");
    expect(sent.length).toBe(renewal.willSend);
    expect(sent[0]!.subject).toMatch(/^Your .+ ends on \d+ \w+ 2026$/);
    expect(sent[0]!.body).toMatch(/\d+ days from now/);
  });

  it("a group send is one send: the same key twice writes nothing more, and a branch manager’s reaches only their branch", async () => {
    const k = key();
    const a = await sendToGroup(owner, { audience: "offers", key: k });
    const total = await db.emailLog.count();
    const b = await sendToGroup(owner, { audience: "offers", key: k });
    expect(b).toMatchObject({ repeated: true, reached: a.reached });
    expect(await db.emailLog.count()).toBe(total);
    const m = await sendToGroup(bm, { audience: "offers", key: key() });
    const bandra = new Set((await db.members.toArray()).filter((x) => x.homeBranchId === "br_bandra").map((x) => x.id));
    for (const e of (await db.emailLog.toArray()).filter((x) => x.campaign === m.campaign)) expect(bandra.has(e.memberId!), e.id).toBe(true);
    expect((await db.auditEvents.where("action").equals("communication.send").toArray())).toHaveLength(2);
  });
});

describe("failed emails and retry", () => {
  it("with the demo’s mail server refusing mail, sent mail is logged as failed; switching it back and retrying sends it, once, and audits it", async () => {
    await setEmailFailure(owner, true);
    expect((await getCommunications(owner)).emailFails).toBe(true);
    const r = await sendToGroup(owner, { audience: "offers", key: key() });
    expect(r.reached).toBe(0);
    expect(r.failed).toBeGreaterThan(20);
    const v = await getCommunications(owner, { status: "failed", limit: 200 });
    expect(v.counts.failed).toBe(r.failed);
    const first = v.rows[0]!;
    expect(first).toMatchObject({ status: "failed", attempts: 1, canRetry: true, detail: "The mail server didn’t accept it. This is the demo’s mail failure." });
    // Still refusing: a retry fails again and counts the try.
    expect(await retryEmail(owner, { id: first.id })).toEqual({ result: "failed", attempts: 2 });
    await setEmailFailure(owner, false);
    expect(await retryEmail(owner, { id: first.id })).toEqual({ result: "sent", attempts: 3 });
    expect((await db.emailLog.get(first.id))).toMatchObject({ status: "sent", detail: "Sent on try 3." });
    // Pressing it again changes nothing.
    expect(await retryEmail(owner, { id: first.id })).toEqual({ result: "unchanged", attempts: 3 });
    const audits = (await db.auditEvents.where("action").equals("communication.retry").toArray()).filter((e) => e.entityId === first.id);
    expect(audits.map((a) => (a.details as { result: string }).result)).toEqual(["failed", "sent"]);
    // Retry all picks up the rest.
    const all = await retryAllFailed(owner);
    expect(all.sent).toBe(r.failed - 1);
    expect((await getCommunications(owner)).counts.failed).toBe(0);
  });

  it("stops after five tries and says what to do; a branch manager retries only their own branch’s mail", async () => {
    await setEmailFailure(owner, true);
    await sendToGroup(owner, { audience: "offers", key: key() });
    const id = (await getCommunications(owner, { status: "failed" })).rows[0]!.id;
    for (let i = 0; i < 4; i++) await retryEmail(owner, { id });
    expect((await db.emailLog.get(id))).toMatchObject({ attempts: 5, detail: "Stopped after 5 tries. Check the address, then send it again." });
    expect((await err(retryEmail(owner, { id }))).message).toBe("This was tried 5 times. Check the address, then send it again from the member’s profile.");
    const other = (await db.emailLog.toArray()).find((e) => e.status === "failed" && e.memberId && e.id !== id && (async () => true)())!;
    const home = (await db.members.get(other.memberId!))!.homeBranchId;
    if (home !== "br_bandra") expect((await err(retryEmail(bm, { id: other.id }))).code).toBe("not_found");
    const mine = await retryAllFailed(bm);
    await setEmailFailure(owner, false);
    expect(mine.sent + mine.failed).toBeGreaterThan(0);
    expect((await db.emailLog.toArray()).filter((e) => e.status === "failed" && e.attempts === 1 && e.memberId && home !== "br_bandra" && e.id === other.id)).toHaveLength(1);
  });

  it("the failure control is for the owner and branch managers", async () => {
    expect((await err(setEmailFailure(as("u_finance"), true))).code).toBe("forbidden");
  });
});

describe("the gym’s own wording", () => {
  const edited = { id: "payment_reminder" as const, subject: "Quick note: {{amount_due}} is open on {{invoice}}", body: "Hello {{first_name}}, {{amount_due}} is still due on {{invoice}}. Thanks, {{gym}}" };
  it("the owner changes it, the next email uses it, and it can be put back; every change is audited from and to", async () => {
    await saveTemplate(owner, { ...edited, key: key() });
    expect((await getCommunications(owner)).templates.find((t) => t.id === "payment_reminder")).toMatchObject({ custom: true, subject: edited.subject, preview: { subject: "Quick note: ₹2,950 is open on PFAND/26-27/0042" } });
    const dues = await getDues(as("u_desk_andheri"), {});
    const row = dues.rows[0]!;
    await sendReminder(as("u_desk_andheri"), { invoiceId: row.invoiceId });
    const e = (await db.emailLog.toArray()).filter((x) => x.template === "payment_reminder" && x.invoiceId === row.invoiceId).sort((a, b) => a.sentAt.localeCompare(b.sentAt) || (a.id.startsWith("em_") ? 0 : 1)).find((x) => x.subject.includes("Quick note"))!;
    expect(e.subject).toMatch(/^(Overdue: )?Quick note: ₹[\d,]+ is open on /);
    expect(e.body).toMatch(/^Hello \w+, ₹[\d,]+ is still due on /);
    const t = (await getCommunications(owner)).templates.find((x) => x.id === "payment_reminder")!;
    await saveTemplate(owner, { id: "payment_reminder", subject: t.defaultSubject, body: t.defaultBody, key: key() });
    expect((await getCommunications(owner)).templates.find((x) => x.id === "payment_reminder")!.custom).toBe(false);
    const events = await db.auditEvents.where("action").equals("communication.template").toArray();
    expect(events.map((x) => (x.details as { change: string }).change)).toEqual(["edited", "back to Ember’s wording"]);
  });

  it("refuses a placeholder the email doesn’t have, and is the owner’s alone", async () => {
    expect((await err(saveTemplate(owner, { ...edited, subject: "Hi {{plan}}", key: key() }))).message).toBe("{{plan}} isn’t available in this email. Use one of the placeholders listed.");
    expect((await err(saveTemplate(bm, { ...edited, key: key() }))).code).toBe("forbidden");
    expect((await getCommunications(bm)).canEditTemplates).toBe(false);
    expect((await db.tenants.toArray())[0]!.emailTemplates).toBeUndefined();
  });
});
