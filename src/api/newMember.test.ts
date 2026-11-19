import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { checkInMember } from "@/api/checkin";
import { checkDuplicates, getWizardOptions, registerMember, type RegisterInput } from "@/api/newMember";
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
let n = 0;
const key = () => `reg-${++n}-${Math.random().toString(36).slice(2)}`;
const base = (over: Partial<RegisterInput> = {}): RegisterInput => ({
  key: key(), branchId: "br_andheri",
  member: { name: "Kabir Anand", phone: "98765 43210", email: "kabir@example.in", dateOfBirth: "1994-05-12", gender: "male", leadSource: "Walk-in" },
  consents: { photos: true, assessments: true, marketing: false, dataProcessing: true }, planId: "pl_monthly", ...over,
});
const full = { method: "cash" as const, amountPaise: 295_000 };

beforeEach(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("the wizard’s choices", () => {
  it("lists the plans on sale at the branch with their totals, the branch’s trainers, and the person’s own discount limit", async () => {
    const o = await getWizardOptions(desk, "br_andheri");
    expect(o).toMatchObject({ branchName: "Andheri", partialPaymentsEnabled: false, maxDiscountBp: 500 });
    expect(o.plans.map((p) => p.id)).toContain("pl_monthly");
    expect(o.plans.find((p) => p.id === "pl_monthly")).toMatchObject({ pricePaise: 250_000, taxPaise: 45_000, totalPaise: 295_000 });
    expect(o.plans.some((p) => p.id === "pl_visit20")).toBe(true);
    expect(o.trainers.map((t) => t.name)).toEqual(expect.arrayContaining(["Meera Joshi", "Aditya Rao"]));
    expect((await getWizardOptions(as("u_bm_bandra"), "br_bandra")).plans.some((p) => p.id === "pl_visit20")).toBe(false);
  });

  it("is for desk, managers and owners, within their own branches", async () => {
    expect((await err(getWizardOptions(as("u_finance"), "br_andheri"))).code).toBe("forbidden");
    expect((await err(getWizardOptions(desk, "br_bandra"))).code).toBe("forbidden");
    expect((await err(getWizardOptions(as("u_member_arjun"), "br_andheri"))).code).toBe("forbidden");
  });
});

describe("the duplicate check", () => {
  it("a phone number or an email that belongs to a member is flagged, however it is typed, and does not stop registration", async () => {
    const byPhone = await checkDuplicates(desk, { name: "Someone Else", phone: "+91 98200 22002" });
    expect(byPhone.sharing[0]).toMatchObject({ memberId: "mem_arjun", match: "phone", branchName: "Andheri" });
    const byEmail = await checkDuplicates(desk, { name: "Someone Else", phone: "9999999999", email: "ARJUN.KUMAR@example.in" });
    expect(byEmail.sharing[0]).toMatchObject({ memberId: "mem_arjun", match: "email" });
  });

  it("a family that already shares a number lists every member on it", async () => {
    const r = await checkDuplicates(desk, { name: "Third Child", phone: "98200 22090" });
    expect(r.sharing.map((m) => m.name).sort()).toEqual(["Aarav Ramaswamy", "Meena Ramaswamy"]);
  });

  it("the same name is a warning, and looks across every branch", async () => {
    const w = await checkDuplicates(desk, { name: "  rahul   mehta ", phone: "9999999999" });
    expect(w.sharing).toEqual([]);
    expect(w.warnings[0]).toMatchObject({ memberId: "mem_rahul", match: "name", branchName: "Bandra" });
    expect(w.warnings[0]!.status).toBeTruthy();
    expect((await checkDuplicates(desk, { name: "Rahul Mehta", phone: "9999999999", dateOfBirth: "1900-01-01" })).warnings.length).toBeLessThanOrEqual(1);
  });

  it("a new person has none", async () => {
    expect(await checkDuplicates(desk, { name: "Kabir Anand", phone: "98765 43210", email: "kabir@example.in" })).toEqual({ sharing: [], warnings: [] });
  });
});

describe("registering a member", () => {
  it("makes the member, the consents, the membership with its terms, the invoice, the payment and the pass in one go", async () => {
    const r = await registerMember(desk, base({ trainer: { trainerId: "u_trainer_meera", effectiveOn: "2026-11-17" }, payment: { ...full, reference: "" } }));
    expect(r).toMatchObject({ name: "Kabir Anand", firstName: "Kabir", repeated: false, trainer: { name: "Meera Joshi", effectiveOn: "2026-11-17" }, emailedTo: "kabir@example.in" });
    expect(r.membership).toMatchObject({ planName: "Monthly", status: "active", startsOn: "2026-11-17", endsOn: "2026-12-17" });
    expect(r.invoice).toMatchObject({ totalPaise: 295_000, duePaise: 0, status: "paid" });
    expect(r.invoice!.number).toMatch(/^PFAND\/26-27\/\d{4}$/);
    expect(r.payment).toMatchObject({ amountPaise: 295_000, method: "cash" });
    expect(r.payment!.receiptNumber).toMatch(/^RCP-2026-\d{4}$/);
    const m = (await db.members.get(r.memberId))!;
    expect(m).toMatchObject({ homeBranchId: "br_andheri", joinedOn: "2026-11-17", leadSource: "Walk-in", phone: "9876543210" });
    expect(m.qrToken).toMatch(/^qr-mem_w_/);
    const consents = (await db.consents.where("memberId").equals(r.memberId).toArray()).map((c) => c.scope).sort();
    expect(consents).toEqual(["assessments", "data_processing", "photos"]);
    expect((await db.consents.where("memberId").equals(r.memberId).first())).toMatchObject({ noticeVersion: "2026-01", recordedBy: "u_desk_andheri" });
    expect((await db.trainerAssignments.where("memberId").equals(r.memberId).toArray())[0]).toMatchObject({ trainerId: "u_trainer_meera", assignedBy: "u_desk_andheri" });
    expect((await db.payments.where("memberId").equals(r.memberId).first())).toMatchObject({ receivedBy: "u_desk_andheri", status: "succeeded", reconciliation: { status: "unmatched" } });
    expect((await db.auditEvents.where("action").equals("membership.create").toArray()).at(-1)).toMatchObject({ actorId: "u_desk_andheri", memberId: r.memberId, details: { plan: "Monthly", paidPaise: 295_000 } });
  });

  it("copies the plan’s terms into the membership, so a later price change never touches it", async () => {
    const r = await registerMember(desk, base({ payment: full }));
    await db.membershipPlans.update("pl_monthly", { pricePaise: 999_900 });
    const ms = (await db.memberships.where("memberId").equals(r.memberId).first())!;
    expect(ms.terms).toMatchObject({ name: "Monthly", pricePaise: 250_000, taxRateBp: 1800, durationDays: 30 });
    expect((await db.invoices.where("memberId").equals(r.memberId).first())!.totalPaise).toBe(295_000);
  });

  it("the pass works at the door straight away", async () => {
    const r = await registerMember(desk, base({ payment: full }));
    const c = await checkInMember(desk, { token: r.qrToken, branchId: "br_andheri", method: "qr", key: key() });
    expect(c).toMatchObject({ memberId: r.memberId, result: "allowed" });
  });

  it("pay later leaves the membership pending and the invoice open, and the pass says so", async () => {
    const r = await registerMember(desk, base());
    expect(r.membership.status).toBe("pending");
    expect(r.invoice).toMatchObject({ status: "open", duePaise: 295_000 });
    expect(r.payment).toBeUndefined();
    const c = await checkInMember(desk, { token: r.qrToken, branchId: "br_andheri", method: "qr", key: key() });
    expect(c).toMatchObject({ result: "denied", reason: "pending" });
  });

  it("a future start date is scheduled once paid", async () => {
    const r = await registerMember(desk, base({ startsOn: "2026-11-24", payment: full }));
    expect(r.membership).toMatchObject({ status: "scheduled", startsOn: "2026-11-24", endsOn: "2026-12-24" });
  });

  it("a plan with training credits adds them when it is paid, and a visit pass starts with its visits", async () => {
    const plus = await registerMember(desk, base({ planId: "pl_monthly_plus", payment: { method: "upi", amountPaise: 413_000, reference: "kabir@okbank" } }));
    expect(creditBalance(await db.creditLedger.where("memberId").equals(plus.memberId).toArray()).available).toBe(2);
    const visits = await registerMember(desk, base({ member: { name: "Tara Bose", phone: "9123456780" }, planId: "pl_visit10", payment: { method: "card", amountPaise: 354_000 } }));
    expect(visits.membership).toMatchObject({ planName: "10-visit pass", visits: 10 });
  });

  it("a free trial needs no invoice and starts at once", async () => {
    const r = await registerMember(desk, base({ planId: "pl_trial" }));
    expect(r.membership.status).toBe("active");
    expect(r.invoice).toBeUndefined();
    expect(await db.invoices.where("memberId").equals(r.memberId).count()).toBe(0);
  });

  it("without an email the pass is not emailed, so the desk prints it", async () => {
    const r = await registerMember(desk, base({ member: { name: "Kabir Anand", phone: "98765 43210", email: "" }, payment: full }));
    expect(r.emailedTo).toBeUndefined();
    expect((await db.emailLog.where("memberId").equals(r.memberId).toArray()).every((e) => e.status === "skipped")).toBe(true);
  });

  it("sends the welcome with the pass code, and the receipt, to the email log", async () => {
    const r = await registerMember(desk, base({ payment: full }));
    const mail = await db.emailLog.where("memberId").equals(r.memberId).toArray();
    expect(mail.map((e) => e.template).sort()).toEqual(["member_welcome", "payment_receipt"]);
    expect(mail.find((e) => e.template === "member_welcome")!.body).toContain(r.passCode);
  });
});

describe("one key makes one member", () => {
  it("sending the same request again returns the same member and writes nothing more", async () => {
    const input = base({ payment: full });
    const a = await registerMember(desk, input);
    const b = await registerMember(desk, input);
    expect(b).toMatchObject({ memberId: a.memberId, repeated: true });
    expect(await db.members.where("phone").equals("9876543210").count()).toBe(1);
    expect(await db.payments.where("memberId").equals(a.memberId).count()).toBe(1);
    expect(await db.invoices.where("memberId").equals(a.memberId).count()).toBe(1);
  });

  it("two at once make one", async () => {
    const input = base({ payment: full });
    const [a, b] = await Promise.all([registerMember(desk, input), registerMember(desk, input)]);
    expect(a.memberId).toBe(b.memberId);
    expect(await db.members.where("phone").equals("9876543210").count()).toBe(1);
    expect(await db.invoices.where("memberId").equals(a.memberId).count()).toBe(1);
  });

  it("the same phone with a new key needs the desk to say it is a different person sharing it", async () => {
    const first = await registerMember(desk, base({ payment: full }));
    const e = await err(registerMember(desk, base({ member: { name: "Kabir’s Son", phone: "98765 43210" }, payment: full })));
    expect(e).toMatchObject({ code: "conflict" });
    expect(e.message).toMatch(/Kabir Anand already has this phone number/);
    expect(e.message).toMatch(/different person sharing it/);
    expect(await db.members.where("phone").equals("9876543210").count()).toBe(1);
    const child = await registerMember(desk, base({ member: { name: "Kabir’s Son", phone: "98765 43210", dateOfBirth: "2011-02-02" }, sharesContactWith: [first.memberId], payment: full }));
    expect((await db.members.get(child.memberId))).toMatchObject({ name: "Kabir’s Son", phone: "9876543210", sharesContactWith: [first.memberId] });
    expect(await db.members.where("phone").equals("9876543210").count()).toBe(2);
    expect((await db.auditEvents.where("action").equals("membership.create").toArray()).at(-1)!.details).toMatchObject({ sharesContactWith: [first.memberId] });
    // Each has their own membership, invoice and pass.
    expect((await db.members.get(child.memberId))!.qrToken).not.toBe((await db.members.get(first.memberId))!.qrToken);
  });

  it("choosing “different person” for someone who doesn’t have the number is not enough, and an answer must cover everyone who has it", async () => {
    const e = await err(registerMember(desk, base({ member: { name: "Visitor Rao", phone: "98200 22090" }, sharesContactWith: ["mem_040"] })));
    expect(e.code).toBe("conflict");
    expect(e.message).toMatch(/Aarav Ramaswamy already has this phone number/);
    const ok = await registerMember(desk, base({ member: { name: "Visitor Rao", phone: "98200 22090" }, sharesContactWith: ["mem_040", "mem_041"] }));
    expect((await db.members.get(ok.memberId))!.sharesContactWith).toEqual(["mem_040", "mem_041"]);
  });

  it("a shared email is flagged the same way", async () => {
    const e = await err(registerMember(desk, base({ member: { name: "Visitor Rao", phone: "9111111111", email: "ARJUN.KUMAR@example.in" } })));
    expect(e.message).toMatch(/Arjun Kumar already has this email address/);
    const ok = await registerMember(desk, base({ member: { name: "Visitor Rao", phone: "9111111111", email: "arjun.kumar@example.in" }, sharesContactWith: ["mem_arjun"] }));
    expect((await db.members.get(ok.memberId))!.sharesContactWith).toEqual(["mem_arjun"]);
  });
});

describe("what is refused before anything is written", () => {
  const nothingWritten = async (before: number) => expect(await db.members.count()).toBe(before);
  const count = () => db.members.count();

  it("a name-only duplicate needs the desk to say it is a different person", async () => {
    const before = await count();
    const dup = base({ member: { name: "Rahul Mehta", phone: "9000000001" } });
    expect((await err(registerMember(desk, dup))).message).toMatch(/Check it is a different person/);
    await nothingWritten(before);
    expect((await registerMember(desk, { ...dup, key: key(), notADuplicate: true })).name).toBe("Rahul Mehta");
  });

  it("the data-processing consent is required", async () => {
    const before = await count();
    const e = await err(registerMember(desk, base({ consents: { photos: true, assessments: true, marketing: true, dataProcessing: false as never } })));
    expect(e.code).toBe("invalid");
    expect(e.message).toMatch(/required/);
    await nothingWritten(before);
  });

  it("a bad phone, a missing name or a plan not on sale here says what to fix", async () => {
    const before = await count();
    expect((await err(registerMember(desk, base({ member: { name: "Kabir", phone: "12345" } })))).message).toMatch(/10-digit mobile number/);
    expect((await err(registerMember(desk, base({ member: { name: "", phone: "9876543210" } })))).message).toMatch(/name/);
    expect((await err(registerMember(as("u_bm_bandra"), base({ branchId: "br_bandra", planId: "pl_visit20" })))).message).toMatch(/isn’t on sale at this branch/);
    expect((await err(registerMember(desk, base({ planId: "pl_nope" })))).code).toBe("invalid");
    await nothingWritten(before);
  });

  it("a discount over the person’s limit, a payment bigger than the bill, and a part payment when not allowed are refused", async () => {
    const before = await count();
    expect((await err(registerMember(desk, base({ discountPaise: 100_000, payment: full })))).code).toBe("forbidden");
    expect((await err(registerMember(desk, base({ payment: { method: "cash", amountPaise: 400_000 } })))).message).toMatch(/more than the ₹2,950 due/);
    expect((await err(registerMember(desk, base({ payment: { method: "cash", amountPaise: 100_000 } })))).message).toMatch(/full ₹2,950 at once/);
    await nothingWritten(before);
  });

  it("a part payment works when the gym allows it, and the membership waits for the rest", async () => {
    await db.gymPolicies.update((await db.gymPolicies.toArray())[0]!.id, { partialPaymentsEnabled: true });
    const r = await registerMember(desk, base({ payment: { method: "cash", amountPaise: 100_000 } }));
    expect(r.invoice).toMatchObject({ status: "partially_paid", duePaise: 195_000 });
    expect(r.membership.status).toBe("pending");
  });

  it("a discount within the person’s limit is taken off the price before tax", async () => {
    const r = await registerMember(desk, base({ discountPaise: 12_500, payment: { method: "cash", amountPaise: 280_250 } }));
    expect(r.invoice).toMatchObject({ totalPaise: 280_250, status: "paid" });
    expect((await db.invoices.where("memberId").equals(r.memberId).first())).toMatchObject({ discountPaise: 12_500, subtotalPaise: 250_000, taxPaise: 42_750 });
  });

  it("a trainer from another branch, a start date in the past, and a branch the desk doesn’t work in are refused", async () => {
    const before = await count();
    expect((await err(registerMember(desk, base({ trainer: { trainerId: "u_trainer_farah", effectiveOn: "2026-11-17" } })))).message).toMatch(/works at this branch/);
    expect((await err(registerMember(desk, base({ startsOn: "2026-11-10" })))).message).toMatch(/past/);
    expect((await err(registerMember(desk, base({ branchId: "br_bandra" })))).code).toBe("forbidden");
    expect((await err(registerMember(as("u_finance"), base()))).code).toBe("forbidden");
    await nothingWritten(before);
  });
});
