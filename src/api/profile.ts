import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { ApiError } from "@/api/errors";
import { openMember } from "@/api/member";
import { buildAuditEvent } from "@/domain/audit";
import { assignmentOn } from "@/domain/membership";
import type { Consent, DataRequest, MemberSettings } from "@/domain/types";
import { formatDate } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Me (S04, O04): the member’s details, what they have agreed to and what that allows, which emails they get, how the app
 * behaves on their device, and their requests for a copy of their data or for deletion. Everything is the member’s own.
 */

/** The privacy notice version a new consent is recorded against. */
export { NOTICE_VERSION } from "@/api/profileNotice";
import { NOTICE_VERSION } from "@/api/profileNotice";

export type ConsentScopeName = "photos" | "assessments" | "marketing";
export const OPTIONAL_CONSENTS: readonly ConsentScopeName[] = ["photos", "assessments", "marketing"];

export interface ConsentView {
  scope: Consent["scope"];
  /** On while there is a consent that hasn’t been withdrawn. Data processing can’t be switched off here. */
  granted: boolean;
  /** When the current consent was given, or when the last one was withdrawn. */
  since?: string;
  withdrawn: boolean;
  required: boolean;
}

export interface RequestView {
  id: string;
  kind: DataRequest["kind"];
  status: DataRequest["status"];
  requestedAt: string;
}

export interface ProfileData {
  today: string;
  name: string;
  phone: string;
  email?: string;
  branchName: string;
  joinedOn: string;
  trainerName?: string;
  consents: ConsentView[];
  messages: MemberSettings["email"];
  hapticsOn: boolean;
  requests: RequestView[];
}

const dateOf = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10);

const DEFAULT_MESSAGES: MemberSettings["email"] = { bookingReminders: true, workoutUpdates: true, renewalReminders: true, inactivityPrompts: true };

export async function getProfile(session: Session | null): Promise<ProfileData> {
  const c = await openMember(session);
  for (const a of ["member.read", "consent.read"] as const) assertCan(c.principal, a, c.resource);
  const [member, branches, assignments, users, consents, settings, requests] = await Promise.all([
    db.members.get(c.memberId), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.trainerAssignments.where("memberId").equals(c.memberId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray(),
    db.consents.where("memberId").equals(c.memberId).toArray(), db.memberSettings.where("memberId").equals(c.memberId).first(), db.dataRequests.where("memberId").equals(c.memberId).toArray(),
  ]);
  if (!member) throw new ApiError("not_found", "We couldn’t find your membership record. Ask the front desk.");
  const view = (scope: Consent["scope"]): ConsentView => {
    const rows = consents.filter((k) => k.scope === scope).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
    const live = rows.find((k) => !k.withdrawnAt);
    const last = rows[0];
    return { scope, granted: !!live, since: live ? dateOf(live.grantedAt) : last?.withdrawnAt ? dateOf(last.withdrawnAt) : undefined, withdrawn: !live && !!last?.withdrawnAt, required: scope === "data_processing" };
  };
  const trainerId = assignmentOn(assignments, c.today)?.trainerId;
  return {
    today: c.today, name: member.name, phone: member.phone, email: member.email, branchName: branches.find((b) => b.id === member.homeBranchId)?.name ?? "", joinedOn: member.joinedOn,
    trainerName: trainerId ? users.find((u) => u.id === trainerId)?.name : undefined,
    consents: (["photos", "assessments", "marketing", "data_processing"] as const).map(view), messages: settings?.email ?? DEFAULT_MESSAGES, hapticsOn: settings?.hapticsOn ?? true,
    requests: requests.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).map((r) => ({ id: r.id, kind: r.kind, status: r.status, requestedAt: r.requestedAt })),
  };
}

const rid = (prefix: string) => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
const parse = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError("invalid", "We couldn’t read that change. Reload the page and try again.");
  return r.data;
};

const ConsentInput = z.object({ scope: z.enum(["photos", "assessments", "marketing"]), granted: z.boolean() });
export type ConsentInput = z.input<typeof ConsentInput>;

/**
 * Gives or withdraws one optional consent (S04). Withdrawing keeps the record and stamps the date; giving again starts a new
 * record against the current notice. Both are written to the audit log. Repeating the same choice changes nothing.
 */
export async function setConsent(session: Session | null, raw: ConsentInput): Promise<ConsentView> {
  const input = parse(ConsentInput, raw);
  const c = await openMember(session);
  assertCan(c.principal, "consent.write", c.resource);
  await db.transaction("rw", db.tables, async () => {
    const rows = await db.consents.where("memberId").equals(c.memberId).filter((k) => k.scope === input.scope).toArray();
    const live = rows.filter((k) => !k.withdrawnAt);
    if (input.granted && live.length === 0) {
      await db.consents.add({ id: rid(`cn_${c.memberId}_${input.scope}`), tenantId: c.tenantId, memberId: c.memberId, scope: input.scope, grantedAt: c.nowIso, noticeVersion: NOTICE_VERSION, recordedBy: c.principal.userId });
    } else if (!input.granted && live.length > 0) {
      for (const k of live) await db.consents.update(k.id, { withdrawnAt: c.nowIso });
    } else return;
    await db.auditEvents.add(buildAuditEvent(c.principal, {
      action: "consent.change", reason: input.granted ? "Member gave consent" : "Member withdrew consent", entityType: "consent", entityId: `${c.memberId}:${input.scope}`, memberId: c.memberId, details: { scope: input.scope, granted: input.granted, noticeVersion: NOTICE_VERSION },
    }, rid("ae"), new Date(c.nowIso)));
  });
  return (await getProfile(session)).consents.find((k) => k.scope === input.scope)!;
}

