import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { getDashboard } from "@/api/dashboard";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { creditBalance } from "@/domain/credits";
import { addDays, istDateOf } from "@/domain/dates";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

/** The demo gym looks like a reasonably busy gym, and every dashboard figure is the one the report definitions give for the stored records, worked out here again by hand. */
describe("the demo gym is busy, and its figures are the definitions’ figures", () => {
  it("fills most of a trainer’s week, with one trainer noticeably lower", async () => {
    const d = await getDashboard(as("u_owner"));
    const pct = d.utilisation.trainers.map((t) => t.percent ?? 0).sort((a, b) => a - b);
    expect(pct).toHaveLength(6);
    expect(pct[0]!).toBeGreaterThanOrEqual(20);
    expect(pct[0]!).toBeLessThanOrEqual(35);
    for (const p of pct.slice(1)) { expect(p).toBeGreaterThanOrEqual(55); expect(p).toBeLessThanOrEqual(75); }
    expect(d.utilisation.percent!).toBeGreaterThanOrEqual(50);
  });

  it("billed, collected, dues and renewals equal a plain count of the stored records", async () => {
    const d = await getDashboard(as("u_owner"));
    const [invoices, payments, memberships, bookings] = await Promise.all([db.invoices.toArray(), db.payments.toArray(), db.memberships.toArray(), db.bookings.toArray()]);
    const inRange = (date: string) => date >= d.from && date <= d.to;
    expect(d.money.billedPaise).toBe(invoices.filter((i) => i.status !== "void" && i.status !== "draft" && inRange(i.issuedOn)).reduce((n, i) => n + i.totalPaise, 0));
    expect(d.money.collectedPaise).toBe(payments.filter((p) => p.status === "succeeded" && p.method !== "credit_note" && inRange(istDateOf(p.receivedAt))).reduce((n, p) => n + p.amountPaise, 0));
    // Collected is most of billed, and what is still owed is a modest share of it: a gym that gets paid.
    expect(d.money.collectedPaise / d.money.billedPaise).toBeGreaterThan(0.75);
    expect(d.dues.duePaise / d.money.billedPaise).toBeLessThan(0.2);
    expect(d.dues.overduePaise).toBeGreaterThan(0);
    // Renewals: ended in the range and not canceled before the end; renewed when the same member has a paid, started-or-scheduled membership that begins within 30 days after.
    const cohort = memberships.filter((m) => m.endsOn && inRange(m.endsOn) && !(m.canceledEffectiveOn && m.canceledEffectiveOn <= m.endsOn));
    const renewed = cohort.filter((m) => memberships.some((x) => x.memberId === m.memberId && x.id !== m.id && x.startsOn > m.startsOn && x.startsOn <= addDays(m.endsOn!, 30) && x.status !== "canceled" && x.status !== "pending"));
    expect(d.renewals).toEqual({ due: cohort.length, renewed: renewed.length, ratePercent: Math.round((renewed.length / cohort.length) * 100) });
    expect(d.renewals.ratePercent!).toBeGreaterThanOrEqual(60);
    expect(d.renewals.ratePercent!).toBeLessThanOrEqual(80);
    // Coached hours: attended personal-training sessions in the range, one hour each.
    const attended = bookings.filter((b) => b.kind === "pt_session" && b.status === "attended" && inRange(istDateOf(b.startsAt)));
    expect(d.utilisation.coachedHours).toBe(attended.length);
  });

  it("one branch keeps fewer members than the others, and every branch has money and visits", async () => {
    const parts = await Promise.all(["br_andheri", "br_bandra", "br_powai"].map((b) => getDashboard(as("u_owner"), { branchId: b })));
    const rates = parts.map((p) => p.renewals.ratePercent!);
    expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThanOrEqual(15);
    for (const p of parts) { expect(p.money.collectedPaise).toBeGreaterThan(0); expect(p.heat.total).toBeGreaterThan(150); }
  });

  it("peak hours are early morning and evening on weekdays, and Sunday is the quietest day", async () => {
    const d = await getDashboard(as("u_owner"));
    for (const p of d.heat.peaks) { expect([6, 7, 8, 17, 18, 19, 20]).toContain(p.hour); }
    const byDay = d.heat.cells.map((row) => row.reduce((n, c) => n + c, 0));
    expect(byDay[6]).toBe(Math.min(...byDay));
    expect(d.heat.total / 100).toBeGreaterThan(7); // about nine visits a month for each active member
  });

  it("every coached session has a credit behind it: no client’s balance goes below zero and no slot is used twice", async () => {
    const [ledger, bookings] = await Promise.all([db.creditLedger.toArray(), db.bookings.toArray()]);
    const byMember = new Map<string, typeof ledger>();
    for (const e of ledger) byMember.set(e.memberId, [...(byMember.get(e.memberId) ?? []), e]);
    for (const [memberId, entries] of byMember) expect(creditBalance(entries).available, memberId).toBeGreaterThanOrEqual(0);
    const keys = bookings.filter((b) => b.status !== "canceled" && b.slotKey).map((b) => b.slotKey);
    expect(new Set(keys).size).toBe(keys.length);
    // A client is never in two sessions at the same time.
    const seen = new Set<string>();
    for (const b of bookings.filter((x) => x.kind === "pt_session" && x.status !== "canceled")) { const k = `${b.memberId}|${b.startsAt}`; expect(seen.has(k), k).toBe(false); seen.add(k); }
  });
});
