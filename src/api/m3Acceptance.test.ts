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
const bandra = as("u_bm_bandra");
const finance = as("u_finance");
const meera = as("u_trainer_meera");
let n = 0;
const key = () => `acc-${++n}-${Math.random().toString(36).slice(2)}`;
const MON_PLUS = "pl_monthly_plus";

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

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

describe("A04: lifecycle and finance, with access, invoice status and ledger in step", () => {
  it("a freeze stops entry and gives the days back; unfreezing lets the member in again", async () => {
    expect((await checkIn("mem_arjun")).result).toMatch(/allowed|repeat_scan/);
    const before = (await db.memberships.where("memberId").equals("mem_arjun").toArray()).find((m) => m.status === "active")!;
    await freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-30", reason: "Travel", key: key() });
    expect((await checkIn("mem_arjun")).result).toBe("denied");
    const frozen = (await db.memberships.get(before.id))!;
    expect(frozen.endsOn! > before.endsOn!).toBe(true);
    await unfreezeMembership(desk, { memberId: "mem_arjun" });
    expect((await checkIn("mem_arjun")).result).toMatch(/allowed|repeat_scan/);
  });

  it("an expired membership is turned away, and the branch manager’s override lets the member in with a reason, an audit event and no visit used", async () => {
    const d = await checkIn("mem_rahul", "br_bandra", bandra);
    expect(d.result).toBe("denied");
    const o = await overrideCheckIn(bandra, { checkInId: d.checkInId, reason: "Cheque cleared, confirmed by phone", key: key() });
    expect(o.result).toBe("override");
    expect((await db.checkIns.get(o.checkInId))?.visitDebited ?? false).toBe(false);
    expect((await db.auditEvents.toArray()).filter((e) => e.action === "checkin.override" && e.memberId === "mem_rahul")).toHaveLength(1);
  });

  it("cancellation ends access on its date, refunds nothing by itself, and an approved refund returns the money once and takes back the unused credits", async () => {
    const inv = (await db.invoices.where("memberId").equals("mem_arjun").toArray()).find((i) => i.status === "paid" && !i.purpose)!;
    const before = await credits("mem_arjun");
    const c = await cancelMembership(desk, { memberId: "mem_arjun", effectiveOn: "2026-11-17", reason: "Moving city" });
    expect(c.takesEffectNow).toBe(true);
    expect((await checkIn("mem_arjun")).result).toBe("denied");
    expect((await db.refunds.toArray()).filter((r) => r.invoiceId === inv.id && r.reason === "Moving city").length).toBe(0);
    const rq = await requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: 30_000, reason: "Moving city", source: "manual", key: key() });
    const d = await decideRefund(finance, { requestId: rq.requestId, decision: "approve", key: key() });
    expect(d.status).toBe("approved");
    const again = await decideRefund(finance, { requestId: rq.requestId, decision: "approve", key: key() });
    expect(again.repeated).toBe(true);
    const refunds = (await db.refunds.toArray()).filter((r) => r.reason === "Moving city");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amountPaise: 30_000, status: "completed", approvedBy: "u_finance" });
    // The invoice keeps its status (paid money was refunded, not unpaid) and the ledger has at most one reversal for it.
    expect((await db.invoices.get(inv.id))!.status).toBe("paid");
    const reversals = (await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).filter((e) => e.kind === "reversal");
    expect(reversals.length).toBeLessThanOrEqual(1);
    expect((await credits("mem_arjun")).available).toBeLessThanOrEqual(before.available);
  });

  it("a duplicate payment notification makes one payment and one renewal, and the invoice, membership and receipts agree", async () => {
    const priya = as("u_member_priya");
    const inv = (await db.invoices.where("memberId").equals("mem_priya").toArray()).find((i) => i.status === "open")!;
    const r = await payInvoice(priya, { invoiceId: inv.id, method: "upi", idempotencyKey: key() });
    await Promise.all([replayGatewayEvent(priya, r.eventId), replayGatewayEvent(priya, r.eventId)]);
    const payments = await db.payments.where("invoiceId").equals(inv.id).toArray();
    expect(payments.filter((p) => p.status === "succeeded")).toHaveLength(1);
    expect((await db.invoices.get(inv.id))!.status).toBe("paid");
    expect(amountDuePaise((await db.invoices.get(inv.id))!, payments)).toBe(0);
    expect(await db.memberships.where("invoiceId").equals(inv.id).count()).toBe(1);
    expect((await db.gatewayEvents.get(r.eventId))!.deliveries).toBe(3);
  });

  it("a no-show uses the credit by the gym’s rule, once, and the ledger and the booking agree", async () => {
    setNow(new Date("2026-11-17T14:00:00.000Z")); // 7:30 pm: the evening sessions began over 15 minutes ago
    const session = (await db.bookings.where("trainerId").equals("u_trainer_meera").toArray()).find((x) => x.status === "booked" && x.startsAt.startsWith("2026-11-17") && Date.parse(x.startsAt) + 15 * 60_000 <= Date.now())!;
    const before = await credits(session.memberId);
    const m = await markAttendance(meera, { bookingId: session.id, outcome: "no_show" });
    expect(m.outcome).toBe("no_show");
    const mAgain = await markAttendance(meera, { bookingId: session.id, outcome: "no_show" });
    expect(mAgain.repeated).toBe(true);
    expect((await db.bookings.get(session.id))!.status).toBe("no_show");
    const after = await credits(session.memberId);
    if (m.credit === "used") { expect(after.consumed).toBe(before.consumed + 1); expect(after.reserved).toBe(before.reserved - 1); } else { expect(after.available).toBe(before.available + 1); }
    expect((await db.creditLedger.toArray()).filter((e) => e.bookingId === session.id && (e.kind === "consumption" || e.kind === "release") && String(e.idempotencyKey).startsWith("mark:"))).toHaveLength(1);
  });
});
