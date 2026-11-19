import { ensureSeeded, ensureTraining } from "@/demo";
import { db } from "@/demo/db";
import { simulateNetwork } from "@/demo/simulate";
import { ApiError } from "@/api/errors";
import { can, type Action, type Principal, type Resource } from "@/domain/permissions";
import type { Session } from "@/app/session";

/**
 * Works out who is calling from the database, not from the session the browser sent. A tampered session can’t
 * widen access: role, gym, branches and limits all come from the stored user and staff role.
 * With a real backend this becomes the server reading the login token.
 */
async function resolvePrincipal(userId: string): Promise<Principal> {
  const user = await db.users.get(userId);
  if (!user) throw new ApiError("unauthenticated", "Your session has ended. Log in again.");
  if (user.status !== "active") throw new ApiError("forbidden", "This account is switched off. Ask your gym owner to turn it back on.");

  if (user.role === "platform_admin") return { userId, role: user.role, tenantId: null, branchIds: [] };

  if (user.role === "member") {
    const member = user.memberId ? await db.members.get(user.memberId) : undefined;
    if (!member) throw new ApiError("unauthenticated", "Your session has ended. Log in again.");
    return { userId, role: user.role, tenantId: user.tenantId, branchIds: [member.homeBranchId], memberId: member.id };
  }

  const staff = await db.staffRoles.where("userId").equals(userId).first();
  if (!staff) throw new ApiError("forbidden", "This account has no role at the gym. Ask your gym owner to assign one.");
  return { userId, role: staff.role, tenantId: staff.tenantId, branchIds: staff.branchIds, limits: staff.limits };
}

export interface CallContext {
  principal: Principal;
}

/**
 * Every API function starts here: wait like a network, make sure the demo exists, find out who is calling.
 */
export async function open(session: Session | null): Promise<CallContext> {
  if (!session) throw new ApiError("unauthenticated", "Log in to continue.");
  await simulateNetwork();
  await ensureSeeded();
  const principal = await resolvePrincipal(session.userId);
  // Training data is for the member and trainer apps; nobody else downloads or builds it.
  if (principal.role === "member" || principal.role === "trainer") await ensureTraining();
  return { principal };
}

/** Throws unless the caller may do this. Deny by default. */
export function assertCan(principal: Principal, action: Action, resource?: Resource): void {
  if (!can(principal, action, resource)) throw new ApiError("forbidden", "You don’t have permission to do this. Ask your gym owner if you need access.");
}
