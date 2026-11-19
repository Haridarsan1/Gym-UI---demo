import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { bookForMember, getBookingFacts, getCalendar, getDeskConflictOptions, moveDeskConflict } from "@/api/deskBookings";
import { registerMember } from "@/api/newMember";
import { addLeave } from "@/api/schedule";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { creditBalance } from "@/domain/credits";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? { code: e.code, message: e.message, details: e.details as Record<string, unknown> | undefined } : { code: "other", message: String(e), details: undefined };
  }
  return { code: "resolved", message: "", details: undefined };
};
const desk = as("u_desk_andheri");
const finance = as("u_finance");
let n = 0;
const key = () => `bk-${++n}-${Math.random().toString(36).slice(2)}`;
/** Wednesday 18 Nov, 7:00 am in India: a free hour of Coach Meera’s at Andheri. */
const WED_7 = "2026-11-18T01:30:00.000Z";
const MEERA = "u_trainer_meera";

/** A new member at Andheri with two training credits (Monthly Plus, paid). */
const joiner = async (name: string, phone: string) => (await registerMember(desk, { key: key(), branchId: "br_andheri", member: { name, phone }, consents: { photos: false, assessments: false, marketing: false, dataProcessing: true }, planId: "pl_monthly_plus", payment: { method: "cash", amountPaise: 413_000 } })).memberId;

beforeEach(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("the calendar", () => {
  it("a day by trainer: each trainer’s free times, every booking with its room, and no conflicts to start with", async () => {
    // Thursday 19 Nov: Arjun’s booked session (6 pm with Coach Meera).
    const d = await getCalendar(desk, { branchId: "br_andheri", date: "2026-11-19" });
    expect(d.branch.name).toBe("Andheri");
    expect(d.rooms.map((r) => r.name)).toEqual(["Studio A", "Studio B"]);
    expect(d.days).toHaveLength(1);
    const meera = d.days[0]!.lanes.find((l) => l.trainerId === MEERA)!;
    // Meera works Bandra on Thursdays, so she has no Andheri hours that day; Wednesday has hours and every one is free.
    expect(meera.free).toEqual([]);
    const wed = (await getCalendar(desk, { branchId: "br_andheri", date: "2026-11-18" })).days[0]!.lanes.find((l) => l.trainerId === MEERA)!;
    expect(wed.free.map((s) => s.time)).toEqual(expect.arrayContaining(["06:00", "07:00", "08:00"]));
    expect(d.bookings.find((b) => b.memberId === "mem_arjun")).toMatchObject({ trainerName: "Meera Joshi", status: "booked", onLeave: false });
    expect(d.bookings.find((b) => b.memberId === "mem_arjun")!.roomName).toMatch(/Studio/);
    expect(d.conflicts).toEqual([]);
    expect(d.sessionMinutes).toBe(60);
  });

  it("a week is seven days, and the desk sees only its own branch", async () => {
    const w = await getCalendar(desk, { branchId: "br_andheri", date: "2026-11-17", days: 7 });
    expect(w.days.map((x) => x.date)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]);
    expect((await err(getCalendar(desk, { branchId: "br_bandra", date: "2026-11-18" }))).code).toBe("forbidden");
    expect((await getCalendar(as("u_owner"), { branchId: "br_bandra", date: "2026-11-18" })).branch.name).toBe("Bandra");
    expect((await err(getCalendar(finance, { branchId: "br_bandra", date: "2026-11-18" }))).code).toBe("forbidden");
    expect((await err(getCalendar(as("u_member_arjun"), { branchId: "br_andheri", date: "2026-11-18" }))).code).toBe("forbidden");
  });

  it("trainer leave shows on the day, with its reason, and the sessions it clashes with are conflicts", async () => {
    await addLeave(as(MEERA), { from: "2026-11-19", to: "2026-11-19", reason: "Conference", key: "leave-cal-001" });
    const d = await getCalendar(desk, { branchId: "br_andheri", date: "2026-11-19" });
    const lane = d.days[0]!.lanes.find((l) => l.trainerId === MEERA)!;
    expect(lane).toMatchObject({ leave: "On leave: Conference", free: [] });
    expect(d.conflicts).toHaveLength(1);
    expect(d.conflicts[0]).toMatchObject({ memberId: "mem_arjun", onLeave: true });
    expect(d.bookings[0]!.onLeave).toBe(true);
  });
});

