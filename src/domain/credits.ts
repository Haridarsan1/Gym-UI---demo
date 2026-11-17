import type { CreditLedgerEntry } from "@/domain/types";

export interface CreditBalance {
  /** Credits free to book. */
  available: number;
  /** Credits held for upcoming bookings. */
  reserved: number;
  /** Credits used by sessions that took place or were late-canceled. */
  consumed: number;
}

/**
 * M06: the personal-training credit balance, worked out from the ledger. Entries are never edited, so this is the only
 * way to know a balance. See CreditEntryKind for what each kind means.
 */
export function creditBalance(entries: Array<Pick<CreditLedgerEntry, "id" | "kind" | "credits" | "direction" | "refEntryId">>): CreditBalance {
  const byId = new Map(entries.map((e) => [e.id, e]));
  let available = 0, reserved = 0, consumed = 0;
  for (const e of entries) {
    const c = e.credits;
    switch (e.kind) {
      case "purchase": available += c; break;
      case "reservation": available -= c; reserved += c; break;
      case "consumption": reserved -= c; consumed += c; break;
      case "release": reserved -= c; available += c; break;
      case "expiry": available -= c; break;
      case "adjustment": available += e.direction === "remove" ? -c : c; break;
      case "reversal": {
        const ref = e.refEntryId ? byId.get(e.refEntryId) : undefined;
        if (!ref) break;
        if (ref.kind === "purchase") available -= c;
        else if (ref.kind === "consumption") { consumed -= c; available += c; }
        else if (ref.kind === "reservation") { reserved -= c; available += c; }
        break;
      }
    }
  }
  return { available, reserved, consumed };
}

/** True when a booking that needs `credits` can be reserved. */
export const canReserve = (balance: CreditBalance, credits = 1): boolean => balance.available >= credits;
