import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { cancelMembership, requestRefund } from "@/api/lifecycle";
import { collectPayment } from "@/api/payments";
import { decideRefund, getRefunds, issueRefund } from "@/api/refunds";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { creditBalance } from "@/domain/credits";

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
const owner = as("u_owner");
let n = 0;
const key = () => `rf-${++n}-${Math.random().toString(36).slice(2)}`;

beforeEach(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

const paidInvoice = async (memberId = "mem_arjun") => {
  const inv = (await db.invoices.where("memberId").equals(memberId).toArray()).find((i) => i.status === "paid" && !i.purpose)!;
  return inv;
};
const ask = async (amountPaise: number, memberId = "mem_arjun", reason = "Moved away") => {
  const inv = await paidInvoice(memberId);
  return requestRefund(desk, { memberId, invoiceId: inv.id, amountPaise, reason, source: "manual", key: key() });
};

describe("the finance queue", () => {
  it("lists what is waiting, with what approving would do, and what was decided, for finance and the owner only", async () => {
    const q = await getRefunds(finance);
    expect(q.limitPaise).toBe(2_500_000);
    expect(q.pending.map((r) => r.id)).toContain("rq_seed_pending");
    const p = q.pending.find((r) => r.id === "rq_seed_pending")!;
    expect(p).toMatchObject({ status: "pending", source: "manual" });
    expect(p.preview!.method).toBeTruthy();
    expect(p.preview!.refundablePaise).toBeGreaterThanOrEqual(p.amountPaise);
    expect(q.decided.map((r) => r.status).sort()).toEqual(["approved", "rejected"]);
    expect(q.decided.find((r) => r.status === "rejected")!.decisionNote).toMatch(/Outside the policy/);
    expect((await getRefunds(owner)).limitPaise).toBeNull();
    expect((await err(getRefunds(desk))).code).toBe("forbidden");
    expect((await err(getRefunds(as("u_member_arjun")))).code).toBe("forbidden");
  });

  it("a branch manager sees only their branch’s requests", async () => {
    const q = await getRefunds(as("u_bm_bandra"));
    expect(q.pending.every((r) => r.branchName === "Bandra")).toBe(true);
  });
});

describe("approving a refund", () => {
  it("pays it back against a real payment, audits both steps, emails the member, and doesn’t go over what the payment holds", async () => {
    const inv = await paidInvoice();
    const r = await ask(100_000);
    const before = (await getRefunds(finance)).pending.find((x) => x.id === r.requestId)!;
    expect(before.preview).toMatchObject({ refundablePaise: expect.any(Number), creditsReversed: 0 });
    const d = await decideRefund(finance, { requestId: r.requestId, decision: "approve", key: key() });
    expect(d).toMatchObject({ status: "approved", amountPaise: 100_000, repeated: false });
    const rf = (await db.refunds.get(d.refundId!))!;
    expect(rf).toMatchObject({ amountPaise: 100_000, status: "completed", approvedBy: "u_finance", requestedBy: "u_desk_andheri", invoiceId: inv.id });
    expect((await db.payments.get(rf.paymentId))!.invoiceId).toBe(inv.id);
    expect((await db.refundRequests.get(r.requestId))).toMatchObject({ status: "approved", decidedBy: "u_finance", refundId: d.refundId });
    const acts = (await db.auditEvents.toArray()).filter((e) => e.memberId === "mem_arjun").map((e) => e.action);
    expect(acts).toEqual(expect.arrayContaining(["refund.request", "refund.approve", "refund.create"]));
    expect((await db.emailLog.where("memberId").equals("mem_arjun").toArray()).some((e) => e.template === "refund_issued")).toBe(true);
    // Asking for more than is left is refused at the desk.
    const left = (await db.payments.where("invoiceId").equals(inv.id).toArray()).reduce((a, p) => a + p.amountPaise, 0) - 100_000;
    expect((await err(requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: left + 1, reason: "Too much", source: "manual", key: key() }))).message).toMatch(/At most/);
  });

  it("the same decision sent twice makes one refund; a decided request can’t be decided the other way", async () => {
    const r = await ask(50_000);
    const a = await decideRefund(finance, { requestId: r.requestId, decision: "approve", key: key() });
    const b = await decideRefund(finance, { requestId: r.requestId, decision: "approve", key: key() });
    expect(b).toMatchObject({ repeated: true, refundId: a.refundId });
    const inv = await paidInvoice();
    expect((await db.refunds.toArray()).filter((x) => x.invoiceId === inv.id && x.amountPaise === 50_000)).toHaveLength(1);
    expect((await err(decideRefund(finance, { requestId: r.requestId, decision: "reject", note: "Changed my mind", key: key() }))).code).toBe("conflict");
  });

  it("is limited by the person’s own refund limit: finance can’t approve above it, the owner can", async () => {
    const inv = await paidInvoice();
    await db.payments.where("invoiceId").equals(inv.id).modify((p) => { p.amountPaise = 4_000_000; });
    await db.invoices.update(inv.id, { totalPaise: 4_000_000 });
    const r = await ask(3_000_000);
    const q = (await getRefunds(finance)).pending.find((x) => x.id === r.requestId)!;
    expect(q.preview!.blocked).toMatch(/Above your refund limit of ₹25,000. Ask the owner./);
    const e = await err(decideRefund(finance, { requestId: r.requestId, decision: "approve", key: key() }));
    expect(e.code).toBe("forbidden");
    expect(e.message).toMatch(/refund limit/);
    expect(await db.refunds.count()).toBe(1);
    expect((await decideRefund(owner, { requestId: r.requestId, decision: "approve", key: key() })).status).toBe("approved");
  });

  it("a rejection needs a note, which the desk sees, and moves no money", async () => {
    const r = await ask(70_000);
    expect((await err(decideRefund(finance, { requestId: r.requestId, decision: "reject", key: key() }))).code).toBe("invalid");
    const d = await decideRefund(finance, { requestId: r.requestId, decision: "reject", note: "Plan was used for a month", key: key() });
    expect(d.status).toBe("rejected");
    expect(await db.refunds.count()).toBe(1);
    expect((await db.refundRequests.get(r.requestId))).toMatchObject({ status: "rejected", decisionNote: "Plan was used for a month", decidedBy: "u_finance" });
    expect((await db.auditEvents.where("action").equals("refund.reject").toArray())[0]).toMatchObject({ actorId: "u_finance", reason: "Plan was used for a month" });
  });

  it("the desk and members can’t decide; another branch’s manager can’t see the request", async () => {
    const r = await ask(10_000);
    expect((await err(decideRefund(desk, { requestId: r.requestId, decision: "approve", key: key() }))).code).toBe("forbidden");
    expect((await err(decideRefund(as("u_member_arjun"), { requestId: r.requestId, decision: "approve", key: key() }))).code).toBe("forbidden");
    expect((await err(decideRefund(as("u_bm_bandra"), { requestId: r.requestId, decision: "approve", key: key() }))).code).toBe("not_found");
  });
});

