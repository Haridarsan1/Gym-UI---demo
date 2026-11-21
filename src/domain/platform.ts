import { daysBetween } from "@/domain/dates";
import type { Level, SubscriptionStatus } from "@/domain/subscription";

/**
 * The platform’s view of a gym (R01, S01, S02), pure: how healthy it looks and how far its onboarding has got. Both are made from facts about the gym’s account (its state, its use against its
 * limits, when anything last happened) and never from its records.
 */
export type HealthLevel = "good" | "watch" | "risk";
export const HEALTH_LABEL: Record<HealthLevel, string> = { good: "Healthy", watch: "Needs a look", risk: "At risk" };

export interface HealthFacts {
  status: SubscriptionStatus;
  trialEndsOn?: string;
  usage: Array<{ label: string; level: Level }>;
  /** The newest thing that happened in the gym (a visit, a change), if anything has. */
  lastActivityOn?: string;
  onboardingPercent: number;
  createdOn: string;
  today: string;
}

export function tenantHealth(f: HealthFacts): { level: HealthLevel; reasons: string[] } {
  const risk: string[] = [];
  const watch: string[] = [];
  if (f.status.effective === "past_due") risk.push(f.status.stored === "trial" ? "The free trial has ended" : `Payment is overdue, grace ends ${f.status.graceEndsOn}`);
  if (f.status.effective === "suspended") risk.push("Suspended: the gym is read-only");
  if (f.status.effective === "canceled") risk.push("Canceled: downloads only");
  if (f.status.effective === "trial" && f.trialEndsOn) { const left = daysBetween(f.today, f.trialEndsOn.slice(0, 10)); if (left <= 7) watch.push(`The trial ends in ${Math.max(0, left)} ${left === 1 ? "day" : "days"}`); }
  for (const u of f.usage) { if (u.level === "full") watch.push(`${u.label} are at the plan’s limit`); else if (u.level === "near") watch.push(`${u.label} are close to the plan’s limit`); }
  if (f.lastActivityOn && daysBetween(f.lastActivityOn, f.today) >= 14) watch.push(`Nothing has happened for ${daysBetween(f.lastActivityOn, f.today)} days`);
  if (!f.lastActivityOn && daysBetween(f.createdOn, f.today) >= 14) watch.push("Nothing has happened yet");
  if (f.onboardingPercent < 100 && daysBetween(f.createdOn, f.today) >= 7) watch.push("Set-up isn’t finished");
  return risk.length ? { level: "risk", reasons: [...risk, ...watch] } : watch.length ? { level: "watch", reasons: watch } : { level: "good", reasons: [] };
}

export interface OnboardingFacts { ownerInvited: boolean; branchesConfigured: boolean; membersImported: boolean }
export interface OnboardingStep { key: "account" | "owner" | "branches" | "members"; label: string; done: boolean; detail: string }

/** S01: the gym account is created, its owner invited, its branches configured (each with opening hours) and its members imported. */
export function onboardingSteps(f: OnboardingFacts): { steps: OnboardingStep[]; percent: number } {
  const steps: OnboardingStep[] = [
    { key: "account", label: "Account created", done: true, detail: "The gym exists on Ember." },
    { key: "owner", label: "Owner invited", done: f.ownerInvited, detail: f.ownerInvited ? "The owner has an account." : "Invite the gym’s owner." },
    { key: "branches", label: "Branches configured", done: f.branchesConfigured, detail: f.branchesConfigured ? "Every branch has its hours." : "The owner sets up branches and their opening hours." },
    { key: "members", label: "Members imported", done: f.membersImported, detail: f.membersImported ? "The gym has members." : "The owner imports members from a spreadsheet." },
  ];
  return { steps, percent: Math.round((steps.filter((s) => s.done).length / steps.length) * 100) };
}

/** Support sessions: how long, and what a request must say. */
export const SUPPORT_MINUTES = [15, 30, 60, 120] as const;
export const SUPPORT_MIN_REASON = 10;

export interface SupportErrors { reason?: string; minutes?: string; tenantId?: string }
export function validateSupportRequest(d: { tenantId: string; reason: string; minutes: number }): SupportErrors {
  const e: SupportErrors = {};
  if (!d.tenantId) e.tenantId = "Choose the gym.";
  if (d.reason.trim().length < SUPPORT_MIN_REASON) e.reason = `Say why you need access, in at least ${SUPPORT_MIN_REASON} characters. The gym’s owner can read it.`;
  if (!(SUPPORT_MINUTES as readonly number[]).includes(d.minutes)) e.minutes = `Choose ${SUPPORT_MINUTES.join(", ")} minutes.`;
  return e;
}

export const featureKeys = ["memberships", "invoices", "qr_checkin", "workouts", "pt_credits", "reports", "analytics", "branch_permissions"] as const;

export interface PlanDraft { name: string; monthlyRupees: string; branches: string; staff: string; activeMembers: string; features: string[]; blurb: string }
export type PlanDraftErrors = Partial<Record<"name" | "monthlyRupees" | "branches" | "staff" | "activeMembers" | "features", string>>;

/** An empty limit box means no limit. */
export function validateSaasPlan(d: PlanDraft, otherNames: string[]): PlanDraftErrors {
  const e: PlanDraftErrors = {};
  const name = d.name.trim();
  if (name.length < 2) e.name = "Give the plan a name."; else if (name.length > 40) e.name = "Use 40 characters or fewer."; else if (otherNames.some((n) => n.toLowerCase() === name.toLowerCase())) e.name = "Another plan has this name.";
  if (d.monthlyRupees.trim() !== "" && !/^\d+(\.\d{1,2})?$/.test(d.monthlyRupees.trim())) e.monthlyRupees = "Enter the monthly price in rupees before GST, or leave it empty for “agreed with Ember”.";
  for (const k of ["branches", "staff", "activeMembers"] as const) if (d[k].trim() !== "" && !/^[1-9]\d{0,5}$/.test(d[k].trim())) e[k] = "Enter a whole number above 0, or leave it empty for no limit.";
  if (d.features.length === 0) e.features = "Choose at least one feature.";
  return e;
}
