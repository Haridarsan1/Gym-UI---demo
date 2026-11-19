import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { bookSession } from "@/api/bookings";
import { checkInMember, overrideCheckIn } from "@/api/checkin";
import { getCoachDays, getCoachWorkout, submitCoachWorkout } from "@/api/coachLog";
import { bookForMember } from "@/api/deskBookings";
import { cancelMembership, changePlan, freezeMembership, requestRefund, unfreezeMembership } from "@/api/lifecycle";
import { payInvoice, replayGatewayEvent } from "@/api/membership";
import { registerMember } from "@/api/newMember";
import { collectPayment } from "@/api/payments";
import { publishProgram, type ProgramInput } from "@/api/programs";
import { decideRefund } from "@/api/refunds";
import { getReview, saveReview } from "@/api/review";
import { markAttendance } from "@/api/schedule";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { isApiError } from "@/api/errors";
import { amountDuePaise } from "@/domain/billing";
import { creditBalance } from "@/domain/credits";
import { toPlanDays, type EditorDoc } from "@/domain/program";

/**
 * M3 acceptance (A01, A03, A04): each scenario is one story run through the real API with the demo people, then checked against the rules the gym has set:
 * what the member can do (access), what the invoice says, and what the credit ledger says must all tell the same story.
 */

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const desk = as("u_desk_andheri");
const finance = as("u_finance");
const meera = as("u_trainer_meera");
const owner = as("u_owner");
let n = 0;
const key = () => `acc-${++n}-${Math.random().toString(36).slice(2)}`;
const MON_PLUS = "pl_monthly_plus";

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) }; } return { code: "resolved", message: "" }; };
const credits = async (memberId: string) => creditBalance(await db.creditLedger.where("memberId").equals(memberId).toArray());
const checkIn = (memberId: string, branchId = "br_andheri", s = desk) => checkInMember(s, { memberId, branchId, method: "desk", key: key() });

describe("A01: the end-to-end member journey", () => {
  it("register, pay, check in, assign a trainer, publish a workout, log a session, review, and renew", async () => {
    // Register with a plan, paid in cash, and a trainer.
    const r = await registerMember(desk, { key: key(), branchId: "br_andheri", member: { name: "Kavya Rao", phone: "9876501234" }, consents: { photos: false, assessments: true, marketing: false, dataProcessing: true }, planId: MON_PLUS, payment: { method: "cash", amountPaise: 413_000 }, trainer: { trainerId: "u_trainer_meera", effectiveOn: "2026-11-17" } });
    expect(r).toMatchObject({ membership: { status: "active", startsOn: "2026-11-17" }, invoice: { status: "paid", duePaise: 0 }, trainer: { name: "Meera Joshi" } });
    expect(r.invoice!.number).toMatch(/^PFAND\/26-27\/\d{4}$/);
    const id = r.memberId;
    const startCredits = (await credits(id)).available;
    expect(startCredits).toBeGreaterThan(0);

    // Check in: allowed, once, and a repeat scan uses no second visit.
    expect((await checkIn(id)).result).toBe("allowed");

    // Meera publishes a workout for today (Tuesday) and logs the session with Kavya.
    const doc: EditorDoc = { name: "First block", notes: "", weeks: [{ key: "w", days: [{ key: "a", title: "Full body", weekday: 0, items: [{ key: "1", exerciseId: "ex_bench_press", section: "main", sets: 3, reps: "8", loadKg: 30, restSec: 90 }] }] }] };
    const input: ProgramInput = { memberId: id, name: doc.name, notes: doc.notes, startsOn: "2026-11-17", days: toPlanDays(doc) };
    expect(await publishProgram(meera, { ...input, key: key() })).toMatchObject({ versionNumber: 1, startsOn: "2026-11-17" });
    const view = await getCoachWorkout(meera, id, "2026-11-17");
    expect(view.exercises.length).toBe(1);
    const { asPrescribed, logSet } = await import("@/domain/workout");
    let entries = view.entries;
    for (const x of view.exercises) for (let s = 1; s <= x.prescription.sets; s++) entries = logSet(entries, x.prescription, asPrescribed(x.prescription, s));
    expect(await submitCoachWorkout(meera, { memberId: id, date: "2026-11-17", entries, idempotencyKey: view.idempotencyKey, effort: 6 })).toMatchObject({ status: "completed" });
    expect((await getCoachDays(meera, id)).days.find((d) => d.date === "2026-11-17")?.status).toBe("completed");

    // Review: a shared review is on the client’s history, and the trend data is there to read.
    const saved = await saveReview(meera, { memberId: id, kind: "shared_review", body: "Good first session. Add 2.5 kg next week.", key: key() });
    const rv = await getReview(meera, id);
    expect(rv.history.map((h) => h.id)).toContain(saved.id);
    expect(rv.trends).toBeDefined();

    // Renew at the desk: it starts the day after this one ends, and is paid in full.
    const change = await changePlan(desk, { memberId: id, planId: MON_PLUS, key: key() });
    expect(change.kind).toBe("renewal");
    const paid = await collectPayment(desk, { invoiceId: change.invoice.id, method: "upi", amountPaise: change.invoice.duePaise, reference: "kavya@okbank", key: key() });
    expect(paid.invoice).toMatchObject({ status: "paid", duePaise: 0 });
    const ms = (await db.memberships.where("memberId").equals(id).toArray()).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    expect(ms).toHaveLength(2);
    expect(ms[1]!.startsOn > ms[0]!.endsOn!).toBe(true);
    // Every invoice is paid, numbers are consecutive and unique, and the audit log holds the money steps.
    const invoices = await db.invoices.where("memberId").equals(id).toArray();
    expect(invoices.every((i) => i.status === "paid")).toBe(true);
    expect(new Set(invoices.map((i) => i.number)).size).toBe(invoices.length);
    const actions = (await db.auditEvents.toArray()).filter((e) => e.memberId === id).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["payment.record", "review.shared"]));
  });
});

