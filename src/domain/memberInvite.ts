/**
 * Inviting members to the app (S01). A member who has a login has joined; one who has been sent an invitation is invited; everyone else has not been invited. An invitation is an email, so a member
 * can be invited only when they have an email address and the gym still holds their details (their data-processing consent isn’t withdrawn); the same member isn’t invited again before the gap in Policies.
 */
export type AppStatus = "joined" | "invited" | "not_invited";
export const APP_STATUS_LABEL: Record<AppStatus, string> = { joined: "Joined", invited: "Invited", not_invited: "Not invited" };

export const appStatus = (m: { userId?: string; appInvite?: { sentAt: string; joinedAt?: string } }): AppStatus => (m.userId || m.appInvite?.joinedAt ? "joined" : m.appInvite ? "invited" : "not_invited");

export type InviteBlock = { kind: "joined" | "no_email" | "no_consent" | "too_soon"; reason: string };

/** Why this member can’t be invited right now, in words for the log, or nothing when they can. */
export function whyNotInvited(m: { name: string; userId?: string; email?: string; appInvite?: { sentAt: string; joinedAt?: string } }, ctx: { consentOk: boolean; today: string; gapDays: number; lastSentOn?: string }): InviteBlock | undefined {
  const first = m.name.split(" ")[0] ?? m.name;
  if (appStatus(m) === "joined") return { kind: "joined", reason: `${first} has already set up their login.` };
  if (!m.email) return { kind: "no_email", reason: "No email address on file. Add one to the member’s profile to invite them." };
  if (!ctx.consentOk) return { kind: "no_consent", reason: `${first} withdrew consent for the gym to hold their details, so they aren’t contacted.` };
  if (ctx.lastSentOn) {
    const next = new Date(Date.parse(`${ctx.lastSentOn}T00:00:00Z`) + ctx.gapDays * 86_400_000).toISOString().slice(0, 10);
    if (next > ctx.today) return { kind: "too_soon", reason: `Invited on ${ctx.lastSentOn}. Another invitation can go from ${next}.` };
  }
  return undefined;
}

export const OTP_DEMO_CODE = "246810";

export interface JoinDraft { method: "phone_otp" | "email_password"; code: string; password: string; confirm: string }
export type JoinErrors = Partial<Record<"code" | "password" | "confirm", string>>;

export function validateJoin(d: JoinDraft): JoinErrors {
  const e: JoinErrors = {};
  if (d.method === "phone_otp") { if (!/^\d{6}$/.test(d.code.trim())) e.code = "Enter the 6-digit code."; else if (d.code.trim() !== OTP_DEMO_CODE) e.code = "That code isn’t right. Check it and try again."; }
  else {
    if (d.password.length < 8) e.password = "Use at least 8 characters.";
    else if (!/[A-Za-z]/.test(d.password) || !/\d/.test(d.password)) e.password = "Use letters and at least one number.";
    if (d.confirm !== d.password) e.confirm = "The two passwords are different.";
  }
  return e;
}
