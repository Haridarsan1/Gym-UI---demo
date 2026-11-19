import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getMembership, getReceipt, payInvoice, replayGatewayEvent, setAutoRenew, startCheckout } from "@/api/membership";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { configureSimulation } from "@/demo/simulate";
import { creditBalance } from "@/domain/credits";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const arjun = as("u_member_arjun");
const priya = as("u_member_priya");
const rahul = as("u_member_rahul");
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? e.code : "other";
  }
  return "resolved";
};
const key = () => `attempt-${Math.random().toString(36).slice(2)}-xxxx`;

beforeEach(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  configureSimulation({ paymentFails: false });
  await resetDemo();
});
afterAll(() => {
  setNow(null);
  configureSimulation({ paymentFails: false });
});

const priyaInvoice = async () => (await db.invoices.where("memberId").equals("mem_priya").filter((i) => i.status === "open").first())!;

describe("the membership screen’s data (M01, M02)", () => {
  it("gives Arjun’s plan, validity, what it includes and no dues", async () => {
    const m = await getMembership(arjun);
    expect(m.current).toMatchObject({ status: "active", planName: "Monthly Plus", startsOn: "2026-11-08", endsOn: "2026-12-08", daysLeft: 21, visitsRemaining: null, agreedPricePaise: 350_000 });
    expect(m.current!.includes).toEqual(["Unlimited visits for 30 days", "Every branch", "2 personal-training sessions", "8 classes"]);
    expect(m.dues).toBeUndefined();
    expect(m.credits).toEqual({ available: 5, reserved: 1, consumed: 2 });
  });

  it("shows a visit pass’s visits left and Rahul’s freeze with its dates", async () => {
    const s = await getMembership(as("u_member_sneha"));
    expect(s.current).toMatchObject({ visitsRemaining: 4, visitsTotal: 10 });
    const r = await getMembership(rahul);
    expect(r.current).toMatchObject({ status: "frozen", freeze: { from: "2026-11-12", to: "2026-11-29", reason: "Travel", current: true } });
  });

  it("keeps the agreed terms when the catalogue price changes (M01)", async () => {
    await db.membershipPlans.update("pl_monthly_plus", { pricePaise: 500_000 });
    const m = await getMembership(arjun);
    expect(m.current!.agreedPricePaise).toBe(350_000);
    expect(m.renewal.options.find((o) => o.planId === "pl_monthly_plus")!.subtotalPaise).toBe(500_000);
  });

  it("offers renewal with the new dates and the total, the current plan marked, dearer plans as upgrades", async () => {
    const { renewal } = await getMembership(arjun);
    expect(renewal.blockedReason).toBeUndefined();
    const same = renewal.options.find((o) => o.current)!;
    expect(same).toMatchObject({ planId: "pl_monthly_plus", startsOn: "2026-12-09", endsOn: "2027-01-08", status: "scheduled", totalPaise: 413_000, upgrade: false });
    expect(renewal.options.find((o) => o.planId === "pl_quarterly")).toMatchObject({ upgrade: true, totalPaise: 767_000 });
    expect(renewal.options.map((o) => o.planId)).not.toContain("pl_trial");
    expect(renewal.options.map((o) => o.planId)).toContain("pl_visit20"); // Andheri and Powai: Arjun is at Andheri
  });

  it("does not offer a plan the member’s branch doesn’t cover", async () => {
    await db.members.update("mem_arjun", { homeBranchId: "br_bandra" });
    const { renewal } = await getMembership(arjun);
    expect(renewal.options.map((o) => o.planId)).not.toContain("pl_visit20");
  });

  it("closes renewal while frozen, and while a renewal invoice is unpaid, saying why", async () => {
    expect((await getMembership(rahul)).renewal).toMatchObject({ options: [], blockedReason: expect.stringMatching(/frozen/) });
    const p = await getMembership(priya);
    expect(p.renewal.blockedReason).toMatch(/Pay invoice [A-Z]{5}\/\d{2}-\d{2}\/\d{4} first/);
    expect(p.dues).toMatchObject({ duePaise: 295_000, overdue: true });
  });

  it("lists invoices and payments with their status and receipts, newest first", async () => {
    const m = await getMembership(arjun);
    expect(m.invoices.length).toBe(5);
    expect(m.invoices.every((i) => i.status === "paid" && i.receipts.length === 1 && i.duePaise === 0)).toBe(true);
    expect([...m.invoices].map((i) => i.issuedOn)).toEqual([...m.invoices].map((i) => i.issuedOn).sort().reverse());
    expect(m.payments.every((p) => p.status === "succeeded")).toBe(true);
    const p = await getMembership(priya);
    expect(p.invoices.find((i) => i.status === "open")).toMatchObject({ duePaise: 295_000, overdue: true, totalPaise: 295_000 });
  });
});

