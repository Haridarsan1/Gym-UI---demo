import type { LoggedExercise, LoggedSet, PlanDay, Prescription, WorkoutLog } from "@/domain/types";

/** What a set can record. Which ones show depends on what the trainer prescribed (W02, W03). */
export type SetField = "reps" | "load" | "duration" | "distance";

/** The prescriptions of a day in the order the member does them. */
export const inOrder = (day: Pick<PlanDay, "prescriptions">): Prescription[] => [...day.prescriptions].sort((a, b) => a.order - b.order);

/** Fields to ask for. Anything with reps also takes an optional load, so a bodyweight move can still record one. */
export function fieldsFor(p: Prescription): SetField[] {
  const fields: SetField[] = [];
  if (p.reps !== undefined) fields.push("reps", "load");
  if (p.durationSec !== undefined) fields.push("duration");
  if (p.distanceM !== undefined) fields.push("distance");
  return fields.length ? fields : ["reps"];
}

/** The reps a set is pre-filled with: the lower end of a range, so logging with one tap is never an overclaim. */
export const targetReps = (p: Pick<Prescription, "reps">): number | undefined => (p.reps === undefined ? undefined : typeof p.reps === "number" ? p.reps : p.reps.min);

const repsText = (p: Pick<Prescription, "reps">): string | undefined => (p.reps === undefined ? undefined : typeof p.reps === "number" ? String(p.reps) : `${p.reps.min}–${p.reps.max}`);

