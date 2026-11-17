import { addDays, istDateOf, istTime } from "@/domain/dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 6:30 am, 7:00 pm. */
export function formatTime(iso: string): string {
  const [h, m] = istTime(iso).split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** 17 Nov 2026. */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** 17 Nov. */
export function formatDayMonth(date: string): string {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}`;
}

/** Wed 18 Nov. */
export function formatWeekdayDate(date: string): string {
  return `${DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${formatDayMonth(date)}`;
}

/** “today”, “tomorrow”, or “Fri 20 Nov”. */
export function dayWord(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  if (date === addDays(today, -1)) return "yesterday";
  return formatWeekdayDate(date);
}

/** “6:00 am tomorrow”, “7:00 pm today”, “6:00 pm Fri 20 Nov”. */
export function whenText(iso: string, nowIso: string): string {
  return `${formatTime(iso)} ${dayWord(istDateOf(iso), istDateOf(nowIso))}`;
}

/**
 * The free-cancellation line shown before confirming a booking and on each booking. It always names the exact deadline.
 * After the deadline it says so and what cancelling does to the credit.
 */
export function freeCancellationText(deadlineIso: string, nowIso: string, lateConsumesCredit: boolean): string {
  if (Date.parse(nowIso) <= Date.parse(deadlineIso)) return `Free cancellation until ${whenText(deadlineIso, nowIso)}`;
  return `Free cancellation ended at ${whenText(deadlineIso, nowIso)}. ${lateConsumesCredit ? "Cancelling now uses your credit." : "You can still cancel."}`;
}

/** Good morning, afternoon or evening, by India time. */
export function greeting(nowIso: string): string {
  const hour = Number(istTime(nowIso).slice(0, 2));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** ₹2,48,600 from paise, without decimals unless there are paise. */
export function formatRupees(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const ps = paise % 100;
  const grouped = new Intl.NumberFormat("en-IN").format(rupees);
  return `₹${grouped}${ps ? `.${String(ps).padStart(2, "0")}` : ""}`;
}
