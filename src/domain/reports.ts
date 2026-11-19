import { amountDuePaise, isOverdue } from "@/domain/billing";
import { addDays, daysBetween, eachDay, istDateOf, weekStart } from "@/domain/dates";
import { effectiveStatus } from "@/domain/lifecycle";
import { mergeWindows, onLeave, type LeaveRange } from "@/domain/schedule";
import type { Booking, CheckIn, Invoice, Membership, Payment, Refund } from "@/domain/types";

/**
 * Report definitions (O06, O07), as the requirements word them. Every function is pure: the API reads the records for the branches a person may see and hands them in, so a branch
 * manager’s numbers can only be made from their own branches. Dates are India calendar dates (`2026-11-17`); a range includes both ends.
 *
 *   Billed       what was invoiced in the range (invoices issued in it, not void or draft). Collected, apart from it: money received in the range (succeeded payments, credit notes
 *                are not money), with what was refunded in the range beside it (O07: “show billed and collected amounts separately”).
 *   Dues         what is owed today on every open or part-paid invoice, and how much of it is overdue.
 *   Active       memberships whose status today is active and in date; expiring: active ones that end within the next `EXPIRY_WINDOW_DAYS`.
 *   Renewals     measured against the memberships due to expire in the range (the cohort): a cohort membership is renewed when the same member has a later membership that starts no
 *                later than `RENEWAL_GRACE_DAYS` after it ended. Memberships canceled before they ended are not in the cohort (O07).
 *   Check-ins    entries (allowed, allowed with dues, override; a repeat scan is not a visit) by weekday and hour.
 *   Utilisation  coached hours (attended personal-training sessions) against the hours trainers were available for booking (O07).
 */

export const EXPIRY_WINDOW_DAYS = 14;
export const RENEWAL_GRACE_DAYS = 30;

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

// ── Money ────────────────────────────────────────────────────────────────────────────────────────

export interface MoneyInput { invoices: Invoice[]; payments: Payment[]; refunds: Array<Pick<Refund, "amountPaise" | "createdAt" | "status">>; from: string; to: string }
export interface Money { billedPaise: number; collectedPaise: number; refundedPaise: number }

export function money(i: MoneyInput): Money {
  const billedPaise = i.invoices.filter((v) => v.status !== "void" && v.status !== "draft" && inRange(v.issuedOn, i.from, i.to)).reduce((n, v) => n + v.totalPaise, 0);
  const collectedPaise = i.payments.filter((p) => p.status === "succeeded" && p.method !== "credit_note" && inRange(istDateOf(p.receivedAt), i.from, i.to)).reduce((n, p) => n + p.amountPaise, 0);
  const refundedPaise = i.refunds.filter((r) => r.status === "completed" && inRange(istDateOf(r.createdAt), i.from, i.to)).reduce((n, r) => n + r.amountPaise, 0);
  return { billedPaise, collectedPaise, refundedPaise };
}

/** Billed and collected for each week (Monday start) that touches the range, so the two can be drawn side by side. */
export function weeklyMoney(i: MoneyInput): Array<{ week: string; billedPaise: number; collectedPaise: number }> {
  const weeks = [...new Set(eachDay(i.from, i.to).map(weekStart))];
  return weeks.map((week) => {
    const lo = week < i.from ? i.from : week;
    const hi = addDays(week, 6) > i.to ? i.to : addDays(week, 6);
    const m = money({ ...i, from: lo, to: hi });
    return { week, billedPaise: m.billedPaise, collectedPaise: m.collectedPaise };
  });
}

export interface Dues { duePaise: number; overduePaise: number; invoices: number; overdueInvoices: number }

export function dues(invoices: Invoice[], payments: Payment[], today: string): Dues {
  const byInvoice = new Map<string, Payment[]>();
  for (const p of payments) byInvoice.set(p.invoiceId, [...(byInvoice.get(p.invoiceId) ?? []), p]);
  const out: Dues = { duePaise: 0, overduePaise: 0, invoices: 0, overdueInvoices: 0 };
  for (const inv of invoices) {
    const mine = byInvoice.get(inv.id) ?? [];
    const due = amountDuePaise(inv, mine);
    // An invoice nobody has started paying and that was never sent (a cart) is not a due.
    if (due <= 0 || (inv.status !== "open" && inv.status !== "partially_paid")) continue;
    out.duePaise += due;
    out.invoices += 1;
    if (isOverdue(inv, mine, today)) { out.overduePaise += due; out.overdueInvoices += 1; }
  }
  return out;
}

// ── Memberships ──────────────────────────────────────────────────────────────────────────────────

type MembershipFacts = Pick<Membership, "id" | "memberId" | "status" | "startsOn" | "endsOn" | "freezes" | "canceledEffectiveOn">;

/** Active on a date: its status that day is active, it has started, and it has not ended. A frozen membership is counted apart. */
export const isActiveOn = (m: MembershipFacts, date: string): boolean => effectiveStatus(m, date) === "active" && m.startsOn <= date && (m.endsOn === undefined || m.endsOn >= date);

export interface MembershipCounts { active: number; frozen: number; expiring: number }

export function membershipCounts(memberships: MembershipFacts[], today: string, windowDays = EXPIRY_WINDOW_DAYS): MembershipCounts {
  let active = 0, frozen = 0, expiring = 0;
  for (const m of memberships) {
    if (isActiveOn(m, today)) {
      active += 1;
      if (m.endsOn !== undefined && m.endsOn <= addDays(today, windowDays)) expiring += 1;
    } else if (effectiveStatus(m, today) === "frozen" && m.startsOn <= today) frozen += 1;
  }
  return { active, frozen, expiring };
}

