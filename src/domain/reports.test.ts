import { describe, expect, it } from "vitest";
import { dues, heatMap, isActiveOn, membershipCounts, money, renewals, trainerUtilisation, weeklyMoney } from "@/domain/reports";
import type { Invoice, Payment } from "@/domain/types";

const TODAY = "2026-11-17";
const inv = (id: string, issuedOn: string, totalPaise: number, over: Partial<Invoice> = {}): Invoice => ({ id, issuedOn, dueOn: issuedOn, totalPaise, status: "open", ...over }) as Invoice;
const pay = (invoiceId: string, receivedAt: string, amountPaise: number, over: Partial<Payment> = {}): Payment => ({ id: `p_${invoiceId}_${receivedAt}`, invoiceId, receivedAt, amountPaise, status: "succeeded", method: "upi", ...over }) as Payment;
const ms = (id: string, memberId: string, startsOn: string, endsOn: string | undefined, over: Record<string, unknown> = {}) => ({ id, memberId, startsOn, endsOn, status: "active" as const, freezes: [], canceledEffectiveOn: undefined, ...over });

describe("billed and collected are separate (O07)", () => {
  const invoices = [inv("a", "2026-11-02", 100_000, { status: "paid" }), inv("b", "2026-11-10", 50_000), inv("c", "2026-11-12", 70_000, { status: "void" }), inv("d", "2026-10-30", 90_000, { status: "paid" })];
  const payments = [pay("a", "2026-11-03T05:00:00.000Z", 100_000), pay("b", "2026-11-11T05:00:00.000Z", 20_000), pay("d", "2026-11-05T05:00:00.000Z", 90_000), pay("b", "2026-11-12T05:00:00.000Z", 5_000, { status: "failed" }), pay("a", "2026-11-04T05:00:00.000Z", 30_000, { method: "credit_note" })];
  it("billed is what was invoiced in the range, not void; collected is money received in it, not credit notes or failures", () => {
    expect(money({ invoices, payments, refunds: [], from: "2026-11-01", to: "2026-11-30" })).toEqual({ billedPaise: 150_000, collectedPaise: 210_000, refundedPaise: 0 });
  });
  it("an invoice from October is billed in October but its payment can be collected in November", () => {
    const oct = money({ invoices, payments, refunds: [], from: "2026-10-01", to: "2026-10-31" });
    expect(oct.billedPaise).toBe(90_000);
    expect(oct.collectedPaise).toBe(0);
  });
  it("refunds are shown beside collections, in the range they were paid back", () => {
    const r = money({ invoices, payments, refunds: [{ amountPaise: 12_000, createdAt: "2026-11-15T05:00:00.000Z", status: "completed" }, { amountPaise: 99, createdAt: "2026-11-15T05:00:00.000Z", status: "failed" }], from: "2026-11-01", to: "2026-11-30" });
    expect(r.refundedPaise).toBe(12_000);
  });
  it("weekly figures add up to the range’s", () => {
    const weeks = weeklyMoney({ invoices, payments, refunds: [], from: "2026-11-01", to: "2026-11-30" });
    expect(weeks.reduce((n, w) => n + w.billedPaise, 0)).toBe(150_000);
    expect(weeks.reduce((n, w) => n + w.collectedPaise, 0)).toBe(210_000);
    expect(weeks[0]!.week).toBe("2026-10-26");
  });
});

describe("dues", () => {
  it("counts what is still owed on open and part-paid invoices, and how much is overdue", () => {
    const invoices = [inv("a", "2026-11-01", 100_000, { dueOn: "2026-11-08" }), inv("b", "2026-11-12", 60_000, { status: "partially_paid", dueOn: "2026-11-30" }), inv("c", "2026-11-01", 40_000, { status: "paid" })];
    const payments = [pay("b", "2026-11-13T05:00:00.000Z", 10_000), pay("c", "2026-11-02T05:00:00.000Z", 40_000)];
    expect(dues(invoices, payments, TODAY)).toEqual({ duePaise: 150_000, overduePaise: 100_000, invoices: 2, overdueInvoices: 1 });
  });
});

describe("memberships", () => {
  it("active means active that day and in date; frozen is counted apart; expiring ends within two weeks (the 14th day counts)", () => {
    const list = [ms("1", "m1", "2026-10-01", "2026-11-30"), ms("2", "m2", "2026-10-20", "2026-11-25"), ms("3", "m3", "2026-10-01", "2026-12-30", { status: "frozen", freezes: [{ from: "2026-11-10", to: "2026-11-30", reason: "Travel" }] }), ms("4", "m4", "2026-12-01", "2027-01-01", { status: "scheduled" }), ms("5", "m5", "2026-09-01", "2026-10-01", { status: "expired" }), ms("6", "m6", "2026-11-01", "2026-12-01")];
    expect(membershipCounts(list as never, TODAY)).toEqual({ active: 3, frozen: 1, expiring: 3 });
    expect(isActiveOn(list[3] as never, TODAY)).toBe(false);
  });
});

