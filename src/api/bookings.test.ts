import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { ApiError, isApiError } from "@/api/errors";
import { NO_CREDITS, SLOT_TAKEN, bookSession, cancelBooking, getBookings, getTrainerOptions, getTrainerSchedule, rescheduleBooking } from "@/api/bookings";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { creditBalance } from "@/domain/credits";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const arjun = as("u_member_arjun");
const priya = as("u_member_priya");
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? e.code : "other";
  }
  return "resolved";
};
const failure = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return e;
  }
  throw new Error("expected an ApiError");
};

// Tuesday 17 Nov 2026, 12:00 noon in India. Coach Meera’s Andheri days are Mon, Wed and Fri.
const NOON = "2026-11-17T06:30:00.000Z";
const WED_6PM = "2026-11-18T12:30:00.000Z"; // 18:00 in India; free cancellation ends 6:00 am that day
const WED_7PM = "2026-11-18T13:30:00.000Z";
const FRI_5PM = "2026-11-20T11:30:00.000Z";
const FRI_6AM = "2026-11-20T00:30:00.000Z";
const MEERA = "u_trainer_meera";
const ADITYA = "u_trainer_aditya";

beforeEach(async () => {
  setNow(new Date(NOON));
  await resetDemo();
  await setChoice(true); // the seeded default is off; most tests below need a member to be able to book any trainer
});
afterAll(() => setNow(null));

const setChoice = (on: boolean) => db.gymPolicies.toCollection().modify({ membersMayChooseTrainer: on });
const book = (s: Session | null, trainerId: string, startsAt: string, key = `k-${Math.random().toString(36).slice(2)}-xxxx`) => bookSession(s, { trainerId, startsAt, idempotencyKey: key });
const balance = async (memberId: string) => creditBalance(await db.creditLedger.where("memberId").equals(memberId).toArray());
const giveCredits = (memberId: string, n: number) => db.creditLedger.add({ id: `cr_${memberId}_buy`, tenantId: "t_pulse", memberId, kind: "purchase", credits: n, createdBy: "u_desk_andheri", createdAt: NOON, idempotencyKey: `buy-${memberId}` });

describe("choosing a trainer, a day and a slot", () => {
  it("lists the trainers at the member’s branch, their own trainer first", async () => {
    const { trainers, branchName } = await getTrainerOptions(arjun);
    expect(branchName).toBe("Andheri");
    expect(trainers.map((t) => t.trainerId)).toEqual([MEERA, ADITYA, "u_trainer_vikrant"]);
    expect(trainers[0]).toMatchObject({ name: "Meera Joshi", assigned: true });
    expect(trainers.slice(1).every((t) => !t.assigned)).toBe(true);
    expect(trainers.map((t) => t.trainerId)).not.toContain("u_trainer_farah"); // Bandra only
  });

  it("names the next free slot for each trainer", async () => {
    const { trainers } = await getTrainerOptions(arjun);
    expect(trainers.find((t) => t.trainerId === MEERA)!.nextFree).toBe("2026-11-18T00:30:00.000Z"); // Wed 6:00 am: Tuesdays she is at Bandra
    expect(trainers.find((t) => t.trainerId === ADITYA)!.nextFree).toBe("2026-11-17T11:30:00.000Z"); // today 5:00 pm
  });

  it("gives each trainer’s days in the booking window, inside their availability and the branch hours", async () => {
    const s = await getTrainerSchedule(arjun, MEERA);
    expect(s).toMatchObject({ trainerName: "Meera Joshi", branchName: "Andheri" });
    // Wednesday, Friday, and Sunday 22 Nov, which Meera covers with a shift (08:00 to 12:00 at Andheri); then Monday.
    expect(s.days.map((d) => d.date).slice(0, 4)).toEqual(["2026-11-18", "2026-11-20", "2026-11-22", "2026-11-23"]);
    expect(s.days.at(-1)!.date <= "2026-12-01").toBe(true);
    expect(s.days[0]!.slots.map((x) => x.time)).toEqual(["06:00", "07:00", "08:00", "09:00", "10:00", "17:00", "18:00", "19:00", "20:00"]);
  });

  it("marks the trainer’s existing bookings as taken, and a canceled one is free again", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    const taken = (await getTrainerSchedule(priya, MEERA)).days[0]!.slots.filter((x) => x.taken).map((x) => x.time);
    expect(taken).toEqual(["18:00"]);
    await cancelBooking(arjun, { bookingId: r.bookingId, expectedOutcome: "released" });
    expect((await getTrainerSchedule(priya, MEERA)).days[0]!.slots.some((x) => x.taken)).toBe(false);
  });

  it("refuses a trainer who has no sessions at the member’s branch", async () => {
    expect(await code(getTrainerSchedule(arjun, "u_trainer_farah"))).toBe("not_found");
  });
});

