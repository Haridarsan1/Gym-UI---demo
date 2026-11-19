import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { openTrainer, type TrainerContext } from "@/api/trainer";
import { buildAuditEvent, type AuditInput } from "@/domain/audit";
import { PT_CREDIT_COST } from "@/domain/booking";
import { creditBalance, type CreditBalance } from "@/domain/credits";
import { addDays, istDateOf } from "@/domain/dates";
import { ATTENDANCE_DEFAULTS, attendanceBlockedReason, attendanceSettlement, creditRuleText, leaveConflicts, leaveProblem, rangesOverlap, weeklyProblem, windowProblem, type AttendanceOutcome } from "@/domain/schedule";
import { nextFree, slotKeyFor, slotsForHorizon, weekdayOf, type Slot } from "@/domain/slots";
import type { Booking, CreditLedgerEntry, GymPolicies, TrainerAvailability, TrainerLeave, TrainerShift } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * The trainer’s schedule (O01, O02, T04, M06): the weekly availability, one-off shifts, leave, today’s and upcoming sessions,
 * marking each attended or a no-show with the credit rule applied, and the sessions that clash with leave. Everything is the
 * signed-in trainer’s own. Leave blocks new bookings; sessions already booked on those days are shown as conflicts, and the
 * trainer can move them to another time or another trainer. The member gets an email and the credit is not affected.
 */

const DEFAULT_NO_SHOW_CONSUMES = true;
export const SLOT_TAKEN = "That time was just taken.";

async function openSchedule(session: Session | null) {
  const t = await openTrainer(session);
  assertCan(t.principal, "schedule.manage", { tenantId: t.tenantId, ownerUserId: t.trainerId });
  return t;
}

const rid = (prefix: string) => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
const audit = (t: TrainerContext, input: AuditInput) => db.auditEvents.add(buildAuditEvent(t.principal, input, rid("ae"), now()));

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  memberId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  branchId: string;
  branchName: string;
  status: "booked" | "attended" | "no_show";
  /** For a finished session: whether its credit was used or went back. */
  credit?: "used" | "returned";
  /** “Attended” can be marked now. */
  markable: boolean;
  /** “No-show” can be marked now (a little later than attended), with the reason when it can’t. */
  noShowReason?: string;
  /** The session’s time has passed and it is still unmarked. */
  awaitingMark: boolean;
  blockedReason?: string;
  conflict?: { leaveId: string; from: string; to: string; reason?: string };
}

export interface ScheduleData {
  today: string;
  nowIso: string;
  firstName: string;
  noShowConsumesCredit: boolean;
  /** How long a session is, from the gym’s policy. */
  sessionMinutes: number;
  /** What each button does to the credit, in words, from the gym’s rule. */
  creditRules: { attended: string; no_show: string };
  branches: Array<{ id: string; name: string }>;
  /** From a week ago to four weeks ahead, newest last. */
  sessions: SessionRow[];
  availability: Array<{ id: string; branchId: string; branchName: string; weekday: number; start: string; end: string }>;
  shifts: Array<{ id: string; branchId: string; branchName: string; date: string; start: string; end: string; note?: string }>;
  leave: Array<{ id: string; from: string; to: string; reason?: string; conflicts: number }>;
  /** Booked sessions on leave days. The same rows as in `sessions`, with `conflict` set. */
  conflicts: SessionRow[];
}

export const policyOf = (p: GymPolicies | undefined) => ({ noShowAfterMinutes: p?.noShowAfterMinutes ?? ATTENDANCE_DEFAULTS.noShowAfterMinutes, markWindowHours: p?.markWindowHours ?? ATTENDANCE_DEFAULTS.markWindowHours, noShowConsumesCredit: p?.noShowConsumesCredit ?? DEFAULT_NO_SHOW_CONSUMES, sessionMinutes: p?.sessionMinutes ?? 60, bookingHorizonDays: p?.bookingHorizonDays ?? 14 });