describe("renewals are measured against the memberships due to expire (O07)", () => {
  const list = [
    ms("a1", "a", "2026-10-01", "2026-11-05", { status: "expired" }), ms("a2", "a", "2026-11-06", "2026-12-05"), // renewed, the day after
    ms("b1", "b", "2026-10-01", "2026-11-10", { status: "expired" }), // not renewed
    ms("c1", "c", "2026-10-02", "2026-11-12", { status: "expired" }), ms("c2", "c", "2026-11-30", "2026-12-30"), // came back 18 days later: inside the 30
    ms("d1", "d", "2026-10-03", "2026-11-20", { canceledEffectiveOn: "2026-11-01", status: "canceled" }), // canceled before the end: not in the cohort
    ms("e1", "e", "2026-10-04", "2026-12-20"), // ends outside the range
    ms("f1", "f", "2026-09-01", "2026-11-08", { status: "expired" }), ms("f2", "f", "2026-11-09", "2026-12-08", { status: "pending" }), // an unpaid renewal is not a renewal
  ];
  it("cohort is the memberships ending in the range; renewed has a later one starting soon after", () => {
    expect(renewals(list as never, "2026-11-01", "2026-11-30")).toEqual({ due: 4, renewed: 2, ratePercent: 50 });
  });
  it("a range with nothing due has no rate, not zero", () => {
    expect(renewals(list as never, "2027-03-01", "2027-03-31")).toEqual({ due: 0, renewed: 0, ratePercent: null });
  });
});

describe("check-in heat map", () => {
  it("counts visits by weekday (Monday first) and hour in India time, not repeats or denials", () => {
    // Tuesday 17 Nov 2026, 6:45 am IST is 01:15 UTC. Monday 16 Nov 6:10 pm IST is 12:40 UTC.
    const h = heatMap([
      { at: "2026-11-17T01:15:00.000Z", result: "allowed" }, { at: "2026-11-17T01:20:00.000Z", result: "repeat_scan" }, { at: "2026-11-17T01:25:00.000Z", result: "allowed_with_dues" },
      { at: "2026-11-16T12:40:00.000Z", result: "override" }, { at: "2026-11-16T12:41:00.000Z", result: "denied" }, { at: "2026-10-01T01:15:00.000Z", result: "allowed" },
    ], "2026-11-01", "2026-11-30");
    expect(h.total).toBe(3);
    expect(h.cells[1]![6]).toBe(2); // Tuesday, 6 am hour
    expect(h.cells[0]![18]).toBe(1); // Monday, 6 pm hour
    expect(h.peaks[0]).toEqual({ weekday: 1, hour: 6, count: 2 });
    expect(h.max).toBe(2);
  });
});

describe("trainer utilisation: coached hours against hours available for booking (O07)", () => {
  const availability = [{ trainerId: "t1", branchId: "b1", weekday: 1, start: "06:00", end: "11:00" }, { trainerId: "t1", branchId: "b1", weekday: 1, start: "17:00", end: "21:00" }, { trainerId: "t1", branchId: "b2", weekday: 3, start: "06:00", end: "10:00" }];
  const base = { availability, shifts: [], leave: [], branchIds: ["b1", "b2"], from: "2026-11-16", to: "2026-11-22" }; // Monday to Sunday
  const session = (start: string, end: string, status = "attended", branchId = "b1") => ({ kind: "pt_session" as const, status: status as "attended", trainerId: "t1", branchId, startsAt: start, endsAt: end });
  it("a trainer with 9 hours on Monday and 4 on Wednesday has 13 available; two attended hours are 15%", () => {
    const u = trainerUtilisation({ ...base, bookings: [session("2026-11-16T01:30:00.000Z", "2026-11-16T02:30:00.000Z"), session("2026-11-18T01:30:00.000Z", "2026-11-18T02:30:00.000Z", "attended", "b2"), session("2026-11-17T01:30:00.000Z", "2026-11-17T02:30:00.000Z", "no_show")] });
    expect(u.trainers).toEqual([{ trainerId: "t1", availableHours: 13, coachedHours: 2, percent: 15 }]);
    expect(u).toMatchObject({ availableHours: 13, coachedHours: 2, percent: 15 });
  });
  it("leave removes the day’s hours, a one-off shift adds its own, and overlapping windows count once", () => {
    const u = trainerUtilisation({ ...base, bookings: [], leave: [{ trainerId: "t1", from: "2026-11-18", to: "2026-11-18" }], shifts: [{ trainerId: "t1", branchId: "b1", date: "2026-11-16", start: "09:00", end: "12:00" }] });
    // Monday: 06–11 and 17–21 plus 09–12 merge to 06–12 and 17–21 = 10 hours; Wednesday is on leave.
    expect(u.availableHours).toBe(10);
  });
  it("only the branches in view count, on both sides", () => {
    const u = trainerUtilisation({ ...base, branchIds: ["b1"], bookings: [session("2026-11-18T01:30:00.000Z", "2026-11-18T02:30:00.000Z", "attended", "b2")] });
    expect(u).toMatchObject({ availableHours: 9, coachedHours: 0, percent: 0 });
  });
  it("nobody available is no percentage, not zero", () => {
    expect(trainerUtilisation({ ...base, availability: [], bookings: [] }).percent).toBeNull();
  });
});
