import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getBookings, getTrainerSchedule } from "@/api/bookings";
import { addLeave, addShift, cancelLeave, getConflictOptions, getSchedule, markAttendance, moveSession, removeShift, saveAvailability } from "@/api/schedule";
import { db } from "@/demo/db";
import { resetDemo } from "@/demo";
import { creditBalance } from "@/domain/credits";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? e.code : "other";
  }
  return "resolved";
};
const meera = as("u_trainer_meera");
const farah = as("u_trainer_farah");
const arjun = as("u_member_arjun");
// 12:00 noon in India on Tuesday 17 Nov 2026.
const NOON = new Date("2026-11-17T06:30:00.000Z");
const EVENING = new Date("2026-11-17T14:00:00.000Z"); // 7:30 pm: the 5 pm and 6 pm sessions have started

beforeEach(async () => {
  setNow(NOON);
  await resetDemo();
});
afterAll(() => setNow(null));

describe("reading the schedule", () => {
  it("shows today’s sessions, availability, a shift, leave and what each button does to the credit", async () => {
    const s = await getSchedule(meera);
    expect(s).toMatchObject({ today: "2026-11-17", firstName: "Meera", noShowConsumesCredit: true, creditRules: { attended: "Uses 1 session credit", no_show: "Uses 1 session credit" } });
    const today = s.sessions.filter((x) => x.startsAt.startsWith("2026-11-17"));
    expect(today.map((x) => x.status)).toEqual(["attended", "booked", "booked", "booked"]);
    expect(today[0]!.credit).toBe("used");
    expect(today.every((x) => !x.markable || x.status === "booked")).toBe(true);
    expect(s.availability).toHaveLength(12);
    expect(s.shifts).toHaveLength(1);
    expect(s.shifts[0]).toMatchObject({ note: "Sunday cover", start: "08:00", end: "12:00", branchName: "Andheri" });
    expect(s.leave.map((l) => l.reason)).toEqual(["Year-end break"]);
    expect(s.conflicts).toEqual([]);
    expect(s.sessions.map((x) => x.startsAt)).toEqual([...s.sessions.map((x) => x.startsAt)].sort());
  });

  it("only shows the trainer’s own", async () => {
    const s = await getSchedule(farah);
    expect(s.sessions.every((x) => x.name !== "")).toBe(true);
    expect(s.leave.map((l) => l.reason)).toEqual(["Family event"]);
    expect(s.sessions.map((x) => x.id)).not.toEqual(expect.arrayContaining((await getSchedule(meera)).sessions.map((x) => x.id)));
  });

  it("members and the front desk cannot open it", async () => {
    expect(await code(getSchedule(arjun))).toBe("forbidden");
    expect(await code(getSchedule(as("u_desk_andheri")))).toBe("forbidden");
  });
});

