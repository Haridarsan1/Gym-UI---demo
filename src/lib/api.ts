/**
 * Trial-signup API boundary. Replace the mock with a real call when the backend is ready:
 *   return fetch("/api/trials", { method: "POST", headers: {...}, body: JSON.stringify(payload) })
 */
export type BranchRange = "1" | "2-3" | "4-10" | "10+";
export type MemberRange = "under-250" | "250-500" | "500-1000" | "1000+";

export interface TrialSignupPayload {
  fullName: string;
  email: string;
  mobile: string;
  password: string;
  gymName: string;
  city: string;
  branches: BranchRange;
  members: MemberRange;
}

export interface TrialSignupResult {
  tenantId: string;
  trialEndsAt: string;
}

export async function createTrialAccount(payload: TrialSignupPayload): Promise<TrialSignupResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  if (payload.email.toLowerCase().endsWith("@taken.test")) {
    throw new Error("An account already uses this email. Log in instead, or use a different email.");
  }
  const ends = new Date();
  ends.setDate(ends.getDate() + 14);
  return { tenantId: `tnt_${Math.random().toString(36).slice(2, 10)}`, trialEndsAt: ends.toISOString() };
}
