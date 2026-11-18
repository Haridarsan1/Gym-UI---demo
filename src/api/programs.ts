import { z } from "zod";
import { db } from "@/demo/db";
import { runOnce, writeAudit } from "@/demo";
import { assertCan } from "@/api/context";
import { ApiError } from "@/api/errors";
import { loadBook } from "@/api/book";
import { openTrainer } from "@/api/trainer";
import { addDays } from "@/domain/dates";
import { compareDays, fromPlanDays, summarize, validateProgram, type ProgramSummary } from "@/domain/program";
import type { PlanDay, WorkoutPlanVersion } from "@/domain/types";
import { PlanDay as PlanDaySchema } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Building and publishing a client’s program (W02, T03, T06). A published version never changes: a new plan is a new
 * version that takes over from its start date, so earlier prescriptions and the logs that answer them stay exactly as they
 * were. A client has at most one draft, which only their trainer can see, and which never reaches the member app.
 */

export interface VersionInfo {
  id: string;
  versionNumber: number;
  name: string;
  startsOn: string;
  authorName: string;
  days: PlanDay[];
  notes?: string;
}
export interface ProgramSource {
  memberId: string;
  memberName: string;
  firstName: string;
  today: string;
  /** The first day a new version may start: today for a client with no plan yet, otherwise tomorrow. */
  earliestStart: string;
  programId: string;
  nextVersion: number;
  /** The version that governs today, or the next one to start. */
  current?: VersionInfo;
  versions: Array<{ versionNumber: number; name: string; startsOn: string }>;
  draft?: { id: string; name: string; notes: string; startsOn: string; days: PlanDay[]; updatedAt: string };
}

const draftId = (memberId: string) => `wpv_${memberId}_draft`;

async function clientFor(session: Session | null, memberId: string) {
  const c = await openTrainer(session);
  assertCan(c.principal, "workoutplan.write", { tenantId: c.tenantId, memberId, assignedTrainerId: c.trainerId });
  const book = await loadBook(c);
  const k = book.clients.find((x) => x.member.id === memberId);
  if (!k) throw new ApiError("not_found", "We couldn’t find this client. They may have moved to another trainer.");
  return { c, k };
}

