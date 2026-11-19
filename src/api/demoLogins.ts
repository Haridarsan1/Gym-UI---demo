import { db } from "@/demo/db";
import { open } from "@/api/context";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
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
