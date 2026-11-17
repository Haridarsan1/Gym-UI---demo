import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { ApiError } from "@/api/errors";
import { openMember } from "@/api/member";
import { viewSensitive } from "@/api/sensitive";
import { currentFor, recordTargetsReached } from "@/api/goals";
import { addDays, daysBetween, istDateOf, weekStart } from "@/domain/dates";
import {
  MEMBER_MEASUREMENTS, effectiveMeasurements, goalProgress, loadedExercises, targetReachedAt, measurementError, measurementInfo, recordTimeline, strengthSeries, weekList, weeklyAttendance, weeklyCompletion,
  weeklyVolume, type MemberMeasurementKind, type StrengthPoint, type WeekCompletion,
} from "@/domain/progress";
import type { Goal, Measurement, TrainerReview } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Everything Progress reads and writes (P01 to P04, T06), for the signed-in member only. The charts come from raw records
 * worked out here with the rules in domain/progress.ts, one series per week or per day, so the screen can change its date
 * range without asking again.
 */

const MAX_WEEKS = 104;
const finished = (l: { status: string }) => l.status === "completed" || l.status === "partial";

const MEASURED = new Set<string>(MEMBER_MEASUREMENTS.map((m) => m.kind));

export interface ProgressMeasurement {
  id: string;
  kind: string;
  value: number;
  unit?: string;
  measuredOn: string;
  method?: string;
  /** Who entered it, in words: “You” or the trainer’s name (P01). */
  by: string;
  source: Measurement["source"];
}

export interface GoalView {
  id: string;
  title: string;
  status: Goal["status"];
  unit: string;
  baseline?: number;
  target: number;
  targetDate: string;
  /** Days to the target date; negative once it has passed. */
  daysLeft: number;
  current?: number;
  fraction: number | null;
  /** The metric the goal is measured on, so Progress can show its chart first. */
  metric: string;
  /** When a reading or workout first reached the target. The goal stays Active until the trainer confirms Achieved. */
  targetReachedOn?: string;
  achievedOn?: string;
  history: Array<{ date: string; note: string }>;
}

export interface ProgressData {
  today: string;
  /** Every Monday from the member’s first data to this week. All week series below line up with this. */
  weeks: string[];
  measurements: ProgressMeasurement[];
  strength: Array<{ exerciseId: string; name: string; points: StrengthPoint[] }>;
  volume: { exercises: Array<{ id: string; name: string }>; all: Array<number | null>; byExercise: Record<string, Array<number | null>> };
  attendance: Array<number | null>;
  completion: WeekCompletion[];
  records: Array<{ exerciseId: string; name: string; loadKg: number; previousKg: number; date: string }>;
  goals: GoalView[];
  photoConsent: boolean;
}

