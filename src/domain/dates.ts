/** Calendar dates in India time. India has no daylight saving, so a fixed +5:30 offset is exact. */
const IST_OFFSET_MS = 5.5 * 3600_000;

/** The calendar date (YYYY-MM-DD) in India at this moment. */
export const todayIST = (now: Date = new Date()): string => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Adds whole days to a YYYY-MM-DD date. */
export const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Whole days from a to b (b minus a). Both are YYYY-MM-DD. */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The Monday of the week a date falls in. Weeks run Monday to Sunday. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}

/** Every date from `from` to `to`, both included. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A local India time on a date as an ISO timestamp: istDateTime("2026-11-17", "19:00") is 13:30 UTC. */
export function istDateTime(date: string, time: string): string {
  return new Date(Date.parse(`${date}T${time}:00Z`) - 5.5 * 3600_000).toISOString();
}

/** The India time (HH:mm) of an ISO timestamp. */
export function istTime(iso: string): string {
  return new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(11, 16);
}

/** The India calendar date of an ISO timestamp. */
export const istDateOf = (iso: string): string => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10);
