import type { PlanDay, Prescription } from "@/domain/types";

/**
 * The program builder’s working model (W02, T03, T06). A trainer builds weeks of days of prescriptions on screen; this turns
 * that into the stored `PlanDay` list and back, and decides whether it is good enough to publish. Pure, so the builder, the
 * template screen and the API all mean the same thing by “valid”.
 *
 * A day sits on a weekday (0 is Monday) of a week, so `dayOffset` is `week × 7 + weekday`. A program starts on a Monday-based
 * calendar in templates; a client’s version starts on the date the trainer picks, and the offsets count from it.
 */

export type Section = Prescription["section"];
export const SECTIONS: Array<{ value: Section; label: string }> = [{ value: "warmup", label: "Warm-up" }, { value: "main", label: "Main" }, { value: "cooldown", label: "Cool-down" }];
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const MAX_WEEKS = 52;

/**
 * Days are counted from the version’s start date: day 0 is the start date itself, so a version that starts on a Wednesday has
 * its first workout on a Wednesday. This is the name of day `offset` (0 to 6) of a week for a start date; with no start date,
 * a Monday start (what templates use).
 */
export function dayName(startsOn: string | undefined, offset: number, long = false): string {
  const startDow = startsOn ? (new Date(`${startsOn}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const names = long ? WEEKDAY_LONG : WEEKDAY_SHORT;
  return names[(startDow + offset) % 7]!;
}

/** The first Monday on or after a date. Templates are built on Monday weeks, so applying one starts on a Monday. */
export function nextMonday(date: string): string {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return dow === 0 ? date : new Date(Date.parse(`${date}T00:00:00Z`) + (7 - dow) * 86_400_000).toISOString().slice(0, 10);
}

export interface EditorRx {
  key: string;
  exerciseId: string;
  section: Section;
  sets: number;
  /** Reps as typed: “10”, or a range “8-12”. Empty for timed work. */
  reps: string;
  loadKg?: number;
  durationSec?: number;
  restSec?: number;
  cues?: string;
}
export interface EditorDay {
  key: string;
  title: string;
  /** 0 is Monday. */
  weekday: number;
  items: EditorRx[];
}
export interface EditorWeek {
  key: string;
  days: EditorDay[];
}
export interface EditorDoc {
  name: string;
  notes: string;
  weeks: EditorWeek[];
}

let counter = 0;
/** A key for a row on screen. Never stored. */
export const newKey = (prefix = "k"): string => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

/** “10” is ten reps, “8-12” is eight to twelve, anything else is not reps. */
export function parseReps(text: string): Prescription["reps"] | "invalid" | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const range = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(t);
  if (range) {
    const [min, max] = [Number(range[1]), Number(range[2])];
    return min >= 1 && max >= min ? { min, max } : "invalid";
  }
  if (/^\d{1,3}$/.test(t) && Number(t) >= 1) return Number(t);
  return "invalid";
}
export const repsToText = (r: Prescription["reps"]): string => (r === undefined ? "" : typeof r === "number" ? String(r) : `${r.min}-${r.max}`);

/** The stored days for an editor document. Weeks and days keep the order they have on screen, ordered by weekday within a week. */
export function toPlanDays(doc: Pick<EditorDoc, "weeks">): PlanDay[] {
  const out: PlanDay[] = [];
  doc.weeks.forEach((week, w) => {
    [...week.days].sort((a, b) => a.weekday - b.weekday).forEach((day, dayIndex) => {
      out.push({
        dayOffset: w * 7 + day.weekday, weekIndex: w, dayIndex, title: day.title.trim() || `Day ${dayIndex + 1}`, canceled: false,
        prescriptions: day.items.map((it, order): Prescription => {
          const reps = parseReps(it.reps);
          return {
            exerciseId: it.exerciseId, order, section: it.section, sets: it.sets, ...(reps !== undefined && reps !== "invalid" ? { reps } : {}),
            ...(it.loadKg ? { loadKg: it.loadKg } : {}), ...(it.durationSec ? { durationSec: it.durationSec } : {}), ...(it.restSec ? { restSec: it.restSec } : {}), ...(it.cues?.trim() ? { cues: it.cues.trim() } : {}),
          };
        }),
      });
    });
  });
  return out;
}

/** The editor’s weeks for stored days. Weeks with no workout in the middle of the program are kept (rest weeks). */
export function fromPlanDays(days: PlanDay[], weeks = Math.max(1, ...days.map((d) => d.weekIndex + 1))): EditorWeek[] {
  return Array.from({ length: weeks }, (_, w) => ({
    key: newKey("w"),
    days: days.filter((d) => d.weekIndex === w).sort((a, b) => a.dayOffset - b.dayOffset).map((d) => ({
      key: newKey("d"), title: d.title, weekday: d.dayOffset - w * 7,
      items: [...d.prescriptions].sort((a, b) => a.order - b.order).map((p): EditorRx => ({
        key: newKey("r"), exerciseId: p.exerciseId, section: p.section, sets: p.sets, reps: repsToText(p.reps), loadKg: p.loadKg, durationSec: p.durationSec, restSec: p.restSec, cues: p.cues,
      })),
    })),
  }));
}

export interface ProgramIssue {
  /** Where on screen it is: “doc”, “week 2 Tue”, and so on. */
  where: string;
  message: string;
  /** For the builder to jump to it. */
  weekIndex?: number;
  dayKey?: string;
  rxKey?: string;
}

/**
 * What stops a program being published (the rules a member relies on): a name, at least one workout, every workout with a main
 * exercise, every exercise in the library and not archived, sets of at least one, reps that read as a number or range for
 * counted work, a duration for work with no reps, and loads and rests that make sense. Days are named from `startsOn`.
 * A draft may be saved with any of these still open.
 */
export function validateProgram(doc: EditorDoc, exercises: Map<string, { name: string; archived: boolean }>, startsOn?: string): ProgramIssue[] {
  const issues: ProgramIssue[] = [];
  if (!doc.name.trim()) issues.push({ where: "program", message: "Give the program a name." });
  const workouts = doc.weeks.flatMap((w) => w.days);
  if (workouts.length === 0) issues.push({ where: "program", message: "Add at least one workout day." });
  doc.weeks.forEach((week, w) => {
    const taken = new Set<number>();
    week.days.forEach((day) => {
      const where = `Week ${w + 1}, ${dayName(startsOn, day.weekday)}`;
      const at = { weekIndex: w, dayKey: day.key };
      if (taken.has(day.weekday)) issues.push({ where, message: `${where} has two workouts on the same day.`, ...at });
      taken.add(day.weekday);
      if (!day.items.some((i) => i.section === "main")) issues.push({ where, message: `${where} needs at least one main exercise.`, ...at });
      day.items.forEach((it) => {
        const ex = exercises.get(it.exerciseId);
        const name = ex?.name ?? "An exercise";
        const here = { ...at, rxKey: it.key };
        if (!ex) issues.push({ where, message: `${where}: ${name} isn’t in the library any more. Remove it.`, ...here });
        else if (ex.archived) issues.push({ where, message: `${where}: ${name} is archived. Swap it for another or restore it.`, ...here });
        if (!Number.isInteger(it.sets) || it.sets < 1 || it.sets > 20) issues.push({ where, message: `${where}: ${name} needs between 1 and 20 sets.`, ...here });
        const reps = parseReps(it.reps);
        if (reps === "invalid") issues.push({ where, message: `${where}: reps for ${name} should be a number like 10 or a range like 8-12.`, ...here });
        else if (reps === undefined && !it.durationSec) issues.push({ where, message: `${where}: ${name} needs reps or a duration.`, ...here });
        if (it.loadKg !== undefined && (it.loadKg < 0 || it.loadKg > 500)) issues.push({ where, message: `${where}: the load for ${name} should be between 0 and 500 kg.`, ...here });
        if (it.restSec !== undefined && (it.restSec < 0 || it.restSec > 900)) issues.push({ where, message: `${where}: rest for ${name} should be at most 15 minutes.`, ...here });
      });
    });
  });
  return issues;
}

export interface ProgramSummary {
  weeks: number;
  workouts: number;
  workoutsPerWeek: number;
  exercises: number;
}

export function summarize(days: PlanDay[]): ProgramSummary {
  const weeks = Math.max(0, ...days.map((d) => d.weekIndex + 1));
  const ids = new Set(days.flatMap((d) => d.prescriptions.map((p) => p.exerciseId)));
  return { weeks, workouts: days.length, workoutsPerWeek: weeks ? Math.round((days.length / weeks) * 10) / 10 : 0, exercises: ids.size };
}

/** A copy of a week, with new keys, appended after it. */
export function cloneWeek(week: EditorWeek): EditorWeek {
  return { key: newKey("w"), days: week.days.map((d) => ({ ...d, key: newKey("d"), items: d.items.map((i) => ({ ...i, key: newKey("r") })) })) };
}

/** Moves one item in a list, for drag and drop and the move buttons. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** What changed between two versions, for the publish confirmation: how many days are new, gone or different. */
export function compareDays(before: PlanDay[], after: PlanDay[]): { added: number; removed: number; changed: number; same: number } {
  const key = (d: PlanDay) => d.dayOffset;
  const old = new Map(before.map((d) => [key(d), JSON.stringify([d.title, d.prescriptions])]));
  let added = 0, changed = 0, same = 0;
  for (const d of after) {
    const prev = old.get(key(d));
    if (prev === undefined) added++;
    else if (prev === JSON.stringify([d.title, d.prescriptions])) same++;
    else changed++;
  }
  return { added, removed: before.filter((d) => !after.some((a) => key(a) === key(d))).length, changed, same };
}
