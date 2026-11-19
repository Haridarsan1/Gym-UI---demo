import { addDays, daysBetween, istDateTime } from "@/domain/dates";
import { mergeWindows, onLeave, type LeaveRange } from "@/domain/schedule";

/**
 * Which times a member can book with a trainer (T04, O01). A slot sits inside a window the trainer is available and inside
 * the branch’s opening hours, starts on the session grid from the start of the window, lies wholly in the window, starts
 * after now and within the booking horizon, and is taken when it overlaps a booking the trainer already has.
 */

export interface Slot {
  /** India calendar date, 2026-11-18. */
  date: string;
  /** Local start, 18:00. */
  time: string;
  startsAt: string;
  endsAt: string;
  taken: boolean;
}

export interface AvailabilityWindow {
  weekday: number;
  start: string;
  end: string;
}

export interface BranchDay {
  weekday: number;
  open: string;
  close: string;
}

const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 0 = Sunday, for a calendar date. */
export const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** The key two bookings share when they want the same trainer at the same time (A03). */
export const slotKeyFor = (trainerId: string, date: string, time: string): string => `${trainerId}|${date}T${time}`;

export function slotsForDay(input: {
  date: string;
  availability: AvailabilityWindow[];
  branchHours: BranchDay[];
  sessionMinutes: number;
  busy: Array<{ startsAt: string; endsAt: string }>;
  nowIso: string;
  today: string;
  horizonDays: number;
  /** Days the trainer is away. No slots on them (O01: leave blocks new bookings). */
  leave?: LeaveRange[];
  /** One-off windows on a date, added to the weekly pattern. */
  shifts?: Array<{ date: string; start: string; end: string }>;
}): Slot[] {
  const { date, availability, branchHours, sessionMinutes, busy, nowIso, today, horizonDays } = input;
  const ahead = daysBetween(today, date);
  if (ahead < 0 || ahead > horizonDays) return [];
  if (onLeave(date, input.leave ?? [])) return [];
  const weekday = weekdayOf(date);
  const open = branchHours.filter((h) => h.weekday === weekday);
  if (!open.length) return [];
  const out: Slot[] = [];
  const windows = mergeWindows([...availability.filter((a) => a.weekday === weekday), ...(input.shifts ?? []).filter((s) => s.date === date)]);
  for (const w of windows) {
    const start = minutes(w.start);
    const end = minutes(w.end);
    for (let s = start; s + sessionMinutes <= end; s += sessionMinutes) {
      // Inside the branch’s hours as well.
      if (!open.some((h) => s >= minutes(h.open) && s + sessionMinutes <= minutes(h.close))) continue;
      const startsAt = istDateTime(date, hhmm(s));
      if (Date.parse(startsAt) <= Date.parse(nowIso)) continue;
      const endsAt = istDateTime(date, hhmm(s + sessionMinutes));
      const taken = busy.some((b) => Date.parse(b.startsAt) < Date.parse(endsAt) && Date.parse(b.endsAt) > Date.parse(startsAt));
      out.push({ date, time: hhmm(s), startsAt, endsAt, taken });
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Every day in the booking horizon that has slots, from today. */
export function slotsForHorizon(input: Omit<Parameters<typeof slotsForDay>[0], "date">): Array<{ date: string; slots: Slot[] }> {
  const days: Array<{ date: string; slots: Slot[] }> = [];
  for (let i = 0; i <= input.horizonDays; i++) {
    const date = addDays(input.today, i);
    const slots = slotsForDay({ ...input, date });
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

/** The next free slots, after a given moment, across days. Used to suggest alternatives when a slot is just taken. */
export function nextFree(days: Array<{ slots: Slot[] }>, afterIso: string, count = 4): Slot[] {
  return days.flatMap((d) => d.slots).filter((s) => !s.taken && s.startsAt > afterIso).slice(0, count);
}