describe("booking for a member", () => {
  it("books the free hour, reserves one credit, emails the member and audits it", async () => {
    const before = creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray());
    const r = await bookForMember(desk, { memberId: "mem_arjun", trainerId: MEERA, startsAt: WED_7, roomId: "rm_andheri_b", key: key() });
    expect(r.credits).toEqual({ available: before.available - 1, reserved: before.reserved + 1 });
    const b = (await db.bookings.get(r.bookingId))!;
    expect(b).toMatchObject({ memberId: "mem_arjun", trainerId: MEERA, status: "booked", roomId: "rm_andheri_b", createdBy: "u_desk_andheri", slotKey: "u_trainer_meera|2026-11-18T07:00" });
    expect((await db.creditLedger.get(b.creditEntryId!))).toMatchObject({ kind: "reservation", credits: 1, bookingId: b.id });
    expect((await db.emailLog.where("memberId").equals("mem_arjun").toArray()).some((e) => e.template === "booking_confirmed" && e.bookingId === b.id)).toBe(true);
    expect((await db.auditEvents.where("action").equals("booking.move").toArray()).some((e) => e.entityId === b.id && e.reason === "Booked at the front desk")).toBe(true);
  });

  it("A03: two requests for one slot at the same time make one booking, and the other leaves the credit balance as it was", async () => {
    const a = await joiner("Kabir Anand", "9876543210");
    const b = await joiner("Tara Bose", "9123456780");
    const [ra, rb] = await Promise.allSettled([bookForMember(desk, { memberId: a, trainerId: MEERA, startsAt: WED_7, key: key() }), bookForMember(desk, { memberId: b, trainerId: MEERA, startsAt: WED_7, key: key() })]);
    expect([ra.status, rb.status].sort()).toEqual(["fulfilled", "rejected"]);
    const loser = ra.status === "rejected" ? a : b;
    const winner = ra.status === "rejected" ? b : a;
    expect(await db.bookings.where("trainerId").equals(MEERA).filter((x) => x.startsAt === WED_7 && x.status === "booked").count()).toBe(1);
    expect(creditBalance(await db.creditLedger.where("memberId").equals(loser).toArray())).toEqual({ available: 2, reserved: 0, consumed: 0 });
    expect(creditBalance(await db.creditLedger.where("memberId").equals(winner).toArray())).toEqual({ available: 1, reserved: 1, consumed: 0 });
    const lost = (ra.status === "rejected" ? ra : (rb as PromiseRejectedResult)) as PromiseRejectedResult;
    expect(isApiError(lost.reason) && lost.reason.message).toBe("That time was just taken.");
    expect((lost.reason as { details?: { nextFree?: unknown[] } }).details?.nextFree?.length).toBeGreaterThan(0);
  });

  it("the same key books once, even sent twice at once", async () => {
    const k = key();
    const [x, y] = await Promise.all([bookForMember(desk, { memberId: "mem_arjun", trainerId: MEERA, startsAt: WED_7, key: k }), bookForMember(desk, { memberId: "mem_arjun", trainerId: MEERA, startsAt: WED_7, key: k })]);
    expect(x.bookingId).toBe(y.bookingId);
    expect(await db.bookings.where("memberId").equals("mem_arjun").filter((b) => b.startsAt === WED_7).count()).toBe(1);
    expect(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).reserved).toBe(1 + 1);
  });

  it("a room in use at that time is refused, and a free room is not; a room at another branch is refused", async () => {
    const a = await joiner("Kabir Anand", "9876543210");
    const b = await joiner("Tara Bose", "9123456780");
    await bookForMember(desk, { memberId: a, trainerId: MEERA, startsAt: WED_7, roomId: "rm_andheri_a", key: key() });
    const e = await err(bookForMember(desk, { memberId: b, trainerId: "u_trainer_aditya", startsAt: WED_7, roomId: "rm_andheri_a", key: key() }));
    expect(e).toMatchObject({ code: "conflict" });
    expect(e.message).toBe("Studio A is in use then. Choose another room or time.");
    expect(creditBalance(await db.creditLedger.where("memberId").equals(b).toArray()).reserved).toBe(0);
    expect((await bookForMember(desk, { memberId: b, trainerId: "u_trainer_aditya", startsAt: WED_7, roomId: "rm_andheri_b", key: key() })).repeated).toBe(false);
    expect((await err(bookForMember(desk, { memberId: "mem_arjun", trainerId: MEERA, startsAt: "2026-11-20T01:30:00.000Z", roomId: "rm_bandra_a", key: key() }))).code).toBe("invalid");
  });

  it("no room set means no room check: two sessions at one time with different trainers are fine", async () => {
    const a = await joiner("Kabir Anand", "9876543210");
    const b = await joiner("Tara Bose", "9123456780");
    await bookForMember(desk, { memberId: a, trainerId: MEERA, startsAt: WED_7, key: key() });
    await bookForMember(desk, { memberId: b, trainerId: "u_trainer_aditya", startsAt: WED_7, key: key() });
    expect(await db.bookings.filter((x) => x.startsAt === WED_7 && x.status === "booked").count()).toBe(2);
  });

  it("is refused without credits or a membership that allows it, and for a time that isn’t free", async () => {
    const ghost = await registerMember(desk, { key: key(), branchId: "br_andheri", member: { name: "Visitor Rao", phone: "9111111111" }, consents: { photos: false, assessments: false, marketing: false, dataProcessing: true }, planId: "pl_monthly", payment: { method: "cash", amountPaise: 295_000 } });
    expect((await getBookingFacts(desk, ghost.memberId)).blocked).toMatch(/no training sessions left/);
    expect((await err(bookForMember(desk, { memberId: ghost.memberId, trainerId: MEERA, startsAt: WED_7, key: key() }))).code).toBe("conflict");
    expect((await err(bookForMember(desk, { memberId: "mem_arjun", trainerId: MEERA, startsAt: "2026-11-18T01:00:00.000Z", key: key() }))).message).toMatch(/isn’t available/);
    // His own diary is checked too: Arjun already has Thursday 6 pm with Meera, so another trainer at that time is refused.
    const e = await err(bookForMember(desk, { memberId: "mem_arjun", trainerId: "u_trainer_aditya", startsAt: "2026-11-19T12:30:00.000Z", key: key() }));
    expect(e.code).toBe("conflict");
    expect(e.message).toMatch(/already has a session at this time/);
  });

  it("a frozen member can’t be booked; another branch’s member is not found; finance can’t book", async () => {
    await db.memberships.update("ms_mem_arjun", { status: "frozen", freezes: [{ from: "2026-11-17", to: "2026-11-30", reason: "Travel" }] });
    expect((await getBookingFacts(desk, "mem_arjun")).blocked).toMatch(/frozen/);
    expect((await err(bookForMember(desk, { memberId: "mem_arjun", trainerId: MEERA, startsAt: WED_7, key: key() }))).code).toBe("forbidden");
    expect((await err(getBookingFacts(desk, "mem_rahul"))).code).toBe("not_found");
    expect((await err(bookForMember(finance, { memberId: "mem_arjun", trainerId: MEERA, startsAt: WED_7, key: key() }))).code).toBe("forbidden");
  });
});