describe("paying an open invoice through the gateway (M03, M04)", () => {
  it("records one payment, marks the invoice paid, renews the membership once and writes a receipt email and an audit event", async () => {
    const inv = await priyaInvoice();
    const co = await startCheckout(priya, { kind: "invoice", invoiceId: inv.id });
    expect(co).toMatchObject({ kind: "renewal", duePaise: 295_000, totalPaise: 295_000, taxPaise: 45_000 });
    expect(co.effects[0]).toMatch(/^Monthly runs 21 Nov 2026 to 21 Dec 2026\.$/);
    const r = await payInvoice(priya, { invoiceId: inv.id, method: "upi", idempotencyKey: key() });
    expect(r).toMatchObject({ status: "succeeded", amountPaise: 295_000, repeated: false, effects: { kind: "renewal", membership: { planName: "Monthly", startsOn: "2026-11-21", endsOn: "2026-12-21", status: "scheduled" } } });
    expect(r.receiptNumber).toMatch(/^RCP-2026-\d{4}$/);
    expect((await db.invoices.get(inv.id))!.status).toBe("paid");
    expect(await db.memberships.where("invoiceId").equals(inv.id).count()).toBe(1);
    expect(await db.emailLog.where("memberId").equals("mem_priya").filter((e) => e.template === "payment_receipt").count()).toBe(1);
    const audit = await db.auditEvents.filter((a) => a.memberId === "mem_priya" && a.action === "membership.renew").toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorRole: "member", reason: "Paid online by the member" });
    const after = await getMembership(priya);
    expect(after.dues).toBeUndefined();
    expect(after.next).toMatchObject({ planName: "Monthly", startsOn: "2026-11-21", status: "scheduled" });
  });

  it("a repeated attempt with the same key returns the same payment and charges once", async () => {
    const inv = await priyaInvoice();
    const k = key();
    const a = await payInvoice(priya, { invoiceId: inv.id, method: "card", idempotencyKey: k });
    const b = await payInvoice(priya, { invoiceId: inv.id, method: "card", idempotencyKey: k });
    expect(b).toMatchObject({ repeated: true, paymentId: a.paymentId, status: "succeeded", effects: { kind: "renewal" } });
    expect(await db.payments.where("invoiceId").equals(inv.id).count()).toBe(1);
  });

  it("refuses to pay an invoice that is already paid, someone else’s, or one that doesn’t exist", async () => {
    const inv = await priyaInvoice();
    await payInvoice(priya, { invoiceId: inv.id, method: "upi", idempotencyKey: key() });
    expect(await code(payInvoice(priya, { invoiceId: inv.id, method: "upi", idempotencyKey: key() }))).toBe("conflict");
    expect(await code(startCheckout(priya, { kind: "invoice", invoiceId: inv.id }))).toBe("conflict");
    const other = await priyaInvoice().catch(() => undefined);
    expect(other).toBeUndefined();
    const arjunInv = (await db.invoices.where("memberId").equals("mem_arjun").first())!;
    expect(await code(payInvoice(priya, { invoiceId: arjunInv.id, method: "upi", idempotencyKey: key() }))).toBe("not_found");
    expect(await code(payInvoice(priya, { invoiceId: "inv_nope", method: "upi", idempotencyKey: key() }))).toBe("not_found");
  });

  it("only a member can pay", async () => {
    const inv = await priyaInvoice();
    expect(await code(payInvoice(as("u_desk_andheri"), { invoiceId: inv.id, method: "upi", idempotencyKey: key() }))).toBe("forbidden");
    expect(await code(startCheckout(as("u_trainer_meera"), { kind: "invoice", invoiceId: inv.id }))).toBe("forbidden");
  });
});

