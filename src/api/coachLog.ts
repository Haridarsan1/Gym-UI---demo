import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { openTrainer } from "@/api/trainer";
import type { MemberContext } from "@/api/member";
import { awardBadges } from "@/api/workoutSummary";
import { recordTargetsReached } from "@/api/goals";
import { dayFor, DraftInputSchema, parse, saveDraftFor, submitFor, SubmitInputSchema, viewDay, type SubmitResult, type WorkoutView } from "@/api/workout";
import { buildAuditEvent } from "@/domain/audit";
import { addDays } from "@/domain/dates";
import { assignmentOn, currentMembership } from "@/domain/membership";
import { effectiveMeasurements } from "@/domain/progress";
import { scheduledBetween } from "@/domain/metrics";
import { LoggedExercise as LoggedExerciseSchema, type WorkoutLog } from "@/domain/types";
import { describeLogged, normalizeEntries, progress, statusFor } from "@/domain/workout";
import type { Session } from "@/app/session";

/**
 * Coach-led logging (T05): a trainer logs a session for a client who was coached in person, or who could not log it
 * themselves. It is the member’s own logging (the same pre-fill rules, the same set rows, the same final submit with an
 * idempotency key) done by the assigned trainer, and every entry says who entered it. A finished log is never overwritten:
 * a correction keeps what it said before, and writes an audit event.
 */

export const CORRECTION_NEEDS_REASON = "Say why you are correcting this log. The reason is kept with it.";

/** What a coach-led day needs: who the client is, and whether this trainer may log for them today. */
async function openCoachDay(session: Session | null, memberId: string, date: string) {
  const t = await openTrainer(session);
  const [assignments, member, memberships] = await Promise.all([
    db.trainerAssignments.where("memberId").equals(memberId).toArray(),
    db.members.get(memberId),
    db.memberships.where("memberId").equals(memberId).toArray(),
  ]);
  const mine = assignmentOn(assignments, t.today);
  // A client who is not this trainer’s is “not found”, so their existence is not revealed.
  if (!member || member.tenantId !== t.tenantId || mine?.trainerId !== t.trainerId || member.archivedAt) throw new ApiError("not_found", "We couldn’t find this client. They may have moved to another trainer.");
  const resource = { tenantId: t.tenantId, memberId, assignedTrainerId: t.trainerId };
  assertCan(t.principal, "workoutlog.write", resource);
  assertCan(t.principal, "workoutplan.read", resource);
  const c: MemberContext = { principal: t.principal, memberId, tenantId: t.tenantId, resource, today: t.today, nowIso: t.nowIso };
  const d = await dayFor(c, date, "trainer");
  // The membership the log is judged against is the client’s current one.
  d.membershipStatus = currentMembership(memberships)?.status;
  return { t, member, d };
}

export interface CorrectionView {
  at: string;
  byName: string;
  reason: string;
  /** What the log said before this correction, in words per exercise. */
  before: { status: "completed" | "partial" | "skipped"; lines: Array<{ name: string; sets: string }>; enteredByName: string; enteredByRole: "member" | "trainer" };
}

export interface CoachWorkoutView extends WorkoutView {
  client: { memberId: string; name: string; firstName: string };
  coachName: string;
  /** Who entered the log as it stands: the member, or a trainer. Absent until something is saved. */
  enteredBy?: { name: string; role: "member" | "trainer"; label: string };
  finished: boolean;
  corrections: CorrectionView[];
  /** The first thing recorded, before any correction. Set only after a correction. */
  original?: CorrectionView["before"];
}

const label = (name: string, role: "member" | "trainer") => (role === "trainer" ? `Entered by Coach ${name.split(" ")[0]}` : "Entered by the member");

