import { addDays, daysBetween, istDateOf } from "@/domain/dates";
import { noShowSettlement, type Settlement } from "@/domain/booking";

/**
 * A trainer’s schedule (O01, O02, T04, M06): when they work, when they are away, which booked sessions clash with that, and what
 * marking a session attended or a no-show does to the member’s credit. Pure rules; the API reads and writes around them.
 */

const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export interface Window {
  start: string;
  end: string;
}

/** One weekly window: on this weekday (0 = Sunday) at this branch, between start and end. */
export interface WeeklyWindow extends Window {
  branchId: string;
  weekday: number;
}

export interface LeaveRange {
  from: string;
  to: string;
  canceledAt?: string;
}

/** Is the trainer away on this date? Canceled leave doesn’t count. */
export const onLeave = (date: string, leave: LeaveRange[]): boolean => leave.some((l) => !l.canceledAt && l.from <= date && date <= l.to);

/** Merges windows that touch or overlap, so two of them never produce the same session twice. */
export function mergeWindows(windows: Window[]): Window[] {
  const sorted = [...windows].sort((a, b) => minutes(a.start) - minutes(b.start));
  const out: Window[] = [];
  for (const w of sorted) {
    const last = out.at(-1);
    if (last && minutes(w.start) <= minutes(last.end)) {
      if (minutes(w.end) > minutes(last.end)) last.end = w.end;
    } else out.push({ ...w });
  }
  return out;
}

/** Why a window can’t be used, in words, or nothing: a time that isn’t HH:MM, an end that isn’t after the start, a window under 30 minutes. */
export function windowProblem(w: Window): string | undefined {
  if (!/^\d{2}:\d{2}$/.test(w.start) || !/^\d{2}:\d{2}$/.test(w.end)) return "Enter the times as hours and minutes.";
  if (minutes(w.start) >= 1440 || minutes(w.end) > 1440) return "Times run from 00:00 to 24:00.";
  if (minutes(w.end) <= minutes(w.start)) return "The end must be after the start.";
  if (minutes(w.end) - minutes(w.start) < 30) return "A window needs at least 30 minutes.";
  return undefined;
}

/** Windows on the same weekday at the same time can’t overlap, whichever branch. A trainer is in one place at a time. */
export function weeklyProblem(windows: WeeklyWindow[]): string | undefined {
  for (const w of windows) {
    const p = windowProblem(w);
    if (p) return p;
  }
  for (let d = 0; d <= 6; d++) {
    const day = windows.filter((w) => w.weekday === d).sort((a, b) => minutes(a.start) - minutes(b.start));
    for (let i = 1; i < day.length; i++) if (minutes(day[i]!.start) < minutes(day[i - 1]!.end)) return "Two windows on the same day overlap. Change one of them.";
  }
  return undefined;
}

/** Leave must start today or later, not end before it starts, and stay within 90 days. */
export function leaveProblem(l: { from: string; to: string }, today: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.from) || !/^\d{4}-\d{2}-\d{2}$/.test(l.to)) return "Choose the first and last day of the leave.";
  if (l.from < today) return "Leave can’t start in the past.";
  if (l.to < l.from) return "The last day can’t be before the first day.";
  if (daysBetween(l.from, l.to) > 89) return "Leave can be up to 90 days. Add another for a longer break.";
  return undefined;
}

export const rangesOverlap = (a: { from: string; to: string }, b: { from: string; to: string }): boolean => a.from <= b.to && b.from <= a.to;

export interface BookedSession {
  id: string;
  kind: string;
  status: string;
  startsAt: string;
}

/**
 * Booked sessions that fall on a day the trainer is away and have not started yet. Both the trainer and the front desk see them
 * as conflicts; either can move the session or hand it to another trainer, and the credit is not affected.
 */
export function leaveConflicts<B extends BookedSession>(bookings: B[], leave: LeaveRange[], nowIso: string): Array<{ booking: B; leave: LeaveRange }> {
  const out: Array<{ booking: B; leave: LeaveRange }> = [];
  for (const b of bookings) {
    if (b.kind !== "pt_session" || b.status !== "booked" || Date.parse(b.startsAt) <= Date.parse(nowIso)) continue;
    const date = istDateOf(b.startsAt);
    const l = leave.find((x) => !x.canceledAt && x.from <= date && date <= x.to);
    if (l) out.push({ booking: b, leave: l });
  }
  return out.sort((a, b) => a.booking.startsAt.localeCompare(b.booking.startsAt));
}

export type AttendanceOutcome = "attended" | "no_show";

/** What marking a session does to its reserved credit: attended uses it; a no-show uses it or gives it back, by the gym’s policy (M06). */
export const attendanceSettlement = (outcome: AttendanceOutcome, noShowConsumesCredit: boolean): Settlement => (outcome === "attended" ? "consume" : noShowSettlement(noShowConsumesCredit));

/** The credit rule in words, shown next to each button before the trainer chooses (never a surprise afterwards). */
export function creditRuleText(outcome: AttendanceOutcome, noShowConsumesCredit: boolean): string {
  return attendanceSettlement(outcome, noShowConsumesCredit) === "consume" ? "Uses 1 session credit" : "Gives the credit back";
}

export interface AttendanceRules {
  noShowAfterMinutes: number;
  markWindowHours: number;
}

/** The gym’s values (`GymPolicies`), used when a gym has none stored. */
export const ATTENDANCE_DEFAULTS: AttendanceRules = { noShowAfterMinutes: 15, markWindowHours: 48 };

/**
 * Why a session can’t be marked this way now, in words, or nothing. “Attended” opens when the session starts; “No-show” opens
 * `noShowAfterMinutes` later, so someone who is only late is not written off; both close `markWindowHours` after the start.
 */
export function attendanceBlockedReason(b: { status: string; startsAt: string }, nowIso: string, outcome: AttendanceOutcome = "attended", rules: AttendanceRules = ATTENDANCE_DEFAULTS): string | undefined {
  if (b.status === "attended" || b.status === "no_show") return `Already marked ${b.status === "attended" ? "attended" : "a no-show"}.`;
  if (b.status !== "booked") return "This session was canceled.";
  const since = Date.parse(nowIso) - Date.parse(b.startsAt);
  if (since < 0) return "It can be marked when the session starts.";
  if (outcome === "no_show" && since < rules.noShowAfterMinutes * 60_000) return `A no-show can be marked ${rules.noShowAfterMinutes} minutes after the session starts.`;
  if (since > rules.markWindowHours * 3_600_000) return `It can be marked up to ${rules.markWindowHours} hours after the session starts. That time has passed, so ask the front desk to settle it.`;
  return undefined;
}

/** The days from `from` to `to`, both included. */
export function daysIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
