/** The cash day close (M3): the cash Ember expects in the drawer for one branch and day, and what the count says. Pure. */

export interface CashPayment { method: string; status: string; amountPaise: number; receivedAt: string; branchId: string }
export interface CashRefund { amountPaise: number; method: string; status: string; createdAt: string; branchId: string }

const istDate = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** Cash taken in, less cash handed back, at one branch on one day (IST). Only cash counts: cards, UPI and transfers never touch the drawer. */
export function expectedCash(branchId: string, date: string, payments: CashPayment[], refunds: CashRefund[]): { receivedPaise: number; refundedPaise: number; expectedPaise: number; count: number } {
  const taken = payments.filter((p) => p.branchId === branchId && p.method === "cash" && p.status === "succeeded" && istDate(p.receivedAt) === date);
  const back = refunds.filter((r) => r.branchId === branchId && r.method === "cash" && r.status === "completed" && istDate(r.createdAt) === date);
  const receivedPaise = taken.reduce((n, p) => n + p.amountPaise, 0);
  const refundedPaise = back.reduce((n, r) => n + r.amountPaise, 0);
  return { receivedPaise, refundedPaise, expectedPaise: receivedPaise - refundedPaise, count: taken.length };
}

/** Counted minus expected: negative is cash short, positive is cash over. */
export const cashVariance = (expectedPaise: number, countedPaise: number): number => countedPaise - expectedPaise;

/** A variance needs a note, so the reason is on record. */
export function closeProblem(input: { countedPaise: number; expectedPaise: number; note: string; date: string; today: string }): string | null {
  if (!Number.isInteger(input.countedPaise) || input.countedPaise < 0) return "Enter the cash you counted, in rupees.";
  if (input.date > input.today) return "You can’t close a day that hasn’t happened yet.";
  if (input.countedPaise !== input.expectedPaise && input.note.trim().length < 3) return "The count is different from what we expected. Add a note that says why.";
  return null;
}
