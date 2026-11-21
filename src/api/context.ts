import { ensureSeeded, ensureTraining } from "@/demo";
import { db } from "@/demo/db";
import { simulateNetwork } from "@/demo/simulate";
import { now } from "@/api/clock";
import { todayIST } from "@/domain/dates";
import { quickStatus } from "@/domain/subscriptionQuick";
import { ApiError } from "@/api/errors";
import { can, type Action, type Principal, type Resource } from "@/domain/permissions";
import type { Session } from "@/app/session";
import { LOTUS_TENANT_ID } from "@/app/demoAccounts";

/**
 * Works out who is calling from the database, not from the session the browser sent. A tampered session can’t
 * widen access: role, gym, branches and limits all come from the stored user and staff role.
 * With a real backend this becomes the server reading the login token.
 */
async function resolvePrincipal(userId: string, supportSessionId?: string): Promise<Principal> {
  const user = await db.users.get(userId);
  if (!user) throw new ApiError("unauthenticated", "Your session has ended. Log in again.");
  if (user.status === "invited") throw new ApiError("forbidden", "You haven’t accepted your invitation yet. Open the link in the email we sent you.");
  if (user.status !== "active") throw new ApiError("forbidden", "This account is switched off. Ask your gym owner to turn it back on.");

  if (user.role === "platform_admin") {
    if (supportSessionId) return (await import("@/api/supportAccess")).supportPrincipal(userId, supportSessionId);
    return { userId, role: user.role, tenantId: null, branchIds: [] };
  }

  if (user.role === "member") {
    const member = user.memberId ? await db.members.get(user.memberId) : undefined;
    if (!member) throw new ApiError("unauthenticated", "Your session has ended. Log in again.");
    return { userId, role: user.role, tenantId: user.tenantId, branchIds: [member.homeBranchId], memberId: member.id, ...(await accessOf(user.tenantId)) };
  }

  const staff = await db.staffRoles.where("userId").equals(userId).first();
  if (!staff) throw new ApiError("forbidden", "This account has no role at the gym. Ask your gym owner to assign one.");
  return { userId, role: staff.role, tenantId: staff.tenantId, branchIds: staff.branchIds, limits: staff.limits, ...(await accessOf(staff.tenantId)) };
}

/** What the gym’s subscription allows today, read from its record on every call (S02). */
async function accessOf(tenantId: string | null): Promise<Pick<Principal, "access" | "accessNote">> {
  if (!tenantId) return {};
  const t = await db.tenants.get(tenantId);
  if (!t) return {};
  const today = todayIST(now());
  if (quickStatus(t.subscription, today)) return {};
  const st = (await import("@/domain/subscriptionStatus")).subscriptionStatus(t.subscription, t.name, today);
  return st.access === "full" ? {} : { access: st.access, accessNote: st.note };
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
  // The second demo gym and Ember’s invoices to the gyms are built when someone first needs them, not on a member’s first visit.
  const lotus = session.tenantId === LOTUS_TENANT_ID || session.role === "platform_admin";
  const invoices = session.role === "owner" || session.role === "platform_admin";
  if (lotus || invoices) {
    const second = await import("@/demo/second");
    if (lotus) await second.ensureLotus();
    if (invoices) await second.ensureSaasInvoices();
  }
  const principal = await resolvePrincipal(session.userId, session.support?.sessionId);
  // Training data is for the member and trainer apps; nobody else downloads or builds it.
  if (principal.role === "member" || principal.role === "trainer") await ensureTraining();
  return { principal };
}

/** Throws unless the caller may do this. Deny by default. */
export function assertCan(principal: Principal, action: Action, resource?: Resource): void {
  if (can(principal, action, resource)) return;
  // Allowed for this person in general, but not while the gym’s subscription is what it is: say that, not “no permission”.
  if (principal.access && principal.access !== "full" && can({ ...principal, access: "full" }, action, resource)) throw new ApiError("forbidden", principal.accessNote ?? "This gym’s subscription doesn’t allow that right now.", { subscription: principal.access });
  if (principal.support) throw new ApiError("forbidden", "Support access is read-only. You can look, and nothing here can be changed or downloaded.", { support: true });
  throw new ApiError("forbidden", "You don’t have permission to do this. Ask your gym owner if you need access.");
}
