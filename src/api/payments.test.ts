import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { adjustCredits } from "@/api/creditsAdjust";
import { getDues, sendReminder } from "@/api/dues";
import { registerMember } from "@/api/newMember";
import { collectPayment, getDeskReceipt } from "@/api/payments";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { creditBalance } from "@/domain/credits";
import { amountDuePaise } from "@/domain/billing";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) };
  }
  return { code: "resolved", message: "" };
};
const desk = as("u_desk_andheri");
const finance = as("u_finance");
let n = 0;
const key = () => `py-${++n}-${Math.random().toString(36).slice(2)}`;
const priyaInvoice = async () => (await db.invoices.where("memberId").equals("mem_priya").toArray()).find((i) => i.status === "open" && i.purpose?.kind === "renewal")!;
const allowPart = () => db.gymPolicies.update("pol_t_pulse", { partialPaymentsEnabled: true });

beforeEach(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("collecting a payment", () => {
  it("a full payment pays the invoice, gets a receipt number, and starts the renewal it bought", async () => {
    const inv = await priyaInvoice();
    const r = await collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: inv.totalPaise, key: key() });
    expect(r).toMatchObject({ amountPaise: inv.totalPaise, repeated: false, invoice: { status: "paid", duePaise: 0, number: inv.number }, effects: { kind: "renewal" } });
    expect(r.receiptNumber).toMatch(/^RCP-2026-\d{4}$/);
    const p = (await db.payments.get(r.paymentId))!;
    expect(p).toMatchObject({ method: "cash", status: "succeeded", receivedBy: "u_desk_andheri", branchId: "br_andheri", reconciliation: { status: "unmatched" } });
    expect((await db.memberships.where("memberId").equals("mem_priya").toArray()).some((m) => m.invoiceId === inv.id)).toBe(true);
    expect((await db.emailLog.where("memberId").equals("mem_priya").toArray()).some((e) => e.template === "payment_receipt" && e.invoiceId === inv.id)).toBe(true);
    expect((await db.auditEvents.where("action").equals("payment.record").toArray()).some((e) => e.memberId === "mem_priya" && e.entityId === r.paymentId)).toBe(true);
  });

  it("the same key makes one payment, even when two arrive at once", async () => {
    const inv = await priyaInvoice();
    const k = key();
    const [a, b] = await Promise.all([collectPayment(desk, { invoiceId: inv.id, method: "upi", amountPaise: inv.totalPaise, reference: "x@y", key: k }), collectPayment(desk, { invoiceId: inv.id, method: "upi", amountPaise: inv.totalPaise, reference: "x@y", key: k })]);
    expect(a.paymentId).toBe(b.paymentId);
    expect((await db.payments.where("invoiceId").equals(inv.id).toArray()).filter((p) => p.status === "succeeded")).toHaveLength(1);
    expect((await db.memberships.where("memberId").equals("mem_priya").toArray()).filter((m) => m.invoiceId === inv.id)).toHaveLength(1);
  });

  it("a part payment is refused unless the gym allows it, then leaves the rest due and the membership waiting", async () => {
    const inv = await priyaInvoice();
    const refused = await err(collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: 100_000, key: key() }));
    expect(refused.code).toBe("invalid");
    expect(refused.message).toMatch(/takes the full ₹[\d,]+ at once/);
    await allowPart();
    const r = await collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: 100_000, key: key() });
    expect(r.invoice).toMatchObject({ status: "partially_paid", duePaise: inv.totalPaise - 100_000 });
    expect(r.effects.kind).toBe("invoice");
    expect((await db.memberships.where("memberId").equals("mem_priya").toArray()).some((m) => m.invoiceId === inv.id)).toBe(false);
    const rest = await collectPayment(desk, { invoiceId: inv.id, method: "upi", amountPaise: inv.totalPaise - 100_000, reference: "priya@okbank", key: key() });
    expect(rest).toMatchObject({ invoice: { status: "paid", duePaise: 0 }, effects: { kind: "renewal" } });
    expect(rest.receiptNumber).not.toBe(r.receiptNumber);
  });

  it("more than the amount due, a paid or void invoice, and another branch are refused", async () => {
    const inv = await priyaInvoice();
    expect((await err(collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: inv.totalPaise + 100, key: key() }))).message).toMatch(/more than the ₹[\d,]+ due/);
    await collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: inv.totalPaise, key: key() });
    expect((await err(collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: 100, key: key() }))).code).toBe("conflict");
    const bandra = (await db.invoices.where("branchId").equals("br_bandra").toArray()).find((i) => i.status === "paid")!;
    await db.invoices.update(bandra.id, { status: "open" });
    expect((await err(collectPayment(desk, { invoiceId: bandra.id, method: "cash", amountPaise: 100, key: key() }))).code).toBe("forbidden");
    await db.invoices.update(inv.id, { status: "void" });
    expect((await err(collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: 100, key: key() }))).code).toMatch(/conflict/);
  });

  it("finance can collect at any branch, and members and trainers can’t", async () => {
    const bandra = (await db.invoices.where("branchId").equals("br_bandra").toArray()).find((i) => i.status === "paid")!;
    await db.invoices.update(bandra.id, { status: "open" });
    await db.payments.where("invoiceId").equals(bandra.id).delete();
    const r = await collectPayment(finance, { invoiceId: bandra.id, method: "transfer", amountPaise: bandra.totalPaise, reference: "NEFT123", key: key() });
    expect(r.invoice.status).toBe("paid");
    expect((await err(collectPayment(as("u_member_priya"), { invoiceId: bandra.id, method: "cash", amountPaise: 100, key: key() }))).code).toBe("forbidden");
    expect((await err(collectPayment(as("u_trainer_meera"), { invoiceId: bandra.id, method: "cash", amountPaise: 100, key: key() }))).code).toBe("forbidden");
  });

  it("the first payment on a pay-later registration starts the membership, with its training credits", async () => {
    const reg = await registerMember(desk, { key: key(), branchId: "br_andheri", member: { name: "Tara Bose", phone: "9123456780", email: "tara@example.in" }, consents: { photos: false, assessments: false, marketing: false, dataProcessing: true }, planId: "pl_monthly_plus" });
    expect(reg.membership.status).toBe("pending");
    const r = await collectPayment(desk, { invoiceId: reg.invoice!.id, method: "card", amountPaise: reg.invoice!.totalPaise, reference: "4242", key: key() });
    expect(r.effects).toMatchObject({ kind: "membership", membership: { planName: "Monthly Plus", status: "active" } });
    expect(creditBalance(await db.creditLedger.where("memberId").equals(reg.memberId).toArray()).available).toBe(2);
  });

  it("a sessions invoice adds the training credits when paid", async () => {
    const before = creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available;
    const inv = { id: "inv_sessions_1", tenantId: "t_pulse", number: "PFAND/26-27/9001", memberId: "mem_arjun", branchId: "br_andheri", placeOfSupply: "27", issuedOn: "2026-11-17", dueOn: "2026-11-17", lines: [{ description: "4 training sessions", quantity: 1, unitPaise: 320_000, taxRateBp: 1800 }], discountPaise: 0, subtotalPaise: 320_000, taxPaise: 57_600, totalPaise: 377_600, status: "open" as const, purpose: { kind: "sessions" as const, sessions: 4 }, createdAt: "2026-11-17T06:30:00.000Z" };
    await db.invoices.add(inv);
    const r = await collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: inv.totalPaise, key: key() });
    expect(r.effects).toMatchObject({ kind: "sessions", sessionsAdded: 4 });
    expect(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available).toBe(before + 4);
  });

  it("the receipt is the same tax document the member gets, with the payment on it", async () => {
    const inv = await priyaInvoice();
    const r = await collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: inv.totalPaise, key: key() });
    const doc = await getDeskReceipt(desk, inv.id);
    expect(doc).toMatchObject({ title: "Tax invoice and receipt", invoice: { number: inv.number }, billTo: { name: "Priya Sharma" }, paidPaise: inv.totalPaise, duePaise: 0 });
    expect(doc.payments[0]).toMatchObject({ receiptNumber: r.receiptNumber, methodLabel: "Cash" });
    expect(doc.amountInWords).toMatch(/rupees/i);
    expect((await err(getDeskReceipt(as("u_member_priya"), inv.id))).code).toBe("forbidden");
    const bandra = (await db.invoices.where("branchId").equals("br_bandra").first())!;
    expect((await err(getDeskReceipt(desk, bandra.id))).code).toBe("not_found");
  });
});