describe("a failed payment (M03)", () => {
  it("is recorded with what happened, leaves the invoice open and activates nothing", async () => {
    const inv = await priyaInvoice();
    configureSimulation({ paymentFails: true });
    const memberships = await db.memberships.where("memberId").equals("mem_priya").count();
    const r = await payInvoice(priya, { invoiceId: inv.id, method: "upi", idempotencyKey: key() });
    expect(r).toMatchObject({ status: "failed", effects: { kind: "invoice" } });
    expect(r.message).toBe("The payment didn’t go through, and no money was taken. Try again, or choose another way to pay.");
    expect(r.receiptNumber).toBeUndefined();
    expect((await db.invoices.get(inv.id))!.status).toBe("open");
    expect(await db.memberships.where("memberId").equals("mem_priya").count()).toBe(memberships);
    expect(await db.emailLog.where("memberId").equals("mem_priya").filter((e) => e.template === "payment_receipt").count()).toBe(0);
    const p = await getMembership(priya);
    expect(p.dues).toMatchObject({ duePaise: 295_000 });
    expect(p.payments[0]).toMatchObject({ status: "failed", failureReason: expect.stringMatching(/no money was taken/) });
    expect(p.invoices.find((i) => i.id === inv.id)!.receipts).toEqual([]);
  });

  it("can be tried again with a new key once the gateway works, and then goes through once", async () => {
    const inv = await priyaInvoice();
    configureSimulation({ paymentFails: true });
    await payInvoice(priya, { invoiceId: inv.id, method: "card", idempotencyKey: key() });
    configureSimulation({ paymentFails: false });
    const ok = await payInvoice(priya, { invoiceId: inv.id, method: "card", idempotencyKey: key() });
    expect(ok.status).toBe("succeeded");
    expect(await db.payments.where("invoiceId").equals(inv.id).filter((p) => p.status === "succeeded").count()).toBe(1);
    expect(await db.memberships.where("invoiceId").equals(inv.id).count()).toBe(1);
  });
});

describe("the same gateway event arriving again (M04)", () => {
  it("creates one payment and one renewal, however many times it is replayed", async () => {
    const inv = await priyaInvoice();
    const r = await payInvoice(priya, { invoiceId: inv.id, method: "upi", idempotencyKey: key() });
    const first = await replayGatewayEvent(priya, r.eventId);
    expect(first).toMatchObject({ ignored: true, deliveries: 2, payments: 1, memberships: 1 });
    const second = await replayGatewayEvent(priya, r.eventId);
    expect(second).toMatchObject({ ignored: true, deliveries: 3, payments: 1, memberships: 1 });
    expect(await db.payments.where("invoiceId").equals(inv.id).count()).toBe(1);
    expect(await db.memberships.where("invoiceId").equals(inv.id).count()).toBe(1);
    expect(await db.emailLog.where("memberId").equals("mem_priya").filter((e) => e.template === "payment_receipt").count()).toBe(1);
    expect((await getMembership(priya)).demo.events[0]).toMatchObject({ id: r.eventId, deliveries: 3, payments: 1, memberships: 1 });
  });

  it("holds when several copies arrive at the same moment", async () => {
    const inv = await priyaInvoice();
    const r = await payInvoice(priya, { invoiceId: inv.id, method: "upi", idempotencyKey: key() });
    const results = await Promise.all(Array.from({ length: 5 }, () => replayGatewayEvent(priya, r.eventId)));
    expect(results.every((x) => x.payments === 1 && x.memberships === 1 && x.ignored)).toBe(true);
    expect((await db.gatewayEvents.get(r.eventId))!.deliveries).toBe(6);
    expect(await db.payments.where("invoiceId").equals(inv.id).count()).toBe(1);
  });

  it("only the member whose payment it was can replay it", async () => {
    const inv = await priyaInvoice();
    const r = await payInvoice(priya, { invoiceId: inv.id, method: "upi", idempotencyKey: key() });
    expect(await code(replayGatewayEvent(arjun, r.eventId))).toBe("not_found");
    expect(await code(replayGatewayEvent(priya, "gw_evt_missing"))).toBe("not_found");
  });
});