export async function getProgress(session: Session | null): Promise<ProgressData> {
  const c = await openMember(session);
  for (const a of ["progress.read", "measurement.read", "goal.read", "workoutlog.read", "workoutplan.read"] as const) assertCan(c.principal, a, c.resource);
  const [rows, logs, versions, checkIns, memberships, goals, consents, users] = await Promise.all([
    db.measurements.where("memberId").equals(c.memberId).toArray(),
    db.workoutLogs.where("memberId").equals(c.memberId).toArray(),
    db.workoutPlanVersions.where("memberId").equals(c.memberId).toArray(),
    db.checkIns.where("memberId").equals(c.memberId).toArray(),
    db.memberships.where("memberId").equals(c.memberId).toArray(),
    db.goals.where("memberId").equals(c.memberId).toArray(),
    db.consents.where("memberId").equals(c.memberId).toArray(),
    db.users.where("tenantId").equals(c.tenantId).toArray(),
  ]);
  const published = versions.filter((v) => v.status === "published");
  const readings = effectiveMeasurements(rows.filter((r) => r.kind !== "progress_photo"));
  const nameOf = (id: string) => (id === c.principal.userId ? "You" : (users.find((u) => u.id === id)?.name ?? "Your trainer"));

  const dates = [...readings.map((r) => r.measuredOn), ...logs.filter(finished).map((l) => l.scheduledOn), ...memberships.map((m) => m.startsOn)].filter((d) => d <= c.today).sort();
  const firstWeek = weekStart(dates[0] ?? c.today);
  const all = weekList(firstWeek, c.today);
  const weeks = all.slice(-MAX_WEEKS);

  // Strength and volume, by exercise
  const loaded = loadedExercises(logs).slice(0, 20);
  const benchmarks = readings.filter((r) => r.kind === "strength_benchmark" && r.exerciseId && r.value !== undefined);
  const strengthIds = [...new Set([...loaded, ...benchmarks.map((b) => b.exerciseId!)])];
  const exercises = await db.exercises.bulkGet(strengthIds);
  const nameFor = new Map(exercises.filter((e): e is NonNullable<typeof e> => !!e).map((e) => [e.id, e.name]));
  const strength = strengthIds.map((id) => {
    const fromLogs = strengthSeries(logs, id);
    const fromTests = benchmarks.filter((b) => b.exerciseId === id).map((b): StrengthPoint => ({ date: b.measuredOn, value: b.value! }));
    return { exerciseId: id, name: nameFor.get(id) ?? "Exercise", points: [...fromLogs, ...fromTests].sort((a, b) => a.date.localeCompare(b.date)) };
  }).filter((s) => s.points.length);

  // Attendance: weeks before the first membership and frozen weeks are gaps
  const freezes = memberships.flatMap((m) => m.freezes);
  const frozenWeeks = new Set(weeks.filter((w) => freezes.some((f) => f.from <= addDays(w, 6) && (f.to === undefined || f.to >= w))));
  const firstMembership = weekStart(memberships.map((m) => m.startsOn).sort()[0] ?? c.today);
  const attendance = weeklyAttendance(checkIns.filter((k) => k.result === "allowed").map((k) => istDateOf(k.at)), weeks, firstMembership, frozenWeeks);

  const records = recordTimeline(logs);
  const recordNames = await db.exercises.bulkGet([...new Set(records.map((r) => r.exerciseId))]);
  const recordName = new Map(recordNames.filter((e): e is NonNullable<typeof e> => !!e).map((e) => [e.id, e.name]));

  return {
    today: c.today, weeks,
    measurements: readings.filter((r) => r.value !== undefined && MEASURED.has(r.kind)).map((r) => ({ id: r.id, kind: r.kind, value: r.value!, unit: r.unit, measuredOn: r.measuredOn, method: r.method, by: nameOf(r.recordedBy), source: r.source })),
    strength,
    volume: { exercises: loaded.map((id) => ({ id, name: nameFor.get(id) ?? "Exercise" })), all: weeklyVolume(logs, weeks), byExercise: Object.fromEntries(loaded.map((id) => [id, weeklyVolume(logs, weeks, id)])) },
    attendance,
    completion: weeklyCompletion(published, logs, weeks, c.today),
    records: records.map((r) => ({ exerciseId: r.exerciseId, name: recordName.get(r.exerciseId) ?? "Exercise", loadKg: r.loadKg, previousKg: r.previousKg, date: r.date })),
    goals: goals.map((g) => goalView(g, c.today, readings, logs)).sort((a, b) => rank(a.status) - rank(b.status) || a.targetDate.localeCompare(b.targetDate)),
    photoConsent: consents.some((k) => k.scope === "photos" && !k.withdrawnAt),
  };
}

const rank = (s: Goal["status"]) => ({ active: 0, achieved: 1, revised: 2, closed: 3 })[s];

function goalView(g: Goal, today: string, readings: Measurement[], logs: Parameters<typeof strengthSeries>[0]): GoalView {
  const current = currentFor(g.metric, readings, logs, today);
  const p = goalProgress(g, current);
  const last = g.history.at(-1);
  const reachedAt = g.status === "active" ? targetReachedAt(g.history) : undefined;
  return {
    id: g.id, title: g.title, metric: g.metric, status: g.status, unit: g.unit, baseline: g.baseline, target: g.target, targetDate: g.targetDate, daysLeft: daysBetween(today, g.targetDate), current,
    fraction: g.status === "achieved" ? 1 : p.fraction, targetReachedOn: reachedAt ? istDateOf(reachedAt) : undefined,
    achievedOn: g.status === "achieved" && last ? istDateOf(last.at) : undefined, history: g.history.map((h) => ({ date: istDateOf(h.at), note: h.note })),
  };
}

// ── Logging a measurement (P01) ─────────────────────────────────────────────────────────────────

const KINDS = MEMBER_MEASUREMENTS.map((m) => m.kind) as [MemberMeasurementKind, ...MemberMeasurementKind[]];
const MeasurementInput = z.object({ kind: z.enum(KINDS), value: z.number(), measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), method: z.string().max(80).optional() });
export type MeasurementInput = z.input<typeof MeasurementInput>;

export interface LoggedMeasurement {
  id: string;
  /** Goals whose target this reading reached for the first time. They stay Active; the trainer confirms Achieved. */
  reachedGoals: Array<{ id: string; title: string }>;
  /** True when the same reading was already saved, so nothing was added. */
  repeated: boolean;
}