describe("the desk side of trainer leave", () => {
  async function clash() {
    await addLeave(as(MEERA), { from: "2026-11-19", to: "2026-11-19", reason: "Conference", key: "leave-desk-001" });
    return (await getCalendar(desk, { branchId: "br_andheri", date: "2026-11-19" })).conflicts[0]!;
  }

  it("shows the options and moves the session: the credit stays, the member is emailed, and it is audited as the desk’s", async () => {
    const c = await clash();
    const o = await getDeskConflictOptions(desk, c.id);
    expect(o.booking).toMatchObject({ name: "Arjun Kumar", branchName: "Andheri" });
    expect(o.sameTrainer.length).toBeGreaterThan(0);
    const ledgerBefore = await db.creditLedger.where("memberId").equals("mem_arjun").count();
    const slot = o.sameTrainer[0]!;
    const r = await moveDeskConflict(desk, { bookingId: c.id, startsAt: slot.startsAt, key: key() });
    expect(r).toMatchObject({ trainerId: MEERA, startsAt: slot.startsAt, repeated: false });
    expect(await db.creditLedger.where("memberId").equals("mem_arjun").count()).toBe(ledgerBefore);
    expect((await getCalendar(desk, { branchId: "br_andheri", date: "2026-11-19" })).conflicts).toEqual([]);
    expect((await db.emailLog.where("memberId").equals("mem_arjun").toArray()).some((e) => e.template === "booking_rescheduled")).toBe(true);
    expect((await db.auditEvents.where("action").equals("booking.move").toArray()).find((e) => e.details?.key !== undefined)).toMatchObject({ actorId: "u_desk_andheri", reason: "Trainer leave, moved by the front desk" });
  });

  it("can hand the session to another trainer, and the same move twice is one move", async () => {
    const c = await clash();
    const o = await getDeskConflictOptions(desk, c.id);
    const other = o.others[0]!;
    const k = key();
    const r = await moveDeskConflict(desk, { bookingId: c.id, startsAt: other.slots[0]!.startsAt, trainerId: other.trainerId, key: k });
    expect((await db.bookings.get(c.id))!.trainerId).toBe(other.trainerId);
    expect((await moveDeskConflict(desk, { bookingId: c.id, startsAt: other.slots[0]!.startsAt, trainerId: other.trainerId, key: k })).repeated).toBe(true);
    expect(r.repeated).toBe(false);
  });

  it("refuses a session that isn’t on leave, another branch’s session, and anyone but the desk", async () => {
    const c = await clash();
    const o = await getDeskConflictOptions(desk, c.id);
    const bandra = (await db.bookings.toArray()).find((b) => b.branchId === "br_bandra" && b.status === "booked")!;
    expect((await err(moveDeskConflict(desk, { bookingId: bandra.id, startsAt: o.sameTrainer[0]!.startsAt, key: key() }))).code).toBe("not_found");
    const fine = await bookForMember(desk, { memberId: "mem_arjun", trainerId: MEERA, startsAt: WED_7, key: key() });
    expect((await err(moveDeskConflict(desk, { bookingId: fine.bookingId, startsAt: o.sameTrainer[0]!.startsAt, key: key() }))).code).toBe("conflict");
    expect((await err(moveDeskConflict(as("u_member_arjun"), { bookingId: c.id, startsAt: o.sameTrainer[0]!.startsAt, key: key() }))).code).toBe("forbidden");
    expect((await err(getDeskConflictOptions(finance, c.id))).code).toBe("forbidden");
  });
});