const SettingsInput = z.object({
  messages: z.object({ bookingReminders: z.boolean(), workoutUpdates: z.boolean(), renewalReminders: z.boolean(), inactivityPrompts: z.boolean() }).partial().optional(),
  hapticsOn: z.boolean().optional(),
});
export type SettingsInput = z.input<typeof SettingsInput>;

/** Saves which emails the member gets, and whether the app vibrates. Receipts and payment confirmations are always sent: they are the member’s records. */
export async function saveSettings(session: Session | null, raw: SettingsInput): Promise<{ messages: MemberSettings["email"]; hapticsOn: boolean }> {
  const input = parse(SettingsInput, raw);
  const c = await openMember(session);
  assertCan(c.principal, "member.update", c.resource);
  return db.transaction("rw", db.tables, async () => {
    const row = await db.memberSettings.where("memberId").equals(c.memberId).first();
    const next: MemberSettings = {
      id: row?.id ?? `set_${c.memberId}`, tenantId: c.tenantId, memberId: c.memberId, soundOn: row?.soundOn ?? false, hapticsOn: input.hapticsOn ?? row?.hapticsOn ?? true,
      email: { ...(row?.email ?? DEFAULT_MESSAGES), ...(input.messages ?? {}) }, updatedAt: c.nowIso,
    };
    await db.memberSettings.put(next);
    return { messages: next.email, hapticsOn: next.hapticsOn };
  });
}

const RequestInput = z.object({ kind: z.enum(["export", "deletion"]), idempotencyKey: z.string().min(8) });
export type RequestInput = z.input<typeof RequestInput>;

/**
 * Asks for a copy of the member’s data, or for deletion (S04). The gym fulfils it under its retention policy; the owner console
 * handles it in M4. Asking while one of the same kind is still open returns that one, and the same key twice is one request.
 * Writes an audit event and a confirmation email to the delivery log.
 */
export async function requestData(session: Session | null, raw: RequestInput): Promise<{ request: RequestView; repeated: boolean }> {
  const input = parse(RequestInput, raw);
  const c = await openMember(session);
  assertCan(c.principal, "data.export.request", c.resource);
  return db.transaction("rw", db.tables, async () => {
    const mine = await db.dataRequests.where("memberId").equals(c.memberId).toArray();
    const view = (r: DataRequest): RequestView => ({ id: r.id, kind: r.kind, status: r.status, requestedAt: r.requestedAt });
    const same = mine.find((r) => r.idempotencyKey === input.idempotencyKey) ?? mine.find((r) => r.kind === input.kind && (r.status === "requested" || r.status === "in_progress"));
    if (same) return { request: view(same), repeated: true };
    const member = await db.members.get(c.memberId);
    const tenant = await db.tenants.get(c.tenantId);
    const request: DataRequest = { id: rid("dr"), tenantId: c.tenantId, memberId: c.memberId, kind: input.kind, status: "requested", requestedAt: c.nowIso, requestedBy: c.principal.userId, idempotencyKey: input.idempotencyKey };
    await db.dataRequests.add(request);
    await db.auditEvents.add(buildAuditEvent(c.principal, {
      action: "data.request", reason: input.kind === "export" ? "Member asked for a copy of their data" : "Member asked for their data to be deleted", entityType: "dataRequest", entityId: request.id, memberId: c.memberId, details: { kind: input.kind },
    }, rid("ae"), new Date(c.nowIso)));
    const first = member?.name.split(" ")[0] ?? "there";
    await db.emailLog.add({
      id: rid("em"), tenantId: c.tenantId, memberId: c.memberId, template: "data_request", to: member?.email, status: member?.email ? "sent" : "skipped", detail: member?.email ? undefined : "No email address on file for this member.", sentAt: c.nowIso,
      subject: input.kind === "export" ? "We have your request for a copy of your data" : "We have your request to delete your data",
      body: [`Hi ${first},`, "", input.kind === "export" ? `We received your request on ${formatDate(c.today)} for a copy of your data. ${tenant?.name ?? "Your gym"} will email it to you and you can follow its status in Me.` : `We received your request on ${formatDate(c.today)} to delete your data. ${tenant?.name ?? "Your gym"} will confirm what can be deleted. Records the law requires, such as invoices and tax receipts, are kept for the period it sets. You can follow the status in Me.`, "", tenant?.name ?? "Your gym"].join("\n"),
    });
    return { request: view(request), repeated: false };
  });
}
