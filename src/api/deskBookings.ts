import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { assertInBranch, memberInScope, openDesk, type DeskContext } from "@/api/desk";
import { conflictOptions, Move, moveBooking, policyOf, slotsOf, SLOT_TAKEN, type ConflictOptions } from "@/api/schedule";
import { buildAuditEvent } from "@/domain/audit";
import { PT_CREDIT_COST } from "@/domain/booking";
import { canReserve, creditBalance } from "@/domain/credits";
import { addDays, istDateOf } from "@/domain/dates";
import { currentMembership } from "@/domain/membership";
import { effectiveStatus } from "@/domain/lifecycle";
import { leaveConflicts } from "@/domain/schedule";
import { nextFree, slotKeyFor, type Slot } from "@/domain/slots";
import type { Booking, CreditLedgerEntry } from "@/domain/types";
import { exactWhen, whenText } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * The bookings calendar at the desk (T04, O01, A03): a day or a week by trainer and by room, booking a session for a member against the trainer’s availability
 * and the member’s credits, and the desk’s side of trainer leave (sessions that clash with leave, moved to another time or another trainer). Booking is one
 * transaction that checks the slot, the member’s diary, the room and the credit again: two requests for one slot make one booking, the loser leaves the credit
 * balance as it was, and the database’s unique slot key is the last line of defence.
 */

const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

export interface CalendarBooking {
  id: string;
  memberId: string;
  name: string;
  trainerId: string;
  trainerName: string;
  startsAt: string;
  endsAt: string;
  status: Booking["status"];
  roomId?: string;
  roomName?: string;
  /** On a day the trainer is on leave: a conflict to move. */
  onLeave: boolean;
}

export interface CalendarLane {
  trainerId: string;
  name: string;
  /** Leave on this date, in words, or nothing. */
  leave?: string;
  /** Times a session can be booked (free, in the future, inside availability and the branch’s hours). */
  free: Slot[];
}

export interface CalendarDay {
  date: string;
  lanes: CalendarLane[];
}

