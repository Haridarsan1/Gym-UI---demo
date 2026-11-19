import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { ApiError } from "@/api/errors";
import { openMember, type MemberContext } from "@/api/member";
import { awardBadges } from "@/api/workoutSummary";
import { recordTargetsReached } from "@/api/goals";
import { effectiveMeasurements } from "@/domain/progress";
import { daysBetween, eachDay, weekStart, addDays } from "@/domain/dates";
import { currentMembership } from "@/domain/membership";
import { estimateMinutes, planFor, scheduledBetween } from "@/domain/metrics";
import { LoggedExercise as LoggedExerciseSchema, type LoggedExercise, type Exercise, type Prescription, type WorkoutLog, type WorkoutPlanVersion } from "@/domain/types";
import { coachLoggingBlockedReason, hasActivity, inOrder, lastTimeFor, loggingBlockedReason, normalizeEntries, progress, statusFor, type LastTime, type Progress } from "@/domain/workout";
import type { Session } from "@/app/session";

/**
 * The workout screens read and write through this file: the plan for a day, the draft being logged, and the final log.
 * Everything is the signed-in member’s own. A member can’t read or write another member’s workout.
 */

export interface ExerciseInfo {
  id: string;
  name: string;
  category: Exercise["category"];
  muscleGroups: string[];
  equipment: string[];
  instructions: string;
}

export interface WorkoutExercise {
  prescription: Prescription;
  exercise: ExerciseInfo;
  /** Swaps the trainer or the library suggests for this exercise (W01). */
  alternatives: ExerciseInfo[];
  /** The last set the member did for this exercise in an earlier workout, used to pre-fill and to show “Last time”. */
  last?: LastTime;
}

export interface WorkoutView {
  date: string;
  today: string;
  title: string;
  weekNumber: number;
  versionNumber: number;
  versionName: string;
  startedOn: string;
  authorName: string;
  minutes: number;
  exercises: WorkoutExercise[];
  /** "none" until something is saved. */
  status: "none" | WorkoutLog["status"];
  /** One entry per prescription, in order, with what was logged. */
  entries: LoggedExercise[];
  /** The key this workout’s saves and its final submit carry, so a retry never makes a second log. */
  idempotencyKey: string;
  effort?: number;
  notes?: string;
  recovery?: number;
  /** Set when the workout can’t be logged now, in words for the member. Previewing is still fine. */
  blockedReason?: string;
}

const info = (e: Exercise): ExerciseInfo => ({ id: e.id, name: e.name, category: e.category, muscleGroups: e.muscleGroups, equipment: e.equipment, instructions: e.instructions });

