/**
 * Matching what Ember collected online with what the payment gateway paid out (M03, M04). Pure: the API reads the records and writes the result.
 *
 *   matched      the gateway reports a charge with the same reference and the same amount
 *   flagged      the gateway reports a different amount, or the payment is older than the settlement window and no payout has it
 *   unmatched    no payout has it yet, and it is still inside the window
 * A charge in a payout that Ember has no payment for is its own issue. A gateway event delivered more than once is listed as a duplicate: it made one
 * payment, and finance accepts it after looking.
 */

export const SETTLEMENT_WINDOW_DAYS = 3;
const ONLINE = new Set(["upi", "card", "netbanking", "online"]);
export const isOnlineMethod = (method: string): boolean => ONLINE.has(method);

export interface ReconPayment { id: string; method: string; status: string; amountPaise: number; reference?: string; receivedAt: string; reconciliation: { status: "unmatched" | "matched" | "flagged"; note?: string; settlementId?: string; reviewedBy?: string } }
export interface ReconSettlement { id: string; reference: string; settledOn: string; lines: Array<{ reference: string; amountPaise: number }> }
export interface ReconEvent { id: string; paymentId: string; deliveries: number; reviewedBy?: string }

export type ReconIssue =
  | { kind: "amount_differs"; paymentId: string; settlementId: string; paymentPaise: number; settledPaise: number }
  | { kind: "not_settled"; paymentId: string; daysAgo: number }
  | { kind: "not_in_ember"; settlementId: string; reference: string; amountPaise: number }
  | { kind: "duplicate_event"; eventId: string; paymentId: string; deliveries: number };

export interface ReconResult {
  statuses: Map<string, ReconPayment["reconciliation"]>;
  issues: ReconIssue[];
  totals: { onlinePaise: number; matchedPaise: number; flaggedPaise: number; waitingPaise: number };
}

const daysBetween = (fromIso: string, today: string) => Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

export function reconcile(input: { payments: ReconPayment[]; settlements: ReconSettlement[]; events: ReconEvent[]; today: string; windowDays?: number }): ReconResult {
  const window = input.windowDays ?? SETTLEMENT_WINDOW_DAYS;
  const lines = new Map<string, { settlementId: string; amountPaise: number }>();
  for (const s of input.settlements) for (const l of s.lines) lines.set(l.reference, { settlementId: s.id, amountPaise: l.amountPaise });
  const online = input.payments.filter((p) => p.status === "succeeded" && isOnlineMethod(p.method));
  const references = new Set(online.map((p) => p.reference).filter(Boolean));
  const statuses = new Map<string, ReconPayment["reconciliation"]>();
  const issues: ReconIssue[] = [];
  const totals = { onlinePaise: 0, matchedPaise: 0, flaggedPaise: 0, waitingPaise: 0 };

  for (const p of online) {
    totals.onlinePaise += p.amountPaise;
    // Finance looked at it and accepted it: it stays accepted.
    if (p.reconciliation.reviewedBy) { statuses.set(p.id, p.reconciliation); totals.matchedPaise += p.amountPaise; continue; }
    const line = p.reference ? lines.get(p.reference) : undefined;
    if (line && line.amountPaise === p.amountPaise) {
      statuses.set(p.id, { status: "matched", settlementId: line.settlementId });
      totals.matchedPaise += p.amountPaise;
    } else if (line) {
      statuses.set(p.id, { status: "flagged", settlementId: line.settlementId, note: "The gateway paid out a different amount." });
      issues.push({ kind: "amount_differs", paymentId: p.id, settlementId: line.settlementId, paymentPaise: p.amountPaise, settledPaise: line.amountPaise });
      totals.flaggedPaise += p.amountPaise;
    } else {
      const age = daysBetween(p.receivedAt, input.today);
      if (age > window) {
        statuses.set(p.id, { status: "flagged", note: `No payout has this charge after ${age} days.` });
        issues.push({ kind: "not_settled", paymentId: p.id, daysAgo: age });
        totals.flaggedPaise += p.amountPaise;
      } else {
        statuses.set(p.id, { status: "unmatched", note: "Waiting for the gateway’s payout." });
        totals.waitingPaise += p.amountPaise;
      }
    }
  }
  for (const s of input.settlements) for (const l of s.lines) if (!references.has(l.reference)) issues.push({ kind: "not_in_ember", settlementId: s.id, reference: l.reference, amountPaise: l.amountPaise });
  for (const e of input.events) if (e.deliveries > 1 && !e.reviewedBy) issues.push({ kind: "duplicate_event", eventId: e.id, paymentId: e.paymentId, deliveries: e.deliveries });
  return { statuses, issues, totals };
}
