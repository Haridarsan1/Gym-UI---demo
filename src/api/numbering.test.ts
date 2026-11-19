import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { startCheckout } from "@/api/membership";
import { allocateNumber } from "@/api/numbering";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { configureSimulation } from "@/demo/simulate";
import { financialYear } from "@/domain/numbering";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};

beforeEach(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  configureSimulation({ paymentFails: false });
  await resetDemo();
});
afterAll(() => setNow(null));

/** Every invoice number, grouped by series (prefix and financial year), in order. */
async function bySeries() {
  const out = new Map<string, number[]>();
  for (const i of await db.invoices.toArray()) {
    const m = /^([A-Z0-9]{3,5})\/(\d{2}-\d{2})\/(\d{4})$/.exec(i.number);
    expect(m, `${i.number} has the GST format`).not.toBeNull();
    expect(i.number.length).toBeLessThanOrEqual(16);
    expect(m![2]).toBe(financialYear(i.issuedOn));
    const k = `${m![1]}/${m![2]}`;
    out.set(k, [...(out.get(k) ?? []), Number(m![3])]);
  }
  return out;
}

describe("GST invoice numbers in the seed", () => {
  it("every invoice has a unique 16-character number with its branch prefix and financial year", async () => {
    const all = await db.invoices.toArray();
    expect(new Set(all.map((i) => i.number)).size).toBe(all.length);
    const branches = new Map((await db.branches.toArray()).map((b) => [b.id, b.invoicePrefix]));
    for (const i of all) expect(i.number.startsWith(`${branches.get(i.branchId)}/`)).toBe(true);
    expect(all.find((i) => i.number.startsWith("PFAND/26-27/"))).toBeDefined();
  });

  it("each series is consecutive from 0001 with no gaps, and the counters say where each one is", async () => {
    for (const [series, seqs] of await bySeries()) {
      expect([...seqs].sort((a, b) => a - b), series).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1));
    }
    for (const row of await db.numberSeries.toArray()) expect(row.last).toBe((await bySeries()).get(`${row.prefix}/${row.financialYear}`)!.length);
  });

  it("numbers follow the order invoices were issued", async () => {
    const rows = (await db.invoices.toArray()).filter((i) => i.number.startsWith("PFAND/26-27/")).sort((a, b) => a.number.localeCompare(b.number));
    expect(rows.map((r) => r.issuedOn)).toEqual([...rows.map((r) => r.issuedOn)].sort());
  });
});

describe("allocating a number", () => {
  it("the next invoice takes the next number in its series", async () => {
    const before = (await db.numberSeries.get("t_pulse|PFAND|26-27"))!.last;
    const co = await startCheckout(as("u_member_arjun"), { kind: "renewal", planId: "pl_monthly_plus" } as never);
    expect(co.number).toBe(`PFAND/26-27/${String(before + 1).padStart(4, "0")}`);
    expect((await db.numberSeries.get("t_pulse|PFAND|26-27"))!.last).toBe(before + 1);
  });

  it("many invoices made at once get different consecutive numbers, none missing", async () => {
    const branch = (await db.branches.get("br_andheri"))!;
    const before = (await db.numberSeries.get("t_pulse|PFAND|26-27"))!.last;
    const numbers = await Promise.all(Array.from({ length: 12 }, () => db.transaction("rw", db.tables, () => allocateNumber("t_pulse", "invoice", branch, "2026-11-17"))));
    expect(new Set(numbers).size).toBe(12);
    expect(numbers.map((n) => Number(n.slice(-4))).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => before + 1 + i));
  });

  it("a transaction that fails gives its number back, so there is no gap", async () => {
    const branch = (await db.branches.get("br_andheri"))!;
    const before = (await db.numberSeries.get("t_pulse|PFAND|26-27"))!.last;
    await expect(db.transaction("rw", db.tables, async () => {
      await allocateNumber("t_pulse", "invoice", branch, "2026-11-17");
      throw new Error("the invoice could not be saved");
    })).rejects.toThrow();
    expect((await db.numberSeries.get("t_pulse|PFAND|26-27"))!.last).toBe(before);
  });

  it("a new financial year starts again at 0001, and credit notes have their own series", async () => {
    const branch = (await db.branches.get("br_andheri"))!;
    expect(await db.transaction("rw", db.tables, () => allocateNumber("t_pulse", "invoice", branch, "2027-04-01"))).toBe("PFAND/27-28/0001");
    expect(await db.transaction("rw", db.tables, () => allocateNumber("t_pulse", "credit_note", branch, "2026-11-17"))).toBe("CNAND/26-27/0001");
    expect(await db.transaction("rw", db.tables, () => allocateNumber("t_pulse", "credit_note", branch, "2026-11-18"))).toBe("CNAND/26-27/0002");
  });
});