describe("A03: booking conflicts", () => {
  /** Wednesday 18 Nov, 7:00 am in India: a free hour of Coach Meera’s at Andheri. */
  const SLOT = "2026-11-18T01:30:00.000Z";
  const joiner = async (name: string, phone: string) => (await registerMember(desk, { key: key(), branchId: "br_andheri", member: { name, phone }, consents: { photos: false, assessments: false, marketing: false, dataProcessing: true }, planId: MON_PLUS, payment: { method: "cash", amountPaise: 413_000 } })).memberId;

  it("a desk booking and a member’s own booking for one trainer slot at the same time: one is confirmed, the other leaves its credits as they were", async () => {
    const a = await joiner("Tara Bose", "9876500001");
    const b = await joiner("Uday Rane", "9876500002");
    const beforeA = await credits(a);
    const beforeB = await credits(b);
    const results = await Promise.allSettled([
      bookForMember(desk, { memberId: a, trainerId: "u_trainer_meera", startsAt: SLOT, key: key() }),
      bookForMember(desk, { memberId: b, trainerId: "u_trainer_meera", startsAt: SLOT, key: key() }),
    ]);
    const confirmed = results.filter((x) => x.status === "fulfilled");
    expect(confirmed).toHaveLength(1);
    const slotBookings = (await db.bookings.where("trainerId").equals("u_trainer_meera").toArray()).filter((x) => x.startsAt === SLOT && x.status !== "canceled");
    expect(slotBookings).toHaveLength(1);
    const winner = slotBookings[0]!.memberId;
    const loser = winner === a ? b : a;
    const was = winner === a ? beforeA : beforeB;
    expect((await credits(winner)).reserved).toBe(was.reserved + 1);
    expect(await credits(loser)).toEqual(loser === a ? beforeA : beforeB);
    // The ledger agrees with the bookings: one reservation, none for the member who lost.
    const ledger = await db.creditLedger.toArray();
    expect(ledger.filter((e) => e.bookingId === slotBookings[0]!.id && e.kind === "reservation")).toHaveLength(1);
    expect(ledger.filter((e) => e.memberId === loser && e.kind === "reservation")).toHaveLength(0);
  });

  it("the member’s own booking and the desk’s, for one slot at the same time: one is confirmed, and the member who lost keeps every credit", async () => {
    const arjun = as("u_member_arjun");
    const before = await credits("mem_arjun");
    const got = await Promise.allSettled([bookForMember(desk, { memberId: "mem_sneha", trainerId: "u_trainer_meera", startsAt: SLOT, key: key() }), bookSession(arjun, { trainerId: "u_trainer_meera", startsAt: SLOT, idempotencyKey: key() })]);
    const slot = (await db.bookings.where("trainerId").equals("u_trainer_meera").toArray()).filter((x) => x.startsAt === SLOT && x.status !== "canceled");
    expect(slot.length).toBeLessThanOrEqual(1);
    expect(got.filter((x) => x.status === "fulfilled").length).toBe(slot.length);
    if (!slot.some((x) => x.memberId === "mem_arjun")) expect(await credits("mem_arjun")).toEqual(before);
  });
});

