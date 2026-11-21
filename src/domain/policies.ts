import { cancellationDeadline, cancellationOutcome, noShowSettlement } from "@/domain/booking";
import { checkInDecision, graceDetail } from "@/domain/checkin";
import { addDays, istDateTime } from "@/domain/dates";
import { applyFreeze, freezeDays, freezeProblem, refundEligibility } from "@/domain/lifecycle";
import { creditRuleText } from "@/domain/schedule";
import { expiringCredits, reviewDue } from "@/domain/trainerToday";
import { exactWhen, formatDate, formatDayMonth, formatRupees, formatTime, formatWeekdayDate } from "@/lib/when";
import { POLICY_DEFAULTS } from "@/domain/policyDefaults";
import type { GymPolicies } from "@/domain/types";

/**
 * The gym’s policies (M02, M05, T04, O02), as the Policies screen shows them: every `GymPolicies` value, its range, what it means in plain words and a worked example that is made by the very
 * same rules the app runs, from the numbers as typed. A test checks each example against the rule it describes. The owner changes the values; everyone else with access reads them.
 */
export type PolicyValues = Omit<GymPolicies, "id" | "tenantId">;
export type PolicyKey = keyof PolicyValues;

export { POLICY_DEFAULTS };

export type GroupId = "sessions" | "training" | "memberships" | "money" | "entry";
export const POLICY_GROUPS: Array<{ id: GroupId; title: string; summary: string }> = [
  { id: "sessions", title: "Booking training sessions", summary: "How far ahead members can book, how long a session is, and what canceling or not turning up costs." },
  { id: "training", title: "Coaching and progress", summary: "What counts toward a streak, and when a trainer’s Today list asks them to act." },
  { id: "memberships", title: "Freezing, canceling and grace", summary: "How long a freeze can be, what a cancellation keeps, and how long a member can still come in after their membership ends." },
  { id: "money", title: "Payments", summary: "Part payments and how often a reminder can be sent." },
  { id: "entry", title: "Entry", summary: "When a second scan is the same visit." },
];

export type Input = { kind: "number"; unit: [one: string, many: string]; min: number; max: number } | { kind: "toggle"; on: string; off: string } | { kind: "rupees"; max: number };

/** The fixed moments the examples are worked from, so they read the same way each time: a session three days from today at 6:00 pm, and a monthly plan of ₹2,950. */
export interface ExampleContext { today: string }
const sessionStart = (ctx: ExampleContext) => istDateTime(addDays(ctx.today, 3), "18:00");
const plus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
const times = (n: number) => (n === 1 ? "once" : `${n} times`);
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const SAMPLE = { price: 250_000, total: 295_000 };

export interface PolicyDef {
  key: PolicyKey;
  group: GroupId;
  label: string;
  /** What it does, in plain words. */
  explain: string;
  input: Input;
  /** A worked example made by the app’s own rules from these values. */
  example: (v: PolicyValues, ctx: ExampleContext) => string;
}