export interface CalendarData {
  today: string;
  nowIso: string;
  branch: { id: string; name: string };
  rooms: Array<{ id: string; name: string; capacity: number }>;
  days: CalendarDay[];
  bookings: CalendarBooking[];
  /** Every booked session at this branch that falls on a day its trainer is on leave. */
  conflicts: CalendarBooking[];
  sessionMinutes: number;
  horizonDays: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One day or a week (seven days from `date`) at a branch: each trainer’s free times, every booking, and the conflicts with leave. */
export async function getCalendar(session: Session | null, params: { branchId: string; date: string; days?: 1 | 7 }): Promise<CalendarData> {
  const c = await openDesk(session, "booking.read");
  assertInBranch(c, "booking.read", params.branchId);
  if (!DAY.test(params.date)) throw new ApiError("invalid", "Choose a valid date.");
  const span = params.days === 7 ? 7 : 1;
  const to = addDays(params.date, span - 1);
  const [branch, staff, users, bookings, members, leaveRows, policy] = await Promise.all([
    db.branches.get(params.branchId), db.staffRoles.where("tenantId").equals(c.tenantId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray(), db.bookings.where("tenantId").equals(c.tenantId).toArray(),
    db.members.where("tenantId").equals(c.tenantId).toArray(), db.trainerLeave.where("tenantId").equals(c.tenantId).toArray(), db.gymPolicies.where("tenantId").equals(c.tenantId).first(),
  ]);
  if (!branch) throw new ApiError("not_found", "We couldn’t find that branch.");
  const pol = policyOf(policy);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const roomName = new Map(branch.rooms.map((r) => [r.id, r.name]));
  const trainers = staff.filter((s) => s.role === "trainer" && s.branchIds.includes(params.branchId)).map((s) => s.userId).sort((a, b) => (name.get(a) ?? "").localeCompare(name.get(b) ?? ""));
  const stub = { principal: c.principal, tenantId: c.tenantId, today: c.today, nowIso: c.nowIso };
  const onLeave = (trainerId: string, date: string) => leaveRows.find((l) => l.trainerId === trainerId && !l.canceledAt && l.from <= date && date <= l.to);
  const days: CalendarDay[] = [];
  for (let i = 0; i < span; i++) {
    const date = addDays(params.date, i);
    const lanes: CalendarLane[] = [];
    for (const t of trainers) {
      const horizon = await slotsOf(stub, t, params.branchId, "");
      const lv = onLeave(t, date);
      lanes.push({ trainerId: t, name: name.get(t) ?? "Trainer", leave: lv ? (lv.reason ? `On leave: ${lv.reason}` : "On leave") : undefined, free: horizon.find((d) => d.date === date)?.slots.filter((s) => !s.taken) ?? [] });
    }
    days.push({ date, lanes });
  }
  const view = (b: Booking): CalendarBooking => ({
    id: b.id, memberId: b.memberId, name: memberName.get(b.memberId) ?? "Member", trainerId: b.trainerId ?? "", trainerName: name.get(b.trainerId ?? "") ?? "Trainer", startsAt: b.startsAt, endsAt: b.endsAt, status: b.status,
    roomId: b.roomId, roomName: b.roomId ? roomName.get(b.roomId) : undefined, onLeave: !!b.trainerId && !!onLeave(b.trainerId, istDateOf(b.startsAt)),
  });
  const here = bookings.filter((b) => b.branchId === params.branchId && b.kind === "pt_session" && b.status !== "canceled");
  const clash = new Set(leaveConflicts(here.filter((b) => b.trainerId), leaveRows.filter((l) => !l.canceledAt), c.nowIso).map((x) => x.booking.id));
  return {
    today: c.today, nowIso: c.nowIso, branch: { id: branch.id, name: branch.name }, rooms: branch.rooms, days,
    bookings: here.filter((b) => istDateOf(b.startsAt) >= params.date && istDateOf(b.startsAt) <= to).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(view),
    conflicts: here.filter((b) => clash.has(b.id)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(view),
    sessionMinutes: pol.sessionMinutes, horizonDays: pol.bookingHorizonDays,
  };
}

export interface BookingFacts {
  memberId: string;
  name: string;
  firstName: string;
  credits: { available: number; reserved: number };
  /** Why a session can’t be booked for this member now, in words for the desk, or nothing. */
  blocked?: string;
}

/** What the desk needs to know before booking for a member: their credits, and whether their membership allows it. */
export async function getBookingFacts(session: Session | null, memberId: string): Promise<BookingFacts> {
  const c = await openDesk(session, "booking.manage");
  const member = await memberInScope(c, "booking.manage", memberId);
  const [ledger, memberships] = await Promise.all([db.creditLedger.where("memberId").equals(memberId).toArray(), db.memberships.where("memberId").equals(memberId).toArray()]);
  const bal = creditBalance(ledger);
  const cur = currentMembership(memberships);
  const status = cur ? effectiveStatus(cur, c.today) : undefined;
  const blocked = !cur ? "This member has no membership, so no session can be booked." : status === "frozen" ? "Their membership is frozen, so booking is paused." : status !== "active" ? `Their membership is ${status}, so no session can be booked.` : bal.available < PT_CREDIT_COST ? "They have no training sessions left. Sell a sessions pack first." : undefined;
  return { memberId, name: member.name, firstName: member.name.split(" ")[0] ?? member.name, credits: { available: bal.available, reserved: bal.reserved }, blocked };
}

const BookInput = z.object({ memberId: z.string().min(1), trainerId: z.string().min(1), startsAt: z.string().datetime(), roomId: z.string().min(1).optional(), key: z.string().min(8) });
export type DeskBookInput = z.input<typeof BookInput>;

export interface DeskBookResult {
  bookingId: string;
  credits: { available: number; reserved: number };
  repeated: boolean;
}

const taken = (days: Array<{ slots: Slot[] }>, afterIso: string) => new ApiError("conflict", SLOT_TAKEN, { nextFree: nextFree(days, afterIso, 4) });

/** Books a session for a member at a trainer’s free time, optionally in a room, reserving one credit. Checked again inside the write (A03). */
export async function bookForMember(session: Session | null, raw: DeskBookInput): Promise<DeskBookResult> {
  const parsed = BookInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "We couldn’t read that booking. Reload the page and try again.");
  const input = parsed.data;
  const c: DeskContext = await openDesk(session, "booking.manage");
  return db.transaction("rw", db.tables, async () => {
    const idem = `desk:${input.key}`;
    const again = await db.bookings.where("idempotencyKey").equals(idem).first();
    if (again) return { bookingId: again.id, credits: (({ available, reserved }) => ({ available, reserved }))(creditBalance(await db.creditLedger.where("memberId").equals(again.memberId).toArray())), repeated: true };
    const member = await memberInScope(c, "booking.manage", input.memberId);
    const facts = await getBookingFacts(session, member.id);
    if (facts.blocked) throw new ApiError(facts.credits.available < PT_CREDIT_COST ? "conflict" : "forbidden", facts.blocked);
    const staff = await db.staffRoles.where("userId").equals(input.trainerId).first();
    const user = await db.users.get(input.trainerId);
    if (!staff || staff.role !== "trainer" || !staff.branchIds.includes(member.homeBranchId) || !user) throw new ApiError("invalid", "Choose a trainer who works at this member’s branch.");
    const days = await slotsOf({ principal: c.principal, tenantId: c.tenantId, today: c.today, nowIso: c.nowIso }, input.trainerId, member.homeBranchId, "");
    const slot = days.flatMap((d) => d.slots).find((s) => s.startsAt === input.startsAt);
    if (!slot) throw new ApiError("invalid", "That time isn’t available. The trainer may be on leave, or it is outside their hours or the booking window.");
    if (slot.taken) throw taken(days, input.startsAt);
    const mine = (await db.bookings.where("memberId").equals(member.id).toArray()).filter((b) => b.status === "booked");
    if (mine.some((b) => Date.parse(b.startsAt) < Date.parse(slot.endsAt) && Date.parse(b.endsAt) > Date.parse(slot.startsAt))) throw new ApiError("conflict", `${facts.firstName} already has a session at this time.`);
    if (input.roomId) {
      const branch = await db.branches.get(member.homeBranchId);
      const room = branch?.rooms.find((r) => r.id === input.roomId);
      if (!room) throw new ApiError("invalid", "Choose a room at this member’s branch.");
      const inUse = (await db.bookings.where("tenantId").equals(c.tenantId).toArray()).find((b) => b.roomId === room.id && b.status === "booked" && Date.parse(b.startsAt) < Date.parse(slot.endsAt) && Date.parse(b.endsAt) > Date.parse(slot.startsAt));
      if (inUse) throw new ApiError("conflict", `${room.name} is in use then. Choose another room or time.`, { room: room.id });
    }
    const ledger = await db.creditLedger.where("memberId").equals(member.id).toArray();
    if (!canReserve(creditBalance(ledger), PT_CREDIT_COST)) throw new ApiError("conflict", "They have no training sessions left.");
    const bookingId = rid("bk");
    const reservation = `cr_${member.id}_res_${bookingId}`;
    const entry: CreditLedgerEntry = { id: reservation, tenantId: c.tenantId, memberId: member.id, membershipId: ledger.find((e) => e.kind === "purchase")?.membershipId, kind: "reservation", credits: PT_CREDIT_COST, bookingId, createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `res:${bookingId}` };
    const booking: Booking = { id: bookingId, tenantId: c.tenantId, memberId: member.id, branchId: member.homeBranchId, kind: "pt_session", trainerId: input.trainerId, roomId: input.roomId, startsAt: slot.startsAt, endsAt: slot.endsAt, status: "booked", creditEntryId: reservation, slotKey: slotKeyFor(input.trainerId, slot.date, slot.time), createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: idem };
    try {
      await db.bookings.add(booking); // the unique slot key refuses a second booking of the same trainer and time
    } catch (e) {
      if ((e as { name?: string }).name === "ConstraintError") throw taken(days, input.startsAt);
      throw e;
    }
    await db.creditLedger.add(entry);
    const tenant = await db.tenants.get(c.tenantId);
    const first = facts.firstName;
    await db.emailLog.add({ id: rid("em"), tenantId: c.tenantId, memberId: member.id, bookingId, template: "booking_confirmed", to: member.email, subject: `Session booked: ${whenText(slot.startsAt, c.nowIso)}`, body: [`Hi ${first},`, "", `Your training session with Coach ${user.name.split(" ")[0]} is booked for ${whenText(slot.startsAt, c.nowIso)}. The front desk booked it for you.`, `One session credit is held for it. ${exactWhen(slot.startsAt)}`, "", tenant?.name ?? "Your gym"].join("\n"), status: member.email ? "sent" : "skipped", detail: member.email ? undefined : "No email address on file for this member.", sentAt: c.nowIso });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "booking.move", reason: "Booked at the front desk", entityType: "booking", entityId: bookingId, memberId: member.id, details: { booked: true, trainerId: input.trainerId, startsAt: slot.startsAt, roomId: input.roomId ?? null } }, rid("ae"), now()));
    const after = creditBalance([...ledger, entry]);
    return { bookingId, credits: { available: after.available, reserved: after.reserved }, repeated: false };
  });
}

/** Where a session on trainer leave can go, for the desk: the same trainer’s other free times, and other trainers at the branch. */
export async function getDeskConflictOptions(session: Session | null, bookingId: string): Promise<ConflictOptions> {
  const c = await openDesk(session, "booking.manage");
  return conflictOptions({ principal: c.principal, tenantId: c.tenantId, today: c.today, nowIso: c.nowIso }, bookingId, (b) => c.branchIds.includes(b.branchId));
}

/** Moves a session on trainer leave to another time or trainer. The credit stays with it and the member is emailed. */
export async function moveDeskConflict(session: Session | null, raw: z.input<typeof Move>): Promise<{ bookingId: string; trainerId: string; startsAt: string; repeated: boolean }> {
  const parsed = Move.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "We couldn’t read that move. Reload and try again.");
  const c = await openDesk(session, "booking.manage");
  return moveBooking({ principal: c.principal, tenantId: c.tenantId, today: c.today, nowIso: c.nowIso }, parsed.data, (b) => c.branchIds.includes(b.branchId), "Trainer leave, moved by the front desk");
}
