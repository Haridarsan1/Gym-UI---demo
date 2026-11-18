import { z } from "zod";
import { db } from "@/demo/db";
import { writeAudit } from "@/demo";
import { assertCan } from "@/api/context";
import { now } from "@/api/clock";
import { ApiError, isApiError } from "@/api/errors";
import { loadBook } from "@/api/book";
import { viewSensitive } from "@/api/sensitive";
import { openTrainer } from "@/api/trainer";
import { currentFor } from "@/api/goals";
import { goalProgress } from "@/domain/progress";
import { metricInfo } from "@/domain/goals";
import { Assessment, Experience } from "@/domain/types";
import type { ProfileGoal } from "@/api/clients";
import type { Goal } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Assessment and goals (T02, P01, P04) for the assigned trainer. The assessment is health information, so every read goes
 * through `viewSensitive` (permission, consent, audit). Goals are not: the trainer always sees them.
 */

export type AssessmentState = "none" | "recorded" | "consent_withdrawn" | "no_consent";

export interface AssessmentRecord extends Omit<Assessment, "tenantId" | "recordedBy"> {
  recordedByName: string;
}

export interface AssessmentView {
  memberId: string;
  memberName: string;
  firstName: string;
  state: AssessmentState;
  /** When consent was withdrawn, for “Withdrawn on …”. */
  consentChangedOn?: string;
  /** Newest first. Empty unless state is “recorded” or “none” with consent. */
  assessments: AssessmentRecord[];
  goals: ProfileGoal[];
  /** The gym’s default days between reviews, offered when a goal is created. */
  defaultCadenceDays: number;
  /** Where each metric stands now, to prefill a goal’s starting point. */
  readings: Record<string, number>;
  today: string;
}

const goalViews = async (goals: Goal[], memberId: string, today: string): Promise<{ goals: ProfileGoal[]; readings: Record<string, number> }> => {
  const [measurements, logs] = await Promise.all([db.measurements.where("memberId").equals(memberId).toArray(), db.workoutLogs.where("memberId").equals(memberId).toArray()]);
  const finished = logs.filter((l) => l.status !== "draft");
  const readings: Record<string, number> = {};
  for (const m of ["weight", "waist", "body_fat", "bench_press", "squat", "deadlift", "overhead_press", "sessions_per_week"]) {
    const v = currentFor(m, measurements, finished, today);
    if (v !== undefined) readings[m] = v;
  }
  const out = goals.map((g) => {
    const now = currentFor(g.metric, measurements, finished, today);
    const pr = goalProgress(g, now);
    return { id: g.id, title: g.title, status: g.status, unit: g.unit, baseline: g.baseline, target: g.target, current: now, fraction: pr.fraction, targetReached: pr.reached, targetDate: g.targetDate, reviewEveryDays: g.reviewEveryDays } satisfies ProfileGoal;
  });
  out.sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.targetDate.localeCompare(b.targetDate));
  return { goals: out, readings };
};

/** The client’s assessments and goals. Says why an assessment can’t be shown rather than failing. */
export async function getAssessment(session: Session | null, memberId: string): Promise<AssessmentView> {
  const c = await openTrainer(session);
  const book = await loadBook(c);
  const k = book.clients.find((x) => x.member.id === memberId);
  if (!k) throw new ApiError("not_found", "We couldn’t find this client. They may have moved to another trainer.");
  const [all, users, goalInfo] = await Promise.all([
    db.assessments.where("memberId").equals(memberId).toArray(),
    db.users.where("tenantId").equals(c.tenantId).toArray(),
    goalViews(k.goals, memberId, c.today),
  ]);
  const base = { memberId, memberName: k.member.name, firstName: k.member.name.split(" ")[0]!, defaultCadenceDays: book.rules.reviewCadenceDays, today: c.today, ...goalInfo };
  const newest = [...all].sort((a, b) => b.recordedOn.localeCompare(a.recordedOn) || b.createdAt.localeCompare(a.createdAt));
  try {
    // One audited view of the newest record (or of the member’s file when there is none yet).
    await viewSensitive(session, { kind: "assessment", memberId, entityId: newest[0]?.id ?? `as_${memberId}_none` });
  } catch (e) {
    if (isApiError(e) && e.code === "forbidden" && (e.details as { reason?: string } | undefined)?.reason) {
      const d = e.details as { reason: "none" | "withdrawn"; on?: string };
      return { ...base, state: d.reason === "withdrawn" ? "consent_withdrawn" : "no_consent", consentChangedOn: d.on, assessments: [] };
    }
    throw e;
  }
  const name = new Map(users.map((u) => [u.id, u.name]));
  const records = newest.map(({ tenantId: _t, recordedBy, ...rest }) => ({ ...rest, recordedByName: name.get(recordedBy) ?? "A trainer" }));
  return { ...base, state: records.length ? "recorded" : "none", assessments: records };
}

