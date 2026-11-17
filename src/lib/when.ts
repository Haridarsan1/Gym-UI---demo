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

/** “6:00 am Wed 18 Nov”: the exact moment, always with its date, for deadlines the member plans around. */
export function exactWhen(iso: string): string {
  return `${formatTime(iso)} ${formatWeekdayDate(istDateOf(iso))}`;
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
  if (Date.parse(nowIso) <= Date.parse(deadlineIso)) return `Free cancellation until ${exactWhen(deadlineIso)}`;
  return `Free cancellation ended ${exactWhen(deadlineIso)}. ${lateConsumesCredit ? "Cancelling now uses your credit." : "You can still cancel."}`;
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

type Outcome = "released" | "consumed" | "kept" | "too_late";

/**
 * What cancelling does to the session credit at this moment, in plain words, shown before the member confirms. It always names
 * the exact free-cancellation time.
 */
export function cancelNowText(outcome: Outcome, deadlineIso: string, _nowIso: string): string {
  const when = exactWhen(deadlineIso);
  switch (outcome) {
    case "released": return `Cancelling now is free. Your session credit goes back to your balance. Free cancellation ends ${when}.`;
    case "consumed": return `Free cancellation ended ${when}. If you cancel now, this session credit is used and does not come back.`;
    case "kept": return `Free cancellation ended ${when}, but this gym does not take a credit for a late cancellation. Your session credit goes back to your balance.`;
    case "too_late": return "This session has already started, so it can’t be canceled.";
  }
}

/** The late-cancellation and no-show terms for a session, in two plain sentences or fewer. Shown before booking and on each booking. */
export function lateTermsText(deadlineIso: string, _nowIso: string, lateConsumes: boolean, noShowConsumes: boolean): string {
  const when = exactWhen(deadlineIso);
  if (lateConsumes && noShowConsumes) return `After ${when}, cancelling or not turning up uses this session credit.`;
  if (lateConsumes) return `After ${when}, cancelling uses this session credit. If you do not turn up, the credit goes back to you.`;
  if (noShowConsumes) return `You can cancel for free at any time before the session. If you do not turn up, this session credit is used.`;
  return "Cancelling late or not turning up does not use your session credit.";
}
