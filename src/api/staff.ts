import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { openOwner } from "@/api/owner";
import { buildAuditEvent } from "@/domain/audit";
import { ROLE_LABEL } from "@/domain/roles";
import { accessChanges, accessSummary, authorityOf, canManageStaff, cleanLimits, defaultLimits, digitsOf, STAFF_ROLES, validateStaff, type Authority, type StaffDraft, type StaffErrors, type StaffRoleName } from "@/domain/staffRules";
import type { StaffLimits } from "@/domain/permissions";
import type { StaffRole, User } from "@/domain/types";
import { formatDate } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Staff, roles and branches (R02, S03). The owner invites, changes and switches off any staff account; a branch manager the owner has allowed does so for front desk and trainers at their own
 * branches, within their own limits; everyone else with access reads. Rules are `domain/staffRules.ts`. A change to someone’s access takes effect on their next action, because every API reads
 * their role from the database. Role, branch and limit changes are `permission.change` in the audit log, invitations and switching on or off are `staff.change`, each with what it was and what it became.
 */
export type StaffStatus = "active" | "invited" | "disabled";

export interface StaffRow {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  role: StaffRoleName;
  status: StaffStatus;
  branchIds: string[];
  branchNames: string[];
  limits: StaffLimits;
  mfaEnabled: boolean;
  invitedOn?: string;
  /** Trainers: members they currently train, so switching them off says what is left to reassign. */
  clients: number;
  you: boolean;
  /** Whether the person looking may change this account, and why not when they may not. */
  manage: { ok: boolean; reason?: string };
  summary: string[];
}

export interface StaffView {
  today: string;
  authority: Authority;
  branches: Array<{ id: string; name: string }>;
  staff: StaffRow[];
  /** Addresses already taken at this gym, for the invitation form to say so before sending. */
  emailsTaken: string[];
  me: { userId: string; role: StaffRoleName; branchIds: string[]; limits?: StaffLimits };
}

const ORDER = new Map(STAFF_ROLES.map((r, i) => [r, i]));

export async function getStaff(session: Session | null): Promise<StaffView> {
  const c = await openOwner(session, "staff.read");
  const [users, roles, branches, assignments] = await Promise.all([
    db.users.where("tenantId").equals(c.tenantId).toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(),
    db.trainerAssignments.filter((a) => a.effectiveTo === undefined).toArray(),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const byUser = new Map(users.map((u) => [u.id, u]));
  const clients = new Map<string, number>();
  for (const a of assignments) clients.set(a.trainerId, (clients.get(a.trainerId) ?? 0) + 1);
  const authority = authorityOf(c.principal);
  const mine = new Set(c.branchIds);
  const staff = roles
    .filter((r) => byUser.has(r.userId) && (c.principal.role === "owner" || r.branchIds.some((b) => mine.has(b))))
    .map((r): StaffRow => {
      const u = byUser.get(r.userId)!;
      const manage = r.userId === c.principal.userId ? { ok: false, reason: "That is you. Another owner changes your access." } : canManageStaff(c.principal, { userId: r.userId, role: r.role, branchIds: r.branchIds });
      const names = r.role === "owner" ? branches.map((b) => b.name) : r.branchIds.map((b) => branchName.get(b) ?? b);
      return {
        userId: r.userId, name: u.name, email: u.email, phone: u.phone, role: r.role, status: u.status, branchIds: r.role === "owner" ? branches.map((b) => b.id) : r.branchIds, branchNames: names, limits: r.limits, mfaEnabled: u.mfaEnabled,
        invitedOn: u.status === "invited" ? u.createdAt.slice(0, 10) : undefined, clients: r.role === "trainer" ? (clients.get(r.userId) ?? 0) : 0, you: r.userId === c.principal.userId, manage, summary: accessSummary(r.role, names, r.limits),
      };
    })
    .sort((a, b) => (ORDER.get(a.role) ?? 9) - (ORDER.get(b.role) ?? 9) || a.name.localeCompare(b.name));
  return {
    today: c.today, authority, branches: branches.filter((b) => b.active && (c.principal.role === "owner" || mine.has(b.id))).map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name)),
    staff, emailsTaken: users.map((u) => u.email).filter((e): e is string => !!e), me: { userId: c.principal.userId, role: c.principal.role as StaffRoleName, branchIds: c.principal.branchIds, limits: c.principal.limits },
  };
}