export const AssessmentInput = z.object({
  memberId: z.string().min(1),
  experience: Experience,
  yearsTraining: z.number().min(0, "Years can’t be negative.").max(80, "That’s more years than we can record.").optional(),
  availability: z.object({ days: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one day."), time: z.enum(["morning", "midday", "evening", "any"]) }),
  preferences: z.string().max(1000, "Keep preferences under 1,000 characters."),
  restrictions: z.string().max(1000, "Keep restrictions under 1,000 characters."),
  baseline: z.object({
    weightKg: z.number().positive("Weight must be above zero.").max(400).optional(),
    bodyFatPct: z.number().min(2, "Body fat looks too low.").max(70, "Body fat looks too high.").optional(),
    waistCm: z.number().positive("Waist must be above zero.").max(300).optional(),
    restingHr: z.number().int().min(30, "Resting heart rate looks too low.").max(220, "Resting heart rate looks too high.").optional(),
  }),
});
export type AssessmentInput = z.infer<typeof AssessmentInput>;

/** Records a new assessment. Refused without the member’s consent, and the history of earlier ones is kept. */
export async function saveAssessment(session: Session | null, raw: AssessmentInput): Promise<AssessmentRecord> {
  const parsed = AssessmentInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the assessment and try again.");
  const input = parsed.data;
  const c = await openTrainer(session);
  assertCan(c.principal, "assessment.write", { tenantId: c.tenantId, memberId: input.memberId, assignedTrainerId: c.trainerId });
  const book = await loadBook(c);
  const k = book.clients.find((x) => x.member.id === input.memberId);
  if (!k) throw new ApiError("not_found", "We couldn’t find this client. They may have moved to another trainer.");
  const consents = await db.consents.where("memberId").equals(input.memberId).toArray();
  const latest = consents.filter((x) => x.scope === "assessments").sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))[0];
  if (!latest) throw new ApiError("forbidden", "This member hasn’t agreed to assessments. Ask them to turn it on in their profile.", { reason: "none" });
  if (latest.withdrawnAt) throw new ApiError("forbidden", "Assessment consent withdrawn. A new assessment can’t be recorded.", { reason: "withdrawn" });

  const clock = now();
  const row: Assessment = { id: `as_${crypto.randomUUID()}`, tenantId: c.tenantId, memberId: input.memberId, recordedBy: c.trainerId, recordedOn: c.today, createdAt: clock.toISOString(), experience: input.experience, yearsTraining: input.yearsTraining, availability: input.availability, preferences: input.preferences.trim(), restrictions: input.restrictions.trim(), baseline: input.baseline };
  await db.transaction("rw", [db.assessments, db.auditEvents], async () => {
    await db.assessments.add(row);
    await writeAudit(c.principal, { action: "record.edit", entityType: "assessment", entityId: row.id, memberId: row.memberId, details: { recorded: true } });
  });
  const me = await db.users.get(c.trainerId);
  const { tenantId: _t, recordedBy: _r, ...rest } = row;
  return { ...rest, recordedByName: me?.name ?? "You" };
}

// ── Goals (T02, P04) ────────────────────────────────────────────────────────────────────────────

const GoalFields = z.object({
  title: z.string().trim().min(1, "Give the goal a name.").max(120),
  metric: z.string().refine((m) => !!metricInfo(m), "Choose what the goal measures."),
  baseline: z.number().optional(),
  target: z.number({ message: "Enter a target." }),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a target date."),
  reviewEveryDays: z.number().int().min(7, "Review at least every 180 days and at most weekly.").max(180, "Review at least every 180 days and at most weekly."),
});
export type GoalInput = z.infer<typeof GoalFields> & { memberId: string };

async function clientFor(session: Session | null, memberId: string) {
  const c = await openTrainer(session);
  assertCan(c.principal, "goal.write", { tenantId: c.tenantId, memberId, assignedTrainerId: c.trainerId });
  const book = await loadBook(c);
  const k = book.clients.find((x) => x.member.id === memberId);
  if (!k) throw new ApiError("not_found", "We couldn’t find this client. They may have moved to another trainer.");
  return { c, k };
}

