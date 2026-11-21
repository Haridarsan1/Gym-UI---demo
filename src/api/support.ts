import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { open } from "@/api/context";
import type { Session } from "@/app/session";

/** What everyone inside a gym sees while an Ember administrator has support access to it (R01): who, why, and until when. Read by every person in the gym, owner to member, so it is never a secret. */
export interface SupportBanner { sessions: Array<{ id: string; reason: string; expiresAt: string; minutesLeft: number; mine: boolean }> }

export async function getSupportBanner(session: Session | null): Promise<SupportBanner> {
  const { principal } = await open(session);
  if (!principal.tenantId) return { sessions: [] };
  const t = now().getTime();
  let sessions = (await db.supportSessions.where("tenantId").equals(principal.tenantId).toArray()).filter((s) => !s.endedAt);
  // A session whose time has run out is ended and written to the gym’s audit log the first time anyone notices. Almost every gym has none, so the code for that is downloaded only when one is due.
  if (sessions.some((s) => Date.parse(s.expiresAt) <= t)) {
    await (await import("@/api/supportAccess")).endExpiredSupport(principal.tenantId);
    sessions = sessions.filter((s) => Date.parse(s.expiresAt) > t);
  }
  return { sessions: sessions.map((s) => ({ id: s.id, reason: s.reason, expiresAt: s.expiresAt, minutesLeft: Math.max(0, Math.ceil((Date.parse(s.expiresAt) - t) / 60_000)), mine: principal.support?.sessionId === s.id })) };
}