/** The workout for one client and day, ready for the trainer to log: the same view the member gets, plus who entered it. */
export async function getCoachWorkout(session: Session | null, memberId: string, date: string): Promise<CoachWorkoutView> {
  const { t, member, d } = await openCoachDay(session, memberId, date);
  const [view, users, exercises] = await Promise.all([viewDay(d, date), db.users.where("tenantId").equals(t.tenantId).toArray(), db.exercises.toArray()]);
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? "A trainer";
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? "Exercise";
  const log = d.log;
  const before = (c: NonNullable<WorkoutLog["corrections"][number]["previous"]>): CorrectionView["before"] => ({
    status: c.status, enteredByRole: c.enteredByRole, enteredByName: c.enteredByRole === "trainer" ? name(c.enteredBy) : "The member",
    lines: c.entries.filter((e) => e.sets.length).map((e) => ({ name: exName(e.exerciseId), sets: describeLogged(e) })),
  });
  const corrections: CorrectionView[] = (log?.corrections ?? []).flatMap((c) => (c.previous ? [{ at: c.at, byName: name(c.by), reason: c.note, before: before(c.previous) }] : []));
  const enteredByName = log ? (log.enteredByRole === "trainer" ? name(log.enteredBy) : member.name) : undefined;
  return {
    ...view,
    client: { memberId, name: member.name, firstName: member.name.split(" ")[0] ?? member.name },
    coachName: name(t.trainerId),
    enteredBy: log && enteredByName ? { name: enteredByName, role: log.enteredByRole, label: label(enteredByName, log.enteredByRole) } : undefined,
    finished: !!log && log.status !== "draft",
    corrections,
    original: corrections[0]?.before,
  };
}

/** One row of “which day are you logging?”: the client’s recent scheduled days and how each stands. */
export interface CoachDay {
  date: string;
  title: string;
  status: "none" | WorkoutLog["status"];
  enteredByLabel?: string;
  corrected: boolean;
  isToday: boolean;
}

/** The client’s scheduled days from two weeks ago to today, newest first, so a missed or coached day can be logged. */
export async function getCoachDays(session: Session | null, memberId: string): Promise<{ client: { memberId: string; name: string }; days: CoachDay[]; today: string }> {
  const t = await openTrainer(session);
  const [assignments, member, versions, logs, users] = await Promise.all([
    db.trainerAssignments.where("memberId").equals(memberId).toArray(),
    db.members.get(memberId),
    db.workoutPlanVersions.where("memberId").equals(memberId).filter((v) => v.status === "published").toArray(),
    db.workoutLogs.where("memberId").equals(memberId).toArray(),
    db.users.where("tenantId").equals(t.tenantId).toArray(),
  ]);
  if (!member || member.tenantId !== t.tenantId || assignmentOn(assignments, t.today)?.trainerId !== t.trainerId) throw new ApiError("not_found", "We couldn’t find this client. They may have moved to another trainer.");
  assertCan(t.principal, "workoutlog.read", { tenantId: t.tenantId, memberId, assignedTrainerId: t.trainerId });
  const days = scheduledBetween(versions, addDays(t.today, -14), t.today).map((s): CoachDay => {
    const log = logs.find((l) => l.scheduledOn === s.date);
    const by = log && (log.enteredByRole === "trainer" ? label(users.find((u) => u.id === log.enteredBy)?.name ?? "A trainer", "trainer") : label(member.name, "member"));
    return { date: s.date, title: s.day.title, status: log?.status ?? "none", enteredByLabel: by, corrected: (log?.corrections.length ?? 0) > 0, isToday: s.date === t.today };
  });
  return { client: { memberId, name: member.name }, days: days.sort((a, b) => b.date.localeCompare(a.date)), today: t.today };
}

const CoachDraft = DraftInputSchema.extend({ memberId: z.string().min(1) });
const CoachSubmit = SubmitInputSchema.extend({ memberId: z.string().min(1) });
export type CoachDraftInput = z.input<typeof CoachDraft>;
export type CoachSubmitInput = z.input<typeof CoachSubmit>;

