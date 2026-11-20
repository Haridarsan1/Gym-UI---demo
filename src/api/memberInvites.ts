import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { openDesk, type DeskContext } from "@/api/desk";
import { hasConsent, render, wordingFor } from "@/api/mail";
import { policiesFor } from "@/api/policies";
import { buildAuditEvent } from "@/domain/audit";
import { istDateOf } from "@/domain/dates";
import { appStatus, validateJoin, whyNotInvited, type AppStatus, type JoinDraft } from "@/domain/memberInvite";
import type { Consent, Member, Tenant } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * App invitations (S01): an email with a link, through the delivery log, so it can fail and be retried like any other. The link opens a page where the member sets up their login, by phone and a
 * code or by email and a password (simulated in demo mode: the code is on the screen and no password is kept). Branch scope is the caller’s: a branch manager or front desk invites only their own branch’s members.
 */
const hash = (t: string) => [...t].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36);

export interface InviteResult { sent: number; failed: number; skipped: Array<{ memberId: string; name: string; reason: string }>; repeated: boolean }
const Input = z.object({ memberIds: z.array(z.string().min(1)).min(1).max(500), key: z.string().min(8) });
export type InviteInput = z.input<typeof Input>;

async function inviteOne(c: DeskContext, m: Member, tenantName: string, tenant: Tenant | undefined, key: string, gapDays: number, consents: Consent[]): Promise<"sent" | "failed" | { reason: string }> {
  const block = whyNotInvited(m, { consentOk: !consents.some((x) => x.memberId === m.id && x.scope === "data_processing") || hasConsent(consents, m.id, "data_processing"), today: c.today, gapDays, lastSentOn: m.appInvite ? istDateOf(m.appInvite.sentAt) : undefined });
  if (block) {
    await db.emailLog.add({ id: `em_inv_${key}_${m.id}`, tenantId: c.tenantId, memberId: m.id, template: "member_invite", to: m.email, subject: "App invitation", body: "", status: "skipped", detail: block.reason, campaign: `inv_${key}`, sentAt: c.nowIso });
    return { reason: block.reason };
  }
  const token = `inv_${hash(`${m.id}${key}`)}${hash(`${key}${m.id}x`)}`;
  const link = `https://app.ember.example/join/${token}`;
  const text = render(wordingFor(tenant, "member_invite"), { first_name: m.name.split(" ")[0] ?? m.name, gym: tenantName, invite_link: link });
  const id = `em_inv_${key}_${m.id}`;
  await db.emailLog.add({ id, tenantId: c.tenantId, memberId: m.id, template: "member_invite", to: m.email, subject: text.subject, body: text.body, status: "sent", campaign: `inv_${key}`, sentAt: c.nowIso });
  await db.members.update(m.id, { appInvite: { token, sentAt: c.nowIso, to: m.email } });
  return (await db.emailLog.get(id))!.status === "failed" ? "failed" : "sent";
}

/** Sends the invitation to each member who can have one; everyone else gets a “not sent” line in the delivery log with the reason. The same key twice sends nothing more. */
export async function inviteMembers(session: Session | null, raw: InviteInput): Promise<InviteResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Choose who to invite.");
  const input = parsed.data;
  const c = await openDesk(session, "message.send");
  return db.transaction("rw", db.tables, async () => {
    const prior = (await db.emailLog.where("tenantId").equals(c.tenantId).toArray()).filter((e) => e.campaign === `inv_${input.key}`);
    if (prior.length > 0) return { sent: prior.filter((e) => e.status === "sent").length, failed: prior.filter((e) => e.status === "failed").length, skipped: [], repeated: true };
    const [tenant, consents, policy] = await Promise.all([db.tenants.get(c.tenantId), db.consents.where("tenantId").equals(c.tenantId).toArray(), policiesFor(c.tenantId)]);
    const members = (await Promise.all([...new Set(input.memberIds)].map((id) => db.members.get(id)))).filter((m): m is Member => !!m && m.tenantId === c.tenantId && c.branchIds.includes(m.homeBranchId));
    if (members.length === 0) throw new ApiError("not_found", "We couldn’t find those members. They may belong to another branch.");
    const out: InviteResult = { sent: 0, failed: 0, skipped: [], repeated: false };
    for (const m of members) {
      const r = await inviteOne(c, m, tenant?.name ?? "your gym", tenant, input.key, policy.reminderGapDays, consents);
      if (r === "sent") out.sent++;
      else if (r === "failed") out.failed++;
      else out.skipped.push({ memberId: m.id, name: m.name, reason: r.reason });
    }
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "member.invite", entityType: "invitation", entityId: `inv_${input.key}`, memberId: members.length === 1 ? members[0]!.id : undefined, details: { members: members.length, sent: out.sent, failed: out.failed, notSent: out.skipped.length } }, `ae_inv_${input.key}`, now()));
    return out;
  });
}

