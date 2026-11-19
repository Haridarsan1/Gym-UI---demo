import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { getClient, type ClientProfile, type ProfileGoal, type ProfileNote } from "@/api/clients";
import { openTrainer } from "@/api/trainer";
import { buildAuditEvent } from "@/domain/audit";
import { addDays } from "@/domain/dates";
import { effectiveMeasurements, loadedExercises, pointsFor, strengthSeries, summarize, targetReachedAt, type Point, type Summary } from "@/domain/progress";
import type { TrainerReview } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * The review (T06, P04): how a client is doing, in one place, and what the trainer does about it. Adherence and the weekly
 * chart, the trends that matter (weight, waist, the lifts done most), the client’s latest check-in, and their goals. The
 * trainer writes feedback the client can read, or a private note only they can, and may set a follow-up date. A goal whose
 * target the client’s own numbers reached shows “Target reached”, and only the trainer confirms it as Achieved.
 */

export interface ReviewTrend {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  points: Point[];
  summary: Summary | null;
  from: string;
  to: string;
}

export interface ReviewGoal extends ProfileGoal {
  /** When the client’s own numbers first reached the target, from the goal’s history. */
  reachedOn?: string;
  /** Show “Confirm achieved”: the target is reached and the goal is still active. */
  canConfirm: boolean;
}

export interface ReviewData {
  memberId: string;
  name: string;
  firstName: string;
  today: string;
  programName?: string;
  adherence: ClientProfile["adherence"];
  weeks: ClientProfile["weeks"];
  trends: ReviewTrend[];
  checkin?: { at: string; effort?: number; recovery?: number; obstacles?: string; body: string; sinceLastReview: boolean };
  goals: ReviewGoal[];
  due?: ClientProfile["review"];
  /** The last review shared with the client, and the follow-up date it set. */
  lastShared?: { at: string; followUpOn?: string };
  /** Shared reviews and your own private notes, newest first. */
  history: ProfileNote[];
  flags: ClientProfile["flags"];
}

const WEEKS = 12;

export async function getReview(session: Session | null, memberId: string): Promise<ReviewData> {
  const p = await getClient(session, memberId);
  const c = await openTrainer(session);
  assertCan(c.principal, "review.read", { tenantId: c.tenantId, memberId, assignedTrainerId: c.trainerId });
  const from = addDays(c.today, -WEEKS * 7);
  const [rows, logs, goals, reviews, exercises] = await Promise.all([
    db.measurements.where("memberId").equals(memberId).toArray(),
    db.workoutLogs.where("memberId").equals(memberId).toArray(),
    db.goals.where("memberId").equals(memberId).toArray(),
    db.trainerReviews.where("memberId").equals(memberId).toArray(),
    db.exercises.toArray(),
  ]);
  const readings = effectiveMeasurements(rows.filter((m) => m.kind !== "progress_photo"));
  const trend = (key: string, label: string, unit: string, points: Point[], decimals = 1): ReviewTrend | undefined =>
    points.length >= 2 ? { key, label, unit, decimals, points, summary: summarize(points), from, to: c.today } : undefined;
  const lifts = loadedExercises(logs.filter((l) => l.scheduledOn >= from))
    .map((id) => ({ id, points: strengthSeries(logs.filter((l) => l.scheduledOn >= from), id) }))
    .filter((x) => x.points.length >= 2)
    .slice(0, 3);
  const trends = [
    trend("weight", "Body weight", "kg", pointsFor(readings, "weight", from, c.today)),
    trend("waist", "Waist", "cm", pointsFor(readings, "waist", from, c.today)),
    ...lifts.map((l) => trend(`lift-${l.id}`, exercises.find((e) => e.id === l.id)?.name ?? "Lift", "kg", l.points)),
  ].filter((t): t is ReviewTrend => !!t);

  const shared = reviews.filter((r) => r.kind === "shared_review").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastShared = shared[0];
  const latestCheckin = reviews.filter((r) => r.kind === "member_checkin").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const rawGoals = new Map(goals.map((g) => [g.id, g]));
  return {
    memberId, name: p.name, firstName: p.firstName, today: c.today, programName: p.program?.name,
    adherence: p.adherence, weeks: p.weeks, trends,
    checkin: latestCheckin && { at: latestCheckin.createdAt, effort: latestCheckin.effort, recovery: latestCheckin.recovery, obstacles: latestCheckin.obstacles, body: latestCheckin.body, sinceLastReview: !lastShared || latestCheckin.createdAt > lastShared.createdAt },
    goals: p.goals.map((g) => ({ ...g, reachedOn: targetReachedAt(rawGoals.get(g.id)?.history ?? []), canConfirm: g.status === "active" && g.targetReached })),
    due: p.review,
    lastShared: lastShared && { at: lastShared.createdAt, followUpOn: lastShared.followUpOn },
    history: p.notes.filter((n) => n.kind !== "member_checkin"),
    flags: p.flags,
  };
}

