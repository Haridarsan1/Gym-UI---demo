/**
 * The emails the gym writes itself (O04): their default wording, the placeholders each may use, and how a template is filled in. The gym can change the wording; the placeholders are filled from the
 * member’s own record when it is sent, and with a sample in the preview. Transactional messages (receipts, booking confirmations) are records and are not edited here.
 */
export type GymTemplateId = "payment_reminder" | "renewal_reminder" | "inactivity_prompt" | "marketing_update" | "member_invite";
export type Placeholder = "first_name" | "gym" | "plan" | "ends_on" | "days" | "amount_due" | "invoice" | "due_on" | "last_visit" | "invite_link";

export interface TemplateDef {
  id: GymTemplateId;
  title: string;
  /** When it goes and to whom, in words. */
  about: string;
  /** What decides whether a member gets it. */
  rule: string;
  placeholders: Placeholder[];
  subject: string;
  body: string;
}

export const PLACEHOLDER_ABOUT: Record<Placeholder, string> = {
  first_name: "The member’s first name", gym: "The gym’s name", plan: "Their plan", ends_on: "The date it ends", days: "Days left (or days since their last visit)", amount_due: "The amount due, with GST",
  invoice: "The invoice number", due_on: "The date it was due", last_visit: "The date of their last visit", invite_link: "The link that opens their login set-up",
};

export const TEMPLATES: TemplateDef[] = [
  {
    id: "payment_reminder", title: "Payment reminder", about: "Sent from Dues by the front desk, finance or a manager, for one open invoice.", rule: "Not sent to a member who turned off renewal and payment reminders. The same invoice can be reminded again only after the gap in Policies.",
    placeholders: ["first_name", "gym", "amount_due", "invoice", "due_on"], subject: "{{amount_due}} is due on invoice {{invoice}}",
    body: "Hi {{first_name}},\n\n{{amount_due}} is due on invoice {{invoice}} (due {{due_on}}).\nYou can pay in the app, or at the front desk.\n\n{{gym}}",
  },
  {
    id: "renewal_reminder", title: "Renewal reminder", about: "Sent to members whose membership ends within 14 days and who have no next membership booked.", rule: "Not sent to a member who turned off renewal and payment reminders.",
    placeholders: ["first_name", "gym", "plan", "ends_on", "days"], subject: "Your {{plan}} ends on {{ends_on}}",
    body: "Hi {{first_name}},\n\nYour {{plan}} membership ends on {{ends_on}}, {{days}} days from now. Renew in the app or at the front desk to keep your place and your streak.\n\n{{gym}}",
  },
  {
    id: "inactivity_prompt", title: "We’ve missed you", about: "Sent to members with an active membership who haven’t checked in for 14 days.", rule: "Not sent to a member who turned off inactivity prompts.",
    placeholders: ["first_name", "gym", "days", "last_visit"], subject: "{{first_name}}, we’ve missed you at {{gym}}",
    body: "Hi {{first_name}},\n\nIt has been {{days}} days since your last visit on {{last_visit}}. Even a short session counts. Your trainer can help you pick up where you left off.\n\n{{gym}}",
  },
  {
    id: "member_invite", title: "App invitation", about: "Sent when the gym invites a member to the app, from their profile or after an import.", rule: "Only to a member with an email address whose consent for the gym to hold their details isn’t withdrawn. Not repeated before the gap in Policies.",
    placeholders: ["first_name", "gym", "invite_link"], subject: "{{first_name}}, set up your {{gym}} app",
    body: "Hi {{first_name}},\n\n{{gym}} has set you up in its app: your plan, your bookings and your workouts in one place. Open the link to choose how you sign in, with your phone number and a code, or with your email and a password.\n\n{{invite_link}}\n\nIf you weren’t expecting this, ignore this email and nothing happens.\n\n{{gym}}",
  },
  {
    id: "marketing_update", title: "Offers and news", about: "Sent to members you choose to tell about offers, events and news.", rule: "Only to members who agreed to offers and news. Someone who withdrew that consent is never sent it.",
    placeholders: ["first_name", "gym"], subject: "News from {{gym}}",
    body: "Hi {{first_name}},\n\nThere is news at {{gym}}. Write your update here.\n\nYou are getting this because you agreed to offers and news. You can turn it off in the app under Me.\n\n{{gym}}",
  },
];

export const templateDef = (id: string): TemplateDef | undefined => TEMPLATES.find((t) => t.id === id);

/** A sample member for previews, so the owner reads a real-looking email. */
export const SAMPLE: Record<Placeholder, string> = {
  first_name: "Priya", gym: "Pulse Fitness", plan: "Monthly", ends_on: "17 Dec 2026", days: "12", amount_due: "₹2,950", invoice: "PFAND/26-27/0042", due_on: "14 Nov 2026", last_visit: "3 Nov 2026", invite_link: "https://app.ember.example/join/inv_sample",
};

export function fill(text: string, vars: Partial<Record<Placeholder, string>>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, k: string) => vars[k as Placeholder] ?? whole);
}

export interface TemplateErrors { subject?: string; body?: string }

/** What is wrong with a template’s wording, in words: empty, too long, or a placeholder this template doesn’t have. */
export function validateTemplate(def: TemplateDef, t: { subject: string; body: string }): TemplateErrors {
  const e: TemplateErrors = {};
  const unknown = (s: string) => [...s.matchAll(/\{\{(\w*)\}\}/g)].map((m) => m[1]!).find((k) => !def.placeholders.includes(k as Placeholder));
  const stray = (s: string) => /\{\{(?!\w+\}\})|\{(?!\{)|(?<!\})\}/.test(s.replace(/\{\{\w+\}\}/g, ""));
  if (!t.subject.trim()) e.subject = "Write a subject.";
  else if (t.subject.length > 120) e.subject = "Use 120 characters or fewer.";
  else if (t.subject.includes("\n")) e.subject = "The subject is one line.";
  else if (unknown(t.subject)) e.subject = `{{${unknown(t.subject)}}} isn’t available in this email. Use one of the placeholders listed.`;
  else if (stray(t.subject)) e.subject = "A placeholder is missing its closing braces. Write it like {{first_name}}.";
  if (!t.body.trim()) e.body = "Write the email.";
  else if (t.body.length > 2000) e.body = "Use 2,000 characters or fewer.";
  else if (unknown(t.body)) e.body = `{{${unknown(t.body)}}} isn’t available in this email. Use one of the placeholders listed.`;
  else if (stray(t.body)) e.body = "A placeholder is missing its closing braces. Write it like {{first_name}}.";
  return e;
}
