import { openDesk, type DeskContext } from "@/api/desk";
import { ApiError } from "@/api/errors";
import type { Action } from "@/domain/permissions";
import type { Session } from "@/app/session";

/**
 * How every owner and branch manager API starts. Owners work across the whole gym; a branch manager across their own branches only, and `branchIds` says which, so a report,
 * a list or an export can never reach another branch. Anyone else is refused, however the call was made.
 */
export type OwnerContext = DeskContext;

export async function openOwner(session: Session | null, action: Action): Promise<OwnerContext> {
  const c = await openDesk(session, action);
  if (c.principal.role !== "owner" && c.principal.role !== "branch_manager") throw new ApiError("forbidden", "This screen is for the gym’s owner and branch managers.");
  return c;
}

/** Narrows a requested branch to the ones this person may see: all of theirs when none or “all” is asked, the one asked for when it is theirs, otherwise a refusal. */
export function branchScope(c: OwnerContext, branchId: string | undefined): string[] {
  if (!branchId || branchId === "all") return c.branchIds;
  if (!c.branchIds.includes(branchId)) throw new ApiError("forbidden", "That branch isn’t one you manage.");
  return [branchId];
}