/**
 * Saves a reading the member typed, recorded as entered by them (P01). Saving the same value for the same day again changes
 * nothing; a different value for a day that already has one is a correction, which keeps the earlier row. A reading that
 * reaches an active goal marks it achieved, with a note in its history, and may earn a badge.
 */
export async function logMeasurement(session: Session | null, raw: MeasurementInput): Promise<LoggedMeasurement> {
  const parsed = MeasurementInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Choose what you measured and enter a number.");
  const input = parsed.data;
  const c = await openMember(session);
  assertCan(c.principal, "measurement.write", c.resource);
  const date = input.measuredOn ?? c.today;
  if (date > c.today) throw new ApiError("invalid", "Choose today or an earlier date. A reading can’t be saved for the future.");
  if (daysBetween(date, c.today) > 400) throw new ApiError("invalid", "Choose a date within the last year.");
  const info = measurementInfo(input.kind)!;
  const problem = measurementError(input.kind, input.value);
  if (problem) throw new ApiError("invalid", problem);
  const value = Math.round(input.value * 10) / 10;

  return db.transaction("rw", [db.measurements, db.goals], async () => {
    const all = await db.measurements.where("memberId").equals(c.memberId).toArray();
    const sameDay = effectiveMeasurements(all.filter((m) => m.kind === input.kind && m.measuredOn === date));
    const existing = sameDay[0];
    if (existing?.value === value) return { id: existing.id, reachedGoals: [], repeated: true };
    const row: Measurement = {
      id: `ms_${c.memberId}_${input.kind}_${date}${existing ? `_r${all.filter((m) => m.kind === input.kind && m.measuredOn === date).length}` : ""}`,
      tenantId: c.tenantId, memberId: c.memberId, kind: input.kind, value, unit: info.unit, measuredOn: date, method: input.kind === "body_fat" ? input.method?.trim() || undefined : undefined,
      source: "member", recordedBy: c.principal.userId, corrects: existing?.id, createdAt: c.nowIso,
    };
    await db.measurements.add(row);

    const readings = effectiveMeasurements([...all, row].filter((m) => m.kind !== "progress_photo"));
    const reached = await recordTargetsReached({
      memberId: c.memberId, userId: c.principal.userId, nowIso: c.nowIso, today: c.today, readings, logs: [],
      describe: (_g, current) => `with a logged ${info.label.toLowerCase()} of ${current} ${info.unit}.`, only: (g) => g.metric === input.kind,
    });
    return { id: row.id, reachedGoals: reached.map((g) => ({ id: g.id, title: g.title })), repeated: false };
  });
}

// ── Progress photos (P01, S04) ──────────────────────────────────────────────────────────────────

export interface PhotoView {
  id: string;
  takenOn: string;
  dataUrl: string;
}

const hasPhotoConsent = async (memberId: string) => (await db.consents.where("memberId").equals(memberId).toArray()).some((k) => k.scope === "photos" && !k.withdrawnAt);
const NO_CONSENT = "Progress photos need your consent. Turn it on under consent in Me, and you can add photos.";

/** The member’s own progress photos, newest first. Without photo consent there are none to show. */
export async function getPhotos(session: Session | null): Promise<{ consent: boolean; photos: PhotoView[] }> {
  const c = await openMember(session);
  assertCan(c.principal, "photo.read", c.resource);
  if (!(await hasPhotoConsent(c.memberId))) return { consent: false, photos: [] };
  const rows = (await db.measurements.where("memberId").equals(c.memberId).toArray()).filter((m) => m.kind === "progress_photo" && m.mediaRef);
  // Every photo opens through the one door for sensitive records. A member’s own views are not audited.
  await Promise.all(rows.map((r) => viewSensitive(session, { kind: "photo", memberId: c.memberId, entityId: r.id })));
  return { consent: true, photos: rows.sort((a, b) => b.measuredOn.localeCompare(a.measuredOn) || b.createdAt.localeCompare(a.createdAt)).map((r) => ({ id: r.id, takenOn: r.measuredOn, dataUrl: r.mediaRef! })) };
}

