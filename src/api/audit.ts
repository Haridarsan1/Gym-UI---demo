import { db } from "@/demo/db";
import { ApiError } from "@/api/errors";
import { branchScope, openOwner, type OwnerContext } from "@/api/owner";
import { buildAuditEvent } from "@/domain/audit";
import { actionLabel, AUDIT_GROUPS } from "@/domain/auditLabels";
import { toCsv } from "@/domain/csv";
import { istDateOf } from "@/domain/dates";
import { ROLE_LABEL } from "@/domain/roles";
import type { AuditEvent } from "@/domain/types";
import { now } from "@/api/clock";
import type { Session } from "@/app/session";

/**
 * The audit log (S05): who did what, when, why and to which record, newest first. The owner reads everything; a branch manager reads what concerns their own branches: events about their branches’
 * members, and what people who work at their branches did, never another branch’s members. Filtered by who, by kind and by date, and downloadable as a file that holds exactly what the person may see.
 */
export interface AuditQuery { branchId?: string; actorId?: string; group?: string; from?: string; to?: string; limit?: number }
export interface AuditRow { id: string; at: string; actorId: string; actor: string; role: string; action: string; label: string; record: string; member?: string; reason?: string; details: Array<{ key: string; value: string }> }
export interface AuditView { today: string; actors: Array<{ id: string; name: string; role: string }>; groups: Array<{ id: string; label: string }>; rows: AuditRow[]; matching: number; total: number; scopeNote: string }

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const flat = (v: unknown, prefix = ""): Array<{ key: string; value: string }> => {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.every((x) => typeof x !== "object") ? [{ key: prefix, value: v.join(", ") }] : v.flatMap((x, i) => flat(x, `${prefix} ${i + 1}`.trim()));
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => flat(x, prefix ? `${prefix}: ${k}` : k));
  return [{ key: prefix, value: String(v) }];
};

async function load(c: OwnerContext, scope: string[], q: AuditQuery) {
  const [events, users, roles, members, branches] = await Promise.all([
    db.auditEvents.where("tenantId").equals(c.tenantId).toArray(), db.users.filter((u) => u.tenantId === c.tenantId || u.role === "platform_admin").toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray(),
    db.members.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const staffHere = new Set(roles.filter((r) => r.role === "owner" || r.branchIds.some((b) => scope.includes(b))).map((r) => r.userId));
  const wholeGym = c.principal.role === "owner" && scope.length === branches.length;
  const visible = events.filter((e) => {
    if (wholeGym) return true;
    if (e.memberId) { const m = memberById.get(e.memberId); return !!m && scope.includes(m.homeBranchId); }
    if (e.entityType === "branch") return scope.includes(e.entityId);
    return staffHere.has(e.actorId);
  });
  const from = isDate(q.from) ? q.from : undefined;
  const to = isDate(q.to) ? q.to : undefined;
  const actions = q.group ? AUDIT_GROUPS.find((g) => g.id === q.group)?.actions : undefined;
  const matched = visible.filter((e) => (!q.actorId || e.actorId === q.actorId) && (!actions || actions.includes(e.action)) && (!from || istDateOf(e.at) >= from) && (!to || istDateOf(e.at) <= to)).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  const recordOf = (e: AuditEvent): string => {
    const d = (e.details ?? {}) as Record<string, unknown>;
    if (e.memberId) return `${e.entityType.replace(/_/g, " ")} of ${memberById.get(e.memberId)?.name ?? "a member"}`;
    const label = typeof d.name === "string" ? d.name : typeof d.invoice === "string" ? d.invoice : typeof d.template === "string" ? d.template : undefined;
    return label ? `${e.entityType.replace(/_/g, " ")}: ${label}` : e.entityType.replace(/_/g, " ");
  };
  const row = (e: AuditEvent): AuditRow => ({
    id: e.id, at: e.at, actorId: e.actorId, actor: name.get(e.actorId) ?? "Someone", role: ROLE_LABEL[e.actorRole] ?? e.actorRole, action: e.action, label: actionLabel(e.action), record: recordOf(e), member: e.memberId ? memberById.get(e.memberId)?.name : undefined,
    reason: e.reason, details: flat(e.details).slice(0, 24),
  });
  const actorIds = [...new Set(visible.map((e) => e.actorId))];
  return { visible, matched, row, actors: actorIds.map((id) => ({ id, name: name.get(id) ?? "Someone", role: ROLE_LABEL[roles.find((r) => r.userId === id)?.role ?? "member"] ?? "" })).sort((a, b) => a.name.localeCompare(b.name)), branches };
}

export async function getAuditLog(session: Session | null, q: AuditQuery = {}): Promise<AuditView> {
  const c = await openOwner(session, "audit.read");
  const scope = branchScope(c, q.branchId);
  const d = await load(c, scope, q);
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
  return {
    today: c.today, actors: d.actors, groups: AUDIT_GROUPS.map((g) => ({ id: g.id, label: g.label })), rows: d.matched.slice(0, limit).map(d.row), matching: d.matched.length, total: d.visible.length,
    scopeNote: c.principal.role === "owner" && scope.length === d.branches.length ? "Everything in the gym." : `What concerns ${scope.length === 1 ? "this branch" : "these branches"}: its members, and what people who work there did.`,
  };
}

/** The log as a file: exactly the rows the person may see for these filters, with names and reasons and nothing about a member’s health or contact details. */
export async function exportAuditLog(session: Session | null, q: AuditQuery = {}): Promise<{ filename: string; csv: string; rows: number }> {
  const c = await openOwner(session, "audit.read");
  const scope = branchScope(c, q.branchId);
  const d = await load(c, scope, q);
  const rows = d.matched.slice(0, 5000).map(d.row);
  if (rows.length === 0) throw new ApiError("conflict", "There is nothing to download for these filters.");
  const csv = toCsv(["When (India time)", "Who", "Role", "What", "Record", "Member", "Reason"], rows.map((r) => [new Date(Date.parse(r.at) + 5.5 * 3_600_000).toISOString().slice(0, 16).replace("T", " "), r.actor, r.role, r.label, r.record, r.member ?? "", r.reason ?? ""]));
  await db.auditEvents.add(buildAuditEvent(c.principal, { action: "export.create", entityType: "export", entityId: "audit", details: { report: "audit", rows: rows.length, branches: scope, group: q.group ?? null, actor: q.actorId ?? null, from: q.from ?? null, to: q.to ?? null } }, `ae_${crypto.randomUUID()}`, now()));
  return { filename: `ember-audit-log-${scope.length === 1 ? scope[0] : "all-branches"}-${c.today}.csv`, csv, rows: rows.length };
}
