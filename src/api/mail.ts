import { fill, templateDef, type GymTemplateId, type Placeholder } from "@/domain/emailTemplates";
import type { Consent, EmailLogEntry, MemberSettings, Tenant } from "@/domain/types";

/** The wording a gym uses for one of the emails it writes: its own if the owner changed it, otherwise Ember’s. */
export function wordingFor(tenant: Pick<Tenant, "emailTemplates"> | undefined, id: GymTemplateId): { subject: string; body: string; custom: boolean } {
  const def = templateDef(id)!;
  const own = tenant?.emailTemplates?.[id];
  return own ? { subject: own.subject, body: own.body, custom: true } : { subject: def.subject, body: def.body, custom: false };
}

export const render = (w: { subject: string; body: string }, vars: Partial<Record<Placeholder, string>>) => ({ subject: fill(w.subject, vars), body: fill(w.body, vars) });

/** Whether a member currently agrees to a kind of message: their newest consent record of that kind has not been withdrawn. */
export function hasConsent(consents: Array<Pick<Consent, "memberId" | "scope" | "grantedAt" | "withdrawnAt">>, memberId: string, scope: Consent["scope"]): boolean {
  const newest = consents.filter((c) => c.memberId === memberId && c.scope === scope).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))[0];
  return !!newest && !newest.withdrawnAt;
}

export const MESSAGE_PREFS: Record<"payment_reminder" | "renewal_reminder" | "inactivity_prompt", keyof MemberSettings["email"]> = { payment_reminder: "renewalReminders", renewal_reminder: "renewalReminders", inactivity_prompt: "inactivityPrompts" };

/** Why a gym email to this member won’t be sent, in words for the delivery log, or nothing when it can go. */
export function whyNotSent(template: GymTemplateId, m: { email?: string }, consents: Parameters<typeof hasConsent>[0], memberId: string, settings: Pick<MemberSettings, "email"> | undefined): { reason: string; kind: "no_email" | "opted_out" | "no_consent" } | undefined {
  if (!m.email) return { reason: "No email address on file for this member.", kind: "no_email" };
  if (template === "marketing_update") return hasConsent(consents, memberId, "marketing") ? undefined : { reason: "This member hasn’t agreed to offers and news, or withdrew that.", kind: "no_consent" };
  if (template === "member_invite") return undefined;
  const pref = MESSAGE_PREFS[template];
  if (settings && settings.email[pref] === false) return { reason: pref === "inactivityPrompts" ? "This member turned off “we’ve missed you” messages." : "This member turned off renewal and payment reminders.", kind: "opted_out" };
  return undefined;
}

export const STATUS_WORDS: Record<EmailLogEntry["status"], string> = { sent: "Sent", skipped: "Not sent", failed: "Failed" };
