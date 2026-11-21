import type { z } from "zod";
import { addDays } from "@/domain/dates";
import type { Access } from "@/domain/permissions";
import { formatDate } from "@/lib/when";
import type { SubscriptionState as StateSchema } from "@/domain/types";

/** The rules that decide what a gym’s subscription lets it do today. Apart from the wording the owner and admin screens show (`subscription.ts`), because every API call needs these and nothing else. */
type SubscriptionState = z.infer<typeof StateSchema>;

// ── What each state does to the gym’s app (S02) ──────────────────────────────────────────────────

export const GRACE_DAYS = 7;
export const EXPORT_DAYS_AFTER_CANCEL = 30;

export interface SubscriptionFacts { state: SubscriptionState; trialEndsAt?: string; pastDueSince?: string; suspendedOn?: string; canceledOn?: string }
export interface Banner { tone: "info" | "warn" | "danger"; title: string; body: string }
export interface SubscriptionStatus {
  stored: SubscriptionState;
  /** What the gym is treated as today: a trial that has ended is overdue, and overdue past its grace is suspended. */
  effective: SubscriptionState;
  access: Access;
  graceEndsOn?: string;
  exportUntil?: string;
  /** What to tell the gym’s staff and owner, or nothing when all is well. */
  banner?: Banner;
  /** A sentence for when an action is refused because of this. */
  note: string;
  /** The owner can pay and reopen the gym themselves. */
  reactivatable: boolean;
}

/**
 * What the subscription lets the gym do today. Overdue (past due) keeps everything working for a grace period and says so; after it the gym is suspended: staff and members can look and download,
 * nothing can be changed. A canceled gym can only download its data, for 30 days. A trial that has run out is overdue from its last day. Paying reactivates any of these straight away.
 */
export function subscriptionStatus(sub: SubscriptionFacts, gym: string, today: string): SubscriptionStatus {
  let effective: SubscriptionState = sub.state;
  let since = sub.pastDueSince;
  if (sub.state === "trial" && sub.trialEndsAt && sub.trialEndsAt.slice(0, 10) < today) { effective = "past_due"; since = addDays(sub.trialEndsAt.slice(0, 10), 1); }
  let graceEndsOn: string | undefined;
  if (effective === "past_due") {
    graceEndsOn = addDays(since ?? today, GRACE_DAYS);
    if (today > graceEndsOn) effective = "suspended";
  }
  switch (effective) {
    case "trial": case "paid": return { stored: sub.state, effective, access: "full", note: "", reactivatable: false };
    case "past_due": return {
      stored: sub.state, effective, access: "full", graceEndsOn, note: "", reactivatable: true,
      banner: { tone: "warn", title: sub.state === "trial" ? "Your free trial has ended" : "Your payment is overdue", body: `${gym} keeps working until ${formatDate(graceEndsOn!)}. After that it becomes read-only: you can look and download, but nothing can be changed. Pay on the Subscription page to keep it fully open.` },
    };
    case "suspended": return {
      stored: sub.state, effective, access: "readonly", reactivatable: true,
      note: `${gym} is read-only because its subscription is ${sub.state === "suspended" ? "suspended" : "overdue past its grace period"}. You can look at records and download them, but nothing can be changed until the owner pays or Ember reactivates it.`,
      banner: { tone: "danger", title: "This gym is read-only", body: "The subscription is suspended. Everyone can look at records and the owner can download them, but nothing can be changed, sold or checked in. The owner reactivates it on the Subscription page." },
    };
    case "canceled": {
      const exportUntil = addDays(sub.canceledOn ?? today, EXPORT_DAYS_AFTER_CANCEL);
      return {
        stored: sub.state, effective, access: "export_only", exportUntil, reactivatable: true,
        note: `${gym}’s subscription was canceled, so only downloads are available. The owner can download everything until ${formatDate(exportUntil)} or reactivate the gym.`,
        banner: { tone: "danger", title: "This subscription was canceled", body: `Only downloads are available, until ${formatDate(exportUntil)}. Download your data from Reports, or reactivate on the Subscription page and everything comes back as it was.` },
      };
    }
  }
}