describe("trainer choice policy", () => {
  it("is off in the seeded gym", async () => {
    await resetDemo();
    expect((await db.gymPolicies.toArray())[0]!.membersMayChooseTrainer).toBe(false);
  });

  it("off: the member sees only their own trainer", async () => {
    await setChoice(false);
    const { trainers, hasAssignedTrainer, policy } = await getTrainerOptions(arjun);
    expect(trainers.map((t) => t.trainerId)).toEqual([MEERA]);
    expect(trainers[0]!.assigned).toBe(true);
    expect([hasAssignedTrainer, policy.membersMayChooseTrainer]).toEqual([true, false]);
  });

  it("off: another trainer’s slots can’t be read, booked or moved to", async () => {
    await setChoice(false);
    expect(await code(getTrainerSchedule(arjun, ADITYA))).toBe("forbidden");
    expect(await code(book(arjun, ADITYA, "2026-11-17T11:30:00.000Z"))).toBe("forbidden");
    expect(await balance("mem_arjun")).toEqual({ available: 5, reserved: 1, consumed: 2 });
    const r = await book(arjun, MEERA, WED_6PM);
    expect(await code(rescheduleBooking(arjun, { bookingId: r.bookingId, trainerId: ADITYA, startsAt: "2026-11-17T11:30:00.000Z", idempotencyKey: "move-key-9001" }))).toBe("forbidden");
    expect(await code(getTrainerSchedule(arjun, MEERA))).toBe("resolved");
  });

  it("off: a session already with another trainer can still be moved with that trainer", async () => {
    const r = await book(arjun, ADITYA, WED_6PM);
    await setChoice(false);
    expect(await code(rescheduleBooking(arjun, { bookingId: r.bookingId, trainerId: ADITYA, startsAt: WED_7PM, idempotencyKey: "move-key-9002" }))).toBe("resolved");
  });

  it("on: the assigned trainer comes first and the others follow", async () => {
    await setChoice(true);
    const { trainers } = await getTrainerOptions(arjun);
    expect(trainers.map((t) => t.trainerId)).toEqual([MEERA, ADITYA, "u_trainer_vikrant"]);
    expect(trainers.map((t) => t.assigned)).toEqual([true, false, false]);
    expect(await code(book(arjun, ADITYA, "2026-11-17T11:30:00.000Z"))).toBe("resolved");
  });
});

