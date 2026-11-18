import { db } from "@/demo/db";
import { assertCan, open } from "@/api/context";
import { loadBook, type BookClient } from "@/api/book";
import { openTrainer } from "@/api/trainer";
import { ApiError } from "@/api/errors";
import type { CreditBalance } from "@/domain/credits";
import { addDays } from "@/domain/dates";
import { adherence, weekStats, type WeekStat } from "@/domain/metrics";
import { currentFor } from "@/api/goals";
import { goalProgress } from "@/domain/progress";
import { volumeKg } from "@/domain/metrics";
import type { Goal, Membership, TrainerReview, WorkoutLog } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * The trainer’s clients (T01 list, T02 and T05 and T06 profile, A02 history). Everything here is limited to the caller’s
 * own clients, those with an open assignment to them today. A trainer a client has moved away from can no longer open them.
 */

export type ClientFlag = "review" | "missed" | "plan" | "credits" | "frozen";

export interface ClientRowData {
  memberId: string;
  name: string;
  branchName: string;
  status: Extract<Membership["status"], "active" | "frozen">;
  planName: string;
  /** The name of the program they are on now, if any. */
  programName?: string;
  /** Completed against scheduled over the last four weeks. Null when nothing was scheduled. */
  completionRate: number | null;
  done: number;
  scheduled: number;
  lastWorkoutOn?: string;
  flags: ClientFlag[];
}

const flagsOf = (k: BookClient): ClientFlag[] => {
  const f: ClientFlag[] = [];
  if (k.membership.status === "frozen") f.push("frozen");
  if (k.review?.overdue) f.push("review");
  if (k.missed) f.push("missed");
  if (k.awaiting) f.push("plan");
  if (k.expiring) f.push("credits");
  return f;
};

export interface ClientListParams {
  search?: string;
  /** Show only clients with this flag. */
  flag?: ClientFlag;
}

