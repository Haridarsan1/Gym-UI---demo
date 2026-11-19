import { TENANT_ID } from "@/app/demoAccounts";
import { addDays, istDateOf } from "@/domain/dates";
import type { GatewayEvent, GatewaySettlement, Payment } from "@/domain/types";

/**
 * What finance reconciles (M3): a gateway event for every online payment (one of them delivered three times, so the repeat has to be accepted), monthly payouts from
 * the gateway that list those charges, and three things that do not match: a payout that paid a different amount, a charge no payout has after the window, and a payout line
 * Ember has no payment for. Statuses are worked out by the same `reconcile` the Reconciliation screen runs, so the seed and the screen agree.
 */
export function buildFinanceSeed(payments: Payment[], today: string): { payments: Payment[]; gatewayEvents: GatewayEvent[]; gatewaySettlements: GatewaySettlement[] } {
  const online = payments.filter((p) => p.status === "succeeded" && ["upi", "card", "netbanking", "online"].includes(p.method) && p.reference).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
  const events: GatewayEvent[] = online.filter((p) => p.gatewayEventId).map((p, k) => ({
    id: p.gatewayEventId!, tenantId: TENANT_ID, memberId: p.memberId, invoiceId: p.invoiceId, type: "payment.succeeded", method: p.method === "card" ? "card" : p.method === "netbanking" ? "netbanking" : "upi",
    amountPaise: p.amountPaise, reference: p.reference!, paymentId: p.id, receivedAt: p.receivedAt, deliveries: k === 2 ? 3 : 1, lastDeliveredAt: k === 2 ? new Date(Date.parse(p.receivedAt) + 40 * 60_000).toISOString() : p.receivedAt,
  }));

  const oldEnough = online.filter((p) => istDateOf(p.receivedAt) < addDays(today, -3));
  const differs = oldEnough[Math.min(3, oldEnough.length - 1)];
  const missing = oldEnough[Math.min(5, oldEnough.length - 1)];
  const byMonth = new Map<string, Payment[]>();
  for (const p of oldEnough) if (p.id !== missing?.id) byMonth.set(istDateOf(p.receivedAt).slice(0, 7), [...(byMonth.get(istDateOf(p.receivedAt).slice(0, 7)) ?? []), p]);
  const settlements: GatewaySettlement[] = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, list], k, all) => {
    const monthEnd = addDays(`${month}-28`, 4).slice(0, 8) + "01";
    const lines = list.map((p) => ({ reference: p.reference!, amountPaise: p.id === differs?.id ? Math.max(0, p.amountPaise - 11_800) : p.amountPaise }));
    if (k === all.length - 1) lines.push({ reference: "UPI000000000001", amountPaise: 70_000 });
    const gross = lines.reduce((n, l) => n + l.amountPaise, 0);
    return { id: `gs_${month}`, tenantId: TENANT_ID, reference: `SETL-${month.replace("-", "")}`, settledOn: monthEnd < addDays(today, -1) ? monthEnd : addDays(today, -1), lines, feePaise: Math.round(gross * 0.0236) };
  });

  // The same statuses `reconcile` works out (a test checks the two agree): in a payout is matched or, when the amount differs, flagged; none after the window is flagged; the rest wait.
  const settled = new Set(settlements.flatMap((x) => x.lines.map((l) => l.reference)));
  const status = (p: Payment): Payment["reconciliation"] => {
    const x = settlements.find((st) => st.lines.some((l) => l.reference === p.reference));
    if (x) return p.id === differs?.id ? { status: "flagged", settlementId: x.id, note: "The gateway paid out a different amount." } : { status: "matched", settlementId: x.id };
    if (settled.has(p.reference!) || !oldEnough.includes(p)) return { status: "unmatched", note: "Waiting for the gateway’s payout." };
    return { status: "flagged", note: `No payout has this charge after ${Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${istDateOf(p.receivedAt)}T00:00:00Z`)) / 86_400_000)} days.` };
  };
  const mine = new Set(online.map((p) => p.id));
  return { payments: payments.map((p) => (mine.has(p.id) ? { ...p, reconciliation: status(p) } : p)), gatewayEvents: events, gatewaySettlements: settlements };
}