describe("booking reserves one credit (M06)", () => {
  it("holds a credit, writes the booking with its slot key, and logs the confirmation email (O04)", async () => {
    const before = await balance("mem_arjun");
    const r = await book(arjun, MEERA, WED_6PM);
    expect(r).toMatchObject({ repeated: false, credits: { available: before.available - 1, reserved: before.reserved + 1, consumed: before.consumed } });
    const b = (await db.bookings.get(r.bookingId))!;
    expect(b).toMatchObject({ memberId: "mem_arjun", trainerId: MEERA, status: "booked", slotKey: "u_trainer_meera|2026-11-18T18:00", branchId: "br_andheri", startsAt: WED_6PM, endsAt: WED_7PM });
    const res = (await db.creditLedger.get(b.creditEntryId!))!;
    expect(res).toMatchObject({ kind: "reservation", credits: 1, bookingId: b.id });
    const mail = (await db.emailLog.toArray()).filter((e) => e.bookingId === b.id);
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ template: "booking_confirmed", status: "sent", to: "arjun.kumar@example.in", subject: "Session booked: 6:00 pm tomorrow", memberId: "mem_arjun" });
    expect(mail[0]!.body).toContain("Coach Meera");
    expect(mail[0]!.body).toContain("Free cancellation ends 6:00 am Wed 18 Nov");
    expect(mail[0]!.body).toContain("cancelling or not turning up uses this session credit");
  });

  it("books once for one key: repeating it makes no second booking and holds no second credit", async () => {
    const a = await book(arjun, MEERA, WED_6PM, "same-key-0001");
    const b = await book(arjun, MEERA, WED_6PM, "same-key-0001");
    expect(b).toMatchObject({ bookingId: a.bookingId, repeated: true });
    expect((await db.creditLedger.toArray()).filter((e) => e.kind === "reservation" && e.bookingId === a.bookingId)).toHaveLength(1);
    expect((await balance("mem_arjun")).reserved).toBe(2);
    expect(await db.emailLog.count()).toBe(1);
  });

  it("with no credits left, says so and books nothing", async () => {
    const e = await failure(book(priya, ADITYA, "2026-11-17T11:30:00.000Z"));
    expect(e).toMatchObject({ code: "conflict", message: NO_CREDITS });
    expect(await db.bookings.where("memberId").equals("mem_priya").count()).toBe(0);
    expect(await db.emailLog.count()).toBe(0);
  });

  it("refuses a frozen membership, in words", async () => {
    const e = await failure(book(as("u_member_rahul"), "u_trainer_farah", WED_6PM));
    expect(e.code).toBe("forbidden");
    expect(e.message).toMatch(/frozen/);
  });

  it("refuses a time that is not an available slot, and a trainer from another branch", async () => {
    expect(await code(book(arjun, MEERA, "2026-11-18T00:45:00.000Z"))).toBe("invalid"); // off the grid
    expect(await code(book(arjun, MEERA, "2026-11-17T11:30:00.000Z"))).toBe("invalid"); // Tuesday: she is at Bandra
    expect(await code(book(arjun, MEERA, "2026-12-08T12:30:00.000Z"))).toBe("invalid"); // past the 14-day window
    expect(await code(book(arjun, "u_trainer_farah", WED_6PM))).toBe("not_found");
    expect((await balance("mem_arjun")).reserved).toBe(1);
  });

  it("will not give a member two sessions at the same time", async () => {
    await book(arjun, MEERA, WED_6PM);
    const e = await failure(book(arjun, ADITYA, WED_6PM));
    expect(e.message).toMatch(/already have a session at this time/);
  });

  it("is for members only", async () => {
    expect(await code(book(as("u_trainer_meera"), MEERA, WED_6PM))).toBe("forbidden");
    expect(await code(book(null, MEERA, WED_6PM))).toBe("unauthenticated");
  });
});