const newKey = () => `wk-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export interface DayContext {
  c: MemberContext;
  /** Who is logging: the member, or their trainer for them (T05). */
  actor: "member" | "trainer";
  version: WorkoutPlanVersion;
  day: WorkoutPlanVersion["days"][number];
  log?: WorkoutLog;
  logs: WorkoutLog[];
  membershipStatus?: string;
}

/** Opens a call for one workout day: checks the member may read their plan, and finds the plan, the log and the membership. */
async function loadDay(session: Session | null, date: string, access: "read" | "write"): Promise<DayContext> {
  const c = await openMember(session);
  assertCan(c.principal, "workoutplan.read", c.resource);
  assertCan(c.principal, access === "write" ? "workoutlog.write" : "workoutlog.read", c.resource);
  return dayFor(c, date, "member");
}

/** Finds the plan, the log and the membership for one day. The caller has already checked who may see it. */
export async function dayFor(c: MemberContext, date: string, actor: DayContext["actor"]): Promise<DayContext> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("invalid", "That isn’t a valid workout date.");
  const [versions, logs, memberships] = await Promise.all([
    db.workoutPlanVersions.where("memberId").equals(c.memberId).filter((v) => v.status === "published").toArray(),
    db.workoutLogs.where("memberId").equals(c.memberId).toArray(),
    db.memberships.where("memberId").equals(c.memberId).toArray(),
  ]);
  const p = planFor(versions.filter((v) => v.status === "published"), date);
  if (p.state !== "workout") throw new ApiError("not_found", "There is no workout planned for this day. Rest days are part of the plan.");
  return { c, actor, version: p.version, day: p.day, log: logs.find((l) => l.scheduledOn === date), logs, membershipStatus: currentMembership(memberships)?.status };
}

async function exercisesFor(ids: string[]): Promise<Map<string, Exercise>> {
  const rows = await db.exercises.bulkGet([...new Set(ids)]);
  return new Map(rows.filter((r): r is Exercise => !!r).map((r) => [r.id, r]));
}

/** The workout for one day, as the trainer prescribed it, with whatever the member has logged. Used to preview and to log. */
export async function getWorkout(session: Session | null, date: string): Promise<WorkoutView> {
  return viewDay(await loadDay(session, date, "read"), date);
}

/** Why this day can’t be logged now, for whoever is logging it. */
export const blockedFor = (d: DayContext, date: string, hasDraft: boolean, logStatus = d.log?.status): string | undefined => {
  const args = { date, today: d.c.today, membershipStatus: d.membershipStatus, logStatus, hasDraft };
  return d.actor === "trainer" ? coachLoggingBlockedReason(args) : loggingBlockedReason(args);
};

export async function viewDay(d: DayContext, date: string): Promise<WorkoutView> {
  const { c, version, day, log, logs } = d;
  const prescriptions = inOrder(day);
  const first = await exercisesFor(prescriptions.map((p) => p.exerciseId));
  const swaps = await exercisesFor([...prescriptions.flatMap((p) => first.get(p.exerciseId)?.substitutionIds ?? []), ...(log?.entries.map((e) => e.exerciseId) ?? [])]);
  const author = await db.users.get(version.authorId);
  const lookup = (id: string) => first.get(id) ?? swaps.get(id);
  return {
    date, today: c.today, title: day.title, weekNumber: Math.floor(daysBetween(version.startsOn, date) / 7) + 1, versionNumber: version.versionNumber, versionName: version.name,
    startedOn: version.startsOn, authorName: author?.name ?? "Your trainer", minutes: estimateMinutes(day),
    exercises: prescriptions.flatMap((p) => {
      const exercise = lookup(p.exerciseId);
      if (!exercise) return [];
      const alternatives = exercise.substitutionIds.map(lookup).filter((e): e is Exercise => !!e && !e.archived).map(info);
      // An exercise the member swapped to stays selectable, even if the library doesn’t list it as an alternative.
      const used = log?.entries.find((e) => e.substitutionFor === p.exerciseId);
      const usedInfo = used && lookup(used.exerciseId);
      if (usedInfo && !alternatives.some((a) => a.id === usedInfo.id)) alternatives.push(info(usedInfo));
      return [{ prescription: p, exercise: info(exercise), alternatives, last: lastTimeFor(logs, p.exerciseId, date) }];
    }),
    status: log?.status ?? "none",
    entries: normalizeEntries(day, log?.entries ?? []),
    idempotencyKey: log?.idempotencyKey ?? newKey(),
    effort: log?.effort, notes: log?.notes, recovery: log?.feedback?.recovery,
    blockedReason: blockedFor(d, date, log?.status === "draft"),
  };
}

export const DraftInputSchema = z.object({ date: z.string(), entries: z.array(LoggedExerciseSchema).max(60), idempotencyKey: z.string().min(8) });
export const SubmitInputSchema = DraftInputSchema.extend({
  effort: z.number().int().min(1).max(10).optional(),
  recovery: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(1000).optional(),
});
export type DraftInput = z.input<typeof DraftInputSchema>;
export type SubmitInput = z.input<typeof SubmitInputSchema>;

export const parse = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError("invalid", "We couldn’t read that workout. Reload the page and try again.");
  return r.data;
};

function newLog(d: DayContext, date: string, input: { entries: WorkoutLog["entries"]; idempotencyKey: string }, status: WorkoutLog["status"]): WorkoutLog {
  const at = d.c.nowIso;
  return {
    id: `wl_${d.c.memberId}_${date}`, tenantId: d.c.tenantId, memberId: d.c.memberId, planVersionId: d.version.id, weekIndex: d.day.weekIndex, dayIndex: d.day.dayIndex, scheduledOn: date,
    status, startedAt: at, entries: input.entries, enteredBy: d.c.principal.userId, enteredByRole: d.actor, corrections: [], idempotencyKey: input.idempotencyKey,
  };
}

/**
 * Saves a workout in progress (W03). Safe to call over and over, and from two tabs: there is one draft per member and day,
 * and a save that arrives after the workout was submitted is ignored.
 */
export async function saveWorkoutDraft(session: Session | null, raw: DraftInput): Promise<{ status: WorkoutLog["status"] | "none" }> {
  const input = parse(DraftInputSchema, raw);
  return saveDraftFor(await loadDay(session, input.date, "write"), input);
}

export async function saveDraftFor(d: DayContext, input: z.output<typeof DraftInputSchema>): Promise<{ status: WorkoutLog["status"] | "none" }> {
  return db.transaction("rw", db.workoutLogs, async () => {
    const existing = await db.workoutLogs.where("memberId").equals(d.c.memberId).and((l) => l.scheduledOn === input.date).first();
    if (existing && existing.status !== "draft") return { status: existing.status };
    const blocked = blockedFor(d, input.date, !!existing, existing?.status);
    if (blocked) throw new ApiError("forbidden", blocked);
    const entries = normalizeEntries(d.day, input.entries);
    if (!existing && !hasActivity(entries)) return { status: "none" as const };
    if (existing) await db.workoutLogs.update(existing.id, { entries });
    else {
      if (await db.workoutLogs.where("idempotencyKey").equals(input.idempotencyKey).first()) throw new ApiError("conflict", "That workout was already saved. Reload the page.");
      await db.workoutLogs.add(newLog(d, input.date, { entries, idempotencyKey: input.idempotencyKey }, "draft"));
    }
    return { status: "draft" as const };
  });
}

export interface SubmitResult {
  logId: string;
  date: string;
  status: Exclude<WorkoutLog["status"], "draft">;
  progress: Progress;
  /** True when this call repeated one that had already gone through. */
  repeated: boolean;
}

/**
 * Finishes a workout as completed, partial or skipped, worked out from the sets (T05). Sending the same key again returns
 * the log that already exists, so a retry after a dropped connection never makes a second one.
 */
export async function submitWorkout(session: Session | null, raw: SubmitInput): Promise<SubmitResult> {
  const input = parse(SubmitInputSchema, raw);
  return submitFor(await loadDay(session, input.date, "write"), input);
}

export async function submitFor(d: DayContext, input: z.output<typeof SubmitInputSchema>): Promise<SubmitResult> {
  return db.transaction("rw", [db.workoutLogs, db.badgeAwards, db.workoutPlanVersions, db.memberships, db.goals, db.checkIns, db.gymPolicies, db.measurements], async () => {
    const byKey = await db.workoutLogs.where("idempotencyKey").equals(input.idempotencyKey).first();
    if (byKey && byKey.memberId !== d.c.memberId) throw new ApiError("conflict", "That workout could not be saved. Reload the page and try again.");
    if (byKey && byKey.status !== "draft") return { logId: byKey.id, date: byKey.scheduledOn, status: byKey.status, progress: progress(d.day, byKey.entries), repeated: true };

    const existing = await db.workoutLogs.where("memberId").equals(d.c.memberId).and((l) => l.scheduledOn === input.date).first();
    const blocked = blockedFor(d, input.date, !!existing, existing?.status);
    if (blocked) throw new ApiError(existing && existing.status !== "draft" ? "conflict" : "forbidden", blocked);

    const entries = normalizeEntries(d.day, input.entries);
    const p = progress(d.day, entries);
    const status = statusFor(p);
    const done = {
      status, entries, completedAt: d.c.nowIso, effort: input.effort, notes: input.notes?.trim() || undefined,
      feedback: input.recovery ? { recovery: input.recovery } : undefined, idempotencyKey: input.idempotencyKey,
      // Whoever finishes a log is its author: a coach who finishes a draft the member started takes it over, and says so.
      enteredBy: d.c.principal.userId, enteredByRole: d.actor,
    };
    let logId: string;
    if (existing) {
      await db.workoutLogs.update(existing.id, done);
      logId = existing.id;
    } else {
      const log: WorkoutLog = { ...newLog(d, input.date, { entries, idempotencyKey: input.idempotencyKey }, status), ...done };
      await db.workoutLogs.add(log);
      logId = log.id;
    }
    const saved = (await db.workoutLogs.get(logId))!;
    await awardBadges({ memberId: d.c.memberId, tenantId: d.c.tenantId, today: d.c.today, nowIso: d.c.nowIso, log: saved });
    // A workout can reach a strength or sessions goal. The goal stays Active; the note is what the celebration reads.
    if (status !== "skipped") {
      const [allLogs, rows] = await Promise.all([db.workoutLogs.where("memberId").equals(d.c.memberId).toArray(), db.measurements.where("memberId").equals(d.c.memberId).toArray()]);
      await recordTargetsReached({
        memberId: d.c.memberId, userId: d.c.principal.userId, nowIso: d.c.nowIso, today: d.c.today, readings: effectiveMeasurements(rows.filter((m) => m.kind !== "progress_photo")), logs: allLogs,
        describe: (g, current) => `with ${current} ${g.unit} in a workout.`,
      });
    }
    return { logId, date: input.date, status, progress: p, repeated: false };
  });
}

// ── The program path (T03, T06) ───────────────────────────────────────────────────────────────────

export type ProgramDayState = "done" | "partial" | "skipped" | "missed" | "today" | "upcoming" | "rest";

export interface ProgramDay {
  date: string;
  state: ProgramDayState;
  title?: string;
  exerciseCount?: number;
  minutes?: number;
  /** Which version of the plan set this day’s workout. */
  versionNumber?: number;
}

export interface ProgramWeek {
  weekStart: string;
  /** Week of the plan version that governs it, counted from that version’s start. */
  weekNumber: number;
  versionNumber: number;
  versionName: string;
  isCurrent: boolean;
  workouts: number;
  done: number;
  days: ProgramDay[];
}

export interface ProgramData {
  today: string;
  current?: { name: string; versionNumber: number; startedOn: string; authorName: string; notes?: string };
  /** Versions that came before the current one. Their workouts and logs are kept as they were (T06). */
  earlier: Array<{ name: string; versionNumber: number; startedOn: string; endedOn: string; authorName: string }>;
  weeks: ProgramWeek[];
}

/** The member’s plan as weeks of days, from the first published version to the last scheduled workout, with how each day went. */
export async function getProgram(session: Session | null): Promise<ProgramData> {
  const c = await openMember(session);
  assertCan(c.principal, "workoutplan.read", c.resource);
  assertCan(c.principal, "workoutlog.read", c.resource);
  const [allVersions, logs, users] = await Promise.all([
    db.workoutPlanVersions.where("memberId").equals(c.memberId).filter((v) => v.status === "published").toArray(),
    db.workoutLogs.where("memberId").equals(c.memberId).toArray(),
    db.users.where("tenantId").equals(c.tenantId).toArray(),
  ]);
  const versions = allVersions.filter((v) => v.status === "published").sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  if (!versions.length) return { today: c.today, earlier: [], weeks: [] };
  const author = (v: WorkoutPlanVersion) => users.find((u) => u.id === v.authorId)?.name ?? "Your trainer";
  const governing = planFor(versions, c.today);
  const currentVersion = governing.state === "no_plan" ? versions[0]! : governing.state === "rest" ? governing.version : governing.version;
  const lastDay = (v: WorkoutPlanVersion) => addDays(v.startsOn, Math.max(0, ...v.days.map((d) => d.dayOffset)));

  const first = weekStart(versions[0]!.startsOn);
  const last = weekStart([lastDay(versions.at(-1)!), c.today].sort().at(-1)!);
  const finalByDate = new Map(logs.filter((l) => l.status !== "draft").map((l) => [l.scheduledOn, l]));
  const weeks: ProgramWeek[] = [];
  for (let monday = first; monday <= last; monday = addDays(monday, 7)) {
    const scheduled = new Map(scheduledBetween(versions, monday, addDays(monday, 6)).map((s) => [s.date, s]));
    const isCurrent = monday === weekStart(c.today);
    if (!scheduled.size && !isCurrent) continue;
    const days: ProgramDay[] = eachDay(monday, addDays(monday, 6)).map((date) => {
      const s = scheduled.get(date);
      if (!s) return { date, state: "rest" };
      const log = finalByDate.get(date);
      const state: ProgramDayState = log ? (log.status === "completed" ? "done" : log.status === "partial" ? "partial" : "skipped") : date === c.today ? "today" : date > c.today ? "upcoming" : "missed";
      return { date, state, title: s.day.title, exerciseCount: s.day.prescriptions.filter((p) => p.section === "main").length, minutes: estimateMinutes(s.day), versionNumber: s.version.versionNumber };
    });
    const anchor = [...scheduled.values()][0]?.version ?? currentVersion;
    weeks.push({
      weekStart: monday, versionNumber: anchor.versionNumber, versionName: anchor.name, isCurrent,
      weekNumber: Math.max(1, Math.floor(daysBetween(weekStart(anchor.startsOn), monday) / 7) + 1),
      workouts: scheduled.size, done: days.filter((d) => d.state === "done").length, days,
    });
  }
  return {
    today: c.today,
    current: { name: currentVersion.name, versionNumber: currentVersion.versionNumber, startedOn: currentVersion.startsOn, authorName: author(currentVersion), notes: currentVersion.notes },
    earlier: versions.filter((v) => v.versionNumber < currentVersion.versionNumber).map((v) => {
      const next = versions.find((x) => x.versionNumber === v.versionNumber + 1);
      return { name: v.name, versionNumber: v.versionNumber, startedOn: v.startsOn, endedOn: next ? addDays(next.startsOn, -1) : lastDay(v), authorName: author(v) };
    }),
    weeks,
  };
}