describe("renewing and upgrading (M01, M02, M04)", () => {
  it("renews the same plan from the day after it ends, adds the plan’s sessions, and keeps the old membership’s terms", async () => {
    const co = await startCheckout(arjun, { kind: "renewal", planId: "pl_monthly_plus" });
    expect(co).toMatchObject({ kind: "renewal", totalPaise: 413_000, subtotalPaise: 350_000, taxPaise: 63_000 });
    expect(co.description).toBe("Monthly Plus membership, 9 Dec 2026 to 8 Jan 2027");
    const again = await startCheckout(arjun, { kind: "renewal", planId: "pl_monthly_plus" });
    expect(again.invoiceId).toBe(co.invoiceId); // asking again reuses the open invoice
    const r = await payInvoice(arjun, { invoiceId: co.invoiceId, method: "netbanking", idempotencyKey: key() });
    expect(r.effects).toMatchObject({ kind: "renewal", membership: { planName: "Monthly Plus", startsOn: "2026-12-09", endsOn: "2027-01-08", status: "scheduled" } });
    const all = await db.memberships.where("memberId").equals("mem_arjun").toArray();
    expect(all.find((m) => m.status === "active")!.endsOn).toBe("2026-12-08"); // the running one is left alone
    expect(all.find((m) => m.invoiceId === co.invoiceId)).toMatchObject({ renewsMembershipId: all.find((m) => m.status === "active")!.id, visitsRemaining: null });
    expect(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available).toBe(7);
    const view = await getMembership(arjun);
    expect(view.current!.planName).toBe("Monthly Plus");
    expect(view.next).toMatchObject({ startsOn: "2026-12-09", endsOn: "2027-01-08" });
    expect(view.renewal.blockedReason).toMatch(/already booked to start/);
  });

  it("an upgrade takes the new plan’s price and terms and is audited as an upgrade", async () => {
    const co = await startCheckout(arjun, { kind: "renewal", planId: "pl_annual_pt" });
    expect(co.totalPaise).toBe(3_304_000);
    await payInvoice(arjun, { invoiceId: co.invoiceId, method: "upi", idempotencyKey: key() });
    const m = (await db.memberships.where("invoiceId").equals(co.invoiceId).first())!;
    expect(m.terms).toMatchObject({ name: "Annual with training", pricePaise: 2_800_000, ptCredits: 8 });
    expect(m.endsOn).toBe("2027-12-09");
    expect(await db.auditEvents.filter((a) => a.memberId === "mem_arjun" && a.action === "membership.upgrade").count()).toBe(1);
  });

  it("choosing another plan replaces the earlier unpaid renewal invoice", async () => {
    const a = await startCheckout(arjun, { kind: "renewal", planId: "pl_monthly_plus" });
    const b = await startCheckout(arjun, { kind: "renewal", planId: "pl_quarterly" });
    expect(b.invoiceId).not.toBe(a.invoiceId);
    expect((await db.invoices.get(a.invoiceId))!.status).toBe("void");
    expect((await getMembership(arjun)).invoices.find((i) => i.id === a.invoiceId)!.status).toBe("void");
  });

  it("starts today as active when the membership has ended, and closes the old one", async () => {
    const current = (await db.memberships.where("memberId").equals("mem_arjun").filter((m) => m.status === "active").first())!;
    await db.memberships.update(current.id, { endsOn: "2026-11-10", status: "expired" });
    const co = await startCheckout(arjun, { kind: "renewal", planId: "pl_monthly" });
    const r = await payInvoice(arjun, { invoiceId: co.invoiceId, method: "upi", idempotencyKey: key() });
    expect(r.effects.membership).toMatchObject({ startsOn: "2026-11-17", status: "active" });
    expect((await getMembership(arjun)).current).toMatchObject({ planName: "Monthly", status: "active" });
  });

  it("refuses a renewal while frozen, for a plan the branch doesn’t sell, and for the free trial", async () => {
    expect(await code(startCheckout(rahul, { kind: "renewal", planId: "pl_annual" }))).toBe("conflict");
    expect(await code(startCheckout(arjun, { kind: "renewal", planId: "pl_trial" }))).toBe("invalid");
    expect(await code(startCheckout(arjun, { kind: "renewal", planId: "pl_missing" }))).toBe("invalid");
  });

  it("a failed renewal payment leaves no membership behind", async () => {
    const co = await startCheckout(arjun, { kind: "renewal", planId: "pl_monthly" });
    configureSimulation({ paymentFails: true });
    const before = await db.memberships.where("memberId").equals("mem_arjun").count();
    const r = await payInvoice(arjun, { invoiceId: co.invoiceId, method: "card", idempotencyKey: key() });
    expect(r.status).toBe("failed");
    expect(await db.memberships.where("memberId").equals("mem_arjun").count()).toBe(before);
    expect((await db.invoices.get(co.invoiceId))!.status).toBe("open");
  });
});