const Review = z.object({
  memberId: z.string().min(1),
  kind: z.enum(["shared_review", "private_note"]),
  body: z.string(),
  followUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** One per review the trainer writes, so a double tap or a retry writes it once. */
  key: z.string().min(8),
});
export type ReviewInput = z.input<typeof Review>;

/**
 * Writes the review. Shared feedback is what the client reads (their Today shows a new-review card until they open it); a private
 * note stays with its author, even if the client moves to another trainer. A follow-up date goes only on shared feedback, must be
 * after today, and is when the next review is due. Sending the same key again returns the one already written.
 */
export async function saveReview(session: Session | null, raw: ReviewInput): Promise<{ id: string; kind: ReviewInput["kind"]; repeated: boolean }> {
  const parsed = Review.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "We couldn’t read that review. Reload the page and try again.");
  const input = parsed.data;
  const c = await openTrainer(session);
  assertCan(c.principal, input.kind === "private_note" ? "note.private" : "review.write", { tenantId: c.tenantId, memberId: input.memberId, assignedTrainerId: c.trainerId });
  const body = input.body.trim();
  if (body.length < 3) throw new ApiError("invalid", input.kind === "shared_review" ? "Write the feedback first. It is what the client reads." : "Write something first.");
  if (body.length > 2000) throw new ApiError("invalid", "Keep it under 2,000 characters.");
  if (input.followUpOn !== undefined) {
    if (input.kind === "private_note") throw new ApiError("invalid", "A follow-up date goes on feedback you share. A private note doesn’t schedule anything.");
    if (input.followUpOn <= c.today) throw new ApiError("invalid", "Choose a follow-up date after today.");
    if (input.followUpOn > addDays(c.today, 365)) throw new ApiError("invalid", "Choose a follow-up date within a year.");
  }
  // Same check as every read of a client: only the one who has them today.
  const mine = await getClient(session, input.memberId);
  const id = `rv_${input.key}`;
  return db.transaction("rw", [db.trainerReviews, db.auditEvents], async () => {
    const again = await db.trainerReviews.get(id);
    if (again) {
      if (again.memberId !== input.memberId || again.authorId !== c.trainerId) throw new ApiError("conflict", "That review could not be saved. Reload the page and try again.");
      return { id, kind: input.kind, repeated: true };
    }
    const row: TrainerReview = { id, tenantId: c.tenantId, memberId: input.memberId, kind: input.kind, authorId: c.trainerId, body, followUpOn: input.followUpOn, createdAt: c.nowIso };
    await db.trainerReviews.add(row);
    if (input.kind === "shared_review") {
      await db.auditEvents.add(buildAuditEvent(c.principal, { action: "review.shared", entityType: "trainer_review", entityId: id, memberId: mine.memberId, details: { followUpOn: input.followUpOn ?? null } }, `ae_${crypto.randomUUID()}`, now()));
    }
    return { id, kind: input.kind, repeated: false };
  });
}
