import type { z } from "zod";
import type { SubscriptionState as StateSchema } from "@/domain/types";

type SubscriptionState = z.infer<typeof StateSchema>;
export type SubscriptionStateName = SubscriptionState;

/** Ember’s rules for each state of a gym’s subscription (S02), in words. Software billing is separate from member billing. */
export const STATE_LABEL: Record<SubscriptionState, string> = { trial: "Free trial", paid: "Paid", past_due: "Payment overdue", suspended: "Suspended", canceled: "Canceled" };

export const STATE_RULES: Record<SubscriptionState, { now: string; ends: string }> = {
  trial: { now: "Everything in your plan works, with its limits.", ends: "When the trial ends, choose a plan to carry on. Nothing is deleted if you wait." },
  paid: { now: "Everything in your plan works, with its limits.", ends: "Your plan renews on the date below." },
  past_due: { now: "Everything keeps working for a 7-day grace period while the payment is sorted out.", ends: "After the grace period the gym becomes read-only: staff can look and download, nobody can sell, check in or change anything." },
  suspended: { now: "The gym is read-only. Staff can look at records and download exports; members can see their own.", ends: "Paying what is due reactivates the gym straight away, with everything as it was." },
  canceled: { now: "The gym is read-only and you can download everything for 30 days.", ends: "After 30 days the data is deleted under the retention policy. Reactivating before then restores it." },
};

export const FEATURE_LABEL: Record<string, string> = {
  memberships: "Memberships", invoices: "GST invoices and receipts", qr_checkin: "QR check-in", workouts: "Workout plans and logging", pt_credits: "Personal training credits", reports: "Reports and CSV downloads",
  analytics: "Advanced analytics", branch_permissions: "Branch-level permissions", everything: "Everything, with a custom agreement",
};

export type Level = "ok" | "near" | "full" | "none";
/** How close a limit is: near from 80%, full at the limit. */
export function usageLevel(used: number, limit: number | null): Level {
  if (limit === null) return "none";
  if (used >= limit) return "full";
  return used / limit >= 0.8 ? "near" : "ok";
}