describe("dues and reminders", () => {
  it("lists unpaid and part-paid invoices at the desk’s branches, most overdue first, with how long", async () => {
    const d = await getDues(desk);
    expect(d.rows.length).toBeGreaterThan(0);
    expect(d.rows.every((r) => r.branchId === "br_andheri" && r.duePaise > 0)).toBe(true);
    const days = d.rows.map((r) => r.daysOverdue);
    expect(days).toEqual([...days].sort((a, b) => b - a));
    const priya = d.rows.find((r) => r.memberId === "mem_priya")!;
    expect(priya.daysOverdue).toBeGreaterThan(0);
    expect(d.totalPaise).toBe(d.rows.reduce((a, r) => a + r.duePaise, 0));
    expect((await getDues(finance)).rows.length).toBeGreaterThanOrEqual(d.rows.length);
  });

  it("a part payment shows what is left and marks the invoice part paid", async () => {
    await allowPart();
    const inv = await priyaInvoice();
    await collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: 100_000, key: key() });
    const row = (await getDues(desk)).rows.find((r) => r.invoiceId === inv.id)!;
    expect(row).toMatchObject({ partPaid: true, duePaise: inv.totalPaise - 100_000 });
  });

  it("a reminder is emailed and logged, and another can’t go for three days", async () => {
    const inv = await priyaInvoice();
    const r = await sendReminder(desk, { invoiceId: inv.id });
    expect(r).toMatchObject({ skipped: false, sentTo: "priya.sharma@example.in" });
    const mail = (await db.emailLog.where("memberId").equals("mem_priya").toArray()).find((e) => e.template === "payment_reminder")!;
    expect(mail).toMatchObject({ invoiceId: inv.id, status: "sent" });
    expect(mail.subject).toMatch(/^Overdue: ₹[\d,]+ is due on invoice PFAND/);
    const again = await err(sendReminder(desk, { invoiceId: inv.id }));
    expect(again.code).toBe("conflict");
    expect(again.message).toMatch(/A reminder went on 17 Nov 2026. Another can go from 20 Nov 2026/);
    const row = (await getDues(desk)).rows.find((x) => x.invoiceId === inv.id)!;
    expect(row).toMatchObject({ reminders: 1, coolingUntil: "2026-11-20" });
    setNow(new Date("2026-11-20T06:30:00.000Z"));
    expect((await sendReminder(desk, { invoiceId: inv.id })).skipped).toBe(false);
  });

  it("a paid invoice needs no reminder; a member with no email is logged as skipped", async () => {
    const inv = await priyaInvoice();
    await db.members.update("mem_priya", { email: undefined });
    expect((await sendReminder(desk, { invoiceId: inv.id })).skipped).toBe(true);
    setNow(new Date("2026-11-21T06:30:00.000Z"));
    await collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: inv.totalPaise, key: key() });
    expect((await err(sendReminder(desk, { invoiceId: inv.id }))).code).toBe("conflict");
  });

  it("members can’t send reminders, and the desk can’t remind about another branch", async () => {
    const bandra = (await db.invoices.where("branchId").equals("br_bandra").toArray()).find((i) => i.status === "paid")!;
    await db.invoices.update(bandra.id, { status: "open" });
    await db.payments.where("invoiceId").equals(bandra.id).delete();
    expect((await err(sendReminder(desk, { invoiceId: bandra.id }))).code).toBe("not_found");
    expect((await err(sendReminder(as("u_member_arjun"), { invoiceId: bandra.id }))).code).toBe("forbidden");
    expect(amountDuePaise(bandra, [])).toBeGreaterThan(0);
  });
});

