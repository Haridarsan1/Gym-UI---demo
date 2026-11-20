import { db } from "@/demo/db";
import { ensureSeeded } from "@/demo";
import { now } from "@/api/clock";
import { open } from "@/api/context";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { StaffLimits } from "@/domain/permissions";
import type { Role } from "@/domain/roles";
import type { Session } from "@/app/session";

export interface NewLogin { userId: string; name: string; tenantId: string; branchIds: string[]; memberId: string }

/**
 * Demo only: members registered at the desk since the demo began, newest first, so the role switcher can sign in as one of them. The sample members are not listed
 * (they are already in the switcher). A real backend gives each new member a login by phone or email instead.
 */
export async function listNewMemberLogins(session: Session | null): Promise<NewLogin[]> {
  const { principal } = await open(session);
  if (!principal.tenantId) return [];
  const known = new Set(DEMO_ACCOUNTS.map((a) => a.userId));
  const [users, members] = await Promise.all([db.users.where("tenantId").equals(principal.tenantId).filter((u) => u.role === "member" && !!u.memberId && !known.has(u.id)).toArray(), db.members.where("tenantId").equals(principal.tenantId).toArray()]);
  const home = new Map(members.map((m) => [m.id, m.homeBranchId]));
  return users.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((u) => ({ userId: u.id, name: u.name, tenantId: principal.tenantId!, branchIds: [home.get(u.memberId!) ?? ""].filter(Boolean), memberId: u.memberId! }));
}

export interface NewStaffLogin { userId: string; name: string; tenantId: string; branchIds: string[]; role: Role; limits: StaffLimits; status: "invited" | "active" }

/**
 * Demo only: staff the owner invited since the demo began, newest first, so the role switcher can sign in as one of them. Signing in as someone still invited is how they accept (below). A real
 * backend sends them a link instead.
 */
export async function listNewStaffLogins(session: Session | null): Promise<NewStaffLogin[]> {
  const { principal } = await open(session);
  if (!principal.tenantId) return [];
  const known = new Set(DEMO_ACCOUNTS.map((a) => a.userId));
  const [users, roles] = await Promise.all([db.users.where("tenantId").equals(principal.tenantId).filter((u) => u.role !== "member" && !known.has(u.id) && (u.status === "invited" || u.status === "active")).toArray(), db.staffRoles.where("tenantId").equals(principal.tenantId).toArray()]);
  const byUser = new Map(roles.map((r) => [r.userId, r]));
  return users.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).flatMap((u) => {
    const r = byUser.get(u.id);
    return r ? [{ userId: u.id, name: u.name, tenantId: principal.tenantId!, branchIds: r.branchIds, role: r.role, limits: r.limits, status: u.status as "invited" | "active" }] : [];
  });
}

/** Demo only: opening the invitation. The account becomes active and the person is signed in. The audit log records that they accepted. */
export async function acceptStaffInvite(userId: string): Promise<void> {
  await ensureSeeded();
  const user = await db.users.get(userId);
  if (!user || user.status !== "invited") return;
  await db.users.update(userId, { status: "active" });
  await db.auditEvents.add({ id: `ae_accept_${userId}`, tenantId: user.tenantId!, actorId: userId, actorRole: user.role, at: now().toISOString(), action: "staff.change", entityType: "staff", entityId: userId, details: { change: "accepted the invitation", name: user.name } });
}