export interface Renewals { due: number; renewed: number; ratePercent: number | null }

/** O07: renewals against the memberships due to expire in the range. A rate of nothing (no cohort) is `null`, never zero. */
export function renewals(memberships: MembershipFacts[], from: string, to: string, graceDays = RENEWAL_GRACE_DAYS): Renewals {
  const cohort = memberships.filter((m) => m.endsOn !== undefined && inRange(m.endsOn, from, to) && !(m.canceledEffectiveOn !== undefined && m.canceledEffectiveOn <= m.endsOn));
  let renewed = 0;
  for (const m of cohort) {
    const next = memberships.some((x) => x.memberId === m.memberId && x.id !== m.id && x.startsOn > m.startsOn && x.startsOn <= addDays(m.endsOn!, graceDays) && x.status !== "canceled" && x.status !== "pending");
    if (next) renewed += 1;
  }
  return { due: cohort.length, renewed, ratePercent: cohort.length === 0 ? null : Math.round((renewed / cohort.length) * 100) };
}

// ── Check-ins ────────────────────────────────────────────────────────────────────────────────────

const ENTRY: ReadonlySet<CheckIn["result"]> = new Set(["allowed", "allowed_with_dues", "override"]);

export interface HeatMap {
  /** Rows are weekdays Monday to Sunday; columns are the hours 0 to 23. */
  cells: number[][];
  total: number;
  max: number;
  /** The busiest few weekday-and-hour slots, busiest first. */
  peaks: Array<{ weekday: number; hour: number; count: number }>;
}

/** Visits by weekday (Monday first) and hour in India time. */
export function heatMap(checkIns: Array<Pick<CheckIn, "at" | "result">>, from: string, to: string): HeatMap {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let total = 0;
  for (const c of checkIns) {
    if (!ENTRY.has(c.result)) continue;
    const local = new Date(Date.parse(c.at) + 5.5 * 3_600_000);
    const date = local.toISOString().slice(0, 10);
    if (!inRange(date, from, to)) continue;
    const weekday = (local.getUTCDay() + 6) % 7;
    cells[weekday]![local.getUTCHours()]! += 1;
    total += 1;
  }
  const flat = cells.flatMap((row, weekday) => row.map((count, hour) => ({ weekday, hour, count }))).filter((x) => x.count > 0).sort((a, b) => b.count - a.count || a.weekday - b.weekday || a.hour - b.hour);
  return { cells, total, max: flat[0]?.count ?? 0, peaks: flat.slice(0, 3) };
}

// ── Trainer utilisation ──────────────────────────────────────────────────────────────────────────

interface Window { start: string; end: string }
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hoursOf = (w: Window) => Math.max(0, minutes(w.end) - minutes(w.start)) / 60;

export interface UtilisationInput {
  availability: Array<{ trainerId: string; branchId: string; weekday: number; start: string; end: string }>;
  shifts: Array<{ trainerId: string; branchId: string; date: string; start: string; end: string }>;
  leave: Array<LeaveRange & { trainerId: string }>;
  bookings: Array<Pick<Booking, "kind" | "status" | "trainerId" | "branchId" | "startsAt" | "endsAt">>;
  branchIds: string[];
  from: string;
  to: string;
}

export interface TrainerUtilisation { trainerId: string; availableHours: number; coachedHours: number; percent: number | null }

/**
 * O07: coached hours against the hours trainers could be booked. Available hours are each trainer’s weekly windows at the branches in view on every day of the range they are not
 * on leave, plus one-off shifts; overlapping windows count once. Coached hours are personal-training sessions marked attended (a no-show was not coached). Both are limited to the
 * branches in view, so a branch manager’s figure is made only from their branches.
 */
export function trainerUtilisation(i: UtilisationInput): { trainers: TrainerUtilisation[]; availableHours: number; coachedHours: number; percent: number | null } {
  const trainers = [...new Set([...i.availability.map((a) => a.trainerId), ...i.bookings.map((b) => b.trainerId ?? "")])].filter(Boolean).sort();
  const days = eachDay(i.from, i.to);
  const rows: TrainerUtilisation[] = trainers.map((trainerId) => {
    const leave = i.leave.filter((l) => l.trainerId === trainerId);
    let available = 0;
    for (const date of days) {
      if (onLeave(date, leave)) continue;
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const windows: Window[] = [
        ...i.availability.filter((a) => a.trainerId === trainerId && a.weekday === weekday && i.branchIds.includes(a.branchId)),
        ...i.shifts.filter((s) => s.trainerId === trainerId && s.date === date && i.branchIds.includes(s.branchId)),
      ];
      available += mergeWindows(windows).reduce((n, w) => n + hoursOf(w), 0);
    }
    const coached = i.bookings
      .filter((b) => b.kind === "pt_session" && b.status === "attended" && b.trainerId === trainerId && i.branchIds.includes(b.branchId) && inRange(istDateOf(b.startsAt), i.from, i.to))
      .reduce((n, b) => n + (Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 3_600_000, 0);
    return { trainerId, availableHours: round1(available), coachedHours: round1(coached), percent: available > 0 ? Math.round((coached / available) * 100) : null };
  }).filter((t) => t.availableHours > 0 || t.coachedHours > 0);
  const availableHours = round1(rows.reduce((n, r) => n + r.availableHours, 0));
  const coachedHours = round1(rows.reduce((n, r) => n + r.coachedHours, 0));
  return { trainers: rows, availableHours, coachedHours, percent: availableHours > 0 ? Math.round((coachedHours / availableHours) * 100) : null };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The date a range of this many days ending today starts on: 7 days is today and the six before it. */
export const rangeFrom = (today: string, days: number): string => addDays(today, -(days - 1));
export { daysBetween };