describe("refunds and training credits (M06)", () => {
  async function sessionsPack() {
    const inv = { id: "inv_pack", tenantId: "t_pulse", number: "PFAND/26-27/9100", memberId: "mem_arjun", branchId: "br_andheri", placeOfSupply: "27", issuedOn: "2026-11-17", dueOn: "2026-11-17", lines: [{ description: "4 training sessions", quantity: 1, unitPaise: 320_000, taxRateBp: 1800 }], discountPaise: 0, subtotalPaise: 320_000, taxPaise: 57_600, totalPaise: 377_600, status: "open" as const, purpose: { kind: "sessions" as const, sessions: 4 }, createdAt: "2026-11-17T06:30:00.000Z" };
    await db.invoices.add(inv);
    await collectPayment(desk, { invoiceId: inv.id, method: "cash", amountPaise: inv.totalPaise, key: key() });
    return inv;
  }

  it("refunding a sessions pack takes back the unused credits it bought, in proportion, as a ledger reversal", async () => {
    const inv = await sessionsPack();
    const before = creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray());
    expect(before.available).toBe(9);
    const r = await requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: 188_800, reason: "Half the pack back", source: "manual", key: key() });
    expect((await getRefunds(finance)).pending.find((x) => x.id === r.requestId)!.preview!.creditsReversed).toBe(2);
    const d = await decideRefund(finance, { requestId: r.requestId, decision: "approve", key: key() });
    expect(d.creditsReversed).toBe(2);
    const after = creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray());
    expect(after.available).toBe(7);
    const rev = (await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).find((e) => e.kind === "reversal")!;
    expect(rev).toMatchObject({ credits: 2, reason: expect.stringContaining("Refund of ₹1,888") });
    expect((await db.refunds.get(d.refundId!))!.creditsReversed).toBe(2);
  });

  it("credits already used are not taken back: only the unused ones, never below zero", async () => {
    const inv = await sessionsPack();
    await db.creditLedger.add({ id: "cr_use", tenantId: "t_pulse", memberId: "mem_arjun", kind: "adjustment", direction: "remove", credits: 8, reason: "Used", createdBy: "u_owner", createdAt: "2026-11-17T06:30:00.000Z", idempotencyKey: "use-8" });
    const r = await requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: inv.totalPaise, reason: "Full pack back", source: "manual", key: key() });
    const d = await decideRefund(finance, { requestId: r.requestId, decision: "approve", key: key() });
    expect(d.creditsReversed).toBe(1);
    expect(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available).toBe(0);
  });

  it("a cancellation’s refund request is approved like any other, with no automatic payment before it", async () => {
    const c = await cancelMembership(desk, { memberId: "mem_arjun", effectiveOn: "2026-11-17", reason: "Moving city" });
    expect(await db.refunds.count()).toBe(1);
    const r = await requestRefund(desk, { memberId: "mem_arjun", invoiceId: c.eligible.invoiceId!, amountPaise: c.eligible.amountPaise, reason: "Cancellation: Moving city", source: "cancellation", key: key() });
    expect(await db.refunds.count()).toBe(1);
    const d = await decideRefund(finance, { requestId: r.requestId, decision: "approve", key: key() });
    expect(d.amountPaise).toBe(c.eligible.amountPaise);
    expect(await db.refunds.count()).toBe(2);
  });
});

describe("refunding without a request", () => {
  it("finance can refund an invoice directly, with the same checks and the same record", async () => {
    const inv = await paidInvoice();
    const k = key();
    const d = await issueRefund(finance, { invoiceId: inv.id, amountPaise: 30_000, reason: "Overcharged at the desk", key: k });
    expect(d).toMatchObject({ status: "approved", amountPaise: 30_000 });
    expect((await issueRefund(finance, { invoiceId: inv.id, amountPaise: 30_000, reason: "Overcharged at the desk", key: k })).repeated).toBe(true);
    expect((await db.refunds.toArray()).filter((r) => r.reason === "Overcharged at the desk")).toHaveLength(1);
    expect((await err(issueRefund(finance, { invoiceId: inv.id, amountPaise: 99_999_999, reason: "Way too much", key: key() }))).message).toMatch(/At most/);
    expect((await err(issueRefund(desk, { invoiceId: inv.id, amountPaise: 100, reason: "Desk can’t", key: key() }))).code).toBe("forbidden");
  });
});