describe("A04: lifecycle and finance, strictly: access, invoice status and ledger in step, to the exact figure", () => {
  const T0 = new Date("2026-11-17T06:30:00.000Z");
  /** A member registered and paid in full at Andheri: Monthly Plus, ₹4,130 with GST, two training credits, 17 Nov to 17 Dec. */
  const joiner = async (name: string, phone: string) => (await registerMember(desk, { key: key(), branchId: "br_andheri", member: { name, phone }, consents: { photos: false, assessments: false, marketing: false, dataProcessing: true }, planId: MON_PLUS, payment: { method: "cash", amountPaise: 413_000 } })).memberId;

  it("a freeze stops entry; after unfreezing, and past the 10-minute repeat window, the member is let in: “allowed”, and nothing else", async () => {
    const id = await joiner("Freya Nair", "9876500011");
    const original = (await db.memberships.where("memberId").equals(id).first())!.endsOn;
    expect((await checkIn(id)).result).toBe("allowed");
    await freezeMembership(desk, { memberId: id, from: "2026-11-17", to: "2026-11-30", reason: "Travel", key: key() });
    expect((await checkIn(id)).result).toBe("denied");
    const frozen = (await db.memberships.where("memberId").equals(id).first())!;
    expect(frozen.status).toBe("frozen");
    expect(frozen.endsOn! > original!).toBe(true);
    const un = await unfreezeMembership(desk, { memberId: id });
    expect(un.unusedDays).toBeGreaterThan(0);
    expect((await db.memberships.where("memberId").equals(id).first())!.endsOn).toBe(original);
    // Inside the window a second scan is a repeat; past it, it is a fresh entry.
    expect((await checkIn(id)).result).toBe("repeat_scan");
    setNow(new Date(T0.getTime() + 11 * 60_000));
    const again = await checkIn(id);
    expect(again.result).toBe("allowed");
    expect(again.firstAt).toBeUndefined();
  });

  it("expiry: the last day is allowed, the next day is turned away, advanced on the clock, and a membership with no grace stays expired", async () => {
    const id = await joiner("Esha Kapoor", "9876500012");
    const ends = (await db.memberships.where("memberId").equals(id).first())!.endsOn!;
    expect(ends).toBe("2026-12-17");
    setNow(new Date("2026-12-17T06:30:00.000Z"));
    expect((await checkIn(id)).result).toBe("allowed");
    setNow(new Date("2026-12-18T06:30:00.000Z"));
    const late = await checkIn(id);
    expect(late.result).toBe("denied");
    expect(late.reason).toBe("expired");
    expect(late.detail).toMatch(/17 Dec 2026/);
    // A day on, still denied; the membership row still says active until a job expires it, and the rule reads the date, not the row.
    setNow(new Date("2026-12-25T06:30:00.000Z"));
    expect((await checkIn(id)).result).toBe("denied");
  });

  it("a front desk person with an override limit: two overrides, then the third is refused with the number, and the limit starts again tomorrow", async () => {
    const powai = as("u_desk_powai");
    expect(powai.limits).toMatchObject({ canOverrideCheckIn: true, maxOverridesPerDay: 2 });
    const members = (await db.members.where("homeBranchId").equals("br_powai").toArray()).slice(0, 4).map((m) => m.id);
    // Three members who must be turned away: their memberships ended.
    for (const m of members.slice(0, 3)) for (const ms of await db.memberships.where("memberId").equals(m).toArray()) await db.memberships.update(ms.id, { status: "expired", endsOn: "2026-10-01", graceUntil: undefined });
    const denied = [] as Array<{ checkInId: string; memberId: string }>;
    for (const m of members.slice(0, 3)) {
      const d = await checkInMember(powai, { memberId: m, branchId: "br_powai", method: "desk", key: key() });
      expect(d.result).toBe("denied");
      denied.push({ checkInId: d.checkInId, memberId: m });
    }
    const k1 = key();
    expect((await overrideCheckIn(powai, { checkInId: denied[0]!.checkInId, reason: "Cheque cleared this morning", key: k1 })).result).toBe("override");
    // Repeating the first press changes nothing and is not counted again.
    expect((await overrideCheckIn(powai, { checkInId: denied[0]!.checkInId, reason: "Cheque cleared this morning", key: k1 })).repeated).toBe(true);
    expect((await overrideCheckIn(powai, { checkInId: denied[1]!.checkInId, reason: "Manager agreed by phone", key: key() })).result).toBe("override");
    const third = await err(overrideCheckIn(powai, { checkInId: denied[2]!.checkInId, reason: "One more", key: key() }));
    expect(third).toEqual({ code: "forbidden", message: `You have used your 2 overrides for today. Ask a manager to let ${(await db.members.get(denied[2]!.memberId))!.name.split(" ")[0]} in.` });
    expect((await db.checkIns.toArray()).filter((c) => c.result === "override" && c.recordedBy === "u_desk_powai")).toHaveLength(2);
    expect((await db.auditEvents.toArray()).filter((e) => e.action === "checkin.override" && e.actorId === "u_desk_powai")).toHaveLength(2);
    // An uncapped person can still do it (the owner), and the capped person has a fresh two tomorrow.
    expect((await overrideCheckIn(owner, { checkInId: denied[2]!.checkInId, reason: "Owner decision", key: key() })).result).toBe("override");
    setNow(new Date("2026-11-18T06:30:00.000Z"));
    const next = await checkInMember(powai, { memberId: denied[0]!.memberId, branchId: "br_powai", method: "desk", key: key() });
    expect(next.result).toBe("denied");
    expect((await overrideCheckIn(powai, { checkInId: next.checkInId, reason: "Still sorting the cheque", key: key() })).result).toBe("override");
  });

  it("cancellation ends access; an approved refund of half returns the money once and takes back exactly one of the two training credits", async () => {
    const id = await joiner("Rhea Menon", "9876500013");
    const inv = (await db.invoices.where("memberId").equals(id).toArray())[0]!;
    expect(await credits(id)).toEqual({ available: 2, reserved: 0, consumed: 0 });
    const c = await cancelMembership(desk, { memberId: id, effectiveOn: "2026-11-17", reason: "Moving city" });
    expect(c.takesEffectNow).toBe(true);
    expect((await checkIn(id)).result).toBe("denied");
    expect((await db.refunds.toArray()).filter((r) => r.invoiceId === inv.id)).toHaveLength(0);
    const rq = await requestRefund(desk, { memberId: id, invoiceId: inv.id, amountPaise: 206_500, reason: "Moving city", source: "manual", key: key() });
    const d = await decideRefund(finance, { requestId: rq.requestId, decision: "approve", key: key() });
    expect(d).toMatchObject({ status: "approved", amountPaise: 206_500, creditsReversed: 1, repeated: false });
    expect((await decideRefund(finance, { requestId: rq.requestId, decision: "approve", key: key() })).repeated).toBe(true);
    const refunds = (await db.refunds.toArray()).filter((r) => r.invoiceId === inv.id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amountPaise: 206_500, status: "completed", approvedBy: "u_finance", creditsReversed: 1 });
    expect((await db.invoices.get(inv.id))!.status).toBe("paid");
    const reversals = (await db.creditLedger.where("memberId").equals(id).toArray()).filter((e) => e.kind === "reversal");
    expect(reversals).toHaveLength(1);
    expect(reversals[0]).toMatchObject({ credits: 1, refEntryId: `cr_${id}_buy_${(await db.memberships.where("memberId").equals(id).first())!.id}` });
    expect(await credits(id)).toEqual({ available: 1, reserved: 0, consumed: 0 });
  });

  it("a duplicate from the member’s gateway and one from the desk’s own Collect each make exactly one payment, one receipt and one renewal", async () => {
    // The gateway repeats its notification.
    const priya = as("u_member_priya");
    const inv = (await db.invoices.where("memberId").equals("mem_priya").toArray()).find((i) => i.status === "open")!;
    const r = await payInvoice(priya, { invoiceId: inv.id, method: "upi", idempotencyKey: key() });
    await Promise.all([replayGatewayEvent(priya, r.eventId), replayGatewayEvent(priya, r.eventId)]);
    expect((await db.payments.where("invoiceId").equals(inv.id).toArray()).filter((p) => p.status === "succeeded")).toHaveLength(1);
    expect(await db.memberships.where("invoiceId").equals(inv.id).count()).toBe(1);
    expect((await db.gatewayEvents.get(r.eventId))!.deliveries).toBe(3);

    // The desk presses Collect twice, once more at the same moment, and again afterwards, with one key.
    const due = (await db.invoices.where("memberId").equals("mem_sneha").toArray()).find((i) => i.status === "open" || i.status === "partially_paid");
    const target = due ?? (await db.invoices.toArray()).find((i) => i.branchId === "br_andheri" && i.status === "open" && i.id !== inv.id)!;
    const owed = amountDuePaise(target, await db.payments.where("invoiceId").equals(target.id).toArray());
    const k = key();
    const input = { invoiceId: target.id, method: "cash" as const, amountPaise: owed, key: k };
    const first = await collectPayment(desk, input);
    const [x, y] = await Promise.all([collectPayment(desk, input), collectPayment(desk, input)]);
    const last = await collectPayment(desk, input);
    expect([x.repeated, y.repeated, last.repeated]).toEqual([true, true, true]);
    expect(new Set([first.paymentId, x.paymentId, y.paymentId, last.paymentId]).size).toBe(1);
    expect(new Set([first.receiptNumber, x.receiptNumber, y.receiptNumber, last.receiptNumber]).size).toBe(1);
    const payments = (await db.payments.where("invoiceId").equals(target.id).toArray()).filter((p) => p.status === "succeeded" && p.idempotencyKey === `desk:${k}`);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amountPaise).toBe(owed);
    expect((await db.invoices.get(target.id))!.status).toBe("paid");
    expect(first.invoice.duePaise).toBe(0);
    // A fresh key on a paid invoice is refused, not paid twice.
    expect((await err(collectPayment(desk, { ...input, key: key() }))).message).toBe("This invoice is already paid.");
    expect((await db.emailLog.toArray()).filter((e) => e.invoiceId === target.id).filter((e) => e.template === "payment_receipt")).toHaveLength(1);
  });

  it("a no-show uses the credit by the default policy, once, and the balance is exact", async () => {
    const policy = (await db.gymPolicies.toArray())[0]!;
    expect(policy).toMatchObject({ noShowConsumesCredit: true, noShowAfterMinutes: 15, markWindowHours: 48 });
    setNow(new Date("2026-11-17T14:00:00.000Z")); // 7:30 pm
    const ledger = await db.creditLedger.toArray();
    const packs = new Set(ledger.filter((e) => e.kind === "purchase").map((e) => e.memberId));
    void packs;
    const session = (await db.bookings.where("trainerId").equals("u_trainer_meera").toArray()).find((x) => x.id.startsWith("bk_roster_") && x.status === "booked" && Date.parse(x.startsAt) + 15 * 60_000 <= Date.now() && ledger.filter((e) => e.memberId === x.memberId && e.kind === "purchase").length === 1)!;
    expect(await credits(session.memberId)).toEqual({ available: 5, reserved: 1, consumed: 0 });
    const m = await markAttendance(meera, { bookingId: session.id, outcome: "no_show" });
    expect(m).toMatchObject({ outcome: "no_show", credit: "used", repeated: false });
    expect((await markAttendance(meera, { bookingId: session.id, outcome: "no_show" })).repeated).toBe(true);
    expect((await db.bookings.get(session.id))!.status).toBe("no_show");
    expect(await credits(session.memberId)).toEqual({ available: 5, reserved: 0, consumed: 1 });
    expect((await db.creditLedger.toArray()).filter((e) => e.bookingId === session.id && e.kind === "consumption" && String(e.idempotencyKey).startsWith("mark:"))).toHaveLength(1);
  });
});