describe("two requests for one slot (A03)", () => {
  it("another member gets “That slot was just taken” with the next free slots, and keeps their credit", async () => {
    await giveCredits("mem_priya", 3);
    await book(arjun, MEERA, WED_6PM);
    const e = await failure(book(priya, MEERA, WED_6PM));
    expect(e).toMatchObject({ code: "conflict", message: SLOT_TAKEN });
    const next = (e.details as { nextFree: Array<{ startsAt: string; taken: boolean }> }).nextFree;
    expect(next).toHaveLength(4);
    expect(next.every((s) => !s.taken && s.startsAt > WED_6PM)).toBe(true);
    expect(next[0]!.startsAt).toBe(WED_7PM);
    expect(await balance("mem_priya")).toEqual({ available: 3, reserved: 0, consumed: 0 });
    expect(await db.bookings.where("memberId").equals("mem_priya").count()).toBe(0);
  });

  it("two members at the same moment: one booking is confirmed, the other fails, and both balances are right", async () => {
    await giveCredits("mem_priya", 3);
    const results = await Promise.allSettled([book(arjun, MEERA, FRI_5PM), book(priya, MEERA, FRI_5PM)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: "conflict", message: SLOT_TAKEN });
    expect((await db.bookings.where("trainerId").equals(MEERA).toArray()).filter((b) => b.status === "booked" && b.startsAt === FRI_5PM)).toHaveLength(1);
    const reserved = (await balance("mem_arjun")).reserved + (await balance("mem_priya")).reserved;
    expect(reserved).toBe(2); // Arjun already held one for his seeded session, plus exactly one new
  });

  it("the same member in two tabs: one booking, one credit held", async () => {
    const before = await balance("mem_arjun");
    const results = await Promise.allSettled([book(arjun, MEERA, FRI_5PM, "tab-one-key-001"), book(arjun, MEERA, FRI_5PM, "tab-two-key-002")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason as ApiError).message).toBe(SLOT_TAKEN);
    expect(await balance("mem_arjun")).toEqual({ available: before.available - 1, reserved: before.reserved + 1, consumed: before.consumed });
  });

  it("the database itself refuses two active bookings with one slot key", async () => {
    const r = await book(arjun, MEERA, FRI_5PM);
    const first = (await db.bookings.get(r.bookingId))!;
    await expect(db.bookings.add({ ...first, id: "bk_dupe", idempotencyKey: "dupe-key-0001" })).rejects.toMatchObject({ name: "ConstraintError" });
  });
});

describe("cancelling (T04, M06)", () => {
  it("in time, gives the credit back, frees the slot and logs the email", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    const c = await cancelBooking(arjun, { bookingId: r.bookingId, expectedOutcome: "released" });
    expect(c).toMatchObject({ outcome: "released", repeated: false, credits: { available: 5, reserved: 1, consumed: 2 } });
    const b = (await db.bookings.get(r.bookingId))!;
    expect(b).toMatchObject({ status: "canceled", cancelReason: "Canceled by member", canceledAt: NOON });
    expect(b.slotKey).toBeUndefined();
    const ledger = (await db.creditLedger.toArray()).filter((e) => e.bookingId === b.id);
    expect(ledger.map((e) => e.kind).sort()).toEqual(["release", "reservation"]);
    const mail = (await db.emailLog.toArray()).filter((e) => e.bookingId === b.id).map((e) => e.template).sort();
    expect(mail).toEqual(["booking_canceled", "booking_confirmed"]);
    expect((await db.emailLog.toArray()).find((e) => e.template === "booking_canceled")!.body).toContain("gone back to your balance");
  });

  it("after the free-cancellation time, uses the credit when the gym’s policy says so", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    setNow(new Date("2026-11-18T01:30:00.000Z")); // 7:00 am on the day, after the 6:00 am deadline
    const c = await cancelBooking(arjun, { bookingId: r.bookingId, expectedOutcome: "consumed" });
    expect(c).toMatchObject({ outcome: "consumed", credits: { available: 4, reserved: 1, consumed: 3 } });
    expect((await db.creditLedger.toArray()).filter((e) => e.bookingId === r.bookingId).map((e) => e.kind).sort()).toEqual(["consumption", "reservation"]);
    expect((await db.emailLog.toArray()).find((e) => e.template === "booking_canceled")!.body).toContain("the session credit was used");
  });

  it("after the time, gives the credit back when the gym does not charge for late cancellations", async () => {
    await db.gymPolicies.toCollection().modify({ lateCancelConsumesCredit: false });
    const r = await book(arjun, MEERA, WED_6PM);
    setNow(new Date("2026-11-18T01:30:00.000Z"));
    expect(await cancelBooking(arjun, { bookingId: r.bookingId, expectedOutcome: "kept" })).toMatchObject({ outcome: "kept", credits: { available: 5, consumed: 2 } });
  });

  it("does nothing, and says so, when the terms changed while the member was deciding", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    setNow(new Date("2026-11-18T01:30:00.000Z"));
    const e = await failure(cancelBooking(arjun, { bookingId: r.bookingId, expectedOutcome: "released" }));
    expect(e).toMatchObject({ code: "conflict" });
    expect(e.message).toMatch(/free-cancellation time just passed/);
    expect((await db.bookings.get(r.bookingId))!.status).toBe("booked");
    expect(await balance("mem_arjun")).toMatchObject({ reserved: 2 });
  });

  it("cannot cancel a session that has started or finished, or someone else’s", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    setNow(new Date("2026-11-18T12:45:00.000Z"));
    expect((await failure(cancelBooking(arjun, { bookingId: r.bookingId, expectedOutcome: "consumed" }))).message).toMatch(/already started/);
    expect((await failure(cancelBooking(arjun, { bookingId: "bk_arjun_1", expectedOutcome: "released" }))).message).toMatch(/already finished/);
    await giveCredits("mem_priya", 1);
    expect(await code(cancelBooking(priya, { bookingId: r.bookingId, expectedOutcome: "released" }))).toBe("not_found");
  });

  it("is safe to repeat: a second cancel changes nothing", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    await cancelBooking(arjun, { bookingId: r.bookingId, expectedOutcome: "released" });
    const again = await cancelBooking(arjun, { bookingId: r.bookingId, expectedOutcome: "released" });
    expect(again).toMatchObject({ repeated: true, credits: { available: 5, reserved: 1 } });
    expect((await db.creditLedger.toArray()).filter((e) => e.kind === "release" && e.bookingId === r.bookingId)).toHaveLength(1);
  });
});