export const POLICY_DEFS: PolicyDef[] = [
  // ── Booking training sessions ──
  {
    key: "bookingHorizonDays", group: "sessions", label: "How far ahead members can book", explain: "Members can book a personal training session this many days from today, and no further.", input: { kind: "number", unit: ["day", "days"], min: 1, max: 60 },
    example: (v, c) => `Today is ${formatWeekdayDate(c.today)}. Members can book up to ${formatWeekdayDate(addDays(c.today, v.bookingHorizonDays))}.`,
  },
  {
    key: "sessionMinutes", group: "sessions", label: "Length of a session", explain: "Every personal training session lasts this long. A trainer’s availability is cut into sessions of this length.", input: { kind: "number", unit: ["minute", "minutes"], min: 15, max: 180 },
    example: (v, c) => `A session that starts at ${formatTime(sessionStart(c))} ends at ${formatTime(plus(sessionStart(c), v.sessionMinutes))}.`,
  },
  {
    key: "membersMayChooseTrainer", group: "sessions", label: "Members can book with other trainers", explain: "When off, a member books only with the trainer they are assigned to.", input: { kind: "toggle", on: "On", off: "Off" },
    example: (v) => (v.membersMayChooseTrainer ? "A member can choose any trainer at their branch when they book. Their own trainer is listed first." : "A member who trains with Meera Joshi sees only Meera’s times when they book."),
  },
  {
    key: "cancellationCutoffHours", group: "sessions", label: "Free cancellation until", explain: "A member can cancel or move a session for free until this many hours before it starts.", input: { kind: "number", unit: ["hour", "hours"], min: 0, max: 168 },
    example: (v, c) => (v.cancellationCutoffHours === 0 ? `A session at ${formatTime(sessionStart(c))} on ${formatWeekdayDate(addDays(c.today, 3))} can be canceled free right up to the moment it starts.` : `A session at ${formatTime(sessionStart(c))} on ${formatWeekdayDate(addDays(c.today, 3))} can be canceled free until ${exactWhen(cancellationDeadline(sessionStart(c), v.cancellationCutoffHours))}. After that it is a late cancel.`),
  },
  {
    key: "lateCancelConsumesCredit", group: "sessions", label: "A late cancel uses the credit", explain: "When on, a member who cancels after the free cancellation time uses their session credit. When off, they get it back.", input: { kind: "toggle", on: "Uses the credit", off: "Gives it back" },
    example: (v, c) => {
      if (v.cancellationCutoffHours === 0) return "With free cancellation until the session starts there is no late cancel, so this changes nothing yet.";
      const start = sessionStart(c);
      const deadline = cancellationDeadline(start, v.cancellationCutoffHours);
      const late = new Date(Math.min(Date.parse(plus(deadline, 60)), Date.parse(plus(start, -1)))).toISOString();
      const outcome = cancellationOutcome(start, v.cancellationCutoffHours, v.lateCancelConsumesCredit, late);
      return `A member who cancels the ${formatTime(start)} session at ${exactWhen(late)}, after the cutoff, ${outcome === "consumed" ? "uses 1 session credit" : "gets the credit back"}.`;
    },
  },
  {
    key: "noShowConsumesCredit", group: "sessions", label: "A no-show uses the credit", explain: "When on, a member who doesn’t turn up uses their session credit. When off, they get it back.", input: { kind: "toggle", on: "Uses the credit", off: "Gives it back" },
    example: (v) => `When the trainer marks a no-show they are told “${creditRuleText("no_show", v.noShowConsumesCredit)}” first, so a member who doesn’t turn up ${noShowSettlement(v.noShowConsumesCredit) === "consume" ? "uses 1 session credit" : "gets the credit back"}.`,
  },
  {
    key: "noShowAfterMinutes", group: "sessions", label: "A no-show can be marked after", explain: "Attended can be marked from the start of a session. No-show opens this many minutes later, so someone who is only late isn’t written off.", input: { kind: "number", unit: ["minute", "minutes"], min: 0, max: 120 },
    example: (v, c) => `A session starts at ${formatTime(sessionStart(c))}. The trainer can mark Attended from ${formatTime(sessionStart(c))} and No-show from ${formatTime(plus(sessionStart(c), v.noShowAfterMinutes))}.`,
  },
  {
    key: "markWindowHours", group: "sessions", label: "A trainer can mark a session for", explain: "After this many hours from the start the trainer can no longer mark a session, and asks the front desk to settle it.", input: { kind: "number", unit: ["hour", "hours"], min: 1, max: 336 },
    example: (v, c) => `The ${formatTime(sessionStart(c))} session on ${formatWeekdayDate(addDays(c.today, 3))} can be marked until ${exactWhen(plus(sessionStart(c), v.markWindowHours * 60))}.`,
  },

  // ── Coaching and progress ──
  {
    key: "streakThresholdPercent", group: "training", label: "A week counts toward the streak at", explain: "A week keeps a member’s streak when they finish at least this share of the workouts planned for it (completed or partly done).", input: { kind: "number", unit: ["percent", "percent"], min: 1, max: 100 },
    example: (v) => {
      const need = Math.ceil((4 * v.streakThresholdPercent) / 100);
      return `With 4 workouts planned in a week, finishing ${need} keeps the streak${need > 1 ? `; finishing ${need - 1} does not` : ""}.`;
    },
  },
  {
    key: "reviewCadenceDays", group: "training", label: "Review a client every", explain: "When none of a client’s goals sets its own pace, the trainer’s Today list asks for a review this many days after the last one.", input: { kind: "number", unit: ["day", "days"], min: 7, max: 180 },
    example: (v, c) => {
      const last = addDays(c.today, -10);
      const r = reviewDue([{ kind: "shared_review", createdAt: istDateTime(last, "10:00"), followUpOn: undefined }], last, c.today, v.reviewCadenceDays);
      return `A client last reviewed on ${formatDate(last)} is ${r.overdue ? `already due, since ${formatDate(r.dueOn)}` : `due for the next review on ${formatDate(r.dueOn)}`}.`;
    },
  },
  {
    key: "missedWorkoutsThreshold", group: "training", label: "A client appears in Today after missing", explain: "The trainer’s Today list shows a client who missed at least this many scheduled workouts in the window below. Skipped workouts and frozen days don’t count.", input: { kind: "number", unit: ["workout", "workouts"], min: 1, max: 14 },
    example: (v) => `A client who has missed ${v.missedWorkoutsThreshold} scheduled ${v.missedWorkoutsThreshold === 1 ? "workout" : "workouts"} with nothing logged in that time is listed for a message. One who has missed ${v.missedWorkoutsThreshold - 1} is not.`,
  },
  {
    key: "missedWorkoutsWindowDays", group: "training", label: "Counted over the last", explain: "How many days before today the missed workouts are counted. Today itself is not counted.", input: { kind: "number", unit: ["day", "days"], min: 3, max: 28 },
    example: (v, c) => `Today is ${formatDayMonth(c.today)}, so missed workouts from ${formatDayMonth(addDays(c.today, -v.missedWorkoutsWindowDays))} to ${formatDayMonth(addDays(c.today, -1))} are counted.`,
  },
  {
    key: "creditExpiryWarningDays", group: "training", label: "Warn about expiring credits", explain: "Training credits are flagged on the trainer’s Today list and the member’s screen this many days before their pack ends.", input: { kind: "number", unit: ["day", "days"], min: 1, max: 90 },
    example: (v, c) => {
      const entry = (end: string) => [{ id: "p", kind: "purchase" as const, credits: 4, expiresOn: end }];
      const flagged = expiringCredits(entry(addDays(c.today, v.creditExpiryWarningDays)), 4, c.today, v.creditExpiryWarningDays);
      const notYet = expiringCredits(entry(addDays(c.today, v.creditExpiryWarningDays + 1)), 4, c.today, v.creditExpiryWarningDays);
      return `A pack ending on ${formatDate(addDays(c.today, v.creditExpiryWarningDays))} is ${flagged ? "listed as expiring" : "not listed"} today. One ending a day later is ${notYet ? "listed too" : "not listed yet"}.`;
    },
  },

  // ── Freezing, canceling and grace ──
  {
    key: "freezeMinDays", group: "memberships", label: "Shortest freeze", explain: "A freeze must last at least this many days, counting the first and last day.", input: { kind: "number", unit: ["day", "days"], min: 1, max: 60 },
    example: (v, c) => freezeExample(v, c, v.freezeMinDays, "shortest"),
  },
  {
    key: "freezeMaxDays", group: "memberships", label: "Longest freeze", explain: "A freeze can last at most this many days. The days frozen are added to the end date, so the member loses nothing.", input: { kind: "number", unit: ["day", "days"], min: 1, max: 180 },
    example: (v, c) => freezeExample(v, c, v.freezeMaxDays, "longest"),
  },
  {
    key: "maxFreezesPerMembership", group: "memberships", label: "Freezes in one membership", explain: "How many times one membership can be frozen. Set 0 to turn freezing off.", input: { kind: "number", unit: ["freeze", "freezes"], min: 0, max: 12 },
    example: (v) => (v.maxFreezesPerMembership === 0 ? "Freezing is off: the desk can’t freeze a membership." : `A membership can be frozen ${times(v.maxFreezesPerMembership)}. After that the desk sees “This membership has used its ${v.maxFreezesPerMembership} ${v.maxFreezesPerMembership === 1 ? "freeze" : "freezes"}.”`),
  },
  {
    key: "graceDays", group: "memberships", label: "Grace period after a membership ends", explain: "Days a member can still come in after their membership ends, while they renew. A plan can set its own, and the desk can change one membership’s.", input: { kind: "number", unit: ["day", "days"], min: 0, max: 30 },
    example: (v, c) => {
      const ends = addDays(c.today, 30);
      const g = graceDetail({ endsOn: ends, graceUntil: undefined, graceDays: undefined, terms: { graceDays: undefined } }, v.graceDays);
      return g.endsOn ? `A membership that ends on ${formatWeekdayDate(ends)} still lets the member in until ${formatWeekdayDate(g.endsOn)}. The desk sees “Checked in, membership ended”.` : `A membership that ends on ${formatWeekdayDate(ends)} stops letting the member in the next day, unless its plan or the desk gives it a grace period.`;
    },
  },
  {
    key: "cancellationFeePaise", group: "memberships", label: "Cancellation fee", explain: "Kept from what a member is offered back when they cancel, before the unused days are returned. The desk requests the refund and finance approves it.", input: { kind: "rupees", max: 5_000_000 },
    example: (v, c) => {
      const r = refundEligibility({ startsOn: addDays(c.today, -10), endsOn: addDays(c.today, 20), terms: { name: "Monthly", kind: "time", pricePaise: SAMPLE.price, taxRateBp: 1800, durationDays: 30, branchIds: [] } }, SAMPLE.total, c.today, { cancellationFeePaise: v.cancellationFeePaise });
      return `A member who cancels a ${formatRupees(SAMPLE.total)} monthly plan with ${r.unusedDays} of ${r.totalDays} days left is worth ${formatRupees(r.gross)} for the unused days, less the ${formatRupees(r.fee)} fee: ${formatRupees(r.amountPaise)} may be offered back.`;
    },
  },

  // ── Payments ──
  {
    key: "partialPaymentsEnabled", group: "money", label: "Part payments", explain: "When on, the front desk can record less than the full amount due and the invoice shows Partly paid. When off, the full amount is taken at once.", input: { kind: "toggle", on: "On", off: "Off" },
    example: (v) => (v.partialPaymentsEnabled ? `On a ${formatRupees(SAMPLE.total)} invoice the desk can take ${formatRupees(100_000)} now. It shows Partly paid, with ${formatRupees(SAMPLE.total - 100_000)} due.` : `On a ${formatRupees(SAMPLE.total)} invoice the desk takes the full ${formatRupees(SAMPLE.total)} at once, or the member pays later.`),
  },
  {
    key: "reminderGapDays", group: "money", label: "Wait between payment reminders", explain: "A payment reminder for the same invoice can go again only after this many days.", input: { kind: "number", unit: ["day", "days"], min: 1, max: 30 },
    example: (v, c) => `A reminder sent on ${formatWeekdayDate(c.today)} can be sent again from ${formatWeekdayDate(addDays(c.today, v.reminderGapDays))}. The desk is told the date if they try sooner.`,
  },

  // ── Entry ──
  {
    key: "repeatScanWindowMinutes", group: "entry", label: "A second scan is the same visit for", explain: "A second scan at the same branch within this many minutes is a repeat: it lets the member through and uses no visit.", input: { kind: "number", unit: ["minute", "minutes"], min: 1, max: 60 },
    example: (v, c) => {
      const first = istDateTime(c.today, "06:30");
      const membership = { status: "active" as const, startsOn: addDays(c.today, -10), endsOn: addDays(c.today, 20), visitsRemaining: 5, graceUntil: undefined, terms: { kind: "visit" as const, branchIds: ["b"] } };
      const scan = (minutes: number) => checkInDecision({ membership, branchId: "b", today: c.today, nowIso: plus(first, minutes), recent: [{ at: first, result: "allowed", branchId: "b" }], scanWindowMinutes: v.repeatScanWindowMinutes });
      const last = scan(v.repeatScanWindowMinutes - 1);
      const next = scan(v.repeatScanWindowMinutes);
      return `A member scans in at ${formatTime(first)}. A scan at ${formatTime(plus(first, v.repeatScanWindowMinutes - 1))} is ${last.result === "repeat_scan" ? "a repeat and uses no visit" : "a new visit"}; at ${formatTime(plus(first, v.repeatScanWindowMinutes))} it is ${next.result === "repeat_scan" ? "still a repeat" : "a new visit"}.`;
    },
  },
];