export async function getSchedule(session: Session | null): Promise<ScheduleData> {
  const t = await openSchedule(session);
  const [bookings, members, branches, availability, shifts, leaveRows, ledger, policies, me] = await Promise.all([
    db.bookings.where("trainerId").equals(t.trainerId).toArray(),
    db.members.where("tenantId").equals(t.tenantId).toArray(),
    db.branches.where("tenantId").equals(t.tenantId).toArray(),
    db.trainerAvailability.where("trainerId").equals(t.trainerId).toArray(),
    db.trainerShifts.where("trainerId").equals(t.trainerId).toArray(),
    db.trainerLeave.where("trainerId").equals(t.trainerId).toArray(),
    db.creditLedger.where("tenantId").equals(t.tenantId).toArray(),
    db.gymPolicies.where("tenantId").equals(t.tenantId).first(),
    db.users.get(t.trainerId),
  ]);
  const policy = policyOf(policies);
  const name = new Map(members.map((m) => [m.id, m.name]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const mine = branches.filter((b) => t.principal.branchIds.includes(b.id));
  const liveLeave = leaveRows.filter((l) => !l.canceledAt && l.to >= t.today);
  const clashes = new Map(leaveConflicts(bookings, leaveRows, t.nowIso).map((c) => [c.booking.id, c.leave as TrainerLeave]));
  const settled = (b: Booking) => (b.creditEntryId ? ledger.filter((e) => e.refEntryId === b.creditEntryId) : []);
  const from = addDays(t.today, -7);
  const to = addDays(t.today, 28);
  const rows = bookings
    .filter((b) => b.kind === "pt_session" && b.status !== "canceled" && istDateOf(b.startsAt) >= from && istDateOf(b.startsAt) <= to)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((b): SessionRow => {
      const blocked = attendanceBlockedReason(b, t.nowIso, "attended", policy);
      const noShowBlocked = attendanceBlockedReason(b, t.nowIso, "no_show", policy);
      const l = clashes.get(b.id);
      const done = settled(b);
      return {
        id: b.id, memberId: b.memberId, name: name.get(b.memberId) ?? "Client", startsAt: b.startsAt, endsAt: b.endsAt, branchId: b.branchId, branchName: branchName.get(b.branchId) ?? "",
        status: b.status as SessionRow["status"], credit: b.status === "booked" ? undefined : done.some((e) => e.kind === "consumption") ? "used" : done.some((e) => e.kind === "release") ? "returned" : undefined,
        markable: !blocked || !noShowBlocked, noShowReason: noShowBlocked, awaitingMark: b.status === "booked" && Date.parse(b.endsAt) <= Date.parse(t.nowIso), blockedReason: blocked,
        conflict: l && { leaveId: l.id, from: l.from, to: l.to, reason: l.reason },
      };
    });
  return {
    today: t.today, nowIso: t.nowIso, firstName: (me?.name ?? "").split(" ")[0] ?? "", noShowConsumesCredit: policy.noShowConsumesCredit, sessionMinutes: policy.sessionMinutes,
    creditRules: { attended: creditRuleText("attended", policy.noShowConsumesCredit), no_show: creditRuleText("no_show", policy.noShowConsumesCredit) },
    branches: mine.map((b) => ({ id: b.id, name: b.name })),
    sessions: rows,
    availability: availability.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)).map((a) => ({ id: a.id, branchId: a.branchId, branchName: branchName.get(a.branchId) ?? "", weekday: a.weekday, start: a.start, end: a.end })),
    shifts: shifts.filter((s) => s.date >= t.today).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)).map((s) => ({ id: s.id, branchId: s.branchId, branchName: branchName.get(s.branchId) ?? "", date: s.date, start: s.start, end: s.end, note: s.note })),
    leave: liveLeave.sort((a, b) => a.from.localeCompare(b.from)).map((l) => ({ id: l.id, from: l.from, to: l.to, reason: l.reason, conflicts: rows.filter((r) => r.conflict?.leaveId === l.id).length })),
    conflicts: rows.filter((r) => r.conflict),
  };
}