export interface AppRow { memberId: string; name: string; email?: string; branchId: string; status: AppStatus; invitedOn?: string; joinedOn?: string }

/** Who has joined, who has been invited and who hasn’t, for the members of one import (or any list of members the caller may see). */
export async function getAppStatus(session: Session | null, input: { memberIds?: string[]; importBatchId?: string }): Promise<{ rows: AppRow[]; counts: Record<AppStatus, number> }> {
  const c = await openDesk(session, "member.read");
  const all = await db.members.where("tenantId").equals(c.tenantId).filter((m) => c.branchIds.includes(m.homeBranchId) && !m.archivedAt).toArray();
  const pick = all.filter((m) => (input.importBatchId ? m.importBatchId === input.importBatchId : input.memberIds ? input.memberIds.includes(m.id) : false));
  const rows = pick.map((m): AppRow => ({ memberId: m.id, name: m.name, email: m.email, branchId: m.homeBranchId, status: appStatus(m), invitedOn: m.appInvite ? istDateOf(m.appInvite.sentAt) : undefined, joinedOn: m.appInvite?.joinedAt ? istDateOf(m.appInvite.joinedAt) : undefined })).sort((a, b) => a.name.localeCompare(b.name));
  return { rows, counts: { joined: rows.filter((r) => r.status === "joined").length, invited: rows.filter((r) => r.status === "invited").length, not_invited: rows.filter((r) => r.status === "not_invited").length } };
}

// ── The link ────────────────────────────────────────────────────────────────────────────────────

export interface InviteView { valid: boolean; reason?: string; firstName?: string; gymName?: string; logoUrl?: string; phoneEnding?: string; email?: string }

/** What the join page shows before anything is typed. No session: the link is the proof. */
export async function getInvite(token: string): Promise<InviteView> {
  const { ensureSeeded } = await import("@/demo");
  await ensureSeeded();
  const m = (await db.members.toArray()).find((x) => x.appInvite?.token === token);
  if (!m || !m.appInvite) return { valid: false, reason: "This link isn’t valid any more. Ask the gym to send you a new invitation." };
  const t = await db.tenants.get(m.tenantId);
  if (m.appInvite.joinedAt || m.userId) return { valid: false, reason: "You have already set up your login. Sign in from the login page.", gymName: t?.name };
  return { valid: true, firstName: m.name.split(" ")[0], gymName: t?.name, logoUrl: t?.logoUrl, phoneEnding: m.phone.slice(-4), email: m.email };
}

const JoinInput = z.object({ token: z.string().min(8), method: z.enum(["phone_otp", "email_password"]), code: z.string(), password: z.string(), confirm: z.string() });

/** Sets up the member’s login and signs them in. Demo: the six-digit code is shown on the page and a password is checked and then forgotten. */
export async function completeJoin(raw: z.input<typeof JoinInput>): Promise<{ userId: string; name: string; tenantId: string; branchIds: string[]; memberId: string }> {
  const parsed = JoinInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check what you entered and try again.");
  const input = parsed.data;
  const errors = validateJoin(input as JoinDraft);
  const first = Object.values(errors)[0];
  if (first) throw new ApiError("invalid", first, { errors });
  return db.transaction("rw", db.tables, async () => {
    const m = (await db.members.toArray()).find((x) => x.appInvite?.token === input.token);
    if (!m || !m.appInvite) throw new ApiError("not_found", "This link isn’t valid any more. Ask the gym to send you a new invitation.");
    if (m.appInvite.joinedAt || m.userId) throw new ApiError("conflict", "You have already set up your login. Sign in from the login page.");
    const at = now().toISOString();
    const userId = `u_${m.id}`;
    await db.users.add({ id: userId, tenantId: m.tenantId, name: m.name, email: m.email, phone: m.phone, role: "member", status: "active", mfaEnabled: false, memberId: m.id, login: { method: input.method, setAt: at }, createdAt: at });
    await db.members.update(m.id, { userId, appInvite: { ...m.appInvite, joinedAt: at } });
    await db.auditEvents.add({ id: `ae_join_${m.id}`, tenantId: m.tenantId, actorId: userId, actorRole: "member", at, action: "member.join", entityType: "login", entityId: userId, memberId: m.id, details: { method: input.method === "phone_otp" ? "phone and a code" : "email and a password" } });
    return { userId, name: m.name, tenantId: m.tenantId, branchIds: [m.homeBranchId], memberId: m.id };
  });
}