/** T01: the people the trainer trains, with how well each is sticking to their plan. */
export async function listClients(session: Session | null, params: ClientListParams = {}): Promise<ClientRowData[]> {
  const c = await openTrainer(session);
  const [book, branches] = await Promise.all([loadBook(c), db.branches.where("tenantId").equals(c.tenantId).toArray()]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const q = params.search?.trim().toLowerCase() ?? "";
  const rows: ClientRowData[] = [];
  for (const k of book.clients) {
    if (q && !k.member.name.toLowerCase().includes(q) && !k.member.phone.includes(q.replace(/\s/g, ""))) continue;
    const flags = flagsOf(k);
    if (params.flag && !flags.includes(params.flag)) continue;
    const current = [...k.plans].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).filter((p) => p.startsOn <= c.today).at(-1);
    rows.push({
      memberId: k.member.id, name: k.member.name, branchName: branchName.get(k.member.homeBranchId) ?? "", status: k.membership.status as ClientRowData["status"], planName: k.membership.terms.name,
      programName: current?.name, completionRate: k.adherence.completionRate, done: k.adherence.completed, scheduled: k.adherence.scheduled, lastWorkoutOn: k.lastWorkoutOn, flags,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export interface ProfileLog {
  id: string;
  date: string;
  title: string;
  status: Exclude<WorkoutLog["status"], "draft">;
  /** Who typed it in (A02 keeps the author whoever the trainer is now). */
  enteredByName: string;
  enteredByRole: "member" | "trainer";
  effort?: number;
  notes?: string;
  volumeKg: number;
  corrected: boolean;
}
export interface ProfileGoal {
  id: string;
  title: string;
  status: Goal["status"];
  unit: string;
  baseline?: number;
  target: number;
  current?: number;
  /** 0 to 1, or null when there is no reading yet. */
  fraction: number | null;
  targetReached: boolean;
  targetDate: string;
  reviewEveryDays: number;
}
export interface ProfileNote {
  id: string;
  kind: TrainerReview["kind"];
  authorName: string;
  authorIsMe: boolean;
  body: string;
  createdAt: string;
  followUpOn?: string;
  effort?: number;
  recovery?: number;
  obstacles?: string;
}
export interface ProfileVersion {
  id: string;
  versionNumber: number;
  name: string;
  startsOn: string;
  publishedAt?: string;
  authorName: string;
  current: boolean;
}

export interface ClientProfile {
  memberId: string;
  name: string;
  firstName: string;
  joinedOn: string;
  phone: string;
  email?: string;
  branchName: string;
  membership: { status: Membership["status"]; planName: string; startsOn: string; endsOn?: string; visitsRemaining: number | null };
  credits: CreditBalance;
  trainer: { assignedOn: string; previous: Array<{ trainerName: string; from: string; to?: string }> };
  program?: { programId: string; name: string; versionNumber: number; startsOn: string; authorName: string; versions: ProfileVersion[] };
  adherence: { completionRate: number | null; completed: number; partial: number; skipped: number; missed: number; scheduled: number };
  weeks: WeekStat[];
  logs: ProfileLog[];
  goals: ProfileGoal[];
  notes: ProfileNote[];
  review?: { dueOn: string; daysOver: number; overdue: boolean; reason: string; cadenceDays: number };
  flags: ClientFlag[];
  missed?: { missed: number; scheduled: number; lastDoneOn?: string };
  awaiting?: { daysWaiting: number; planName: string };
  expiring?: { credits: number; expiresOn: string; daysLeft: number };
  /** Whether the member agrees to assessments. The assessment itself is read through `getAssessment`. */
  assessmentConsent: "agreed" | "withdrawn" | "none";
  today: string;
}

/** T02, T05, T06, A02: one client, for the trainer who has them. */
export async function getClient(session: Session | null, memberId: string): Promise<ClientProfile> {
  const c = await openTrainer(session);
  const book = await loadBook(c);
  const k = book.clients.find((x) => x.member.id === memberId);
  if (!k) throw new ApiError("not_found", "We couldn’t find this client. They may have moved to another trainer.");
  const [users, branches, allAssignments, consents, measurements] = await Promise.all([
    db.users.where("tenantId").equals(c.tenantId).toArray(),
    db.branches.where("tenantId").equals(c.tenantId).toArray(),
    db.trainerAssignments.where("memberId").equals(memberId).toArray(),
    db.consents.where("memberId").equals(memberId).toArray(),
    db.measurements.where("memberId").equals(memberId).toArray(),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const finished = k.logs.filter((l): l is WorkoutLog & { status: ProfileLog["status"] } => l.status !== "draft");
  const planTitle = (l: WorkoutLog) => k.plans.find((p) => p.id === l.planVersionId)?.days.find((d) => d.weekIndex === l.weekIndex && d.dayIndex === l.dayIndex)?.title ?? "Workout";
  const logs: ProfileLog[] = [...finished]
    .sort((a, b) => b.scheduledOn.localeCompare(a.scheduledOn))
    .slice(0, 12)
    .map((l) => ({
      id: l.id, date: l.scheduledOn, title: planTitle(l), status: l.status, enteredByName: l.enteredByRole === "trainer" ? (userName.get(l.enteredBy) ?? "A trainer") : "The member", enteredByRole: l.enteredByRole,
      effort: l.effort, notes: l.notes, volumeKg: volumeKg(l), corrected: l.corrections.length > 0,
    }));

  const sortedPlans = [...k.plans].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const current = sortedPlans.filter((p) => p.startsOn <= c.today).at(-1) ?? sortedPlans[0];
  const program = current && {
    programId: current.programId, name: current.name, versionNumber: current.versionNumber, startsOn: current.startsOn, authorName: userName.get(current.authorId) ?? "A trainer",
    versions: sortedPlans.map((p) => ({ id: p.id, versionNumber: p.versionNumber, name: p.name, startsOn: p.startsOn, publishedAt: p.publishedAt, authorName: userName.get(p.authorId) ?? "A trainer", current: p.id === current.id })).reverse(),
  };
  const adh = adherence(k.plans, k.logs, addDays(c.today, -28), addDays(c.today, -1), c.today);

  const goals: ProfileGoal[] = k.goals.map((g) => {
    const now = currentFor(g.metric, measurements, finished, c.today);
    const pr = goalProgress(g, now);
    return { id: g.id, title: g.title, status: g.status, unit: g.unit, baseline: g.baseline, target: g.target, current: now, fraction: pr.fraction, targetReached: pr.reached, targetDate: g.targetDate, reviewEveryDays: g.reviewEveryDays };
  }).sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.targetDate.localeCompare(b.targetDate));

  // What the trainer may read: shared reviews and the member’s check-ins from anyone (authors kept), but private notes only
  // their own. A note a previous trainer kept to themselves never reaches the new trainer.
  const notes: ProfileNote[] = k.reviews
    .filter((r) => r.kind !== "private_note" || r.authorId === c.trainerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ id: r.id, kind: r.kind, authorName: r.kind === "member_checkin" ? "The member" : (userName.get(r.authorId) ?? "A trainer"), authorIsMe: r.authorId === c.trainerId, body: r.body, createdAt: r.createdAt, followUpOn: r.followUpOn, effort: r.effort, recovery: r.recovery, obstacles: r.obstacles }));

  const consent = consents.filter((x) => x.scope === "assessments").sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))[0];
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  return {
    memberId, name: k.member.name, firstName: k.member.name.split(" ")[0]!, joinedOn: k.member.joinedOn, phone: k.member.phone, email: k.member.email, branchName: branchName.get(k.member.homeBranchId) ?? "",
    membership: { status: k.membership.status, planName: k.membership.terms.name, startsOn: k.membership.startsOn, endsOn: k.membership.endsOn, visitsRemaining: k.membership.visitsRemaining },
    credits: k.credits,
    trainer: {
      assignedOn: k.assignment.effectiveFrom,
      previous: allAssignments.filter((a) => a.id !== k.assignment.id && a.trainerId !== c.trainerId).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map((a) => ({ trainerName: userName.get(a.trainerId) ?? "A trainer", from: a.effectiveFrom, to: a.effectiveTo })),
    },
    program,
    adherence: { completionRate: adh.completionRate, completed: adh.completed, partial: adh.partial, skipped: adh.skipped, missed: adh.missed, scheduled: adh.scheduled },
    weeks: weekStats(k.plans, k.logs, k.membership.freezes, addDays(c.today, -35), c.today),
    logs, goals, notes,
    review: k.review && { dueOn: k.review.dueOn, daysOver: k.review.daysOver, overdue: k.review.overdue, reason: k.review.reason, cadenceDays: k.cadenceDays },
    flags: flagsOf(k),
    missed: k.missed && { missed: k.missed.missed, scheduled: k.missed.scheduled, lastDoneOn: k.missed.lastDoneOn },
    awaiting: k.awaiting, expiring: k.expiring,
    assessmentConsent: !consent ? "none" : consent.withdrawnAt ? "withdrawn" : "agreed",
    today: c.today,
  };
}

export interface NoteInput {
  memberId: string;
  body: string;
}

/** A note only the author can read (T06). It stays with its author if the client moves to another trainer. */
export async function addPrivateNote(session: Session | null, input: NoteInput): Promise<ProfileNote> {
  const { principal } = await open(session);
  assertCan(principal, "note.private");
  const c = await openTrainer(session);
  const book = await loadBook(c);
  if (!book.clients.some((x) => x.member.id === input.memberId)) throw new ApiError("not_found", "We couldn’t find this client. They may have moved to another trainer.");
  const body = input.body.trim();
  if (!body) throw new ApiError("invalid", "Write something first.");
  const row: TrainerReview = { id: `rv_${crypto.randomUUID()}`, tenantId: c.tenantId, memberId: input.memberId, kind: "private_note", authorId: c.trainerId, body, createdAt: c.nowIso };
  await db.trainerReviews.add(row);
  const me = await db.users.get(c.trainerId);
  return { id: row.id, kind: row.kind, authorName: me?.name ?? "You", authorIsMe: true, body, createdAt: row.createdAt };
}
