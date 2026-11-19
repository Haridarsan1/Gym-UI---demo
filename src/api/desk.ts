import { db } from "@/demo/db";
import { assertCan, open } from "@/api/context";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { todayIST } from "@/domain/dates";
import type { Action, Principal, Resource } from "@/domain/permissions";
import type { Member } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * How every front desk and finance API starts. It works out who is calling from the database, checks they may use the feature at all,
 * and gives back the branches they work in. Owners see the whole gym, branch managers, front desk and finance their own branches
 * (finance is given every branch). Nothing here reaches health records: assessments, progress photos and trainers’ private notes
 * have no door in this file, and `deskRestrictions.test.ts` proves the desk and finance are refused at each one.
 */

export interface DeskContext {
  principal: Principal;
  tenantId: string;
  /** Branches this person may act in. */
  branchIds: string[];
  today: string;
  nowIso: string;
}

export async function openDesk(session: Session | null, action: Action): Promise<DeskContext> {
  const { principal } = await open(session);
  if (!principal.tenantId || principal.role === "member" || principal.role === "trainer" || principal.role === "platform_admin") throw new ApiError("forbidden", "This screen is for the gym’s desk and finance staff.");
  assertCan(principal, action);
  const clock = now();
  const branches = principal.role === "owner" ? (await db.branches.where("tenantId").equals(principal.tenantId).toArray()).map((b) => b.id) : principal.branchIds;
  return { principal, tenantId: principal.tenantId, branchIds: branches, today: todayIST(clock), nowIso: clock.toISOString() };
}

/** The permission check for one record in one branch. A branch outside the person’s own is refused, as another gym’s would be. */
export function assertInBranch(c: DeskContext, action: Action, branchId: string, extra: Resource = {}): void {
  assertCan(c.principal, action, { tenantId: c.tenantId, branchId, ...extra });
}

/** A member the caller may see: in their gym and one of their branches. Otherwise “not found”, so a member’s existence is not revealed. */
export async function memberInScope(c: DeskContext, action: Action, memberId: string): Promise<Member> {
  const m = await db.members.get(memberId);
  if (!m || m.tenantId !== c.tenantId || !c.branchIds.includes(m.homeBranchId)) throw new ApiError("not_found", "We couldn’t find this member. They may belong to another branch.");
  assertInBranch(c, action, m.homeBranchId, { memberId: m.id });
  return m;
}
