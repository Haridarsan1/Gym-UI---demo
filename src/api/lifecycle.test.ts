import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { checkInMember } from "@/api/checkin";
import { cancelMembership, changePlan, freezeMembership, getPlanChoices, keepMembership, previewCancel, requestRefund, unfreezeMembership } from "@/api/lifecycle";
import { collectPayment } from "@/api/payments";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { amountDuePaise } from "@/domain/billing";
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
let n = 0;
const key = () => `lc-${++n}-${Math.random().toString(36).slice(2)}`;
/** The member’s main membership, as the seed made it. */
const current = async (memberId: string) => (await db.memberships.get(`ms_${memberId}`))!;

beforeEach(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("freeze and unfreeze", () => {
  it("freezes from today, pushes the end date back, pauses access, and writes an audit event", async () => {
    const before = (await current("mem_arjun")).endsOn!;
    const r = await freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-23", reason: "Travel", key: key() });
    expect(r).toMatchObject({ frozenDays: 7, repeated: false });
    const m = await current("mem_arjun");
    expect(m.status).toBe("frozen");
    expect(m.endsOn).toBe(new Date(Date.parse(`${before}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10));
    expect(await checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() })).toMatchObject({ result: "denied", reason: "frozen" });
    expect((await db.auditEvents.where("action").equals("membership.freeze").toArray()).at(-1)).toMatchObject({ actorId: "u_desk_andheri", memberId: "mem_arjun", reason: "Travel" });
  });

  it("the gym’s freeze limits apply, and the rules say what is wrong", async () => {
    expect((await err(freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-20", reason: "Travel", key: key() }))).message).toMatch(/at least 7 days/);
    expect((await err(freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to: "2026-12-30", reason: "Travel", key: key() }))).message).toMatch(/at most 30 days/);
    expect((await err(freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-30", reason: "", key: key() }))).code).toBe("invalid");
    await db.gymPolicies.update((await db.gymPolicies.toArray())[0]!.id, { freezeMinDays: 3 });
    expect((await freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-20", reason: "Short break", key: key() })).frozenDays).toBe(4);
    expect((await err(freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-25", reason: "Again", key: key() }))).message).toMatch(/already frozen/);
  });

  it("unfreezing early returns access today and gives the unused days back", async () => {
    const before = (await current("mem_arjun")).endsOn!;
    await freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-30", reason: "Travel", key: key() });
    setNow(new Date("2026-11-21T06:30:00.000Z"));
    const r = await unfreezeMembership(desk, { memberId: "mem_arjun" });
    expect(r.unusedDays).toBe(10);
    expect((await current("mem_arjun"))).toMatchObject({ status: "active", endsOn: new Date(Date.parse(`${before}T00:00:00Z`) + 4 * 86_400_000).toISOString().slice(0, 10) });
    expect((await checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() })).result).toMatch(/allowed/);
    expect((await err(unfreezeMembership(desk, { memberId: "mem_arjun" }))).code).toBe("conflict");
  });

  it("a freeze that has run its course lets the member in again without anyone touching it", async () => {
    await freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-23", reason: "Travel", key: key() });
    setNow(new Date("2026-11-25T06:30:00.000Z"));
    expect((await checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() })).result).toMatch(/allowed/);
  });

  it("the desk can’t freeze another branch’s member, and finance and members can’t freeze at all", async () => {
    const bandra = (await db.members.where("homeBranchId").equals("br_bandra").first())!;
    expect((await err(freezeMembership(desk, { memberId: bandra.id, from: "2026-11-17", to: "2026-11-30", reason: "Travel", key: key() }))).code).toBe("not_found");
    expect((await err(freezeMembership(as("u_finance"), { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-30", reason: "Travel", key: key() }))).code).toBe("forbidden");
    expect((await err(freezeMembership(as("u_member_arjun"), { memberId: "mem_arjun", from: "2026-11-17", to: "2026-11-30", reason: "Travel", key: key() }))).code).toBe("forbidden");
  });
});

describe("upgrade with a GST credit note", () => {
  it("lists what each plan would do: an upgrade with its credit, and a cheaper plan at the period end", async () => {
    const { choices } = await getPlanChoices(desk, "mem_arjun");
    const quarterly = choices.find((c) => c.planId === "pl_quarterly")!;
    expect(quarterly.change.kind).toBe("upgrade");
    expect(quarterly.change.credit!.totalPaise).toBeGreaterThan(0);
    expect(quarterly.change.duePaise).toBe(quarterly.change.totalPaise - quarterly.change.credit!.totalPaise);
    const monthly = choices.find((c) => c.planId === "pl_monthly")!;
    expect(monthly.change).toMatchObject({ kind: "at_period_end" });
    expect(monthly.change.credit).toBeUndefined();
    expect(choices.find((c) => c.planId === "pl_monthly_plus")!.change.kind).toBe("renewal");
  });

  it("makes the new membership, its invoice, and a credit note linked to the original invoice, applied as its own payment", async () => {
    const before = await current("mem_arjun");
    const r = await changePlan(desk, { memberId: "mem_arjun", planId: "pl_quarterly", key: key() });
    expect(r.kind).toBe("upgrade");
    expect(r.creditNote!.number).toMatch(/^CNAND\/26-27\/\d{4}$/);
    expect(r.invoice.number).toMatch(/^PFAND\/26-27\/\d{4}$/);
    const cn = (await db.creditNotes.toArray()).find((x) => x.id === r.creditNote!.id)!;
    const original = (await db.invoices.get(cn.invoiceId))!;
    expect(original.memberId).toBe("mem_arjun");
    expect(r.creditNote!.invoiceNumber).toBe(original.number);
    expect(cn.totalPaise).toBe(cn.subtotalPaise + cn.taxPaise);
    expect(cn.lines[0]!.description).toMatch(/Unused \d+ of 30 days of Monthly Plus/);
    const inv = (await db.invoices.get(r.invoice.id))!;
    expect(inv.totalPaise).toBe(767_000);
    const pays = await db.payments.where("invoiceId").equals(inv.id).toArray();
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ method: "credit_note", amountPaise: cn.totalPaise, reference: cn.number, reconciliation: { status: "matched" } });
    expect(r.invoice.duePaise).toBe(inv.totalPaise - cn.totalPaise);
    // Until it is paid, the old plan carries on and the new one waits.
    expect((await current("mem_arjun")).id).toBe(before.id);
    const up = (await db.memberships.where("memberId").equals("mem_arjun").toArray()).find((m) => m.upgradeOf === before.id)!;
    expect(up).toMatchObject({ status: "pending", startsOn: "2026-11-17", terms: { name: "Quarterly" } });
    expect((await db.auditEvents.where("action").equals("creditnote.issue").toArray()).at(-1)).toMatchObject({ memberId: "mem_arjun", details: { number: cn.number, invoice: original.number } });
  });

  it("paying the difference starts the new plan today and ends the old one the day before", async () => {
    const before = await current("mem_arjun");
    const r = await changePlan(desk, { memberId: "mem_arjun", planId: "pl_quarterly", key: key() });
    const paid = await collectPayment(desk, { invoiceId: r.invoice.id, method: "upi", amountPaise: r.invoice.duePaise, reference: "arjun@okbank", key: key() });
    expect(paid).toMatchObject({ invoice: { status: "paid", duePaise: 0 }, effects: { kind: "upgrade", membership: { planName: "Quarterly", status: "active", startsOn: "2026-11-17", endsOn: "2027-02-15" } } });
    const ms = await db.memberships.where("memberId").equals("mem_arjun").toArray();
    expect(ms.find((m) => m.id === before.id)).toMatchObject({ status: "expired", endsOn: "2026-11-16" });
    expect(ms.find((m) => m.upgradeOf === before.id)!.status).toBe("active");
    expect((await db.auditEvents.where("action").equals("membership.upgrade").toArray()).length).toBeGreaterThan(0);
    // The plan’s training credits come with it: Quarterly has none, so the balance is unchanged.
    expect(creditBalance(await db.creditLedger.where("memberId").equals("mem_arjun").toArray()).available).toBe(5);
  });

  it("the credit note numbers are their own series, consecutive", async () => {
    await changePlan(desk, { memberId: "mem_arjun", planId: "pl_quarterly", key: key() });
    await changePlan(desk, { memberId: "mem_sneha", planId: "pl_quarterly", key: key() }).catch(() => undefined);
    const nums = (await db.creditNotes.toArray()).map((c) => c.number);
    expect(nums[0]).toBe("CNAND/26-27/0001");
  });

  it("a cheaper plan is invoiced to start when this period ends, with no credit note and nothing refunded", async () => {
    const m = await current("mem_arjun");
    const r = await changePlan(desk, { memberId: "mem_arjun", planId: "pl_monthly", key: key() });
    expect(r).toMatchObject({ kind: "at_period_end", startsOn: new Date(Date.parse(`${m.endsOn}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), invoice: { totalPaise: 295_000, duePaise: 295_000, status: "open" } });
    expect(r.creditNote).toBeUndefined();
    expect(await db.creditNotes.count()).toBe(0);
    const paid = await collectPayment(desk, { invoiceId: r.invoice.id, method: "cash", amountPaise: 295_000, key: key() });
    expect(paid.effects).toMatchObject({ kind: "renewal", membership: { planName: "Monthly", status: "scheduled" } });
    expect((await current("mem_arjun")).status).toBe("active");
  });

  it("the same key makes one invoice and one credit note", async () => {
    const k = key();
    const a = await changePlan(desk, { memberId: "mem_arjun", planId: "pl_quarterly", key: k });
    const b = await changePlan(desk, { memberId: "mem_arjun", planId: "pl_quarterly", key: k });
    expect(b).toMatchObject({ repeated: true, invoice: { id: a.invoice.id }, creditNote: { id: a.creditNote!.id } });
    expect(await db.creditNotes.count()).toBe(1);
  });

  it("while a renewal or upgrade is open, another change is refused and says which invoice", async () => {
    const a = await changePlan(desk, { memberId: "mem_arjun", planId: "pl_quarterly", key: key() });
    const e = await err(changePlan(desk, { memberId: "mem_arjun", planId: "pl_half", key: key() }));
    expect(e.code).toBe("conflict");
    expect(e.message).toContain(a.invoice.number);
    expect((await getPlanChoices(desk, "mem_arjun")).blocked).toContain(a.invoice.number);
  });

  it("a plan that isn’t on sale at the member’s branch is refused", async () => {
    expect((await err(changePlan(desk, { memberId: "mem_arjun", planId: "pl_nope", key: key() }))).code).toBe("invalid");
    expect((await err(changePlan(desk, { memberId: "mem_arjun", planId: "pl_trial", key: key() }))).code).toBe("invalid");
  });
});

describe("cancelling", () => {
  it("shows what the member may be eligible for under policy, and refunds nothing", async () => {
    const p = await previewCancel(desk, { memberId: "mem_arjun", effectiveOn: "2026-11-17" });
    expect(p.amountPaise).toBeGreaterThan(0);
    expect(p.explanation).toMatch(/days unused, less the cancellation fee/);
    expect(p.invoiceNumber).toMatch(/^PFAND\//);
    const r = await cancelMembership(desk, { memberId: "mem_arjun", effectiveOn: "2026-11-17", reason: "Moving city" });
    expect(r).toMatchObject({ takesEffectNow: true, eligible: { amountPaise: p.amountPaise } });
    // The seed has a few refunds and requests of its own; cancelling adds none.
    expect(await db.refunds.count()).toBe(1);
    expect(await db.refundRequests.count()).toBe(3);
    expect((await current("mem_arjun"))).toMatchObject({ status: "canceled", canceledEffectiveOn: "2026-11-17", cancelReason: "Moving city" });
    expect((await db.auditEvents.where("action").equals("membership.cancel").toArray()).at(-1)).toMatchObject({ reason: "Moving city", details: { eligiblePaise: p.amountPaise } });
  });

  it("a later effective date keeps access until that date, and can be taken back before it", async () => {
    await cancelMembership(desk, { memberId: "mem_arjun", effectiveOn: "2026-11-25", reason: "Moving city" });
    expect((await checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() })).result).toMatch(/allowed/);
    expect((await current("mem_arjun")).status).toBe("active");
    setNow(new Date("2026-11-25T06:30:00.000Z"));
    expect((await checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() })).reason).toBe("canceled");
    setNow(new Date("2026-11-20T06:30:00.000Z"));
    await keepMembership(desk, { memberId: "mem_arjun" });
    expect((await current("mem_arjun")).canceledEffectiveOn).toBeUndefined();
    setNow(new Date("2026-11-26T06:30:00.000Z"));
    expect((await checkInMember(desk, { memberId: "mem_arjun", branchId: "br_andheri", method: "desk", key: key() })).result).toMatch(/allowed/);
  });

  it("needs a reason and a sensible date, and a canceled membership can’t be canceled again", async () => {
    expect((await err(cancelMembership(desk, { memberId: "mem_arjun", effectiveOn: "2026-11-17", reason: "" }))).message).toMatch(/Say why/);
    expect((await err(cancelMembership(desk, { memberId: "mem_arjun", effectiveOn: "2026-11-10", reason: "Moving" }))).message).toMatch(/past/);
    expect((await err(cancelMembership(desk, { memberId: "mem_arjun", effectiveOn: "2030-01-01", reason: "Moving" }))).message).toMatch(/after the membership ends/);
    await cancelMembership(desk, { memberId: "mem_arjun", effectiveOn: "2026-11-17", reason: "Moving" });
    expect((await err(cancelMembership(desk, { memberId: "mem_arjun", effectiveOn: "2026-11-17", reason: "Moving" }))).message).toMatch(/already canceled/);
  });
});

