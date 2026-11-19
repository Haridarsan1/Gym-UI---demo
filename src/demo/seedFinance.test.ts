import { describe, expect, it } from "vitest";
import { generateSeed } from "@/demo/seed";
import { reconcile } from "@/domain/reconciliation";

const NOW = new Date("2026-11-17T06:30:00.000Z");

describe("the finance seed", () => {
  const seed = generateSeed(NOW);
  const result = reconcile({ payments: seed.payments, settlements: seed.gatewaySettlements, events: seed.gatewayEvents, today: "2026-11-17" });

  it("has an event for each online payment that names one, and exactly one delivered more than once", () => {
    expect(seed.gatewayEvents.length).toBeGreaterThan(5);
    expect(seed.gatewayEvents.filter((e) => e.deliveries > 1)).toHaveLength(1);
    for (const e of seed.gatewayEvents) expect(seed.payments.find((p) => p.id === e.paymentId)?.gatewayEventId).toBe(e.id);
  });
  it("has one payout with a different amount, one charge no payout has, and one payout line Ember doesn’t know", () => {
    expect(result.issues.filter((i) => i.kind === "amount_differs")).toHaveLength(1);
    expect(result.issues.filter((i) => i.kind === "not_settled")).toHaveLength(1);
    expect(result.issues.filter((i) => i.kind === "not_in_ember")).toHaveLength(1);
    expect(result.issues.filter((i) => i.kind === "duplicate_event")).toHaveLength(1);
  });
  it("stores the status the Reconciliation screen would work out, so the two agree", () => {
    for (const p of seed.payments) { const s = result.statuses.get(p.id); if (s) expect(p.reconciliation).toEqual(s); }
  });
});