describe("marking attended and no-show", () => {
  const evening = async () => (await getSchedule(meera)).sessions.filter((x) => x.startsAt.startsWith("2026-11-17") && x.status === "booked");

  it("a session can’t be marked before it starts", async () => {
    const [first] = await evening();
    expect(first!.markable).toBe(false);
    expect(first!.blockedReason).toMatch(/when the session starts/);
    expect(await code(markAttendance(meera, { bookingId: first!.id, outcome: "attended" }))).toBe("conflict");
  });

  it("attended uses the credit, once, and the member sees it used", async () => {
    setNow(new Date("2026-11-19T13:00:00.000Z"));
    const arjunSession = (await getSchedule(meera)).sessions.find((x) => x.memberId === "mem_arjun" && x.status === "booked")!;
    expect(arjunSession.markable).toBe(true);
    const before = creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray());
    const r = await markAttendance(meera, { bookingId: arjunSession.id, outcome: "attended" });
    expect(r).toMatchObject({ outcome: "attended", credit: "used", repeated: false });
    expect(r.credits.reserved).toBe(before.reserved - 1);
    expect(r.credits.consumed).toBe(before.consumed + 1);
    expect(r.credits.available).toBe(before.available);
    const again = await markAttendance(meera, { bookingId: arjunSession.id, outcome: "attended" });
    expect(again).toMatchObject({ repeated: true, credit: "used" });
    const entries = (await db.creditLedger.toArray()).filter((e) => e.bookingId === arjunSession.id && e.kind === "consumption");
    expect(entries).toHaveLength(1);
    // The member’s own Bookings says the session was attended and the credit used.
    const mine = await getBookings(arjun);
    expect(mine.past.find((b) => b.id === arjunSession.id)).toMatchObject({ status: "attended", credit: "used" });
    expect((await db.auditEvents.where("action").equals("booking.attendance").toArray()).at(-1)).toMatchObject({ actorId: "u_trainer_meera", entityId: arjunSession.id, memberId: "mem_arjun", details: { outcome: "attended", credit: "used" } });
  });

  it("a no-show uses the credit when the gym says so, and gives it back when it doesn’t", async () => {
    setNow(EVENING);
    const [a, b] = await evening();
    const used = await markAttendance(meera, { bookingId: a!.id, outcome: "no_show" });
    expect(used).toMatchObject({ outcome: "no_show", credit: "used" });
    const policy = (await db.gymPolicies.toArray())[0]!;
    await db.gymPolicies.update(policy.id, { noShowConsumesCredit: false });
    expect((await getSchedule(meera)).creditRules.no_show).toBe("Gives the credit back");
    const back = await markAttendance(meera, { bookingId: b!.id, outcome: "no_show" });
    expect(back).toMatchObject({ outcome: "no_show", credit: "returned" });
    const released = (await db.creditLedger.toArray()).filter((e) => e.bookingId === b!.id && e.kind === "release");
    expect(released).toHaveLength(1);
    const row = (await getSchedule(meera)).sessions.find((x) => x.id === b!.id)!;
    expect(row).toMatchObject({ status: "no_show", credit: "returned" });
  });

  it("a session already marked one way is not changed to the other", async () => {
    setNow(EVENING);
    const [a] = await evening();
    await markAttendance(meera, { bookingId: a!.id, outcome: "attended" });
    expect(await code(markAttendance(meera, { bookingId: a!.id, outcome: "no_show" }))).toBe("conflict");
  });

  it("only the session’s own trainer can mark it", async () => {
    setNow(EVENING);
    const [a] = await evening();
    expect(await code(markAttendance(farah, { bookingId: a!.id, outcome: "attended" }))).toBe("not_found");
    expect(await code(markAttendance(arjun, { bookingId: a!.id, outcome: "attended" }))).toBe("forbidden");
  });
});