describe("buying more sessions (M06)", () => {
  it("adds the pack’s credits once, with an expiry, after the payment succeeds", async () => {
    const co = await startCheckout(arjun, { kind: "sessions", sessions: 4 });
    expect(co).toMatchObject({ kind: "sessions", subtotalPaise: 320_000, taxPaise: 57_600, totalPaise: 377_600 });
    expect(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available).toBe(5); // nothing yet
    const r = await payInvoice(arjun, { invoiceId: co.invoiceId, method: "upi", idempotencyKey: key() });
    expect(r.effects).toMatchObject({ kind: "sessions", sessionsAdded: 4, balance: { available: 9, reserved: 1, consumed: 2 } });
    const e = await replayGatewayEvent(arjun, r.eventId);
    expect(e).toMatchObject({ ignored: true, payments: 1, creditEntries: 1 });
    expect(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available).toBe(9);
    const entry = (await db.creditLedger.where("memberId").equals("mem_arjun").filter((x) => x.idempotencyKey.startsWith("sessions:")).toArray())[0]!;
    expect(entry.expiresOn).toBe("2027-04-16");
  });

  it("refuses a pack that isn’t on offer", async () => {
    expect(await code(startCheckout(arjun, { kind: "sessions", sessions: 5 }))).toBe("invalid");
  });

  it("a failed payment adds no sessions", async () => {
    const co = await startCheckout(arjun, { kind: "sessions", sessions: 8 });
    configureSimulation({ paymentFails: true });
    await payInvoice(arjun, { invoiceId: co.invoiceId, method: "upi", idempotencyKey: key() });
    expect(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available).toBe(5);
  });
});

describe("auto-renew (M04)", () => {
  it("is opt-in, says when and what is charged, and writes an audit event each way", async () => {
    const before = await getMembership(arjun);
    expect(before.autoRenew).toMatchObject({ on: false, available: true, terms: { planName: "Monthly Plus", chargeOn: "2026-12-08", reminderOn: "2026-12-05", amountPaise: 413_000, newEndsOn: "2027-01-08" } });
    expect(await setAutoRenew(arjun, { on: true, method: "upi" })).toEqual({ on: true, method: "upi" });
    expect((await getMembership(arjun)).autoRenew).toMatchObject({ on: true, method: "upi" });
    await setAutoRenew(arjun, { on: false });
    expect((await getMembership(arjun)).autoRenew.on).toBe(false);
    const audit = await db.auditEvents.filter((a) => a.memberId === "mem_arjun" && a.action === "membership.autorenew").toArray();
    expect(audit.map((a) => a.reason).sort()).toEqual(["Member opted in", "Member opted out"]);
  });

  it("needs a payment method to turn on, and an active membership", async () => {
    expect(await code(setAutoRenew(arjun, { on: true }))).toBe("invalid");
    expect(await code(setAutoRenew(rahul, { on: true, method: "card" }))).toBe("conflict");
    expect((await getMembership(rahul)).autoRenew).toMatchObject({ available: false, unavailableReason: expect.stringMatching(/while your membership is active/) });
  });
});