const PhotoInput = z.object({ dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(1_800_000), takenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
export type PhotoInput = z.input<typeof PhotoInput>;

export async function addProgressPhoto(session: Session | null, raw: PhotoInput): Promise<PhotoView> {
  const c = await openMember(session);
  assertCan(c.principal, "photo.write", c.resource);
  if (!(await hasPhotoConsent(c.memberId))) throw new ApiError("forbidden", NO_CONSENT);
  const parsed = PhotoInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "That photo couldn’t be saved. Choose a JPEG, PNG or WebP image under about 1 MB.");
  const takenOn = parsed.data.takenOn ?? c.today;
  if (takenOn > c.today) throw new ApiError("invalid", "Choose today or an earlier date for the photo.");
  const id = `ph_${c.memberId}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await db.measurements.add({ id, tenantId: c.tenantId, memberId: c.memberId, kind: "progress_photo", measuredOn: takenOn, mediaRef: parsed.data.dataUrl, source: "member", recordedBy: c.principal.userId, createdAt: c.nowIso });
  return { id, takenOn, dataUrl: parsed.data.dataUrl };
}

export async function deleteProgressPhoto(session: Session | null, id: string): Promise<void> {
  const c = await openMember(session);
  assertCan(c.principal, "photo.write", c.resource);
  const row = await db.measurements.get(id);
  if (!row || row.memberId !== c.memberId || row.kind !== "progress_photo") throw new ApiError("not_found", "We couldn’t find this photo. It may already be removed.");
  await db.measurements.delete(id);
}

// ── Reviews and check-ins (P04, T06) ────────────────────────────────────────────────────────────

export interface ReviewView {
  id: string;
  trainerName: string;
  body: string;
  createdAt: string;
  followUpOn?: string;
  unread: boolean;
}

export interface CheckInView {
  id: string;
  createdAt: string;
  effort?: number;
  recovery?: number;
  obstacles?: string;
}

/** Reviews the trainer shared, newest first, and the member’s own check-ins. Private trainer notes never come here. */
export async function getReviews(session: Session | null): Promise<{ reviews: ReviewView[]; checkIns: CheckInView[] }> {
  const c = await openMember(session);
  assertCan(c.principal, "review.read", c.resource);
  const [rows, users] = await Promise.all([db.trainerReviews.where("memberId").equals(c.memberId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray()]);
  const newest = (a: TrainerReview, b: TrainerReview) => b.createdAt.localeCompare(a.createdAt);
  return {
    reviews: rows.filter((r) => r.kind === "shared_review").sort(newest).map((r) => ({ id: r.id, trainerName: users.find((u) => u.id === r.authorId)?.name ?? "Your trainer", body: r.body, createdAt: r.createdAt, followUpOn: r.followUpOn, unread: !r.readByMemberAt })),
    checkIns: rows.filter((r) => r.kind === "member_checkin" && r.authorId === c.principal.userId).sort(newest).map((r) => ({ id: r.id, createdAt: r.createdAt, effort: r.effort, recovery: r.recovery, obstacles: r.obstacles })),
  };
}

/** Marks the shared reviews as read, which clears the “new review” card on Today. */
export async function markReviewsRead(session: Session | null): Promise<number> {
  const c = await openMember(session);
  assertCan(c.principal, "review.read", c.resource);
  return db.transaction("rw", db.trainerReviews, async () => {
    const unread = (await db.trainerReviews.where("memberId").equals(c.memberId).toArray()).filter((r) => r.kind === "shared_review" && !r.readByMemberAt);
    for (const r of unread) await db.trainerReviews.update(r.id, { readByMemberAt: c.nowIso });
    return unread.length;
  });
}

const CheckInInput = z.object({ key: z.string().min(8), effort: z.number().int().min(1).max(10).optional(), recovery: z.number().int().min(1).max(5).optional(), obstacles: z.string().max(1000).optional() });
export type CheckInInput = z.input<typeof CheckInInput>;

/** Saves the member’s own check-in on effort, recovery and what got in the way (P04). The same key twice makes one check-in. */
export async function submitCheckIn(session: Session | null, raw: CheckInInput): Promise<CheckInView> {
  const parsed = CheckInInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Choose a number from each scale, or leave it blank.");
  const input = parsed.data;
  const obstacles = input.obstacles?.trim() || undefined;
  if (input.effort === undefined && input.recovery === undefined && !obstacles) throw new ApiError("invalid", "Tell your trainer how hard it felt, how recovered you feel, or what got in the way.");
  const c = await openMember(session);
  assertCan(c.principal, "feedback.write", c.resource);
  const id = `rv_chk_${c.memberId}_${input.key}`;
  const existing = await db.trainerReviews.get(id);
  if (existing) return { id, createdAt: existing.createdAt, effort: existing.effort, recovery: existing.recovery, obstacles: existing.obstacles };
  const row: TrainerReview = { id, tenantId: c.tenantId, memberId: c.memberId, kind: "member_checkin", authorId: c.principal.userId, body: obstacles ?? "Check-in", effort: input.effort, recovery: input.recovery, obstacles, createdAt: c.nowIso };
  await db.trainerReviews.add(row);
  return { id, createdAt: row.createdAt, effort: row.effort, recovery: row.recovery, obstacles };
}