describe("availability, shifts and leave", () => {
  it("leave blocks new bookings on its days and shows the sessions already booked then as conflicts", async () => {
    // Friday 20 Nov is a day Arjun can book at Andheri; Thursday 19 Nov holds his booked session.
    const before = await getTrainerSchedule(arjun, "u_trainer_meera");
    expect(before.days.map((d) => d.date)).toContain("2026-11-20");
    const r = await addLeave(meera, { from: "2026-11-19", to: "2026-11-20", reason: "Conference", key: "leave-key-1" });
    expect(r).toMatchObject({ conflicts: 1, repeated: false });
    const after = await getTrainerSchedule(arjun, "u_trainer_meera");
    expect(after.days.map((d) => d.date)).not.toContain("2026-11-20");
    expect(after.days.map((d) => d.date)).toContain("2026-11-18");
    const s = await getSchedule(meera);
    expect(s.conflicts).toHaveLength(1);
    expect(s.conflicts[0]).toMatchObject({ memberId: "mem_arjun", conflict: { from: "2026-11-19", to: "2026-11-20", reason: "Conference" } });
    expect(s.leave.find((l) => l.id === r.id)).toMatchObject({ conflicts: 1 });
    // Nothing was canceled, and Arjun’s credit is untouched.
    expect((await db.bookings.get(s.conflicts[0]!.id))!.status).toBe("booked");
  });

  it("the same key adds one leave; overlapping leave, past leave and a backwards range are refused", async () => {
    const a = await addLeave(meera, { from: "2026-12-01", to: "2026-12-03", key: "leave-key-2" });
    const b = await addLeave(meera, { from: "2026-12-01", to: "2026-12-03", key: "leave-key-2" });
    expect(b).toMatchObject({ id: a.id, repeated: true });
    expect(await code(addLeave(meera, { from: "2026-12-03", to: "2026-12-05", key: "leave-key-3" }))).toBe("conflict");
    expect(await code(addLeave(meera, { from: "2026-11-10", to: "2026-11-12", key: "leave-key-4" }))).toBe("invalid");
    expect(await code(addLeave(meera, { from: "2026-12-10", to: "2026-12-08", key: "leave-key-5" }))).toBe("invalid");
    expect(await code(addLeave(arjun, { from: "2026-12-10", to: "2026-12-11", key: "leave-key-6" }))).toBe("forbidden");
  });

  it("canceling leave opens its days again and clears the conflict, and keeps the record", async () => {
    const r = await addLeave(meera, { from: "2026-11-19", to: "2026-11-20", key: "leave-key-7" });
    expect((await getSchedule(meera)).conflicts).toHaveLength(1);
    await cancelLeave(meera, r.id);
    await cancelLeave(meera, r.id);
    expect((await getSchedule(meera)).conflicts).toHaveLength(0);
    expect((await db.trainerLeave.get(r.id))!.canceledAt).toBeTruthy();
    expect((await getTrainerSchedule(arjun, "u_trainer_meera")).days.map((d) => d.date)).toContain("2026-11-20");
    expect(await code(cancelLeave(farah, r.id))).toBe("not_found");
  });

  it("a shift adds bookable hours on its date and only on that date", async () => {
    // Sunday 22 Nov has no weekly window; the seeded cover shift (08:00 to 12:00 at Andheri) makes it bookable at Arjun’s branch.
    const days = (await getTrainerSchedule(arjun, "u_trainer_meera")).days;
    const sunday = days.find((d) => d.date === "2026-11-22")!;
    expect(sunday.slots.map((s) => s.time)).toEqual(["08:00", "09:00", "10:00", "11:00"]);
    const s = await addShift(meera, { branchId: "br_andheri", date: "2026-11-23", start: "12:00", end: "14:00", note: "Extra", key: "shift-key-1" });
    expect(s.repeated).toBe(false);
    expect((await addShift(meera, { branchId: "br_andheri", date: "2026-11-23", start: "12:00", end: "14:00", key: "shift-key-1" })).repeated).toBe(true);
    expect((await getTrainerSchedule(arjun, "u_trainer_meera")).days.find((d) => d.date === "2026-11-23")!.slots.map((x) => x.time)).toEqual(expect.arrayContaining(["12:00", "13:00"]));
    await removeShift(meera, s.id);
    expect((await getSchedule(meera)).shifts.map((x) => x.id)).not.toContain(s.id);
  });

  it("a shift can’t be in the past, on leave, outside her branches, or at another branch at the same time", async () => {
    expect(await code(addShift(meera, { branchId: "br_andheri", date: "2026-11-10", start: "08:00", end: "10:00", key: "shift-key-2" }))).toBe("invalid");
    expect(await code(addShift(meera, { branchId: "br_powai", date: "2026-11-25", start: "08:00", end: "10:00", key: "shift-key-3" }))).toBe("forbidden");
    // Wednesday 18 Nov she works Andheri 06:00 to 11:00; a Bandra shift then puts her in two places.
    expect(await code(addShift(meera, { branchId: "br_bandra", date: "2026-11-18", start: "07:00", end: "09:00", key: "shift-key-4" }))).toBe("conflict");
    await addLeave(meera, { from: "2026-11-26", to: "2026-11-26", key: "leave-key-8" });
    expect(await code(addShift(meera, { branchId: "br_andheri", date: "2026-11-26", start: "12:00", end: "14:00", key: "shift-key-5" }))).toBe("conflict");
    expect(await code(addShift(meera, { branchId: "br_andheri", date: "2026-11-25", start: "14:00", end: "13:00", key: "shift-key-6" }))).toBe("invalid");
  });

  it("the weekly pattern is replaced as a whole and can’t overlap itself or use another branch", async () => {
    expect(await code(saveAvailability(meera, { windows: [{ branchId: "br_andheri", weekday: 1, start: "06:00", end: "09:00" }, { branchId: "br_bandra", weekday: 1, start: "08:00", end: "10:00" }] }))).toBe("invalid");
    expect(await code(saveAvailability(meera, { windows: [{ branchId: "br_powai", weekday: 1, start: "06:00", end: "09:00" }] }))).toBe("forbidden");
    await saveAvailability(meera, { windows: [{ branchId: "br_andheri", weekday: 1, start: "07:00", end: "10:00" }, { branchId: "br_andheri", weekday: 3, start: "17:00", end: "20:00" }] });
    const s = await getSchedule(meera);
    expect(s.availability.map((a) => [a.weekday, a.start, a.end])).toEqual([[1, "07:00", "10:00"], [3, "17:00", "20:00"]]);
    expect((await db.auditEvents.where("action").equals("schedule.change").toArray()).length).toBeGreaterThan(0);
  });
});