describe("rescheduling keeps one reserved credit", () => {
  it("moves the booking and its credit: nothing is reserved or released, so never two", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    const ledgerBefore = (await db.creditLedger.toArray()).length;
    const moved = await rescheduleBooking(arjun, { bookingId: r.bookingId, trainerId: MEERA, startsAt: FRI_5PM, idempotencyKey: "move-key-0001" });
    expect(moved).toMatchObject({ bookingId: r.bookingId, repeated: false, credits: { available: 4, reserved: 2, consumed: 2 } });
    expect((await db.creditLedger.toArray()).length).toBe(ledgerBefore);
    const b = (await db.bookings.get(r.bookingId))!;
    expect(b).toMatchObject({ startsAt: FRI_5PM, status: "booked", slotKey: "u_trainer_meera|2026-11-20T17:00" });
    expect((await db.creditLedger.toArray()).filter((e) => e.bookingId === b.id && e.kind === "reservation")).toHaveLength(1);
    // The old slot is free, the new one is taken, and the email is logged.
    const day = (await getTrainerSchedule(priya, MEERA)).days;
    expect(day.find((d) => d.date === "2026-11-18")!.slots.some((x) => x.taken)).toBe(false);
    expect(day.find((d) => d.date === "2026-11-20")!.slots.find((x) => x.time === "17:00")!.taken).toBe(true);
    expect((await db.emailLog.toArray()).find((e) => e.template === "booking_rescheduled")!.body).toContain("Your one session credit moved with it");
  });

  it("can move to another trainer", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    await rescheduleBooking(arjun, { bookingId: r.bookingId, trainerId: ADITYA, startsAt: "2026-11-17T11:30:00.000Z", idempotencyKey: "move-key-0002" });
    expect(await db.bookings.get(r.bookingId)).toMatchObject({ trainerId: ADITYA, slotKey: "u_trainer_aditya|2026-11-17T17:00" });
  });

  it("is free only until the free-cancellation time", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    setNow(new Date("2026-11-18T01:30:00.000Z"));
    const e = await failure(rescheduleBooking(arjun, { bookingId: r.bookingId, trainerId: MEERA, startsAt: FRI_5PM, idempotencyKey: "move-key-0003" }));
    expect(e.code).toBe("forbidden");
    expect(e.message).toMatch(/Moving a session is free until 6:00 am Wed 18 Nov, and that time has passed/);
    expect((await db.bookings.get(r.bookingId))!.startsAt).toBe(WED_6PM);
  });

  it("says “That slot was just taken” when the new slot goes first to someone else, and changes nothing", async () => {
    await giveCredits("mem_priya", 1);
    await book(priya, MEERA, FRI_5PM);
    const r = await book(arjun, MEERA, WED_6PM);
    const e = await failure(rescheduleBooking(arjun, { bookingId: r.bookingId, trainerId: MEERA, startsAt: FRI_5PM, idempotencyKey: "move-key-0004" }));
    expect(e.message).toBe(SLOT_TAKEN);
    expect((e.details as { nextFree: unknown[] }).nextFree.length).toBeGreaterThan(0);
    expect((await db.bookings.get(r.bookingId))!.startsAt).toBe(WED_6PM);
  });

  it("refuses the time the member already has, and a clash with their other session", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    expect((await failure(rescheduleBooking(arjun, { bookingId: r.bookingId, trainerId: MEERA, startsAt: WED_6PM, idempotencyKey: "move-key-0005" }))).message).toMatch(/time you already have/);
    const other = await book(arjun, MEERA, FRI_5PM);
    expect((await failure(rescheduleBooking(arjun, { bookingId: other.bookingId, trainerId: ADITYA, startsAt: WED_6PM, idempotencyKey: "move-key-0006" }))).message).toMatch(/already have a session at this time/);
  });

  it("repeating the same move is safe", async () => {
    const r = await book(arjun, MEERA, WED_6PM);
    await rescheduleBooking(arjun, { bookingId: r.bookingId, trainerId: MEERA, startsAt: FRI_6AM, idempotencyKey: "move-key-0007" });
    const rows = await db.creditLedger.count();
    expect(await code(rescheduleBooking(arjun, { bookingId: r.bookingId, trainerId: MEERA, startsAt: FRI_6AM, idempotencyKey: "move-key-0007" }))).not.toBe("forbidden");
    expect(await db.creditLedger.count()).toBe(rows);
  });
});

