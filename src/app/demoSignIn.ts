import { DEMO_ACCOUNTS, TENANT_NAME, type DemoAccount } from "@/app/demoAccounts";
import { writeGym } from "@/app/gymCache";
import { writeSession, type Session } from "@/app/session";

/**
 * Signing in as one of the demo people. Used by the login page, the signup page and the role switcher.
 * This file is part of the marketing bundle, so it must not import React Query, Dexie or Zod.
 */
export function sessionFor(account: DemoAccount): Session {
  return { userId: account.userId, name: account.name, role: account.role, tenantId: account.tenantId, branchIds: account.branchIds, memberId: account.memberId, limits: account.limits };
}

/** Writes the session for this person and returns it, or null if there is no such demo account. */
export function signInDemo(userId: string): Session | null {
  const account = DEMO_ACCOUNTS.find((a) => a.userId === userId);
  if (!account) return null;
  const session = sessionFor(account);
  writeSession(session);
  // The gym’s name is known at sign-in, so the header never has to show anything else while it loads.
  if (account.tenantId) writeGym({ tenantId: account.tenantId, name: TENANT_NAME });
  return session;
}

/** Signs in as a member the desk registered after the demo began (they are not in `DEMO_ACCOUNTS`). Demo only. */
export function signInRegistered(m: { userId: string; name: string; tenantId: string; branchIds: string[]; memberId?: string; role?: Session["role"]; limits?: Session["limits"] }): Session {
  const session: Session = { userId: m.userId, name: m.name, role: m.role ?? "member", tenantId: m.tenantId, branchIds: m.branchIds, ...(m.memberId ? { memberId: m.memberId } : {}), ...(m.limits ? { limits: m.limits } : {}) };
  writeSession(session);
  writeGym({ tenantId: m.tenantId, name: TENANT_NAME });
  return session;
}

/** The people shown in “Try as…” and in the role switcher: one for each role worth seeing. */
export const FEATURED_ACCOUNTS: DemoAccount[] = DEMO_ACCOUNTS.filter((a) => a.featured);

/** More sample members, each in a different state. Shown under “More sample members” on the login page. */
export const SAMPLE_MEMBERS: DemoAccount[] = DEMO_ACCOUNTS.filter((a) => a.sample);