const Limits = z.object({
  refundLimitPaise: z.number().nullable(), canOverrideCheckIn: z.boolean(), canManageFrontline: z.boolean().optional(), maxOverridesPerDay: z.number().nullable().optional(), maxDiscountBp: z.number(), canViewClientHealth: z.boolean(),
});
const Person = z.object({ name: z.string(), email: z.string(), phone: z.string(), role: z.enum(["owner", "branch_manager", "front_desk", "finance", "trainer"]), branchIds: z.array(z.string()), limits: Limits });
const InviteInput = Person.extend({ key: z.string().min(8) });
const UpdateInput = Person.extend({ key: z.string().min(8), userId: z.string().min(1), reason: z.string().trim().max(300).optional() });
export type InviteStaffInput = z.input<typeof InviteInput>;
export type UpdateStaffInput = z.input<typeof UpdateInput>;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

function fail(errors: StaffErrors): never {
  throw new ApiError("invalid", Object.values(errors)[0]!, { errors });
}

/** The email an invitation sends. Nothing is really sent in the demo; it is written to the delivery log like every other message. */
async function sendInvite(tenantId: string, gymName: string, by: string, user: User, role: StaffRoleName, branchNames: string[], nowIso: string, repeat: boolean): Promise<void> {
  const first = user.name.split(" ")[0] ?? user.name;
  await db.emailLog.add({
    id: rid("em"), tenantId, userId: user.id, template: "staff_invite", to: user.email, subject: `${repeat ? "Reminder: " : ""}${by} has invited you to ${gymName}`,
    body: [`Hi ${first},`, "", `${by} has invited you to join ${gymName} as ${ROLE_LABEL[role].toLowerCase()} at ${role === "owner" ? "every branch" : branchNames.join(", ")}.`, "", "Open the link below to set your password and sign in. It works once.", `https://app.ember.example/invite/${user.id}`, "", "If you weren’t expecting this, ignore this email and nothing happens."].join("\n"),
    status: user.email ? "sent" : "skipped", detail: user.email ? undefined : "No email address", sentAt: nowIso,
  });
}

/** Invites someone: an account that can’t sign in until they accept, with the role, branches and limits the inviter chose. */
export async function inviteStaff(session: Session | null, raw: InviteStaffInput): Promise<StaffRow> {
  const parsed = InviteInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check the details and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "staff.read");
  const authority = authorityOf(c.principal);
  if (authority.scope === "none") throw new ApiError("forbidden", authority.why!);
  return db.transaction("rw", db.tables, async () => {
    const userId = `u_staff_${slug(input.name)}_${slug(input.key).slice(-6)}`;
    const existing = await db.users.get(userId);
    const [users, branches, tenant] = await Promise.all([db.users.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.tenants.get(c.tenantId)]);
    const names = new Map(branches.map((b) => [b.id, b.name]));
    const branchIds = input.role === "owner" ? branches.map((b) => b.id) : [...new Set(input.branchIds)];
    const draft: StaffDraft = { ...input, limits: input.limits };
    const errors = validateStaff(existing ? { ...draft, email: "" } : draft, c.principal, { emailsTaken: users.map((u) => u.email ?? ""), allBranchIds: branches.map((b) => b.id) });
    if (existing) delete errors.email; // the same invitation sent again
    if (Object.keys(errors).length) fail(errors);
    const view = async (u: User, r: StaffRole): Promise<StaffRow> => ({
      userId: u.id, name: u.name, email: u.email, phone: u.phone, role: r.role, status: u.status, branchIds: r.branchIds, branchNames: r.branchIds.map((b) => names.get(b) ?? b), limits: r.limits, mfaEnabled: u.mfaEnabled, invitedOn: u.createdAt.slice(0, 10), clients: 0, you: false,
      manage: { ok: true }, summary: accessSummary(r.role, r.branchIds.map((b) => names.get(b) ?? b), r.limits),
    });
    if (existing) return view(existing, (await db.staffRoles.where("userId").equals(userId).first())!);

    const limits = cleanLimits(input.role, input.limits);
    const user: User = { id: userId, tenantId: c.tenantId, name: input.name.trim().replace(/\s+/g, " "), email: input.email.trim().toLowerCase(), phone: input.phone.trim() ? digitsOf(input.phone) : undefined, role: input.role, status: "invited", mfaEnabled: false, createdAt: c.nowIso };
    const role: StaffRole = { id: `sr_${userId}`, tenantId: c.tenantId, userId, role: input.role, branchIds, limits };
    await db.users.add(user);
    await db.staffRoles.add(role);
    const inviter = users.find((u) => u.id === c.principal.userId)?.name ?? "Your gym";
    await sendInvite(c.tenantId, tenant?.name ?? "the gym", inviter, user, input.role, branchIds.map((b) => names.get(b) ?? b), c.nowIso, false);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "staff.change", entityType: "staff", entityId: userId, details: { change: "invited", name: user.name, role: input.role, branches: branchIds.map((b) => names.get(b) ?? b), access: accessSummary(input.role, branchIds.map((b) => names.get(b) ?? b), limits) } }, `ae_staff_${input.key}`, now()));
    return view(user, role);
  });
}