/** Sets a new goal with a target date and a review cadence. */
export async function createGoal(session: Session | null, input: GoalInput): Promise<string> {
  const parsed = GoalFields.safeParse(input);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the goal and try again.");
  const { c } = await clientFor(session, input.memberId);
  if (parsed.data.targetDate <= c.today) throw new ApiError("invalid", "The target date must be after today.");
  const goal: Goal = {
    id: `goal_${crypto.randomUUID()}`, tenantId: c.tenantId, memberId: input.memberId, title: parsed.data.title, metric: parsed.data.metric, unit: metricInfo(parsed.data.metric)!.unit, baseline: parsed.data.baseline,
    target: parsed.data.target, targetDate: parsed.data.targetDate, reviewEveryDays: parsed.data.reviewEveryDays, status: "active", history: [{ at: c.nowIso, by: c.trainerId, note: "Goal set." }], createdBy: c.trainerId, createdAt: c.nowIso,
  };
  await db.goals.add(goal);
  return goal.id;
}

/**
 * Changes a goal’s target, date or cadence. The goal it replaces is kept as “Revised” with the reason, and the new one
 * starts Active with a history that says where it came from (P04: every change is kept).
 */
export async function reviseGoal(session: Session | null, input: GoalInput & { goalId: string; reason: string }): Promise<string> {
  const parsed = GoalFields.safeParse(input);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the goal and try again.");
  if (!input.reason.trim()) throw new ApiError("invalid", "Say why the goal is changing.");
  const { c } = await clientFor(session, input.memberId);
  if (parsed.data.targetDate <= c.today) throw new ApiError("invalid", "The target date must be after today.");
  return db.transaction("rw", db.goals, async () => {
    const old = await db.goals.get(input.goalId);
    if (!old || old.memberId !== input.memberId || old.status !== "active") throw new ApiError("conflict", "Only an active goal can be revised.");
    await db.goals.update(old.id, { status: "revised", history: [...old.history, { at: c.nowIso, by: c.trainerId, note: `Revised: ${input.reason.trim()}` }] });
    const next: Goal = {
      id: `goal_${crypto.randomUUID()}`, tenantId: c.tenantId, memberId: input.memberId, title: parsed.data.title, metric: parsed.data.metric, unit: metricInfo(parsed.data.metric)!.unit, baseline: parsed.data.baseline ?? old.baseline,
      target: parsed.data.target, targetDate: parsed.data.targetDate, reviewEveryDays: parsed.data.reviewEveryDays, status: "active",
      history: [{ at: c.nowIso, by: c.trainerId, note: `Revised from “${old.title}”: ${input.reason.trim()}` }], createdBy: c.trainerId, createdAt: c.nowIso,
    };
    await db.goals.add(next);
    return next.id;
  });
}

/** Stops working towards a goal without achieving it. */
export async function closeGoal(session: Session | null, input: { memberId: string; goalId: string; reason: string }): Promise<void> {
  if (!input.reason.trim()) throw new ApiError("invalid", "Say why the goal is closed.");
  const { c } = await clientFor(session, input.memberId);
  await db.transaction("rw", db.goals, async () => {
    const g = await db.goals.get(input.goalId);
    if (!g || g.memberId !== input.memberId || g.status !== "active") throw new ApiError("conflict", "Only an active goal can be closed.");
    await db.goals.update(g.id, { status: "closed", history: [...g.history, { at: c.nowIso, by: c.trainerId, note: `Closed: ${input.reason.trim()}` }] });
  });
}

/**
 * Only the trainer confirms a goal as achieved, here, never the member’s own reading (P04). The first confirmation awards the
 * “Goal achieved” badge. Confirming again changes nothing.
 */
export async function confirmGoalAchieved(session: Session | null, input: { memberId: string; goalId: string; note?: string }): Promise<void> {
  const { c } = await clientFor(session, input.memberId);
  await db.transaction("rw", [db.goals, db.badgeAwards], async () => {
    const g = await db.goals.get(input.goalId);
    if (!g || g.memberId !== input.memberId) throw new ApiError("not_found", "We couldn’t find that goal.");
    if (g.status === "achieved") return;
    if (g.status !== "active") throw new ApiError("conflict", "Only an active goal can be confirmed as achieved.");
    await db.goals.update(g.id, { status: "achieved", history: [...g.history, { at: c.nowIso, by: c.trainerId, note: input.note?.trim() ? `Achieved: ${input.note.trim()}` : "Achieved. Confirmed by the trainer." }] });
    const has = (await db.badgeAwards.where("memberId").equals(input.memberId).toArray()).some((b) => b.badge === "goal_achieved");
    if (!has) await db.badgeAwards.add({ id: `bd_${input.memberId}_goal_achieved`, tenantId: c.tenantId, memberId: input.memberId, badge: "goal_achieved", awardedAt: c.nowIso });
  });
}