/** A membership ending in 30 days, frozen from today for `n` days: what the freeze does to its end date, or why this length isn’t allowed by the numbers as typed. */
function freezeExample(v: PolicyValues, c: ExampleContext, n: number, which: "shortest" | "longest"): string {
  const ends = addDays(c.today, 30);
  const m = { status: "active" as const, startsOn: addDays(c.today, -10), endsOn: ends, freezes: [], canceledEffectiveOn: undefined, terms: { kind: "time" as const, durationDays: 30, pricePaise: SAMPLE.price, taxRateBp: 1800 } };
  const f = { from: c.today, to: addDays(c.today, n - 1) };
  if (v.maxFreezesPerMembership === 0) return "Freezing is off, so no freeze is possible.";
  const problem = freezeProblem(m, f, c.today, { freezeMinDays: v.freezeMinDays, freezeMaxDays: v.freezeMaxDays, maxFreezesPerMembership: v.maxFreezesPerMembership, cancellationFeePaise: v.cancellationFeePaise });
  if (problem) return `A freeze of ${days(n)} isn’t allowed with these numbers: ${problem.replace(/\.$/, "").toLowerCase()}.`;
  const after = applyFreeze(m, { ...f, reason: "Travel" });
  return `The ${which} freeze, ${days(freezeDays(f.from, f.to))}, from today moves a membership that ends on ${formatDate(ends)} to ${formatDate(after.endsOn!)}.`;
}