/** Changes a person’s details and access. Refuses what the person making the change may not do, and what would leave the gym without an owner. */
export async function updateStaff(session: Session | null, raw: UpdateStaffInput): Promise<{ changes: ReturnType<typeof accessChanges>; repeated: boolean }> {
  const parsed = UpdateInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check the details and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "staff.read");
  const authority = authorityOf(c.principal);
  if (authority.scope === "none") throw new ApiError("forbidden", authority.why!);
  return db.transaction("rw", db.tables, async () => {
    const auditId = `ae_staff_${input.key}`;
    const [user, role, branches] = await Promise.all([db.users.get(input.userId), db.staffRoles.where("userId").equals(input.userId).first(), db.branches.where("tenantId").equals(c.tenantId).toArray()]);
    if (!user || !role || user.tenantId !== c.tenantId) throw new ApiError("not_found", "We couldn’t find that person. They may have been removed.");
    const names = new Map(branches.map((b) => [b.id, b.name]));
    const prior = await db.auditEvents.get(auditId);
    if (prior) return { changes: ((prior.details as { changes?: ReturnType<typeof accessChanges> } | undefined)?.changes ?? []), repeated: true };
    const self = user.id === c.principal.userId;
    const allowed = canManageStaff(c.principal, { userId: user.id, role: role.role, branchIds: role.branchIds });
    if (!allowed.ok && !self) throw new ApiError("forbidden", allowed.reason);

    const branchIds = input.role === "owner" ? branches.map((b) => b.id) : [...new Set(input.branchIds)];
    const limits = cleanLimits(input.role, input.limits);
    const errors = validateStaff({ ...input, email: user.email ?? "placeholder@example.in", limits: input.limits, branchIds }, c.principal, { emailsTaken: [], allBranchIds: branches.map((b) => b.id) });
    if (self) { delete errors.role; delete errors.branchIds; }
    const first = Object.values(errors)[0];
    if (first) throw new ApiError("invalid", first, { errors });
    const before = { role: role.role, branchNames: role.branchIds.map((b) => names.get(b) ?? b), limits: role.limits };
    const after = { role: input.role, branchNames: branchIds.map((b) => names.get(b) ?? b), limits };
    const changes = accessChanges(before, after);
    if (self && changes.length > 0) throw new ApiError("forbidden", "You can’t change your own role or access. Ask another owner.");

    const name = input.name.trim().replace(/\s+/g, " ");
    const phone = input.phone.trim() ? digitsOf(input.phone) : undefined;
    const detailsChanged = name !== user.name || phone !== user.phone;
    if (changes.length === 0 && !detailsChanged) return { changes, repeated: false };
    await db.users.put({ ...user, name, phone, role: input.role });
    if (changes.length > 0) await db.staffRoles.put({ ...role, role: input.role, branchIds, limits });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: changes.length > 0 ? "permission.change" : "staff.change", reason: input.reason, entityType: "staff", entityId: user.id, details: { change: changes.length > 0 ? "access" : "details", name, changes, ...(detailsChanged ? { details: { name: { from: user.name, to: name }, phone: { from: user.phone ?? null, to: phone ?? null } } } : {}) } }, auditId, now()));
    return { changes, repeated: false };
  });
}

