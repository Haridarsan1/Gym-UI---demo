import { istDateOf, istTime } from "@/domain/dates";

/**
 * A branch’s opening hours and rooms (O01), pure. Hours are one opening time and one closing time on each day the branch is open; a day with none is closed. Sessions can only be booked inside
 * them. Rooms have a capacity; a session can be put in one, and no room holds two sessions at once.
 */
export interface DayHours { weekday: number; open: string; close: string }
export interface RoomDraft { id?: string; name: string; capacity: number | null }
export interface BranchDraft { address: string; hours: DayHours[]; rooms: RoomDraft[] }
export type BranchErrors = { address?: string; hours?: string; rooms?: string; days: Partial<Record<number, string>>; roomRows: Record<number, { name?: string; capacity?: string }> };

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Monday first, the order a gym reads its week in. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateBranch(d: BranchDraft): BranchErrors {
  const e: BranchErrors = { days: {}, roomRows: {} };
  if (d.address.length > 200) e.address = "Use 200 characters or fewer.";
  const seen = new Set<number>();
  for (const h of d.hours) {
    if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6) e.days[h.weekday] = "Choose a day of the week.";
    else if (seen.has(h.weekday)) e.days[h.weekday] = "This day is listed twice.";
    else if (!HHMM.test(h.open) || !HHMM.test(h.close)) e.days[h.weekday] = "Enter the times as hours and minutes, for example 05:30.";
    else if (h.open >= h.close) e.days[h.weekday] = "It has to open before it closes.";
    seen.add(h.weekday);
  }
  if (d.hours.length === 0) e.hours = "A branch has to be open on at least one day.";
  if (d.rooms.length > 20) e.rooms = "A branch can have up to 20 rooms.";
  const names = new Set<string>();
  d.rooms.forEach((r, i) => {
    const row: { name?: string; capacity?: string } = {};
    const name = r.name.trim().replace(/\s+/g, " ");
    if (!name) row.name = "Give the room a name.";
    else if (name.length > 40) row.name = "Use 40 characters or fewer.";
    else if (names.has(name.toLowerCase())) row.name = "Another room has this name.";
    names.add(name.toLowerCase());
    if (r.capacity === null || !Number.isInteger(r.capacity) || r.capacity < 1 || r.capacity > 500) row.capacity = "Enter how many people it holds, 1 to 500.";
    if (row.name || row.capacity) e.roomRows[i] = row;
  });
  return e;
}

export const hasBranchErrors = (e: BranchErrors) => !!(e.address || e.hours || e.rooms) || Object.keys(e.days).length > 0 || Object.keys(e.roomRows).length > 0;

const ampm = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
};

/** “5:30 am to 10:30 pm”, or “Closed”. */
export const hoursText = (h: DayHours | undefined): string => (h ? `${ampm(h.open)} to ${ampm(h.close)}` : "Closed");

/** The week in short lines, equal days joined: “Mon to Fri 5:30 am to 10:30 pm”. */
export function weekSummary(hours: DayHours[]): string[] {
  const by = new Map(hours.map((h) => [h.weekday, h]));
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const out: Array<{ days: number[]; text: string }> = [];
  for (const w of WEEK_ORDER) {
    const text = hoursText(by.get(w));
    const last = out.at(-1);
    if (last && last.text === text) last.days.push(w);
    else out.push({ days: [w], text });
  }
  return out.map((g) => `${g.days.length === 1 ? short[g.days[0]!] : `${short[g.days[0]!]} to ${short[g.days.at(-1)!]}`} ${g.text}`);
}

/** Whether a session that starts at this moment (and lasts `minutes`) is inside the branch’s opening hours. */
export function withinHours(hours: DayHours[], startsAtIso: string, minutes: number): boolean {
  const date = istDateOf(startsAtIso);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const day = hours.find((h) => h.weekday === weekday);
  if (!day) return false;
  const start = istTime(startsAtIso);
  const [h, m] = start.split(":").map(Number) as [number, number];
  const end = h * 60 + m + minutes;
  const close = Number(day.close.slice(0, 2)) * 60 + Number(day.close.slice(3, 5));
  return start >= day.open && end <= close;
}
