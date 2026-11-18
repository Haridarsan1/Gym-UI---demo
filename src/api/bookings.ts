import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { ApiError } from "@/api/errors";
import { openMember, type MemberContext } from "@/api/member";
import { PT_CREDIT_COST, cancellationDeadline, cancellationOutcome, cancellationSettlement, canReschedule } from "@/domain/booking";
import { canReserve, creditBalance, type CreditBalance } from "@/domain/credits";
import { assignmentOn, currentMembership } from "@/domain/membership";
import { nextFree, slotKeyFor, slotsForHorizon, type Slot } from "@/domain/slots";
import type { Booking, CreditLedgerEntry, EmailLogEntry, GymPolicies, Member } from "@/domain/types";
import { exactWhen, lateTermsText, whenText } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Everything Bookings reads and writes (T04, O01, M06), for the signed-in member only. A booking reserves one credit; a
 * cancellation in time gives it back, a late one or a no-show uses it; moving a booking keeps its one reserved credit. Every
 * write runs in one database transaction that checks the slot again, so two requests for one slot (two tabs, A03) give one
 * booking, and the credit balance stays right for the other.
 */

export const NO_CREDITS = "You have no training sessions left. Buy more sessions to book.";
export const SLOT_TAKEN = "That slot was just taken.";

export interface BookingPolicy {
  cancellationCutoffHours: number;
  lateCancelConsumesCredit: boolean;
  noShowConsumesCredit: boolean;
  bookingHorizonDays: number;
  sessionMinutes: number;
  /** Members may book with trainers other than their own. */
  membersMayChooseTrainer: boolean;
}

const DEFAULT_POLICY: BookingPolicy = { cancellationCutoffHours: 12, lateCancelConsumesCredit: true, noShowConsumesCredit: true, bookingHorizonDays: 14, sessionMinutes: 60, membersMayChooseTrainer: false };
const policyOf = (p: GymPolicies | undefined): BookingPolicy => (p ? { cancellationCutoffHours: p.cancellationCutoffHours, lateCancelConsumesCredit: p.lateCancelConsumesCredit, noShowConsumesCredit: p.noShowConsumesCredit, bookingHorizonDays: p.bookingHorizonDays, sessionMinutes: p.sessionMinutes, membersMayChooseTrainer: p.membersMayChooseTrainer ?? false } : DEFAULT_POLICY);

export interface BookingView {
  id: string;
  startsAt: string;
  endsAt: string;
  trainerId?: string;
  trainerName: string;
  branchName: string;
  status: Booking["status"];
  /** When free cancellation ends, and for a booked session what cancelling would do right now. */
  freeUntil: string;
  outcomeNow: "released" | "consumed" | "kept" | "too_late";
  canCancel: boolean;
  /** Moving it is free only while cancelling is free. */
  canReschedule: boolean;
  /** For a finished booking: whether its credit was used or returned. */
  credit?: "used" | "returned";
  /** The session time has passed but nobody has marked it attended, cancelled or a no-show yet. */
  awaitingMark: boolean;
}

export interface BookingsData {
  today: string;
  nowIso: string;
  credits: CreditBalance;
  policy: BookingPolicy;
  upcoming: BookingView[];
  past: BookingView[];
  /** Set when booking is closed for a reason other than credits, in words for the member. */
  blockedReason?: string;
}

function blockedReasonFor(status: string | undefined): string | undefined {
  if (!status) return "Ask the front desk to set up your membership, then you can book sessions.";
  if (status === "frozen") return "Your membership is frozen, so booking is paused. It opens again when your freeze ends.";
  if (status !== "active") return "Your membership is not active. Renew it to book sessions.";
  return undefined;
}

interface Env {
  c: MemberContext;
  member: Member;
  policy: BookingPolicy;
  ledger: CreditLedgerEntry[];
  membershipStatus?: string;
}