const StatusInput = z.object({ key: z.string().min(8), userId: z.string().min(1), active: z.boolean(), reason: z.string().trim() });
export type StaffStatusInput = z.input<typeof StatusInput>;

/** Switches an account off (they can’t sign in; what they did stays) or back on. Needs a reason to switch off. */
export async function setStaffActive(session: Session | null, raw: StaffStatusInput): Promise<{ status: StaffStatus; clients: number; repeated: boolean }> {
  const parsed = StatusInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check the details and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "staff.read");
  const authority = authorityOf(c.principal);
  if (authority.scope === "none") throw new ApiError("forbidden", authority.why!);
  if (!input.active && input.reason.length < 3) throw new ApiError("invalid", "Say why the account is being switched off. The reason is kept and audited.");
  return db.transaction("rw", db.tables, async () => {
    const [user, role] = await Promise.all([db.users.get(input.userId), db.staffRoles.where("userId").equals(input.userId).first()]);
    if (!user || !role || user.tenantId !== c.tenantId) throw new ApiError("not_found", "We couldn’t find that person. They may have been removed.");
    const clients = role.role === "trainer" ? await db.trainerAssignments.where("trainerId").equals(user.id).filter((a) => a.effectiveTo === undefined).count() : 0;
    const auditId = `ae_staff_${input.key}`;
    if (await db.auditEvents.get(auditId)) return { status: user.status, clients, repeated: true };
    if (user.id === c.principal.userId) throw new ApiError("forbidden", "You can’t switch off your own account.");
    const allowed = canManageStaff(c.principal, { userId: user.id, role: role.role, branchIds: role.branchIds });
    if (!allowed.ok) throw new ApiError("forbidden", allowed.reason);
    const next: StaffStatus = input.active ? "active" : "disabled";
    if (user.status === next) return { status: next, clients, repeated: false };
    await db.users.put({ ...user, status: next });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "staff.change", reason: input.reason || undefined, entityType: "staff", entityId: user.id, details: { change: input.active ? "switched on" : "switched off", name: user.name, role: role.role, clients } }, auditId, now()));
    return { status: next, clients, repeated: false };
  });
}

/** Sends the invitation again to someone who hasn’t accepted. */
export async function resendInvite(session: Session | null, input: { userId: string; key: string }): Promise<{ sentTo: string; repeated: boolean }> {
  if (!input.userId || !input.key || input.key.length < 8) throw new ApiError("invalid", "Check the details and try again.");
  const c = await openOwner(session, "staff.read");
  const authority = authorityOf(c.principal);
  if (authority.scope === "none") throw new ApiError("forbidden", authority.why!);
  return db.transaction("rw", db.tables, async () => {
    const [user, role, tenant, users, branches] = await Promise.all([db.users.get(input.userId), db.staffRoles.where("userId").equals(input.userId).first(), db.tenants.get(c.tenantId), db.users.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray()]);
    if (!user || !role || user.tenantId !== c.tenantId) throw new ApiError("not_found", "We couldn’t find that person. They may have been removed.");
    const allowed = canManageStaff(c.principal, { userId: user.id, role: role.role, branchIds: role.branchIds });
    if (!allowed.ok) throw new ApiError("forbidden", allowed.reason);
    if (user.status !== "invited") throw new ApiError("conflict", user.status === "active" ? `${user.name.split(" ")[0]} has already accepted.` : "This account is switched off. Switch it on first.");
    const auditId = `ae_staff_${input.key}`;
    if (await db.auditEvents.get(auditId)) return { sentTo: user.email ?? "", repeated: true };
    const names = new Map(branches.map((b) => [b.id, b.name]));
    await sendInvite(c.tenantId, tenant?.name ?? "the gym", users.find((u) => u.id === c.principal.userId)?.name ?? "Your gym", user, role.role, role.branchIds.map((b) => names.get(b) ?? b), c.nowIso, true);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "staff.change", entityType: "staff", entityId: user.id, details: { change: "invite sent again", name: user.name, on: formatDate(c.today) } }, auditId, now()));
    return { sentTo: user.email ?? "", repeated: false };
  });
}

export { defaultLimits };