export function durationText(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** “3 × 10 · 18 kg · rest 1 min 15 s”. The target as the trainer wrote it. */
export function describeTarget(p: Prescription): string {
  const parts: string[] = [];
  const reps = repsText(p);
  parts.push(reps ? `${p.sets} × ${reps}` : p.durationSec ? `${p.sets} × ${durationText(p.durationSec)}` : `${p.sets} ${p.sets === 1 ? "set" : "sets"}`);
  if (reps && p.durationSec) parts.push(durationText(p.durationSec));
  if (p.loadKg) parts.push(`${p.loadKg} kg`);
  if (p.distanceM) parts.push(`${p.distanceM} m`);
  if (p.restSec) parts.push(`rest ${durationText(p.restSec)}`);
  if (p.rpeTarget) parts.push(`effort ${p.rpeTarget}/10`);
  return parts.join(" · ");
}

/** A set logged with one tap: exactly what was prescribed. */
export function asPrescribed(p: Prescription, setNumber: number): LoggedSet {
  return { setNumber, reps: targetReps(p), loadKg: p.loadKg, durationSec: p.durationSec, distanceM: p.distanceM, skipped: false, asPrescribed: true };
}

/** Does this logged exercise answer this prescription? A substitution answers the exercise it replaced. */
const answers = (e: LoggedExercise, p: Prescription) => (e.substitutionFor ?? e.exerciseId) === p.exerciseId;

export const entryFor = (entries: LoggedExercise[], p: Prescription): LoggedExercise | undefined => entries.find((e) => answers(e, p));

/**
 * Puts the entries in the day’s order with one entry per prescription, drops sets numbered beyond what was prescribed,
 * and keeps one row per set number (the later one wins). The API runs everything it stores through this.
 */
export function normalizeEntries(day: Pick<PlanDay, "prescriptions">, entries: LoggedExercise[]): LoggedExercise[] {
  return inOrder(day).map((p) => {
    const found = entryFor(entries, p);
    const bySet = new Map<number, LoggedSet>();
    for (const s of found?.sets ?? []) if (s.setNumber >= 1 && s.setNumber <= p.sets) bySet.set(s.setNumber, s);
    const sets = [...bySet.values()].sort((a, b) => a.setNumber - b.setNumber);
    return found ? { ...found, sets } : { exerciseId: p.exerciseId, sets };
  });
}

/** The starting point of a workout: every exercise, nothing logged. */
export const emptyEntries = (day: Pick<PlanDay, "prescriptions">): LoggedExercise[] => normalizeEntries(day, []);

const replaceEntry = (entries: LoggedExercise[], p: Prescription, next: (e: LoggedExercise) => LoggedExercise): LoggedExercise[] =>
  entries.map((e) => (answers(e, p) ? next(e) : e));

/** Logs (or corrects) one set. */
export const logSet = (entries: LoggedExercise[], p: Prescription, set: LoggedSet): LoggedExercise[] =>
  replaceEntry(entries, p, (e) => ({ ...e, sets: [...e.sets.filter((s) => s.setNumber !== set.setNumber), set].sort((a, b) => a.setNumber - b.setNumber) }));

/** Marks a set skipped. Skipping is a choice, not a failure, so it is kept and shown calmly. */
export const skipSet = (entries: LoggedExercise[], p: Prescription, setNumber: number): LoggedExercise[] => logSet(entries, p, { setNumber, skipped: true });

/** Takes a set back to “not logged yet”. */
export const clearSet = (entries: LoggedExercise[], p: Prescription, setNumber: number): LoggedExercise[] =>
  replaceEntry(entries, p, (e) => ({ ...e, sets: e.sets.filter((s) => s.setNumber !== setNumber) }));

/**
 * Do a different exercise from the one prescribed (W03). The sets logged for the other exercise are cleared, because
 * they were a different movement. Choosing the prescribed exercise again undoes the swap.
 */
export const substituteExercise = (entries: LoggedExercise[], p: Prescription, exerciseId: string): LoggedExercise[] =>
  replaceEntry(entries, p, () => (exerciseId === p.exerciseId ? { exerciseId: p.exerciseId, sets: [] } : { exerciseId, substitutionFor: p.exerciseId, sets: [] }));

export interface Progress {
  /** Sets the trainer prescribed. */
  total: number;
  done: number;
  skipped: number;
  /** Not logged either way. */
  open: number;
}

const counted = (day: Pick<PlanDay, "prescriptions">): Prescription[] => {
  const main = day.prescriptions.filter((p) => p.section === "main");
  return main.length ? main : day.prescriptions;
};

/** How far through the day the member is. Warm-up and cool-down are logged but don’t change the result, unless they are all there is. */
export function progress(day: Pick<PlanDay, "prescriptions">, entries: LoggedExercise[]): Progress {
  let total = 0, done = 0, skipped = 0;
  for (const p of counted(day)) {
    total += p.sets;
    for (const s of entryFor(entries, p)?.sets ?? []) {
      if (s.setNumber > p.sets) continue;
      if (s.skipped) skipped++;
      else done++;
    }
  }
  return { total, done, skipped, open: total - done - skipped };
}

/**
 * The result of finishing a workout (T05). Completed: every prescribed set was done, whatever the reps and load (10, 10 and
 * 8 against 3 × 10 is completed). Partial: some were done. Skipped: none were.
 */
export function statusFor(p: Progress): Exclude<WorkoutLog["status"], "draft"> {
  if (p.done === 0) return "skipped";
  return p.done >= p.total ? "completed" : "partial";
}

/** Seconds to rest after logging a set, or 0 for none: not after the last set of the workout, and only when the trainer set a rest. */
export function restAfter(p: Pick<Prescription, "restSec">, isLastSetOfWorkout: boolean): number {
  return isLastSetOfWorkout ? 0 : (p.restSec ?? 0);
}

/** Does this entry hold anything the member did? Used to decide whether there is a draft to save. */
export const hasActivity = (entries: LoggedExercise[]): boolean => entries.some((e) => e.sets.length > 0 || e.substitutionFor !== undefined);

/**
 * Why a workout can’t be logged right now, in words for the member, or nothing when it can. A workout opens on its day. One
 * that was started stays open until the next day ends, so a session that runs past midnight can still be saved. A finished
 * workout is final; a trainer corrects it (T05).
 */
export function loggingBlockedReason(args: { date: string; today: string; membershipStatus?: string; logStatus?: WorkoutLog["status"]; hasDraft: boolean }): string | undefined {
  const { date, today, membershipStatus, logStatus, hasDraft } = args;
  if (logStatus && logStatus !== "draft") return "You have already logged this workout. Ask your trainer if something needs correcting.";
  if (!membershipStatus) return "Ask the front desk to set up your membership, then your workouts can be logged.";
  if (membershipStatus === "frozen") return "Your membership is frozen, so workouts are paused. They open again when your freeze ends.";
  if (membershipStatus !== "active") return "Your membership is not active. Renew it to log workouts.";
  if (date > today) return "This workout opens on its day.";
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (date < today && !(hasDraft && date >= yesterday)) return "This day has passed. Ask your trainer to log it for you.";
  return undefined;
}

/** “10 × 20 kg”, “45 s”, or “skipped”. One logged set in words. */
export function describeSet(s: LoggedSet): string {
  if (s.skipped) return "skipped";
  const parts: string[] = [];
  if (s.reps !== undefined) parts.push(s.loadKg ? `${s.reps} × ${s.loadKg} kg` : `${s.reps} reps`);
  else if (s.loadKg) parts.push(`${s.loadKg} kg`);
  if (s.durationSec !== undefined) parts.push(durationText(s.durationSec));
  if (s.distanceM !== undefined) parts.push(`${s.distanceM} m`);
  return parts.join(" · ") || "done";
}

/** The sets of one exercise in words, in order: “10 × 20 kg, 10 × 20 kg, 8 × 20 kg”. */
export const describeLogged = (e: Pick<LoggedExercise, "sets">): string => e.sets.map(describeSet).join(", ");