describe("the tax receipt (M03)", () => {
  it("is an Indian tax invoice: gym details, GSTIN, SAC, CGST and SGST for in-state supply, the amount in words and the payment", async () => {
    const inv = (await db.invoices.where("memberId").equals("mem_arjun").first())!;
    const r = await getReceipt(arjun, inv.id);
    expect(r.title).toBe("Tax invoice and receipt");
    expect(r.supplier).toMatchObject({ legalName: "Pulse Fitness Private Limited", gstin: "27AABCP1234F1Z5", stateName: "Maharashtra", stateCode: "27" });
    expect(r.placeOfSupply).toEqual({ code: "27", name: "Maharashtra" });
    expect(r.invoice.sac).toBe("999723");
    expect(r.totals.cgstPaise + r.totals.sgstPaise).toBe(r.totals.taxPaise);
    expect(r.totals.igstPaise).toBe(0);
    expect(r.totals.totalPaise).toBe(r.totals.taxablePaise + r.totals.taxPaise);
    expect(r.rateBp).toBe(900);
    expect(r.amountInWords).toMatch(/^Rupees .* Only$/);
    expect(r.payments).toHaveLength(1);
    expect(r.payments[0]!.receiptNumber).toMatch(/^RCP-2026-/);
    expect(r.duePaise).toBe(0);
    expect(r.billTo).toMatchObject({ name: "Arjun Kumar", branchName: "Andheri" });
  });

  it("is only a tax invoice until it is paid, and shows what is due", async () => {
    const inv = await priyaInvoice();
    const r = await getReceipt(priya, inv.id);
    expect(r).toMatchObject({ title: "Tax invoice", duePaise: 295_000, paidPaise: 0, payments: [] });
    expect(r.invoice.overdue).toBe(true);
    expect(r.amountInWords).toBe("Rupees Two Thousand Nine Hundred Fifty Only");
  });

  it("uses IGST when the place of supply is another state, and never opens someone else’s invoice", async () => {
    const inv = (await db.invoices.where("memberId").equals("mem_arjun").first())!;
    await db.invoices.update(inv.id, { placeOfSupply: "29" });
    const r = await getReceipt(arjun, inv.id);
    expect(r.totals).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: inv.taxPaise });
    expect(r.rateBp).toBe(1800);
    expect(await code(getReceipt(priya, inv.id))).toBe("not_found");
  });
});

describe("a checkout that was never paid is a cart, not a bill", () => {
  it("is not owed, not listed and not shown as dues until a payment has been tried", async () => {
    const co = await startCheckout(arjun, { kind: "sessions", sessions: 4 });
    const cart = await getMembership(arjun);
    expect(cart.dues).toBeUndefined();
    expect(cart.invoices.map((i) => i.id)).not.toContain(co.invoiceId);
    // The same checkout again reuses it instead of making another.
    expect((await startCheckout(arjun, { kind: "sessions", sessions: 4 })).invoiceId).toBe(co.invoiceId);
    // After a declined payment it is a real open invoice, so the member can see it and pay it.
    configureSimulation({ paymentFails: true });
    await payInvoice(arjun, { invoiceId: co.invoiceId, method: "upi", idempotencyKey: key() });
    const after = await getMembership(arjun);
    expect(after.dues).toMatchObject({ invoiceId: co.invoiceId, duePaise: 377_600 });
    expect(after.invoices.find((i) => i.id === co.invoiceId)).toMatchObject({ status: "open", duePaise: 377_600 });
  });

  it("doesn’t stop a renewal or show on Today while it is only a cart", async () => {
    await startCheckout(arjun, { kind: "renewal", planId: "pl_quarterly" });
    expect((await getMembership(arjun)).renewal.options.length).toBeGreaterThan(0);
    const { getToday } = await import("@/api/member");
    expect((await getToday(arjun)).dues).toBeUndefined();
  });
});