// ── Availability, shifts and leave ──────────────────────────────────────────────────────────────

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Enter the times as hours and minutes.");
const Windows = z.object({ windows: z.array(z.object({ branchId: z.string().min(1), weekday: z.number().int().min(0).max(6), start: hhmm, end: hhmm })).max(40) });
export type AvailabilityInput = z.input<typeof Windows>;

const parse = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError("invalid", r.error.issues[0]?.message ?? "Check what you entered and try again.");
  return r.data;
};

const inMyBranch = (t: TrainerContext, branchId: string) => {
  if (!t.principal.branchIds.includes(branchId)) throw new ApiError("forbidden", "You can only set hours at the branches you work at.");
};

/** Replaces the weekly pattern: when, at which branch, between which times. Existing bookings are left as they are. */
export async function saveAvailability(session: Session | null, raw: AvailabilityInput): Promise<{ windows: number }> {
  const t = await openSchedule(session);
  const { windows } = parse(Windows, raw);
  for (const w of windows) inMyBranch(t, w.branchId);
  const problem = weeklyProblem(windows);
  if (problem) throw new ApiError("invalid", problem);
  await db.transaction("rw", [db.trainerAvailability, db.auditEvents], async () => {
    const old = await db.trainerAvailability.where("trainerId").equals(t.trainerId).toArray();
    await db.trainerAvailability.bulkDelete(old.map((o) => o.id));
    const rows: TrainerAvailability[] = windows.map((w) => ({ id: `av_${t.trainerId}_${w.weekday}_${w.start.replace(":", "")}`, tenantId: t.tenantId, trainerId: t.trainerId, branchId: w.branchId, weekday: w.weekday, start: w.start, end: w.end }));
    await db.trainerAvailability.bulkAdd(rows);
    await audit(t, { action: "schedule.change", entityType: "availability", entityId: t.trainerId, details: { windows: rows.length, before: old.length } });
  });
  return { windows: windows.length };
}

