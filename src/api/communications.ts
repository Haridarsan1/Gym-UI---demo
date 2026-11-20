import { z } from "zod";
import { db } from "@/demo/db";
import { getSimulation, configureSimulation } from "@/demo/simulate";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { render, whyNotSent, wordingFor } from "@/api/mail";
import { branchScope, openOwner, type OwnerContext } from "@/api/owner";
import { buildAuditEvent } from "@/domain/audit";
import { addDays, daysBetween, istDateOf } from "@/domain/dates";
import { SAMPLE, TEMPLATES, templateDef, validateTemplate, type GymTemplateId, type Placeholder } from "@/domain/emailTemplates";
import { can } from "@/domain/permissions";
import { enteredOk } from "@/domain/checkin";
import type { EmailLogEntry, Member, Membership } from "@/domain/types";
import { formatDate } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Communications (O04), email only. The owner and branch managers read the delivery log for their own branches’ members, retry what failed, and send a reminder, a “we’ve missed you” or an offer to
 * a group. A message is sent only when the member can be reached and hasn’t turned that kind of message off; offers and news only go to members who agreed to them. Every skipped message says why.
 * Nothing is really sent in demo mode: a message is written to the log as sent, or as failed while the demo’s mail server is set to refuse mail.
 */
export const MAX_ATTEMPTS = 5;
const REMINDER_DAYS = 14;
const QUIET_DAYS = 14;

export interface TemplateView { id: GymTemplateId; title: string; about: string; rule: string; placeholders: Array<{ key: Placeholder; about: string }>; subject: string; body: string; custom: boolean; defaultSubject: string; defaultBody: string; preview: { subject: string; body: string } }
export interface AudienceView { id: "renewal" | "inactive" | "offers"; title: string; template: GymTemplateId; total: number; willSend: number; noEmail: number; optedOut: number; noConsent: number }
export interface LogRow { id: string; at: string; to?: string; name: string; kind: "member" | "staff"; template: string; subject: string; body: string; status: EmailLogEntry["status"]; detail?: string; attempts: number; canRetry: boolean }
export interface CommunicationsView {
  today: string;
  canEditTemplates: boolean;
  /** The demo’s mail server is set to refuse mail. */
  emailFails: boolean;
  templates: TemplateView[];
  audiences: AudienceView[];
  counts: { all: number; sent: number; skipped: number; failed: number };
  rows: LogRow[];
  /** How many rows match the filters, of which `rows` shows the first `limit`. */
  matching: number;
  failedRetryable: number;
}

export interface CommsQuery { branchId?: string; status?: EmailLogEntry["status"]; template?: string; limit?: number }

const TEMPLATE_LABEL: Record<string, string> = {
  booking_confirmed: "Booking confirmed", booking_canceled: "Booking canceled", booking_rescheduled: "Booking moved", payment_receipt: "Payment receipt", membership_renewed: "Membership renewed", sessions_purchased: "Sessions bought",
  data_request: "Data request", member_welcome: "Welcome", payment_reminder: "Payment reminder", refund_issued: "Refund issued", staff_invite: "Staff invitation", member_invite: "App invitation", renewal_reminder: "Renewal reminder", inactivity_prompt: "We’ve missed you", marketing_update: "Offers and news",
};

async function scoped(c: OwnerContext, scope: string[]) {
  const [members, memberships, consents, settings, checkIns, tenant] = await Promise.all([
    db.members.where("tenantId").equals(c.tenantId).filter((m) => !m.archivedAt && scope.includes(m.homeBranchId)).toArray(), db.memberships.where("tenantId").equals(c.tenantId).toArray(), db.consents.where("tenantId").equals(c.tenantId).toArray(),
    db.memberSettings.where("tenantId").equals(c.tenantId).toArray(), db.checkIns.where("tenantId").equals(c.tenantId).filter((x) => enteredOk(x.result) && x.result !== "repeat_scan").toArray(), db.tenants.get(c.tenantId),
  ]);
  return { members, memberships, consents, settings: new Map(settings.map((s) => [s.memberId, s])), checkIns, tenant };
}

interface Target { member: Member; template: GymTemplateId; vars: Partial<Record<Placeholder, string>> }

