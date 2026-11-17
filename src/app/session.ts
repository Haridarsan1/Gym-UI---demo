import type { Role } from "@/domain/roles";

/** The signed-in demo user, kept in localStorage so a refresh keeps you signed in. */
export interface Session {
  userId: string;
  role: Role;
}

const KEY = "ember.session";

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    /* Storage can be blocked (private windows). The session then lasts until the page closes. */
  }
}
