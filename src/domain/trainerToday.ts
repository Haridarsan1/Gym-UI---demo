import { addDays, daysBetween, eachDay } from "@/domain/dates";
import { scheduledBetween } from "@/domain/metrics";
import type { CreditLedgerEntry, Membership, TrainerReview, WorkoutLog, WorkoutPlanVersion } from "@/domain/types";

/**
 * The rules behind the trainer’s Today (T07). They are plain functions of records, so the dashboard, the client list and the
 * reports that follow in M2 all mean the same thing by “overdue”, “missed” and “expiring”.
 */

/** A client is reviewed about every four weeks unless a follow-up date says otherwise. */
export const REVIEW_CADENCE_DAYS = 28;
/** Training credits are flagged this many days before they run out. */
export const CREDIT_WARNING_DAYS = 14;
/** The window for “recent missed workouts”: the last seven days, not counting today. */
export const MISSED_WINDOW_DAYS = 7;
/** Two missed workouts in the window is a pattern worth a message; one is just a week. */
export const MISSED_THRESHOLD = 2;

export interface ReviewDue {
  /** When the next review is due. */
  dueOn: string;
  /** Whole days past due, 0 when not yet due. */
  daysOver: number;
  overdue: boolean;
  /** Why it falls on that date, in words for the screen. */
  why: "follow-up" | "cadence" | "first";
}

/**
 * The date a client’s next review is due. The newest shared review sets it: its follow-up date if it has one, otherwise
 * four weeks after it. Before any review, four weeks after the plan began (or, with no plan date, after `since`).
 * Private notes and the member’s own check-ins are not reviews.
 */
export function reviewDue(reviews: Array<Pick<TrainerReview, "kind" | "createdAt" | "followUpOn">>, since: string, today: string): ReviewDue {
  const shared = reviews.filter((r) => r.kind === "shared_review").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  let dueOn: string;
  let why: ReviewDue["why"];
  if (shared?.followUpOn) [dueOn, why] = [shared.followUpOn, "follow-up"];
  else if (shared) [dueOn, why] = [addDays(shared.createdAt.slice(0, 10), REVIEW_CADENCE_DAYS), "cadence"];
  else [dueOn, why] = [addDays(since, REVIEW_CADENCE_DAYS), "first"];
  const daysOver = Math.max(0, daysBetween(dueOn, today));
  return { dueOn, daysOver, overdue: dueOn < today, why };
}

export interface MissedSummary {
  missed: number;
  scheduled: number;
  /** The most recent scheduled day with nothing logged. */
  lastMissedOn?: string;
  /** The most recent day a workout was done. */
  lastDoneOn?: string;
}

/**
 * Workouts scheduled in the last seven days with nothing logged. A day inside a freeze never counts. A workout the
 * member logged as skipped is their choice and is not missed.
 */
export function recentMissed(versions: WorkoutPlanVersion[], logs: Array<Pick<WorkoutLog, "scheduledOn" | "status">>, freezes: Membership["freezes"], today: string): MissedSummary {
  const from = addDays(today, -MISSED_WINDOW_DAYS);
  const to = addDays(today, -1);
  const byDate = new Map(logs.filter((l) => l.status !== "draft").map((l) => [l.scheduledOn, l]));
  const frozen = (d: string) => freezes.some((f) => d >= f.from && (!f.to || d <= f.to));
  let missed = 0, scheduled = 0;
  let lastMissedOn: string | undefined;
  for (const s of scheduledBetween(versions, from, to)) {
    if (frozen(s.date)) continue;
    scheduled++;
    if (!byDate.has(s.date)) {
      missed++;
      lastMissedOn = s.date;
    }
  }
  const lastDoneOn = [...byDate.values()].filter((l) => l.status === "completed" || l.status === "partial").map((l) => l.scheduledOn).sort().pop();
  return { missed, scheduled, lastMissedOn, lastDoneOn };
}

export interface ExpiringCredits {
  credits: number;
  expiresOn: string;
  daysLeft: number;
}

/**
 * Training credits that run out within two weeks. The credits at risk are the unused ones from packs that expire in the
 * window, never more than the member still has free to book.
 */
export function expiringCredits(entries: Array<Pick<CreditLedgerEntry, "id" | "kind" | "credits" | "direction" | "refEntryId" | "expiresOn">>, available: number, today: string): ExpiringCredits | undefined {
  const horizon = addDays(today, CREDIT_WARNING_DAYS);
  const soon = entries.filter((e) => e.kind === "purchase" && e.expiresOn && e.expiresOn >= today && e.expiresOn <= horizon);
  if (!soon.length || available <= 0) return undefined;
  const credits = Math.min(available, soon.reduce((n, e) => n + e.credits, 0));
  const expiresOn = soon.map((e) => e.expiresOn!).sort()[0]!;
  return { credits, expiresOn, daysLeft: daysBetween(today, expiresOn) };
}

export type SessionPhase = "done" | "now" | "next" | "later" | "unmarked";

/**
 * Where a session sits in the day. Done once marked attended or no-show; “unmarked” when it has ended and still needs
 * marking; “now” while it runs; the first to come is “next”.
 */
export function sessionPhases(sessions: Array<{ startsAt: string; endsAt: string; status: "booked" | "attended" | "no_show" }>, nowIso: string): SessionPhase[] {
  let nextGiven = false;
  return sessions.map((s) => {
    if (s.status !== "booked") return "done";
    if (s.endsAt <= nowIso) return "unmarked";
    if (s.startsAt <= nowIso) return "now";
    if (!nextGiven) {
      nextGiven = true;
      return "next";
    }
    return "later";
  });
}

/** Every day in the window, for tests and screens that draw it. */
export const missedWindow = (today: string): string[] => eachDay(addDays(today, -MISSED_WINDOW_DAYS), addDays(today, -1));