/** Who a group send would go to, by the rule for that group, before anyone is ruled out. */
function targets(audience: AudienceView["id"], today: string, d: Awaited<ReturnType<typeof scoped>>): Target[] {
  const gym = d.tenant?.name ?? "Your gym";
  const byMember = new Map<string, Membership[]>();
  for (const m of d.memberships) byMember.set(m.memberId, [...(byMember.get(m.memberId) ?? []), m]);
  const out: Target[] = [];
  for (const member of d.members) {
    const mine = byMember.get(member.id) ?? [];
    const cur = mine.filter((m) => m.status === "active").sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
    if (audience === "offers") { out.push({ member, template: "marketing_update", vars: { first_name: member.name.split(" ")[0] ?? member.name, gym } }); continue; }
    if (!cur) continue;
    if (audience === "renewal") {
      if (!cur.endsOn || cur.endsOn < today || cur.endsOn > addDays(today, REMINDER_DAYS) || mine.some((x) => x.id !== cur.id && x.startsOn > cur.startsOn && (x.status === "scheduled" || x.status === "active" || x.status === "pending"))) continue;
      out.push({ member, template: "renewal_reminder", vars: { first_name: member.name.split(" ")[0] ?? member.name, gym, plan: cur.terms.name, ends_on: formatDate(cur.endsOn), days: String(daysBetween(today, cur.endsOn)) } });
    } else {
      const last = d.checkIns.filter((x) => x.memberId === member.id).map((x) => istDateOf(x.at)).sort().at(-1);
      if (!last || last > addDays(today, -QUIET_DAYS) || cur.startsOn > addDays(today, -QUIET_DAYS)) continue;
      out.push({ member, template: "inactivity_prompt", vars: { first_name: member.name.split(" ")[0] ?? member.name, gym, days: String(daysBetween(last, today)), last_visit: formatDate(last) } });
    }
  }
  return out;
}

const AUDIENCES: Array<{ id: AudienceView["id"]; title: string; template: GymTemplateId }> = [
  { id: "renewal", title: `Memberships ending in ${REMINDER_DAYS} days`, template: "renewal_reminder" },
  { id: "inactive", title: `No visit in ${QUIET_DAYS} days`, template: "inactivity_prompt" },
  { id: "offers", title: "Offers and news", template: "marketing_update" },
];

function audienceView(a: (typeof AUDIENCES)[number], today: string, d: Awaited<ReturnType<typeof scoped>>): AudienceView {
  const list = targets(a.id, today, d);
  const v: AudienceView = { id: a.id, title: a.title, template: a.template, total: list.length, willSend: 0, noEmail: 0, optedOut: 0, noConsent: 0 };
  for (const t of list) {
    const why = whyNotSent(t.template, t.member, d.consents, t.member.id, d.settings.get(t.member.id));
    if (!why) v.willSend++;
    else if (why.kind === "no_email") v.noEmail++;
    else if (why.kind === "opted_out") v.optedOut++;
    else v.noConsent++;
  }
  return v;
}

