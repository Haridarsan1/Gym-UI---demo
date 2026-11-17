/** Calendar dates in India time. India has no daylight saving, so a fixed +5:30 offset is exact. */
const IST_OFFSET_MS = 5.5 * 3600_000;

/** The calendar date (YYYY-MM-DD) in India at this moment. */
export const todayIST = (now: Date = new Date()): string => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Adds whole days to a YYYY-MM-DD date. */
export const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