describe("moving a session that clashes with leave", () => {
  async function clash() {
    await addLeave(meera, { from: "2026-11-19", to: "2026-11-19", reason: "Conference", key: "leave-move-1" });
    return (await getSchedule(meera)).conflicts[0]!;
  }

  it("offers her own other times outside leave and other trainers at the same branch", async () => {
    const c = await clash();
    const o = await getConflictOptions(meera, c.id);
    expect(o.booking).toMatchObject({ name: "Arjun Kumar", branchName: "Andheri" });
    expect(o.sameTrainer.length).toBeGreaterThan(0);
    expect(o.sameTrainer.every((s) => s.date !== "2026-11-19" && !s.taken)).toBe(true);
    expect(o.others.length).toBeGreaterThan(0);
    expect(o.others.map((x) => x.trainerId)).not.toContain("u_trainer_meera");
  });

  it("moves it to another time with her: the credit stays with the session, the member is emailed", async () => {
    const c = await clash();
    const o = await getConflictOptions(meera, c.id);
    const slot = o.sameTrainer[0]!;
    const ledgerBefore = await db.creditLedger.where("memberId").equals("mem_arjun").count();
    const r = await moveSession(meera, { bookingId: c.id, startsAt: slot.startsAt, key: "move-key-1" });
    expect(r).toMatchObject({ trainerId: "u_trainer_meera", startsAt: slot.startsAt, repeated: false });
    const b = (await db.bookings.get(c.id))!;
    expect(b).toMatchObject({ status: "booked", startsAt: slot.startsAt, trainerId: "u_trainer_meera" });
    expect(await db.creditLedger.where("memberId").equals("mem_arjun").count()).toBe(ledgerBefore);
    expect((await getSchedule(meera)).conflicts).toEqual([]);
    const mail = (await db.emailLog.where("memberId").equals("mem_arjun").toArray()).filter((e) => e.template === "booking_rescheduled").at(-1)!;
    expect(mail.body).toMatch(/Your session credit is not affected/);
    expect(mail.subject).toMatch(/moved to/);
    // The same key again moves nothing and sends nothing more.
    const again = await moveSession(meera, { bookingId: c.id, startsAt: slot.startsAt, key: "move-key-1" });
    expect(again.repeated).toBe(true);
    expect((await db.emailLog.where("memberId").equals("mem_arjun").toArray()).filter((e) => e.template === "booking_rescheduled")).toHaveLength(1);
    expect((await db.auditEvents.where("action").equals("booking.move").toArray()).at(-1)).toMatchObject({ actorId: "u_trainer_meera", reason: "Trainer leave" });
  });

  it("moves it to another trainer, who then has it, and Arjun’s own Bookings shows the new trainer and the same credit", async () => {
    const c = await clash();
    const o = await getConflictOptions(meera, c.id);
    const other = o.others[0]!;
    const slot = other.slots[0]!;
    await moveSession(meera, { bookingId: c.id, startsAt: slot.startsAt, trainerId: other.trainerId, key: "move-key-2" });
    const b = (await db.bookings.get(c.id))!;
    expect(b.trainerId).toBe(other.trainerId);
    expect(b.slotKey).toContain(other.trainerId);
    expect((await getSchedule(meera)).sessions.map((x) => x.id)).not.toContain(c.id);
    const mine = await getBookings(arjun);
    expect(mine.upcoming.find((x) => x.id === c.id)).toMatchObject({ trainerName: other.name });
    expect(mine.credits.reserved).toBe(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).reserved);
  });

  it("refuses a slot that is taken, a session with no clash, and one that is not hers", async () => {
    const c = await clash();
    const o = await getConflictOptions(meera, c.id);
    const slot = o.sameTrainer[0]!;
    // Someone else books it first.
    await db.bookings.add({ id: "bk_taken", tenantId: "t_pulse", memberId: "mem_061", branchId: "br_andheri", kind: "pt_session", trainerId: "u_trainer_meera", startsAt: slot.startsAt, endsAt: slot.endsAt, status: "booked", slotKey: `u_trainer_meera|${slot.date}T${slot.time}`, createdBy: "u_desk_andheri", createdAt: NOON.toISOString(), idempotencyKey: "taken-key-1" });
    expect(await code(moveSession(meera, { bookingId: c.id, startsAt: slot.startsAt, key: "move-key-3" }))).toBe("conflict");
    const free = (await getConflictOptions(meera, c.id)).sameTrainer[0]!;
    expect(free.startsAt).not.toBe(slot.startsAt);
    // A session on a day she is working is not a clash.
    const today = (await getSchedule(meera)).sessions.find((x) => x.startsAt.startsWith("2026-11-17") && x.status === "booked")!;
    expect(await code(moveSession(meera, { bookingId: today.id, startsAt: free.startsAt, key: "move-key-4" }))).toBe("conflict");
    expect(await code(moveSession(farah, { bookingId: c.id, startsAt: free.startsAt, key: "move-key-5" }))).toBe("not_found");
  });
});
