import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import type { Principal } from "@/domain/permissions";

/**
 * An Ember administrator inside a gym under a support session (R01): the owner’s read-only views and nothing else, for as long as the session lasts. A session that has run out or been ended
 * is refused, and its end is written to the gym’s audit log the first time anyone notices (`endExpiredSupport`).
 */
export async function supportPrincipal(userId: string, sessionId: string): Promise<Principal> {
  const s = await db.supportSessions.get(sessionId);
  if (!s || s.adminId !== userId) throw new ApiError("forbidden", "That support session isn’t yours. Ask for access again.");
  await endExpiredSupport(s.tenantId);
  const fresh = (await db.supportSessions.get(sessionId))!;
  if (fresh.endedAt) throw new ApiError("forbidden", "Your support access has ended. Ask for access again if you still need it.");
  const branches = await db.branches.where("tenantId").equals(s.tenantId).toArray();
  return { userId, role: "owner", tenantId: s.tenantId, branchIds: branches.map((b) => b.id), limits: { refundLimitPaise: 0, canOverrideCheckIn: false, maxDiscountBp: 0, canViewClientHealth: false }, support: { sessionId, adminId: userId, expiresAt: s.expiresAt } };
}

/** Ends every support session in this gym whose time has run out, and says so in the gym’s audit log. Safe to call often. */
export async function endExpiredSupport(tenantId: string): Promise<void> {
  const nowIso = now().toISOString();
  const due = (await db.supportSessions.where("tenantId").equals(tenantId).toArray()).filter((s) => !s.endedAt && s.expiresAt <= nowIso);
  for (const s of due) {
    await db.supportSessions.update(s.id, { endedAt: s.expiresAt, endedBy: "time" });
    await db.auditEvents.add({ id: `ae_support_end_${s.id}`, tenantId, actorId: s.adminId, actorRole: "platform_admin", at: s.expiresAt, action: "support.access.end", entityType: "support_session", entityId: s.id, details: { ended: "by itself, when its time ran out", minutes: s.minutes } });
  }
}