async function loadEnv(session: Session | null, write = false): Promise<Env> {
  const c = await openMember(session);
  assertCan(c.principal, write ? "booking.manage" : "booking.read", c.resource);
  assertCan(c.principal, "credits.read", c.resource);
  const [member, ledger, memberships, policies] = await Promise.all([
    db.members.get(c.memberId),
    db.creditLedger.where("memberId").equals(c.memberId).toArray(),
    db.memberships.where("memberId").equals(c.memberId).toArray(),
    db.gymPolicies.where("tenantId").equals(c.tenantId).first(),
  ]);
  if (!member) throw new ApiError("not_found", "We couldn’t find your membership record. Ask the front desk.");
  return { c, member, policy: policyOf(policies), ledger, membershipStatus: currentMembership(memberships)?.status };
}

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────

export async function getBookings(session: Session | null): Promise<BookingsData> {
  const env = await loadEnv(session);
  const { c, policy, ledger } = env;
  const [rows, users, branches] = await Promise.all([db.bookings.where("memberId").equals(c.memberId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray()]);
  const view = (b: Booking): BookingView => {
    const outcome = cancellationOutcome(b.startsAt, policy.cancellationCutoffHours, policy.lateCancelConsumesCredit, c.nowIso);
    const settled = b.creditEntryId ? ledger.filter((e) => e.refEntryId === b.creditEntryId) : [];
    return {
      id: b.id, startsAt: b.startsAt, endsAt: b.endsAt, trainerId: b.trainerId, trainerName: users.find((u) => u.id === b.trainerId)?.name ?? "Your trainer",
      branchName: branches.find((x) => x.id === b.branchId)?.name ?? "", status: b.status, freeUntil: cancellationDeadline(b.startsAt, policy.cancellationCutoffHours), outcomeNow: outcome,
      canCancel: b.status === "booked" && outcome !== "too_late", canReschedule: b.status === "booked" && canReschedule(b.startsAt, policy.cancellationCutoffHours, c.nowIso),
      credit: b.status === "booked" ? undefined : settled.some((e) => e.kind === "consumption") ? "used" : settled.some((e) => e.kind === "release") ? "returned" : undefined,
      awaitingMark: b.status === "booked" && Date.parse(b.endsAt) <= Date.parse(c.nowIso),
    };
  };
  const pt = rows.filter((b) => b.kind === "pt_session");
  const isUpcoming = (b: Booking) => b.status === "booked" && Date.parse(b.endsAt) > Date.parse(c.nowIso);
  return {
    today: c.today, nowIso: c.nowIso, credits: creditBalance(ledger), policy,
    upcoming: pt.filter(isUpcoming).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(view),
    past: pt.filter((b) => !isUpcoming(b)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map(view),
    blockedReason: blockedReasonFor(env.membershipStatus),
  };
}

export interface TrainerOption {
  trainerId: string;
  name: string;
  /** The member’s own trainer, always listed first. */
  assigned: boolean;
  branchName: string;
  /** The first free slot in the booking window. */
  nextFree?: string;
}

async function scheduleFor(env: Env, trainerId: string, excludeBookingId?: string) {
  const { c, member, policy } = env;
  const [availability, branch, busyRows] = await Promise.all([
    db.trainerAvailability.where("trainerId").equals(trainerId).toArray(),
    db.branches.get(member.homeBranchId),
    db.bookings.where("trainerId").equals(trainerId).toArray(),
  ]);
  const here = availability.filter((a) => a.branchId === member.homeBranchId);
  const busy = busyRows.filter((b) => b.status === "booked" && b.id !== excludeBookingId);
  const days = slotsForHorizon({ availability: here, branchHours: branch?.hours ?? [], sessionMinutes: policy.sessionMinutes, busy, nowIso: c.nowIso, today: c.today, horizonDays: policy.bookingHorizonDays });
  return { days, branch, hasAvailability: here.length > 0 };
}

/** Trainers the member can book at their home branch: their own trainer, then the others when the gym allows choosing. */
export async function getTrainerOptions(session: Session | null): Promise<{ trainers: TrainerOption[]; branchName: string; policy: BookingPolicy; hasAssignedTrainer: boolean }> {
  const env = await loadEnv(session);
  const { c, member, policy } = env;
  const [availability, users, assignments, branch] = await Promise.all([
    db.trainerAvailability.where("tenantId").equals(c.tenantId).toArray(),
    db.users.where("tenantId").equals(c.tenantId).toArray(),
    db.trainerAssignments.where("memberId").equals(c.memberId).toArray(),
    db.branches.get(member.homeBranchId),
  ]);
  const assigned = assignmentOn(assignments, c.today)?.trainerId;
  // Unless the gym lets members choose, the only trainer on offer is their own.
  const ids = [...new Set(availability.filter((a) => a.branchId === member.homeBranchId).map((a) => a.trainerId))].filter((id) => policy.membersMayChooseTrainer || id === assigned);
  const trainers: TrainerOption[] = [];
  for (const id of ids) {
    const { days } = await scheduleFor(env, id);
    trainers.push({ trainerId: id, name: users.find((u) => u.id === id)?.name ?? "Trainer", assigned: id === assigned, branchName: branch?.name ?? "", nextFree: nextFree(days, c.nowIso, 1)[0]?.startsAt });
  }
  trainers.sort((a, b) => Number(b.assigned) - Number(a.assigned) || a.name.localeCompare(b.name));
  return { trainers, branchName: branch?.name ?? "", policy, hasAssignedTrainer: assigned !== undefined };
}

/** One trainer’s days and slots in the booking window, with the ones already booked marked taken. */
export async function getTrainerSchedule(session: Session | null, trainerId: string, excludeBookingId?: string): Promise<{ trainerId: string; trainerName: string; branchName: string; days: Array<{ date: string; slots: Slot[] }>; nowIso: string }> {
  const env = await loadEnv(session);
  const existing = excludeBookingId ? (await db.bookings.get(excludeBookingId))?.trainerId : undefined;
  await assertTrainerAllowed(env, trainerId, existing);
  const [user, s] = await Promise.all([db.users.get(trainerId), scheduleFor(env, trainerId, excludeBookingId)]);
  if (!user || !s.hasAvailability) throw new ApiError("not_found", "That trainer has no sessions to book at your branch. Choose another trainer.");
  return { trainerId, trainerName: user.name, branchName: s.branch?.name ?? "", days: s.days, nowIso: env.c.nowIso };
}

/**
 * When the gym doesn’t let members choose, only the assigned trainer can be booked. A session already with another trainer
 * (the policy was off after it was made) can still be moved with that trainer.
 */
async function assertTrainerAllowed(env: Env, trainerId: string, keepTrainerId?: string): Promise<void> {
  if (env.policy.membersMayChooseTrainer || trainerId === keepTrainerId) return;
  const assigned = assignmentOn(await db.trainerAssignments.where("memberId").equals(env.c.memberId).toArray(), env.c.today)?.trainerId;
  if (trainerId !== assigned) throw new ApiError("forbidden", "Your gym books sessions with your own trainer. Choose your trainer to continue.");
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

const Key = z.string().min(8);
const BookInput = z.object({ trainerId: z.string().min(1), startsAt: z.string().datetime(), idempotencyKey: Key });
const RescheduleInput = BookInput.extend({ bookingId: z.string().min(1) });
const CancelInput = z.object({ bookingId: z.string().min(1), expectedOutcome: z.enum(["released", "consumed", "kept"]) });
export type BookInput = z.input<typeof BookInput>;
export type RescheduleInput = z.input<typeof RescheduleInput>;
export type CancelInput = z.input<typeof CancelInput>;

const parse = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError("invalid", "We couldn’t read that booking. Reload the page and try again.");
  return r.data;
};

export interface BookingResult {
  bookingId: string;
  credits: CreditBalance;
  /** True when this call repeated one that had already gone through. */
  repeated: boolean;
}

const rid = (prefix: string) => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

function slotTaken(days: Array<{ slots: Slot[] }>, afterIso: string): ApiError {
  return new ApiError("conflict", SLOT_TAKEN, { nextFree: nextFree(days, afterIso, 4) });
}

/** The email the member would get, written to the delivery log (O04). Nothing is really sent in demo mode. */
async function logEmail(env: Env, b: Pick<Booking, "id" | "startsAt">, template: EmailLogEntry["template"], detail: { subject: string; lines: string[] }): Promise<void> {
  const tenant = await db.tenants.get(env.c.tenantId);
  const to = env.member.email;
  const first = env.member.name.split(" ")[0] ?? env.member.name;
  const body = [`Hi ${first},`, "", ...detail.lines, "", tenant?.name ?? "Your gym"].join("\n");
  await db.emailLog.add({
    id: rid("em"), tenantId: env.c.tenantId, memberId: env.c.memberId, bookingId: b.id, template, to, subject: detail.subject, body,
    status: to ? "sent" : "skipped", detail: to ? undefined : "No email address on file for this member.", sentAt: env.c.nowIso,
  });
}

const coach = (name: string) => `Coach ${name.split(" ")[0]}`;

/** Books a session: checks the membership, the credit, the slot and the member’s own diary, then reserves one credit. */
export async function bookSession(session: Session | null, raw: BookInput): Promise<BookingResult> {
  const input = parse(BookInput, raw);
  const env = await loadEnv(session, true);
  const { c, member, policy } = env;
  return db.transaction("rw", db.tables, async () => {
    const again = await db.bookings.where("idempotencyKey").equals(input.idempotencyKey).first();
    if (again) {
      if (again.memberId !== c.memberId) throw new ApiError("conflict", "That booking could not be saved. Reload the page and try again.");
      return { bookingId: again.id, credits: creditBalance(await db.creditLedger.where("memberId").equals(c.memberId).toArray()), repeated: true };
    }
    const blocked = blockedReasonFor(env.membershipStatus);
    if (blocked) throw new ApiError("forbidden", blocked);
    const ledger = await db.creditLedger.where("memberId").equals(c.memberId).toArray();
    if (!canReserve(creditBalance(ledger), PT_CREDIT_COST)) throw new ApiError("conflict", NO_CREDITS);

    await assertTrainerAllowed(env, input.trainerId);
    const user = await db.users.get(input.trainerId);
    const { days, branch, hasAvailability } = await scheduleFor(env, input.trainerId);
    if (!user || !hasAvailability) throw new ApiError("not_found", "That trainer has no sessions to book at your branch. Choose another trainer.");
    const slot = days.flatMap((d) => d.slots).find((s) => s.startsAt === input.startsAt);
    if (!slot) throw new ApiError("invalid", "That time isn’t available any more. Choose another slot.");
    if (slot.taken) throw slotTaken(days, input.startsAt);

    const mine = (await db.bookings.where("memberId").equals(c.memberId).toArray()).filter((b) => b.status === "booked");
    if (mine.some((b) => Date.parse(b.startsAt) < Date.parse(slot.endsAt) && Date.parse(b.endsAt) > Date.parse(slot.startsAt))) throw new ApiError("conflict", "You already have a session at this time. Choose another slot.");

    const bookingId = rid("bk");
    const reservation = `cr_${c.memberId}_res_${bookingId}`;
    const membershipId = ledger.find((e) => e.kind === "purchase")?.membershipId;
    const entry: CreditLedgerEntry = { id: reservation, tenantId: c.tenantId, memberId: c.memberId, membershipId, kind: "reservation", credits: PT_CREDIT_COST, bookingId, createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `book:${input.idempotencyKey}:res` };
    const booking: Booking = {
      id: bookingId, tenantId: c.tenantId, memberId: c.memberId, branchId: member.homeBranchId, kind: "pt_session", trainerId: input.trainerId, startsAt: slot.startsAt, endsAt: slot.endsAt, status: "booked",
      creditEntryId: reservation, slotKey: slotKeyFor(input.trainerId, slot.date, slot.time), createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: input.idempotencyKey,
    };
    try {
      await db.bookings.add(booking); // the unique slot key is the last line of defence against a double booking
    } catch (e) {
      if ((e as { name?: string }).name === "ConstraintError") throw slotTaken(days, input.startsAt);
      throw e;
    }
    await db.creditLedger.add(entry);
    const deadline = cancellationDeadline(slot.startsAt, policy.cancellationCutoffHours);
    await logEmail(env, booking, "booking_confirmed", {
      subject: `Session booked: ${whenText(slot.startsAt, c.nowIso)}`,
      lines: [`Your training session with ${coach(user.name)} is booked for ${whenText(slot.startsAt, c.nowIso)} at ${branch?.name ?? "your branch"}.`, `One session credit is held for it. Free cancellation ends ${exactWhen(deadline)}.`, lateTermsText(deadline, c.nowIso, policy.lateCancelConsumesCredit, policy.noShowConsumesCredit)],
    });
    return { bookingId, credits: creditBalance([...ledger, entry]), repeated: false };
  });
}

/**
 * Cancels a booked session. `expectedOutcome` is what the member was told cancelling would do; if the free-cancellation
 * time passed while they were deciding, nothing happens and they are asked to confirm the new terms. In time the credit
 * goes back; late it is used when the gym’s policy says so.
 */
export async function cancelBooking(session: Session | null, raw: CancelInput): Promise<BookingResult & { outcome: "released" | "consumed" | "kept" }> {
  const input = parse(CancelInput, raw);
  const env = await loadEnv(session, true);
  const { c, policy } = env;
  return db.transaction("rw", db.tables, async () => {
    const b = await db.bookings.get(input.bookingId);
    if (!b || b.memberId !== c.memberId || b.kind !== "pt_session") throw new ApiError("not_found", "We couldn’t find that booking. It may already be canceled.");
    const ledger = await db.creditLedger.where("memberId").equals(c.memberId).toArray();
    if (b.status === "canceled") {
      const used = ledger.some((e) => e.kind === "consumption" && e.refEntryId === b.creditEntryId);
      return { bookingId: b.id, credits: creditBalance(ledger), repeated: true, outcome: used ? "consumed" : "released" };
    }
    if (b.status !== "booked") throw new ApiError("conflict", "This session is already finished, so it can’t be canceled.");
    const outcome = cancellationOutcome(b.startsAt, policy.cancellationCutoffHours, policy.lateCancelConsumesCredit, c.nowIso);
    const settle = cancellationSettlement(outcome);
    if (!settle || outcome === "too_late") throw new ApiError("conflict", "This session has already started, so it can’t be canceled.");
    if (outcome !== input.expectedOutcome) throw new ApiError("conflict", "The free-cancellation time just passed, so the terms changed. Check them and confirm again.");
    const entry: CreditLedgerEntry = {
      id: `cr_${c.memberId}_${settle}_${b.id}`, tenantId: c.tenantId, memberId: c.memberId, membershipId: ledger.find((e) => e.id === b.creditEntryId)?.membershipId, kind: settle === "consume" ? "consumption" : "release", credits: PT_CREDIT_COST,
      bookingId: b.id, refEntryId: b.creditEntryId, reason: outcome === "consumed" ? "Late cancellation" : "Canceled in time", createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `cancel:${b.id}:${settle}`,
    };
    await db.creditLedger.add(entry);
    await db.bookings.update(b.id, { status: "canceled", canceledAt: c.nowIso, cancelReason: "Canceled by member", slotKey: undefined });
    const user = await db.users.get(b.trainerId ?? "");
    await logEmail(env, b, "booking_canceled", {
      subject: `Session canceled: ${whenText(b.startsAt, c.nowIso)}`,
      lines: [`Your training session with ${coach(user?.name ?? "your trainer")} on ${whenText(b.startsAt, c.nowIso)} is canceled.`, settle === "consume" ? "Because it was after the free-cancellation time, the session credit was used." : "Your session credit has gone back to your balance."],
    });
    return { bookingId: b.id, credits: creditBalance([...ledger, entry]), repeated: false, outcome };
  });
}

/**
 * Moves a booked session to another slot. The one credit already reserved stays with it: nothing is reserved or released, so
 * the member never holds two. It is free only while cancelling would be free.
 */
export async function rescheduleBooking(session: Session | null, raw: RescheduleInput): Promise<BookingResult> {
  const input = parse(RescheduleInput, raw);
  const env = await loadEnv(session, true);
  const { c, member, policy } = env;
  return db.transaction("rw", db.tables, async () => {
    const b = await db.bookings.get(input.bookingId);
    if (!b || b.memberId !== c.memberId || b.kind !== "pt_session") throw new ApiError("not_found", "We couldn’t find that booking.");
    const ledger = await db.creditLedger.where("memberId").equals(c.memberId).toArray();
    if (b.status === "booked" && b.idempotencyKey === input.idempotencyKey) return { bookingId: b.id, credits: creditBalance(ledger), repeated: true };
    if (b.status !== "booked") throw new ApiError("conflict", "Only a booked session can be moved.");
    const deadline = cancellationDeadline(b.startsAt, policy.cancellationCutoffHours);
    if (!canReschedule(b.startsAt, policy.cancellationCutoffHours, c.nowIso)) {
      throw new ApiError("forbidden", `Moving a session is free until ${exactWhen(deadline)}, and that time has passed. You can keep this session or cancel it under the late terms.`);
    }
    await assertTrainerAllowed(env, input.trainerId, b.trainerId);
    const user = await db.users.get(input.trainerId);
    const { days, branch, hasAvailability } = await scheduleFor(env, input.trainerId, b.id);
    if (!user || !hasAvailability) throw new ApiError("not_found", "That trainer has no sessions to book at your branch. Choose another trainer.");
    const slot = days.flatMap((d) => d.slots).find((s) => s.startsAt === input.startsAt);
    if (!slot) throw new ApiError("invalid", "That time isn’t available any more. Choose another slot.");
    if (slot.startsAt === b.startsAt && input.trainerId === b.trainerId) throw new ApiError("invalid", "That is the time you already have. Choose a different slot.");
    if (slot.taken) throw slotTaken(days, input.startsAt);
    const mine = (await db.bookings.where("memberId").equals(c.memberId).toArray()).filter((x) => x.status === "booked" && x.id !== b.id);
    if (mine.some((x) => Date.parse(x.startsAt) < Date.parse(slot.endsAt) && Date.parse(x.endsAt) > Date.parse(slot.startsAt))) throw new ApiError("conflict", "You already have a session at this time. Choose another slot.");
    const from = b.startsAt;
    try {
      await db.bookings.update(b.id, { startsAt: slot.startsAt, endsAt: slot.endsAt, trainerId: input.trainerId, branchId: member.homeBranchId, slotKey: slotKeyFor(input.trainerId, slot.date, slot.time) });
    } catch (e) {
      if ((e as { name?: string }).name === "ConstraintError") throw slotTaken(days, input.startsAt);
      throw e;
    }
    const nextDeadline = cancellationDeadline(slot.startsAt, policy.cancellationCutoffHours);
    await logEmail(env, { id: b.id, startsAt: slot.startsAt }, "booking_rescheduled", {
      subject: `Session moved: ${whenText(slot.startsAt, c.nowIso)}`,
      lines: [`Your training session with ${coach(user.name)} moved from ${whenText(from, c.nowIso)} to ${whenText(slot.startsAt, c.nowIso)} at ${branch?.name ?? "your branch"}.`, `Your one session credit moved with it. Free cancellation now ends ${exactWhen(nextDeadline)}.`],
    });
    return { bookingId: b.id, credits: creditBalance(ledger), repeated: false };
  });
}