export async function getCommunications(session: Session | null, q: CommsQuery = {}): Promise<CommunicationsView> {
  const c = await openOwner(session, "communication.manage");
  const scope = branchScope(c, q.branchId);
  const d = await scoped(c, scope);
  const [log, users, roles] = await Promise.all([db.emailLog.where("tenantId").equals(c.tenantId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray()]);
  const memberIds = new Map(d.members.map((m) => [m.id, m]));
  const name = new Map(users.map((u) => [u.id, u.name]));
  const staffInScope = new Set(roles.filter((r) => c.principal.role === "owner" || r.branchIds.some((b) => scope.includes(b))).map((r) => r.userId));
  const mine = log.filter((e) => (e.memberId ? memberIds.has(e.memberId) : e.userId ? staffInScope.has(e.userId) : false)).sort((a, b) => b.sentAt.localeCompare(a.sentAt) || a.id.localeCompare(b.id));
  const filtered = mine.filter((e) => (!q.status || e.status === q.status) && (!q.template || e.template === q.template));
  const counts = { all: mine.length, sent: mine.filter((e) => e.status === "sent").length, skipped: mine.filter((e) => e.status === "skipped").length, failed: mine.filter((e) => e.status === "failed").length };
  const limit = Math.min(Math.max(q.limit ?? 25, 1), 200);
  return {
    today: c.today, canEditTemplates: can(c.principal, "communication.template"), emailFails: getSimulation().emailFails,
    templates: TEMPLATES.map((t): TemplateView => {
      const w = wordingFor(d.tenant, t.id);
      return { id: t.id, title: t.title, about: t.about, rule: t.rule, placeholders: t.placeholders.map((key) => ({ key, about: ({ first_name: "The member’s first name", gym: "The gym’s name", plan: "Their plan", ends_on: "The date it ends", days: "Days left, or days since their last visit", invite_link: "The link that opens their login set-up", amount_due: "The amount due, with GST", invoice: "The invoice number", due_on: "The date it was due", last_visit: "The date of their last visit" } as Record<Placeholder, string>)[key] })), subject: w.subject, body: w.body, custom: w.custom, defaultSubject: t.subject, defaultBody: t.body, preview: render(w, SAMPLE) };
    }),
    audiences: AUDIENCES.map((a) => audienceView(a, c.today, d)),
    counts, matching: filtered.length, failedRetryable: mine.filter((e) => e.status === "failed" && (e.attempts ?? 1) < MAX_ATTEMPTS).length,
    rows: filtered.slice(0, limit).map((e): LogRow => ({
      id: e.id, at: e.sentAt, to: e.to, name: e.memberId ? (memberIds.get(e.memberId)?.name ?? "Member") : (name.get(e.userId ?? "") ?? "Staff"), kind: e.memberId ? "member" : "staff", template: TEMPLATE_LABEL[e.template] ?? e.template, subject: e.subject, body: e.body, status: e.status, detail: e.detail,
      attempts: e.attempts ?? 1, canRetry: e.status === "failed" && (e.attempts ?? 1) < MAX_ATTEMPTS,
    })),
  };
}

// ── Wording ─────────────────────────────────────────────────────────────────────────────────────

const TemplateInput = z.object({ id: z.enum(["payment_reminder", "renewal_reminder", "inactivity_prompt", "marketing_update", "member_invite"]), subject: z.string(), body: z.string(), key: z.string().min(8) });
export type SaveTemplateInput = z.input<typeof TemplateInput>;

/** Changes the gym’s wording for one email. `subject` and `body` equal to Ember’s wording puts it back. */
export async function saveTemplate(session: Session | null, raw: SaveTemplateInput): Promise<{ custom: boolean; repeated: boolean }> {
  const parsed = TemplateInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check the wording and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "communication.template");
  const def = templateDef(input.id)!;
  const errors = validateTemplate(def, input);
  const first = Object.values(errors)[0];
  if (first) throw new ApiError("invalid", first, { errors });
  return db.transaction("rw", db.tables, async () => {
    const auditId = `ae_tpl_${input.key}`;
    if (await db.auditEvents.get(auditId)) return { custom: !!(await db.tenants.get(c.tenantId))?.emailTemplates?.[input.id], repeated: true };
    const tenant = (await db.tenants.get(c.tenantId))!;
    const before = wordingFor(tenant, input.id);
    const reset = input.subject === def.subject && input.body === def.body;
    if (before.subject === input.subject && before.body === input.body) return { custom: before.custom, repeated: false };
    const next = { ...(tenant.emailTemplates ?? {}) };
    if (reset) delete next[input.id];
    else next[input.id] = { subject: input.subject, body: input.body };
    await db.tenants.put({ ...tenant, emailTemplates: Object.keys(next).length ? next : undefined });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "communication.template", entityType: "email_template", entityId: input.id, details: { template: def.title, change: reset ? "back to Ember’s wording" : "edited", from: { subject: before.subject, body: before.body }, to: { subject: input.subject, body: input.body } } }, auditId, now()));
    return { custom: !reset, repeated: false };
  });
}

// ── Group sends ─────────────────────────────────────────────────────────────────────────────────

const SendInput = z.object({ audience: z.enum(["renewal", "inactive", "offers"]), key: z.string().min(8), branchId: z.string().optional() });
export type SendInput = z.input<typeof SendInput>;
export interface SendResult { campaign: string; reached: number; failed: number; noEmail: number; optedOut: number; noConsent: number; repeated: boolean }

/** Sends one email to each member of a group who can be reached and hasn’t turned it off; everyone else gets a “not sent” line in the log with the reason. The same key twice sends nothing more. */
export async function sendToGroup(session: Session | null, raw: SendInput): Promise<SendResult> {
  const parsed = SendInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Choose who to send to and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "communication.manage");
  const scope = branchScope(c, input.branchId);
  const campaign = `cmp_${input.key}`;
  return db.transaction("rw", db.tables, async () => {
    const prior = await db.emailLog.toArray().then((l) => l.filter((e) => e.campaign === campaign));
    const tally = (list: EmailLogEntry[], repeated: boolean): SendResult => ({
      campaign, repeated, reached: list.filter((e) => e.status === "sent").length, failed: list.filter((e) => e.status === "failed").length,
      noEmail: list.filter((e) => e.status === "skipped" && e.detail?.startsWith("No email")).length, optedOut: list.filter((e) => e.status === "skipped" && e.detail?.includes("turned off")).length, noConsent: list.filter((e) => e.status === "skipped" && e.detail?.includes("agreed")).length,
    });
    if (prior.length > 0) return tally(prior, true);
    const d = await scoped(c, scope);
    const list = targets(input.audience, c.today, d);
    if (list.length === 0) throw new ApiError("conflict", "No one is in this group right now, so nothing was sent.");
    const written: EmailLogEntry[] = [];
    for (const t of list) {
      const why = whyNotSent(t.template, t.member, d.consents, t.member.id, d.settings.get(t.member.id));
      const text = render(wordingFor(d.tenant, t.template), t.vars);
      const row: EmailLogEntry = { id: `em_${campaign}_${t.member.id}`, tenantId: c.tenantId, memberId: t.member.id, template: t.template, to: t.member.email, subject: text.subject, body: text.body, status: why ? "skipped" : "sent", detail: why?.reason, campaign, sentAt: c.nowIso };
      await db.emailLog.add(row);
      written.push((await db.emailLog.get(row.id))!);
    }
    const result = tally(written, false);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "communication.send", entityType: "campaign", entityId: campaign, details: { audience: input.audience, template: list[0]!.template, branches: scope, ...result } }, `ae_${campaign}`, now()));
    return result;
  });
}