describe("asking finance for a refund", () => {
  async function paidInvoice() {
    const inv = (await db.invoices.where("memberId").equals("mem_arjun").toArray()).find((i) => i.status === "paid")!;
    const paid = (await db.payments.where("invoiceId").equals(inv.id).toArray()).filter((p) => p.status === "succeeded").reduce((a, p) => a + p.amountPaise, 0);
    return { inv, paid };
  }

  it("the desk asks, with the amount, reason, member and invoice, and the request waits for finance", async () => {
    const { inv } = await paidInvoice();
    const r = await requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: 100_000, reason: "Cancelled, within policy", source: "cancellation", key: key() });
    expect(r.repeated).toBe(false);
    expect((await db.refundRequests.get(r.requestId))).toMatchObject({ status: "pending", requestedBy: "u_desk_andheri", amountPaise: 100_000, invoiceId: inv.id, memberId: "mem_arjun", source: "cancellation" });
    expect(await db.refunds.count()).toBe(1);
    expect((await db.auditEvents.where("action").equals("refund.request").toArray()).at(-1)).toMatchObject({ actorId: "u_desk_andheri", reason: "Cancelled, within policy" });
  });

  it("the same key makes one request, and more than was paid, or than is left, is refused", async () => {
    const { inv, paid } = await paidInvoice();
    const k = key();
    await requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: 100_000, reason: "Cancelled", source: "manual", key: k });
    expect((await requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: 100_000, reason: "Cancelled", source: "manual", key: k })).repeated).toBe(true);
    expect((await db.refundRequests.where("memberId").equals("mem_arjun").toArray())).toHaveLength(1);
    const e = await err(requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: paid, reason: "Too much", source: "manual", key: key() }));
    expect(e.code).toBe("invalid");
    expect(e.message).toMatch(/At most/);
    expect((await err(requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: 0, reason: "Zero", source: "manual", key: key() }))).code).toBe("invalid");
    expect((await err(requestRefund(desk, { memberId: "mem_arjun", invoiceId: inv.id, amountPaise: 1000, reason: "", source: "manual", key: key() }))).code).toBe("invalid");
  });

  it("another member’s invoice is not found, and members and trainers can’t ask", async () => {
    const other = (await db.invoices.where("memberId").equals("mem_priya").first())!;
    expect((await err(requestRefund(desk, { memberId: "mem_arjun", invoiceId: other.id, amountPaise: 1000, reason: "Wrong", source: "manual", key: key() }))).code).toBe("not_found");
    expect((await err(requestRefund(as("u_member_arjun"), { memberId: "mem_arjun", invoiceId: other.id, amountPaise: 1000, reason: "Wrong", source: "manual", key: key() }))).code).toBe("forbidden");
    expect(amountDuePaise(other, [])).toBeGreaterThan(0);
  });
});