export async function getProgramSource(session: Session | null, memberId: string): Promise<ProgramSource> {
  const { c, k } = await clientFor(session, memberId);
  const [all, users] = await Promise.all([db.workoutPlanVersions.where("memberId").equals(memberId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray()]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const published = all.filter((v) => v.status === "published").sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const draft = all.find((v) => v.status === "draft");
  const current = published.filter((v) => v.startsOn <= c.today).at(-1) ?? published[0];
  const info = (v: WorkoutPlanVersion): VersionInfo => ({ id: v.id, versionNumber: v.versionNumber, name: v.name, startsOn: v.startsOn, authorName: name.get(v.authorId) ?? "A trainer", days: v.days, notes: v.notes });
  return {
    memberId, memberName: k.member.name, firstName: k.member.name.split(" ")[0]!, today: c.today,
    earliestStart: published.some((v) => v.startsOn <= c.today) ? addDays(c.today, 1) : c.today,
    programId: published[0]?.programId ?? `prog_${memberId}`,
    nextVersion: Math.max(0, ...published.map((v) => v.versionNumber)) + 1,
    current: current && info(current),
    versions: published.map((v) => ({ versionNumber: v.versionNumber, name: v.name, startsOn: v.startsOn })),
    draft: draft && { id: draft.id, name: draft.name, notes: draft.notes ?? "", startsOn: draft.startsOn, days: draft.days, updatedAt: draft.publishedAt ?? c.nowIso },
  };
}

const ProgramInput = z.object({
  memberId: z.string().min(1),
  name: z.string().max(80, "Keep the program name under 80 characters."),
  notes: z.string().max(1000, "Keep the notes under 1,000 characters."),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
  days: z.array(PlanDaySchema).max(52 * 7),
});
export type ProgramInput = z.infer<typeof ProgramInput>;

/** Saves the client’s one draft. Safe to repeat: it replaces the draft. */
export async function saveProgramDraft(session: Session | null, raw: ProgramInput): Promise<{ savedAt: string }> {
  const parsed = ProgramInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the program and try again.");
  const input = parsed.data;
  const { c } = await clientFor(session, input.memberId);
  return db.transaction("rw", db.workoutPlanVersions, async () => {
    const mine = await db.workoutPlanVersions.where("memberId").equals(input.memberId).toArray();
    const number = Math.max(0, ...mine.filter((v) => v.status === "published").map((v) => v.versionNumber)) + 1;
    const programId = mine.find((v) => v.status === "published")?.programId ?? `prog_${input.memberId}`;
    const row: WorkoutPlanVersion = { id: draftId(input.memberId), tenantId: c.tenantId, memberId: input.memberId, programId, versionNumber: number, name: input.name.trim() || "Untitled program", status: "draft", startsOn: input.startsOn, publishedAt: c.nowIso, authorId: c.trainerId, notes: input.notes.trim() || undefined, days: input.days };
    await db.workoutPlanVersions.put(row);
    return { savedAt: c.nowIso };
  });
}

export async function discardProgramDraft(session: Session | null, memberId: string): Promise<void> {
  await clientFor(session, memberId);
  await db.workoutPlanVersions.delete(draftId(memberId));
}

export interface PublishInput extends ProgramInput {
  /** One per publish click, so repeating it (a double tap, a retry) makes one version. */
  key: string;
}
export interface PublishResult {
  id: string;
  versionNumber: number;
  name: string;
  startsOn: string;
  summary: ProgramSummary;
  previous?: { versionNumber: number; name: string; startsOn: string; endsOn: string };
  changes?: { added: number; removed: number; changed: number; same: number };
}

/**
 * Publishes the program as the client’s next version. It must pass `validateProgram`, start on or after the earliest day
 * and after the previous version began, and it never touches an earlier version or any log. Repeating the same key returns
 * the same version. The client’s draft is removed.
 */
export async function publishProgram(session: Session | null, raw: PublishInput): Promise<PublishResult> {
  const parsed = ProgramInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the program and try again.");
  const input = parsed.data;
  const { c } = await clientFor(session, input.memberId);
  return runOnce(`publish-program-${c.trainerId}-${raw.key}`, async () => {
    const [library, mine] = await Promise.all([db.exercises.toArray(), db.workoutPlanVersions.where("memberId").equals(input.memberId).toArray()]);
    const exercises = new Map(library.filter((e) => e.tenantId === null || e.tenantId === c.tenantId).map((e) => [e.id, { name: e.name, archived: e.archived }]));
    const issues = validateProgram({ name: input.name, notes: input.notes, weeks: fromPlanDays(input.days) }, exercises, input.startsOn);
    if (issues.length) throw new ApiError("invalid", issues[0]!.message, { issues: issues.map((i) => i.message) });
    const published = mine.filter((v) => v.status === "published").sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    const latest = published.at(-1);
    const earliest = published.some((v) => v.startsOn <= c.today) ? addDays(c.today, 1) : c.today;
    if (input.startsOn < earliest) throw new ApiError("invalid", earliest === c.today ? "The program can’t start in the past." : "A new version starts tomorrow at the earliest, so today’s workout stays as the client expects it.");
    if (latest && input.startsOn <= latest.startsOn) throw new ApiError("invalid", `It must start after version ${latest.versionNumber}, which starts on ${latest.startsOn}.`);
    const versionNumber = Math.max(0, ...published.map((v) => v.versionNumber)) + 1;
    const row: WorkoutPlanVersion = {
      id: `wpv_${input.memberId}_${versionNumber}`, tenantId: c.tenantId, memberId: input.memberId, programId: published[0]?.programId ?? `prog_${input.memberId}`, versionNumber, name: input.name.trim(), status: "published",
      startsOn: input.startsOn, publishedAt: c.nowIso, authorId: c.trainerId, notes: input.notes.trim() || undefined, days: input.days,
    };
    await db.workoutPlanVersions.add(row);
    await db.workoutPlanVersions.delete(draftId(input.memberId));
    await writeAudit(c.principal, { action: "record.edit", entityType: "plan_version", entityId: row.id, memberId: input.memberId, details: { versionNumber, startsOn: input.startsOn } });
    const governing = published.filter((v) => v.startsOn < input.startsOn).at(-1);
    return {
      id: row.id, versionNumber, name: row.name, startsOn: row.startsOn, summary: summarize(row.days),
      previous: governing && { versionNumber: governing.versionNumber, name: governing.name, startsOn: governing.startsOn, endsOn: addDays(input.startsOn, -1) },
      changes: governing && compareDays(governing.days, row.days),
    };
  });
}
