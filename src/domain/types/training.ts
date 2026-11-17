import { z } from "zod";
import { id, idempotencyKey, isoDate, isoDateTime } from "./common";

export const ExerciseCategory = z.enum(["strength", "cardio", "mobility", "core", "conditioning", "warmup"]);

/** Library entry (W01). Archived exercises stay readable because old plans point to them. */
export const Exercise = z.object({
  id,
  /** Null for exercises that ship with Ember. */
  tenantId: id.nullable(),
  name: z.string().min(1),
  category: ExerciseCategory,
  muscleGroups: z.array(z.string()),
  equipment: z.array(z.string()),
  instructions: z.string(),
  mediaUrl: z.string().optional(),
  substitutionIds: z.array(id),
  archived: z.boolean(),
  createdBy: id.optional(),
});
export type Exercise = z.infer<typeof Exercise>;

const reps = z.union([
  z.number().int().positive(),
  z.object({ min: z.number().int().positive(), max: z.number().int().positive() }).refine((r) => r.max >= r.min, "Maximum reps can’t be below minimum."),
]);

/** What the trainer prescribes for one exercise on one day (W02). */
export const Prescription = z.object({
  exerciseId: id,
  order: z.number().int().nonnegative(),
  section: z.enum(["warmup", "main", "cooldown"]),
  sets: z.number().int().positive(),
  reps: reps.optional(),
  loadKg: z.number().nonnegative().optional(),
  durationSec: z.number().int().positive().optional(),
  distanceM: z.number().int().positive().optional(),
  restSec: z.number().int().nonnegative().optional(),
  tempo: z.string().optional(),
  rpeTarget: z.number().min(1).max(10).optional(),
  cues: z.string().optional(),
});
export type Prescription = z.infer<typeof Prescription>;

export const PlanDay = z.object({
  /** Days after the version's start date. Week 2 day 3 of a 3-day plan is offset 9 when the plan starts on a Monday. */
  dayOffset: z.number().int().nonnegative(),
  weekIndex: z.number().int().nonnegative(),
  dayIndex: z.number().int().nonnegative(),
  title: z.string(),
  /** A canceled prescription is left out of completion counts (P03). */
  canceled: z.boolean(),
  prescriptions: z.array(Prescription),
});
export type PlanDay = z.infer<typeof PlanDay>;

/**
 * One published version of a member's program (T03, T06). A published version never changes. A new plan is a
 * new version, so earlier prescriptions and logs stay exactly as they were.
 */
export const WorkoutPlanVersion = z.object({
  id,
  tenantId: id,
  memberId: id,
  /** Same for every version of one program. */
  programId: id,
  versionNumber: z.number().int().positive(),
  name: z.string().min(1),
  status: z.enum(["draft", "published"]),
  startsOn: isoDate,
  publishedAt: isoDateTime.optional(),
  authorId: id,
  notes: z.string().optional(),
  days: z.array(PlanDay),
});
export type WorkoutPlanVersion = z.infer<typeof WorkoutPlanVersion>;

export const LoggedSet = z.object({
  setNumber: z.number().int().positive(),
  reps: z.number().int().nonnegative().optional(),
  loadKg: z.number().nonnegative().optional(),
  durationSec: z.number().int().nonnegative().optional(),
  distanceM: z.number().nonnegative().optional(),
  rpe: z.number().min(1).max(10).optional(),
  skipped: z.boolean(),
  /** Logged with one tap as prescribed. */
  asPrescribed: z.boolean().optional(),
});

export const LoggedExercise = z.object({
  exerciseId: id,
  /** Set when the member did a different exercise from the one prescribed. */
  substitutionFor: id.optional(),
  sets: z.array(LoggedSet),
  notes: z.string().optional(),
});

/** What was actually done (W03, T05). Shown next to the prescription it answers. */
export const WorkoutLog = z.object({
  id,
  tenantId: id,
  memberId: id,
  planVersionId: id,
  weekIndex: z.number().int().nonnegative(),
  dayIndex: z.number().int().nonnegative(),
  scheduledOn: isoDate,
  /** A draft is saved but not submitted. Skipped is never shown in red. */
  status: z.enum(["draft", "completed", "partial", "skipped"]),
  startedAt: isoDateTime.optional(),
  completedAt: isoDateTime.optional(),
  entries: z.array(LoggedExercise),
  effort: z.number().min(1).max(10).optional(),
  notes: z.string().optional(),
  feedback: z.object({ recovery: z.number().min(1).max(5).optional(), obstacles: z.string().optional() }).optional(),
  /** Who typed it in. A trainer logging for a client is shown as the author (T05). */
  enteredBy: id,
  enteredByRole: z.enum(["member", "trainer"]),
  corrections: z.array(z.object({ at: isoDateTime, by: id, note: z.string() })),
  idempotencyKey,
});
export type WorkoutLog = z.infer<typeof WorkoutLog>;

export const GoalStatus = z.enum(["active", "achieved", "revised", "closed"]);

export const Goal = z.object({
  id,
  tenantId: id,
  memberId: id,
  title: z.string().min(1),
  metric: z.string(),
  unit: z.string(),
  baseline: z.number().optional(),
  target: z.number(),
  targetDate: isoDate,
  reviewEveryDays: z.number().int().positive(),
  status: GoalStatus,
  /** Every status or target change is kept (P04). */
  history: z.array(z.object({ at: isoDateTime, by: id, note: z.string() })),
  createdBy: id,
  createdAt: isoDateTime,
});
export type Goal = z.infer<typeof Goal>;

export const MeasurementKind = z.enum(["weight", "waist", "chest", "hips", "arm", "thigh", "body_fat", "fitness_test", "strength_benchmark", "progress_photo"]);

/** A dated reading (P01). A correction is a new row pointing at the one it replaces, so the history stays. */
export const Measurement = z.object({
  id,
  tenantId: id,
  memberId: id,
  kind: MeasurementKind,
  value: z.number().optional(),
  unit: z.string().optional(),
  measuredOn: isoDate,
  /** For body fat: how it was measured, for example skinfold or scale. */
  method: z.string().optional(),
  exerciseId: id.optional(),
  /** Photos only. Needs an active photo consent. */
  mediaRef: z.string().optional(),
  source: z.enum(["member", "trainer", "device"]),
  recordedBy: id,
  corrects: id.optional(),
  createdAt: isoDateTime,
});
export type Measurement = z.infer<typeof Measurement>;