// ── Retry ───────────────────────────────────────────────────────────────────────────────────────

async function retryOne(c: OwnerContext, e: EmailLogEntry): Promise<"sent" | "failed" | "unchanged"> {
  if (e.status !== "failed") return "unchanged";
  const attempts = (e.attempts ?? 1) + 1;
  const refused = getSimulation().emailFails;
  const next: EmailLogEntry = refused
    ? { ...e, attempts, lastAttemptAt: c.nowIso, detail: attempts >= MAX_ATTEMPTS ? `Stopped after ${MAX_ATTEMPTS} tries. Check the address, then send it again.` : "The mail server still didn’t accept it. This is the demo’s mail failure." }
    : { ...e, status: "sent", attempts, lastAttemptAt: c.nowIso, detail: `Sent on try ${attempts}.` };
  await db.emailLog.put(next);
  await db.auditEvents.add(buildAuditEvent(c.principal, { action: "communication.retry", entityType: "email", entityId: e.id, memberId: e.memberId, details: { template: e.template, to: e.to, attempts, result: next.status } }, `ae_retry_${e.id}_${attempts}`, now()));
  return next.status === "sent" ? "sent" : "failed";
}

async function mineFailed(c: OwnerContext, branchId?: string): Promise<EmailLogEntry[]> {
  const scope = branchScope(c, branchId);
  const [log, members, roles] = await Promise.all([db.emailLog.where("tenantId").equals(c.tenantId).toArray(), db.members.where("tenantId").equals(c.tenantId).toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray()]);
  const inScope = new Set(members.filter((m) => scope.includes(m.homeBranchId)).map((m) => m.id));
  const staff = new Set(roles.filter((r) => c.principal.role === "owner" || r.branchIds.some((b) => scope.includes(b))).map((r) => r.userId));
  return log.filter((e) => (e.memberId ? inScope.has(e.memberId) : e.userId ? staff.has(e.userId) : false));
}

/** Tries one failed email again. An email that isn’t failed is left alone, so a second press does nothing. */
export async function retryEmail(session: Session | null, input: { id: string }): Promise<{ result: "sent" | "failed" | "unchanged"; attempts: number }> {
  if (!input.id) throw new ApiError("invalid", "Choose an email to retry.");
  const c = await openOwner(session, "communication.manage");
  return db.transaction("rw", db.tables, async () => {
    const e = (await mineFailed(c)).find((x) => x.id === input.id);
    if (!e) throw new ApiError("not_found", "We couldn’t find that email. It may belong to another branch.");
    if (e.status === "failed" && (e.attempts ?? 1) >= MAX_ATTEMPTS) throw new ApiError("conflict", `This was tried ${MAX_ATTEMPTS} times. Check the address, then send it again from the member’s profile.`);
    const result = await retryOne(c, e);
    return { result, attempts: (await db.emailLog.get(e.id))!.attempts ?? 1 };
  });
}

/** Tries every failed email in view again, once each. */
export async function retryAllFailed(session: Session | null, input: { branchId?: string } = {}): Promise<{ sent: number; failed: number }> {
  const c = await openOwner(session, "communication.manage");
  return db.transaction("rw", db.tables, async () => {
    const list = (await mineFailed(c, input.branchId)).filter((e) => e.status === "failed" && (e.attempts ?? 1) < MAX_ATTEMPTS);
    let sent = 0, failed = 0;
    for (const e of list) (await retryOne(c, e)) === "sent" ? sent++ : failed++;
    return { sent, failed };
  });
}

/** Demo control: the mail server refuses every email until it is switched back. */
export async function setEmailFailure(session: Session | null, on: boolean): Promise<{ emailFails: boolean }> {
  await openOwner(session, "communication.manage");
  configureSimulation({ emailFails: !!on });
  return { emailFails: !!on };
}

