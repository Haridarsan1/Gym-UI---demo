import { describe, expect, it } from "vitest";
import { canReserve, creditBalance } from "@/domain/credits";
import type { CreditLedgerEntry } from "@/domain/types";

type E = Pick<CreditLedgerEntry, "id" | "kind" | "credits" | "direction" | "refEntryId">;
const e = (id: string, kind: E["kind"], credits: number, extra: Partial<E> = {}): E => ({ id, kind, credits, direction: undefined, refEntryId: undefined, ...extra });

describe("credit ledger (M06)", () => {
  it("adds purchases to the available balance", () => {
    expect(creditBalance([e("1", "purchase", 8)])).toEqual({ available: 8, reserved: 0, consumed: 0 });
  });
  it("moves a credit from available to reserved when a session is booked", () => {
    expect(creditBalance([e("1", "purchase", 8), e("2", "reservation", 1)])).toEqual({ available: 7, reserved: 1, consumed: 0 });
  });
  it("consumes a reserved credit when the session happens", () => {
    expect(creditBalance([e("1", "purchase", 8), e("2", "reservation", 1), e("3", "consumption", 1)])).toEqual({ available: 7, reserved: 0, consumed: 1 });
  });
  it("gives a reserved credit back when a booking is canceled in time", () => {
    expect(creditBalance([e("1", "purchase", 8), e("2", "reservation", 1), e("3", "release", 1)])).toEqual({ available: 8, reserved: 0, consumed: 0 });
  });
  it("takes back credits on expiry and applies manual adjustments both ways", () => {
    expect(creditBalance([e("1", "purchase", 8), e("2", "expiry", 2), e("3", "adjustment", 1, { direction: "add" }), e("4", "adjustment", 3, { direction: "remove" })])).toEqual({ available: 4, reserved: 0, consumed: 0 });
  });
  it("reverses a purchase (a refund) and a consumption (a session recorded by mistake)", () => {
    expect(creditBalance([e("1", "purchase", 8), e("2", "reversal", 3, { refEntryId: "1" })]).available).toBe(5);
    expect(creditBalance([e("1", "purchase", 8), e("2", "reservation", 1), e("3", "consumption", 1), e("4", "reversal", 1, { refEntryId: "3" })])).toEqual({ available: 8, reserved: 0, consumed: 0 });
  });
  it("ignores a reversal of an entry that is not there", () => {
    expect(creditBalance([e("1", "purchase", 2), e("2", "reversal", 1, { refEntryId: "nope" })]).available).toBe(2);
  });
  it("only allows a booking when there is a free credit", () => {
    expect(canReserve({ available: 0, reserved: 1, consumed: 3 })).toBe(false);
    expect(canReserve({ available: 1, reserved: 0, consumed: 0 })).toBe(true);
    expect(canReserve({ available: 1, reserved: 0, consumed: 0 }, 2)).toBe(false);
  });
});
