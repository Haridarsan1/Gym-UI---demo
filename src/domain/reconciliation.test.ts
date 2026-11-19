import { describe, expect, it } from "vitest";
import { reconcile, type ReconPayment } from "@/domain/reconciliation";

const pay = (id: string, amountPaise: number, reference: string, receivedAt = "2026-11-10T06:00:00.000Z", extra: Partial<ReconPayment> = {}): ReconPayment => ({ id, method: "upi", status: "succeeded", amountPaise, reference, receivedAt, reconciliation: { status: "unmatched" }, ...extra });
const settle = (id: string, lines: Array<[string, number]>) => ({ id, reference: id, settledOn: "2026-11-12", lines: lines.map(([reference, amountPaise]) => ({ reference, amountPaise })) });
const TODAY = "2026-11-17";

describe("reconcile", () => {
  it("matches a charge with the same reference and amount", () => {
    const r = reconcile({ payments: [pay("p1", 5000, "r1")], settlements: [settle("s1", [["r1", 5000]])], events: [], today: TODAY });
    expect(r.statuses.get("p1")).toEqual({ status: "matched", settlementId: "s1" });
    expect(r.issues).toEqual([]);
    expect(r.totals).toMatchObject({ onlinePaise: 5000, matchedPaise: 5000 });
  });
  it("flags a payout with a different amount", () => {
    const r = reconcile({ payments: [pay("p1", 5000, "r1")], settlements: [settle("s1", [["r1", 4900]])], events: [], today: TODAY });
    expect(r.statuses.get("p1")?.status).toBe("flagged");
    expect(r.issues).toEqual([{ kind: "amount_differs", paymentId: "p1", settlementId: "s1", paymentPaise: 5000, settledPaise: 4900 }]);
  });
  it("waits three days for a payout, then flags the charge", () => {
    const young = reconcile({ payments: [pay("p1", 5000, "r1", "2026-11-14T06:00:00.000Z")], settlements: [], events: [], today: TODAY });
    expect(young.statuses.get("p1")?.status).toBe("unmatched");
    expect(young.issues).toEqual([]);
    const old = reconcile({ payments: [pay("p1", 5000, "r1", "2026-11-13T06:00:00.000Z")], settlements: [], events: [], today: TODAY });
    expect(old.statuses.get("p1")?.status).toBe("flagged");
    expect(old.issues[0]).toMatchObject({ kind: "not_settled", daysAgo: 4 });
  });
  it("lists a payout line Ember has no payment for", () => {
    const r = reconcile({ payments: [], settlements: [settle("s1", [["ghost", 700]])], events: [], today: TODAY });
    expect(r.issues).toEqual([{ kind: "not_in_ember", settlementId: "s1", reference: "ghost", amountPaise: 700 }]);
  });
  it("lists an event delivered more than once, until finance has accepted it", () => {
    const events = [{ id: "e1", paymentId: "p1", deliveries: 3 }];
    expect(reconcile({ payments: [pay("p1", 5000, "r1")], settlements: [settle("s1", [["r1", 5000]])], events, today: TODAY }).issues).toEqual([{ kind: "duplicate_event", eventId: "e1", paymentId: "p1", deliveries: 3 }]);
    expect(reconcile({ payments: [pay("p1", 5000, "r1")], settlements: [settle("s1", [["r1", 5000]])], events: [{ ...events[0]!, reviewedBy: "u_finance" }], today: TODAY }).issues).toEqual([]);
  });
  it("ignores cash and failed payments, and keeps a payment finance already accepted", () => {
    const accepted = pay("p3", 900, "r3", "2026-11-01T06:00:00.000Z", { reconciliation: { status: "matched", note: "Reviewed", reviewedBy: "u_finance" } });
    const r = reconcile({ payments: [pay("p1", 100, "r1", undefined, { method: "cash" }), pay("p2", 100, "r2", undefined, { status: "failed" }), accepted], settlements: [], events: [], today: TODAY });
    expect([...r.statuses.keys()]).toEqual(["p3"]);
    expect(r.issues).toEqual([]);
  });
});