const ShiftInput = z.object({ branchId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date of the shift."), start: hhmm, end: hhmm, note: z.string().max(200).optional(), key: z.string().min(8) });
export type ShiftInput = z.input<typeof ShiftInput>;

/** A one-off window on a date, such as covering a Sunday or another branch. It adds hours; it removes none. */
export async function addShift(session: Session | null, raw: ShiftInput): Promise<{ id: string; repeated: boolean }> {
  const t = await openSchedule(session);
  const s = parse(ShiftInput, raw);
  inMyBranch(t, s.branchId);
  if (s.date < t.today) throw new ApiError("invalid", "A shift can’t be in the past.");
  const bad = windowProblem(s);
  if (bad) throw new ApiError("invalid", bad);
  const id = `sh_${s.key}`;
  return db.transaction("rw", [db.trainerShifts, db.trainerAvailability, db.trainerLeave, db.auditEvents], async () => {
    if (await db.trainerShifts.get(id)) return { id, repeated: true };
    const [shifts, weekly, leave] = await Promise.all([db.trainerShifts.where("trainerId").equals(t.trainerId).toArray(), db.trainerAvailability.where("trainerId").equals(t.trainerId).toArray(), db.trainerLeave.where("trainerId").equals(t.trainerId).toArray()]);
    if (leave.some((l) => !l.canceledAt && l.from <= s.date && s.date <= l.to)) throw new ApiError("conflict", "You are on leave that day. Cancel the leave first, or choose another date.");
    const clash = (x: { branchId: string; start: string; end: string }) => x.start < s.end && s.start < x.end && x.branchId !== s.branchId;
    if (shifts.some((x) => x.date === s.date && clash(x)) || weekly.some((x) => x.weekday === weekdayOf(s.date) && clash(x))) throw new ApiError("conflict", "You already work at another branch at that time.");
    const row: TrainerShift = { id, tenantId: t.tenantId, trainerId: t.trainerId, branchId: s.branchId, date: s.date, start: s.start, end: s.end, note: s.note?.trim() || undefined, createdAt: t.nowIso };
    await db.trainerShifts.add(row);
    await audit(t, { action: "schedule.change", entityType: "shift", entityId: id, details: { date: s.date, start: s.start, end: s.end, branchId: s.branchId } });
    return { id, repeated: false };
  });
}

export async function removeShift(session: Session | null, id: string): Promise<void> {
  const t = await openSchedule(session);
  await db.transaction("rw", [db.trainerShifts, db.auditEvents], async () => {
    const row = await db.trainerShifts.get(id);
    if (!row || row.trainerId !== t.trainerId) throw new ApiError("not_found", "We couldn’t find that shift. It may already be removed.");
    await db.trainerShifts.delete(id);
    await audit(t, { action: "schedule.change", entityType: "shift", entityId: id, details: { removed: true, date: row.date } });
  });
}

const LeaveInput = z.object({ from: z.string(), to: z.string(), reason: z.string().max(200).optional(), key: z.string().min(8) });
export type LeaveInput = z.input<typeof LeaveInput>;

/**
 * Adds leave. It blocks new bookings on those days at once. Sessions already booked then are returned as conflicts for the
 * trainer to move; nothing is canceled for them.
 */
export async function addLeave(session: Session | null, raw: LeaveInput): Promise<{ id: string; conflicts: number; repeated: boolean }> {
  const t = await openSchedule(session);
  const l = parse(LeaveInput, raw);
  const bad = leaveProblem(l, t.today);
  if (bad) throw new ApiError("invalid", bad);
  const id = `lv_${l.key}`;
  return db.transaction("rw", [db.trainerLeave, db.bookings, db.auditEvents], async () => {
    const again = await db.trainerLeave.get(id);
    if (again) return { id, conflicts: leaveConflicts(await db.bookings.where("trainerId").equals(t.trainerId).toArray(), [again], t.nowIso).length, repeated: true };
    const rows = await db.trainerLeave.where("trainerId").equals(t.trainerId).toArray();
    if (rows.some((x) => !x.canceledAt && rangesOverlap(x, l))) throw new ApiError("conflict", "You already have leave on some of those days.");
    const row: TrainerLeave = { id, tenantId: t.tenantId, trainerId: t.trainerId, from: l.from, to: l.to, reason: l.reason?.trim() || undefined, createdBy: t.trainerId, createdAt: t.nowIso };
    await db.trainerLeave.add(row);
    const conflicts = leaveConflicts(await db.bookings.where("trainerId").equals(t.trainerId).toArray(), [row], t.nowIso).length;
    await audit(t, { action: "schedule.change", entityType: "leave", entityId: id, reason: row.reason, details: { from: l.from, to: l.to, conflicts } });
    return { id, conflicts, repeated: false };
  });
}

/** Ends leave that has not finished. The record stays, and its days open for booking again. */
export async function cancelLeave(session: Session | null, id: string): Promise<void> {
  const t = await openSchedule(session);
  await db.transaction("rw", [db.trainerLeave, db.auditEvents], async () => {
    const row = await db.trainerLeave.get(id);
    if (!row || row.trainerId !== t.trainerId) throw new ApiError("not_found", "We couldn’t find that leave.");
    if (row.canceledAt) return;
    if (row.to < t.today) throw new ApiError("conflict", "That leave is already over.");
    await db.trainerLeave.update(id, { canceledAt: t.nowIso });
    await audit(t, { action: "schedule.change", entityType: "leave", entityId: id, details: { canceled: true, from: row.from, to: row.to } });
  });
}

// ── Attended and no-show ────────────────────────────────────────────────────────────────────────

const Mark = z.object({ bookingId: z.string().min(1), outcome: z.enum(["attended", "no_show"]) });
export type MarkInput = z.input<typeof Mark>;

export interface MarkResult {
  bookingId: string;
  outcome: AttendanceOutcome;
  /** What happened to the session’s credit. */
  credit: "used" | "returned" | "none";
  credits: CreditBalance;
  repeated: boolean;
}

/**
 * Marks one of the trainer’s sessions attended or a no-show, from its start time on. The reserved credit is settled by the rule: attended
 * uses it; a no-show uses it or gives it back by the gym’s policy (M06). Marking the same outcome again changes nothing; a session that
 * is already marked the other way is not changed here. Each is audited.
 */
export async function markAttendance(session: Session | null, raw: MarkInput): Promise<MarkResult> {
  const t = await openSchedule(session);
  const input = parse(Mark, raw);
  return db.transaction("rw", db.tables, async () => {
    const b = await db.bookings.get(input.bookingId);
    if (!b || b.kind !== "pt_session" || b.trainerId !== t.trainerId || b.tenantId !== t.tenantId) throw new ApiError("not_found", "We couldn’t find that session. It may belong to another trainer.");
    assertCan(t.principal, "booking.manage", { tenantId: t.tenantId, memberId: b.memberId, ownerUserId: b.trainerId });
    const ledger = await db.creditLedger.where("memberId").equals(b.memberId).toArray();
    const settledCredit = (): MarkResult["credit"] => {
      const done = b.creditEntryId ? ledger.filter((e) => e.refEntryId === b.creditEntryId) : [];
      return done.some((e) => e.kind === "consumption") ? "used" : done.some((e) => e.kind === "release") ? "returned" : "none";
    };
    if (b.status === input.outcome) return { bookingId: b.id, outcome: input.outcome, credit: settledCredit(), credits: creditBalance(ledger), repeated: true };
    const policy = policyOf(await db.gymPolicies.where("tenantId").equals(t.tenantId).first());
    const blocked = attendanceBlockedReason(b, t.nowIso, input.outcome, policy);
    if (blocked) throw new ApiError("conflict", blocked);
    const settle = attendanceSettlement(input.outcome, policy.noShowConsumesCredit);
    let next = ledger;
    if (b.creditEntryId) {
      const entry: CreditLedgerEntry = {
        id: `cr_${b.memberId}_${settle}_${b.id}`, tenantId: t.tenantId, memberId: b.memberId, membershipId: ledger.find((e) => e.id === b.creditEntryId)?.membershipId, kind: settle === "consume" ? "consumption" : "release", credits: PT_CREDIT_COST,
        bookingId: b.id, refEntryId: b.creditEntryId, reason: input.outcome === "attended" ? "Session attended" : settle === "consume" ? "No-show: the credit is used" : "No-show: the credit goes back", createdBy: t.trainerId, createdAt: t.nowIso, idempotencyKey: `mark:${b.id}:${settle}`,
      };
      if (!(await db.creditLedger.get(entry.id))) await db.creditLedger.add(entry);
      next = [...ledger, entry];
    }
    await db.bookings.update(b.id, { status: input.outcome });
    await audit(t, { action: "booking.attendance", entityType: "booking", entityId: b.id, memberId: b.memberId, details: { outcome: input.outcome, credit: settle === "consume" ? "used" : "returned", startsAt: b.startsAt } });
    return { bookingId: b.id, outcome: input.outcome, credit: b.creditEntryId ? (settle === "consume" ? "used" : "returned") : "none", credits: creditBalance(next), repeated: false };
  });
}

// ── Leave conflicts: move a session ─────────────────────────────────────────────────────────────

/** Who is acting on a booking: a trainer on their own, or desk staff within their branches. */
export interface Actor {
  principal: TrainerContext["principal"];
  tenantId: string;
  today: string;
  nowIso: string;
}

export async function slotsOf(t: Actor, trainerId: string, branchId: string, excludeBookingId: string) {
  const [availability, branch, bookings, shifts, leave, policies] = await Promise.all([
    db.trainerAvailability.where("trainerId").equals(trainerId).toArray(),
    db.branches.get(branchId),
    db.bookings.where("trainerId").equals(trainerId).toArray(),
    db.trainerShifts.where("trainerId").equals(trainerId).toArray(),
    db.trainerLeave.where("trainerId").equals(trainerId).toArray(),
    db.gymPolicies.where("tenantId").equals(t.tenantId).first(),
  ]);
  const policy = policyOf(policies);
  return slotsForHorizon({
    availability: availability.filter((a) => a.branchId === branchId), branchHours: branch?.hours ?? [], sessionMinutes: policy.sessionMinutes,
    busy: bookings.filter((b) => b.status === "booked" && b.id !== excludeBookingId), nowIso: t.nowIso, today: t.today, horizonDays: policy.bookingHorizonDays, leave, shifts: shifts.filter((s) => s.branchId === branchId),
  });
}

export interface ConflictOptions {
  booking: { id: string; name: string; startsAt: string; branchName: string };
  /** Other times with you, outside your leave. */
  sameTrainer: Slot[];
  /** Other trainers at the same branch with their next free times. */
  others: Array<{ trainerId: string; name: string; slots: Slot[] }>;
}

/** Where a session that clashes with leave can go: your own next free times, and other trainers’ at the same branch. */
export async function getConflictOptions(session: Session | null, bookingId: string): Promise<ConflictOptions> {
  const t = await openSchedule(session);
  return conflictOptions(t, bookingId, (b) => b.trainerId === t.trainerId);
}

/** The same, for whoever is allowed to move the booking (`mayMove`): the trainer it belongs to, or desk staff at its branch. */
export async function conflictOptions(t: Actor, bookingId: string, mayMove: (b: Booking) => boolean): Promise<ConflictOptions> {
  const b = await db.bookings.get(bookingId);
  if (!b || !mayMove(b) || b.kind !== "pt_session" || b.status !== "booked") throw new ApiError("not_found", "We couldn’t find that session. It may already be moved.");
  const [member, users, staff, branch] = await Promise.all([db.members.get(b.memberId), db.users.where("tenantId").equals(t.tenantId).toArray(), db.staffRoles.where("tenantId").equals(t.tenantId).toArray(), db.branches.get(b.branchId)]);
  const mine = await slotsOf(t, b.trainerId!, b.branchId, b.id);
  const others: ConflictOptions["others"] = [];
  for (const s of staff.filter((x) => x.role === "trainer" && x.userId !== b.trainerId && x.branchIds.includes(b.branchId))) {
    const days = await slotsOf(t, s.userId, b.branchId, b.id);
    const slots = nextFree(days, t.nowIso, 6);
    if (slots.length) others.push({ trainerId: s.userId, name: users.find((u) => u.id === s.userId)?.name ?? "Trainer", slots });
  }
  return { booking: { id: b.id, name: member?.name ?? "Client", startsAt: b.startsAt, branchName: branch?.name ?? "" }, sameTrainer: nextFree(mine, t.nowIso, 8), others };
}

export const Move = z.object({ bookingId: z.string().min(1), startsAt: z.string().datetime(), trainerId: z.string().min(1).optional(), key: z.string().min(8) });
export type MoveInput = z.input<typeof Move>;

/**
 * Moves a session that clashes with leave to another time with its trainer, or to another trainer. The one credit already reserved stays with the session, so the
 * member’s balance does not change; they get an email with the new time. Free slots are checked again inside the write, so two requests for one slot make one
 * booking (A03).
 */
export async function moveSession(session: Session | null, raw: MoveInput): Promise<{ bookingId: string; trainerId: string; startsAt: string; repeated: boolean }> {
  const t = await openSchedule(session);
  const input = parse(Move, raw);
  return moveBooking(t, input, (b) => b.trainerId === t.trainerId, "Trainer leave");
}

/** The move itself, for whoever may do it: `mayMove` says whether this person may move that booking. */
export async function moveBooking(t: Actor, input: z.output<typeof Move>, mayMove: (b: Booking) => boolean, reason: string): Promise<{ bookingId: string; trainerId: string; startsAt: string; repeated: boolean }> {
  return db.transaction("rw", db.tables, async () => {
    const b = await db.bookings.get(input.bookingId);
    if (!b || b.kind !== "pt_session") throw new ApiError("not_found", "We couldn’t find that session. It may already be moved.");
    // The same key again is the same move: the session is where it was asked to go, and nothing else happens.
    const done = (await db.auditEvents.where("action").equals("booking.move").toArray()).find((e) => e.entityId === b.id && e.details?.key === input.key);
    if (done) return { bookingId: b.id, trainerId: b.trainerId!, startsAt: b.startsAt, repeated: true };
    if (!mayMove(b)) throw new ApiError("not_found", "We couldn’t find that session. It may already be moved.");
    if (b.status !== "booked") throw new ApiError("conflict", "This session is already finished or canceled.");
    const leave = await db.trainerLeave.where("trainerId").equals(b.trainerId!).toArray();
    if (!leaveConflicts([b], leave, t.nowIso).length) throw new ApiError("conflict", "This session doesn’t clash with the trainer’s leave, so it stays with the member to change.");
    const toTrainer = input.trainerId ?? b.trainerId!;
    const days = await slotsOf(t, toTrainer, b.branchId, b.id);
    const slot = days.flatMap((d) => d.slots).find((s) => s.startsAt === input.startsAt);
    if (!slot || slot.taken) throw new ApiError("conflict", SLOT_TAKEN, { nextFree: nextFree(days, t.nowIso, 4) });
    const date = istDateOf(slot.startsAt);
    const slotKey = slotKeyFor(toTrainer, date, slot.time);
    await db.bookings.update(b.id, { trainerId: toTrainer, startsAt: slot.startsAt, endsAt: slot.endsAt, slotKey });
    const [member, tenant, from, to] = await Promise.all([db.members.get(b.memberId), db.tenants.get(t.tenantId), db.users.get(b.trainerId!), db.users.get(toTrainer)]);
    const first = (member?.name ?? "").split(" ")[0] ?? "";
    const coach = (n?: string) => `Coach ${(n ?? "your trainer").split(" ")[0]}`;
    const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());
    await db.emailLog.add({
      id: rid("em"), tenantId: t.tenantId, memberId: b.memberId, bookingId: b.id, template: "booking_rescheduled", to: member?.email,
      subject: `Your session has moved to ${when(slot.startsAt)}`,
      body: [`Hi ${first},`, "", `${coach(from?.name)} is away on ${when(b.startsAt)}, so your training session has moved to ${when(slot.startsAt)}${toTrainer !== b.trainerId ? ` with ${coach(to?.name)}` : ""}.`, "Your session credit is not affected. If the new time doesn’t suit you, you can change it in the app.", "", tenant?.name ?? "Your gym"].join("\n"),
      status: member?.email ? "sent" : "skipped", detail: member?.email ? undefined : "No email address on file for this member.", sentAt: t.nowIso,
    });
    await db.auditEvents.add(buildAuditEvent(t.principal, { action: "booking.move", entityType: "booking", entityId: b.id, memberId: b.memberId, reason, details: { from: b.startsAt, to: slot.startsAt, trainer: toTrainer, key: input.key } }, rid("ae"), now()));
    return { bookingId: b.id, trainerId: toTrainer, startsAt: slot.startsAt, repeated: false };
  });
}