describe("upcoming and past bookings", () => {
  it("lists the upcoming session with its free-cancellation time, and the past ones with how each ended", async () => {
    const d = await getBookings(arjun);
    expect(d.credits).toEqual({ available: 5, reserved: 1, consumed: 2 });
    expect(d.policy).toMatchObject({ cancellationCutoffHours: 12, lateCancelConsumesCredit: true, noShowConsumesCredit: true });
    expect(d.upcoming).toHaveLength(1);
    expect(d.upcoming[0]).toMatchObject({ trainerName: "Meera Joshi", branchName: "Andheri", status: "booked", freeUntil: "2026-11-19T00:30:00.000Z", outcomeNow: "released", canCancel: true, canReschedule: true });
    expect(d.past.map((b) => `${b.status}:${b.credit}`)).toEqual(["no_show:used", "canceled:returned", "attended:used"]);
    expect(d.past.map((b) => b.startsAt)).toEqual([...d.past.map((b) => b.startsAt)].sort().reverse());
    expect(d.blockedReason).toBeUndefined();
  });

  it("says a late cancellation would use the credit, and that a session in progress can no longer be moved", async () => {
    setNow(new Date("2026-11-19T02:00:00.000Z")); // 7:30 am on the day of the seeded 6 pm session
    const d = await getBookings(arjun);
    expect(d.upcoming[0]).toMatchObject({ outcomeNow: "consumed", canCancel: true, canReschedule: false });
  });

  it("explains a closed booking for a frozen member, and no credits for a member without any", async () => {
    expect((await getBookings(as("u_member_rahul"))).blockedReason).toMatch(/frozen/);
    const p = await getBookings(priya);
    expect(p.credits).toEqual({ available: 0, reserved: 0, consumed: 0 });
    expect(p.upcoming).toEqual([]);
  });

  it("shows only the member’s own bookings", async () => {
    const d = await getBookings(priya);
    expect(d.upcoming.length + d.past.length).toBe(0);
    expect(await code(getBookings(as("u_trainer_meera")))).toBe("forbidden");
  });
});