describe("adjusting training credits", () => {
  it("adds or removes credits with a reason, in the ledger and the audit log, never below zero", async () => {
    const mgr = as("u_owner");
    const before = creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available;
    const k = key();
    const a = await adjustCredits(mgr, { memberId: "mem_arjun", direction: "add", credits: 2, reason: "Goodwill after a missed session", key: k });
    expect(a.balance.available).toBe(before + 2);
    expect((await adjustCredits(mgr, { memberId: "mem_arjun", direction: "add", credits: 2, reason: "Goodwill after a missed session", key: k })).repeated).toBe(true);
    expect(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available).toBe(before + 2);
    expect((await err(adjustCredits(mgr, { memberId: "mem_arjun", direction: "remove", credits: 99, reason: "Too many", key: key() }))).message).toMatch(/at most/);
    expect((await err(adjustCredits(mgr, { memberId: "mem_arjun", direction: "add", credits: 1, reason: "", key: key() }))).code).toBe("invalid");
    expect((await db.auditEvents.where("action").equals("credits.adjust").toArray())[0]).toMatchObject({ actorId: "u_owner", memberId: "mem_arjun", reason: "Goodwill after a missed session", details: { direction: "add", credits: 2 } });
  });

  it("the front desk and finance can’t adjust credits", async () => {
    expect((await err(adjustCredits(desk, { memberId: "mem_arjun", direction: "add", credits: 1, reason: "Because", key: key() }))).code).toBe("forbidden");
    expect((await err(adjustCredits(finance, { memberId: "mem_arjun", direction: "add", credits: 1, reason: "Because", key: key() }))).code).toBe("forbidden");
  });
});