/** Saves a coached session in progress. One draft per client and day, whoever is typing, so saving again never makes a second. */
export async function saveCoachDraft(session: Session | null, raw: CoachDraftInput): Promise<{ status: WorkoutLog["status"] | "none" }> {
  const input = parse(CoachDraft, raw);
  const { d } = await openCoachDay(session, input.memberId, input.date);
  return saveDraftFor(d, input);
}

/** Finishes a coached session. Sending the same key again returns the log that already exists. */
export async function submitCoachWorkout(session: Session | null, raw: CoachSubmitInput): Promise<SubmitResult> {
  const input = parse(CoachSubmit, raw);
  const { d } = await openCoachDay(session, input.memberId, input.date);
  return submitFor(d, input);
}

const Correction = z.object({
  memberId: z.string().min(1),
  date: z.string(),
  entries: z.array(LoggedExerciseSchema).max(60),
  effort: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
  reason: z.string().max(500),
  /** One per correction the person confirms, so a double tap or a retry writes it once. */
  key: z.string().min(8),
});
export type CorrectionInput = z.input<typeof Correction>;

/**
 * Changes a finished log (T05). The log keeps its author and its first entries: the version before this change is stored in
 * the log’s correction list, with the reason, and an audit event is written. Sending the same key again changes nothing.
 */
export async function correctWorkout(session: Session | null, raw: CorrectionInput): Promise<{ logId: string; status: Exclude<WorkoutLog["status"], "draft">; repeated: boolean }> {
  const input = parse(Correction, raw);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new ApiError("invalid", CORRECTION_NEEDS_REASON);
  const { t, d } = await openCoachDay(session, input.memberId, input.date);
  return db.transaction("rw", [db.workoutLogs, db.auditEvents, db.badgeAwards, db.goals, db.memberships, db.checkIns, db.gymPolicies, db.measurements, db.workoutPlanVersions], async () => {
    const log = await db.workoutLogs.where("memberId").equals(input.memberId).and((l) => l.scheduledOn === input.date).first();
    if (!log || log.status === "draft") throw new ApiError("conflict", "Only a finished workout can be corrected.");
    if (log.corrections.some((c) => c.key === input.key)) return { logId: log.id, status: log.status as Exclude<WorkoutLog["status"], "draft">, repeated: true };
    const entries = normalizeEntries(d.day, input.entries);
    const status = statusFor(progress(d.day, entries));
    const next: Partial<WorkoutLog> = {
      entries, status, effort: input.effort ?? log.effort, notes: input.notes !== undefined ? input.notes.trim() || undefined : log.notes,
      corrections: [...log.corrections, { at: t.nowIso, by: t.trainerId, note: reason, key: input.key, previous: { status: log.status as Exclude<WorkoutLog["status"], "draft">, entries: log.entries, effort: log.effort, notes: log.notes, enteredBy: log.enteredBy, enteredByRole: log.enteredByRole } }],
    };
    await db.workoutLogs.update(log.id, next);
    await db.auditEvents.add(buildAuditEvent(t.principal, { action: "workout.correct", reason, entityType: "workout_log", entityId: log.id, memberId: input.memberId, details: { date: input.date, from: log.status, to: status, corrections: log.corrections.length + 1 } }, `ae_${crypto.randomUUID()}`, now()));
    const saved = (await db.workoutLogs.get(log.id))!;
    if (status !== "skipped") {
      await awardBadges({ memberId: input.memberId, tenantId: t.tenantId, today: t.today, nowIso: t.nowIso, log: saved });
      const [allLogs, rows] = await Promise.all([db.workoutLogs.where("memberId").equals(input.memberId).toArray(), db.measurements.where("memberId").equals(input.memberId).toArray()]);
      await recordTargetsReached({ memberId: input.memberId, userId: t.trainerId, nowIso: t.nowIso, today: t.today, readings: effectiveMeasurements(rows.filter((m) => m.kind !== "progress_photo")), logs: allLogs, describe: (g, current) => `with ${current} ${g.unit} in a corrected workout.` });
    }
    return { logId: log.id, status: status as Exclude<WorkoutLog["status"], "draft">, repeated: false };
  });
}
