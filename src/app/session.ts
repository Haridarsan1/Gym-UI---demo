import type { Principal } from "@/domain/permissions";

/**
 * The signed-in demo user, kept in localStorage so a refresh keeps you signed in. It carries what the permission
 * checks need. In demo mode the API layer looks the user up again by `userId` and does not trust these fields.
 * This file is imported by the login page, so it must not pull in React Query, Dexie or Zod.
 */
export interface Session extends Principal {
  name: string;
}

/** Where an administrator’s own session is kept while they are inside a gym under support access, so ending the access puts them back. */
export const ADMIN_SESSION_KEY = "ember.admin.session";


export const SESSION_KEY = "ember.session";

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (typeof s.userId !== "string" || typeof s.role !== "string" || !Array.isArray(s.branchIds)) return null;
    return { name: "", tenantId: null, ...s } as Session;
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* Storage can be blocked (private windows). The session then lasts until the page closes. */
  }
}