// ── Checking and describing ─────────────────────────────────────────────────────────────────────

export type PolicyErrors = Partial<Record<PolicyKey, string>>;

/** What is wrong with a set of values, in the owner’s words, by setting. */
export function validatePolicies(v: PolicyValues): PolicyErrors {
  const e: PolicyErrors = {};
  for (const d of POLICY_DEFS) {
    const value = v[d.key];
    if (d.input.kind === "toggle") continue;
    if (d.input.kind === "number") {
      if (typeof value !== "number" || !Number.isInteger(value)) e[d.key] = `Enter a whole number of ${d.input.unit[1]}.`;
      else if (value < d.input.min || value > d.input.max) e[d.key] = `Enter ${d.input.min} to ${d.input.max} ${d.input.unit[1]}.`;
    } else if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > d.input.max) e[d.key] = `Enter an amount from ₹0 to ${formatRupees(d.input.max)}.`;
  }
  if (!e.freezeMinDays && !e.freezeMaxDays && v.freezeMinDays > v.freezeMaxDays) e.freezeMinDays = "The shortest freeze can’t be longer than the longest. Lower this or raise the longest freeze.";
  return e;
}

/** A value as the screen and the audit log say it: “12 hours”, “On”, “₹500”. */
export function describeValue(d: PolicyDef, value: number | boolean): string {
  if (d.input.kind === "toggle") return value ? d.input.on : d.input.off;
  if (d.input.kind === "rupees") return formatRupees(Number(value));
  return d.input.unit[0] === "percent" ? `${value}%` : `${value} ${value === 1 ? d.input.unit[0] : d.input.unit[1]}`;
}

export interface PolicyChange { key: PolicyKey; label: string; from: string; to: string }

/** Which settings differ, with what they were and what they become, in words. */
export function policyChanges(before: PolicyValues, after: PolicyValues): PolicyChange[] {
  return POLICY_DEFS.filter((d) => before[d.key] !== after[d.key]).map((d) => ({ key: d.key, label: d.label, from: describeValue(d, before[d.key]), to: describeValue(d, after[d.key]) }));
}

/** The stored row with a default for any setting it doesn’t have yet. */
export function withDefaults(row: Partial<PolicyValues> | undefined): PolicyValues {
  const out = { ...POLICY_DEFAULTS };
  if (row) for (const k of Object.keys(POLICY_DEFAULTS) as PolicyKey[]) if (row[k] !== undefined) (out as Record<PolicyKey, number | boolean>)[k] = row[k] as number | boolean;
  return out;
}

