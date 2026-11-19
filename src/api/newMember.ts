import { z } from "zod";
import { db } from "@/demo/db";
import { ApiError } from "@/api/errors";
import { assertInBranch, openDesk } from "@/api/desk";
import { allocateNumber } from "@/api/numbering";
import { NOTICE_VERSION } from "@/api/profileNotice";
import { nextReceiptNumber } from "@/api/receipts";
import { buildAuditEvent } from "@/domain/audit";
import { now } from "@/api/clock";
import { amountDuePaise, invoiceTotals, placeOfSupplyFor, type InvoiceTotals } from "@/domain/billing";
import { addDays } from "@/domain/dates";
import { Member as MemberSchema } from "@/domain/types/core";
import type { CreditLedgerEntry, EmailLogEntry, Invoice, Member, Membership, MembershipPlan, Payment, TrainerAssignment } from "@/domain/types";
import { formatDate, formatRupees } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Registering a new member at the desk (T01, M01, M03, O03): who they are (with a duplicate check), what they agree to, the plan they
 * buy (its terms copied into the membership, so later price changes never touch it), their trainer and from when, the invoice and the
 * first payment, and the QR pass. It is one transaction behind one key: a double tap or a retry makes one member, one membership, one
 * invoice and one payment. A phone number or an email that already belongs to a member is refused, because they are how members log in.
 */

const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export interface Duplicate {
  memberId: string;
  name: string;
  phone: string;
  branchName: string;
  /** Why it matched. “phone” and “email” stop registration; “name” is a warning. */
  match: "phone" | "email" | "name";
  status?: string;
}

export interface DuplicateCheck {
  /** Stops registration: the member already exists. */
  blocking: Duplicate[];
  /** The same name and date of birth, or the same name at the same branch: worth a look before continuing. */
  warnings: Duplicate[];
}

export interface DuplicateQuery {
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
}

/** Members already in the gym who match what was typed. Looks across every branch, because a person joins once. */
export async function checkDuplicates(session: Session | null, q: DuplicateQuery): Promise<DuplicateCheck> {
  const c = await openDesk(session, "member.create");
  const [members, branches, memberships] = await Promise.all([db.members.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.memberships.where("tenantId").equals(c.tenantId).toArray()]);
  const bn = new Map(branches.map((b) => [b.id, b.name]));
  const status = (id: string) => memberships.filter((m) => m.memberId === id).sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]?.status;
  const hit = (m: Member, match: Duplicate["match"]): Duplicate => ({ memberId: m.id, name: m.name, phone: m.phone, branchName: bn.get(m.homeBranchId) ?? "", match, status: status(m.id) });
  const phone = digits(q.phone);
  const email = q.email?.trim().toLowerCase();
  const name = norm(q.name);
  const blocking: Duplicate[] = [];
  const warnings: Duplicate[] = [];
  for (const m of members) {
    if (m.archivedAt) continue;
    if (phone.length === 10 && digits(m.phone) === phone) blocking.push(hit(m, "phone"));
    else if (email && m.email?.toLowerCase() === email) blocking.push(hit(m, "email"));
    else if (name.length >= 3 && norm(m.name) === name && (!q.dateOfBirth || !m.dateOfBirth || m.dateOfBirth === q.dateOfBirth)) warnings.push(hit(m, "name"));
  }
  return { blocking, warnings: warnings.slice(0, 5) };
}

export interface WizardOptions {
  branchId: string;
  branchName: string;
  noticeVersion: string;
  /** Plans on sale at this branch today. */
  plans: Array<{ id: string; name: string; kind: MembershipPlan["kind"]; pricePaise: number; taxRateBp: number; durationDays?: number; visits?: number; ptCredits?: number; classEntitlements?: number } & InvoiceTotals>;
  trainers: Array<{ id: string; name: string }>;
  partialPaymentsEnabled: boolean;
  /** The most discount this person may give, as a share of the price in basis points. */
  maxDiscountBp: number;
  today: string;
}

export async function getWizardOptions(session: Session | null, branchId: string): Promise<WizardOptions> {
  const c = await openDesk(session, "member.create");
  assertInBranch(c, "member.create", branchId);
  const [branch, plans, staff, users, policy] = await Promise.all([
    db.branches.get(branchId), db.membershipPlans.where("tenantId").equals(c.tenantId).toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray(),
    db.gymPolicies.where("tenantId").equals(c.tenantId).first(),
  ]);
  const onSale = plans.filter((p) => p.active && p.branchIds.includes(branchId) && p.effectiveFrom <= c.today && (p.effectiveTo === undefined || p.effectiveTo >= c.today));
  return {
    branchId, branchName: branch?.name ?? "", noticeVersion: NOTICE_VERSION, today: c.today,
    plans: onSale.sort((a, b) => a.pricePaise - b.pricePaise).map((p) => ({ id: p.id, name: p.name, kind: p.kind, pricePaise: p.pricePaise, taxRateBp: p.taxRateBp, durationDays: p.durationDays, visits: p.visits, ptCredits: p.ptCredits, classEntitlements: p.classEntitlements, ...invoiceTotals([{ quantity: 1, unitPaise: p.pricePaise, taxRateBp: p.taxRateBp }]) })),
    trainers: staff.filter((s) => s.role === "trainer" && s.branchIds.includes(branchId)).map((s) => ({ id: s.userId, name: users.find((u) => u.id === s.userId)?.name ?? "Trainer" })).sort((a, b) => a.name.localeCompare(b.name)),
    partialPaymentsEnabled: policy?.partialPaymentsEnabled ?? false,
    maxDiscountBp: c.principal.limits?.maxDiscountBp ?? 0,
  };
}

const Input = z.object({
  key: z.string().min(8),
  branchId: z.string().min(1),
  member: z.object({
    name: z.string().trim().min(2, "Enter the member’s name.").max(80),
    phone: z.string().transform((s) => digits(s)).pipe(MemberSchema.shape.phone),
    email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), MemberSchema.shape.email),
    dateOfBirth: z.preprocess((v) => (v === "" ? undefined : v), MemberSchema.shape.dateOfBirth),
    gender: MemberSchema.shape.gender,
    emergencyContact: z.object({ name: z.string().trim().min(1), phone: z.string().transform((s) => digits(s)).pipe(MemberSchema.shape.phone) }).optional(),
    leadSource: z.string().max(60).optional(),
  }),
  /** The member agreed to a name-only duplicate warning being a different person. */
  notADuplicate: z.boolean().optional(),
  consents: z.object({ photos: z.boolean(), assessments: z.boolean(), marketing: z.boolean(), dataProcessing: z.literal(true, { message: "Using their details is required to register a member." }) }),
  planId: z.string().min(1, "Choose a plan."),
  startsOn: z.string().optional(),
  discountPaise: z.number().int().nonnegative().optional(),
  trainer: z.object({ trainerId: z.string().min(1), effectiveOn: z.string() }).optional(),
  payment: z.object({ method: z.enum(["cash", "upi", "card", "transfer"]), amountPaise: z.number().int().positive(), reference: z.string().max(60).optional() }).optional(),
});
export type RegisterInput = z.input<typeof Input>;

export interface RegisterResult {
  memberId: string;
  name: string;
  firstName: string;
  qrToken: string;
  /** The short code printed under the QR, typed at the desk when the camera can’t read it. */
  passCode: string;
  membership: { planName: string; status: Membership["status"]; startsOn: string; endsOn?: string; visits: number | null };
  invoice?: { id: string; number: string; totalPaise: number; duePaise: number; status: Invoice["status"] };
  payment?: { id: string; receiptNumber?: string; amountPaise: number; method: Payment["method"] };
  trainer?: { name: string; effectiveOn: string };
  /** Where the pass and receipt were sent, or undefined when the member has no email and the pass must be printed. */
  emailedTo?: string;
  repeated: boolean;
}

const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
const hash = (s: string) => { let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); };
export const passCodeFor = (token: string) => token.replace(/^qr-/, "").replace(/^mem_/, "").toUpperCase().slice(0, 18);

/**
 * Registers the member, in one transaction. Everything that can be wrong is said before anything is written: a missing consent, a plan
 * that isn’t on sale at the branch, a discount over the person’s limit, a payment bigger than the bill, a trainer from another branch.
 */
export async function registerMember(session: Session | null, raw: RegisterInput): Promise<RegisterResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the details and try again.");
  const input = parsed.data;
  const c = await openDesk(session, "member.create");
  assertInBranch(c, "member.create", input.branchId);
  const memberId = `mem_w_${hash(input.key)}${input.key.length.toString(36)}`;
  return db.transaction("rw", db.tables, async () => {
    const existing = await db.members.get(memberId);
    if (existing) return summary(c.tenantId, existing, true);

    const dup = await checkDuplicates(session, { name: input.member.name, phone: input.member.phone, email: input.member.email, dateOfBirth: input.member.dateOfBirth });
    if (dup.blocking[0]) throw new ApiError("conflict", `${dup.blocking[0].name} already has this ${dup.blocking[0].match === "phone" ? "phone number" : "email address"}. Open their profile instead of registering them again.`, { duplicate: dup.blocking[0] });
    if (dup.warnings.length && !input.notADuplicate) throw new ApiError("conflict", `A member called ${dup.warnings[0]!.name} already exists. Check it is a different person, then continue.`, { warning: dup.warnings[0] });

    const [plan, branch, policy, staff] = await Promise.all([db.membershipPlans.get(input.planId), db.branches.get(input.branchId), db.gymPolicies.where("tenantId").equals(c.tenantId).first(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray()]);
    if (!plan || plan.tenantId !== c.tenantId || !plan.active || !plan.branchIds.includes(input.branchId) || plan.effectiveFrom > c.today || (plan.effectiveTo !== undefined && plan.effectiveTo < c.today)) throw new ApiError("invalid", "That plan isn’t on sale at this branch. Choose another.");
    if (!branch) throw new ApiError("not_found", "We couldn’t find that branch.");
    const startsOn = input.startsOn ?? c.today;
    if (startsOn < c.today) throw new ApiError("invalid", "A membership can’t start in the past.");
    if (startsOn > addDays(c.today, 60)) throw new ApiError("invalid", "A membership can start up to 60 days ahead.");
    const lines = [{ quantity: 1, unitPaise: plan.pricePaise, taxRateBp: plan.taxRateBp }];
    const discount = input.discountPaise ?? 0;
    const limit = c.principal.limits?.maxDiscountBp ?? 0;
    if (discount > Math.floor((plan.pricePaise * limit) / 10000)) throw new ApiError("forbidden", `You can give up to ${(limit / 100).toFixed(limit % 100 ? 1 : 0)}% off. Ask a manager for more.`);
    if (discount > plan.pricePaise) throw new ApiError("invalid", "The discount can’t be more than the price.");
    const totals = invoiceTotals(lines, discount);
    let trainerRow: TrainerAssignment | undefined;
    if (input.trainer) {
      const t = staff.find((s) => s.userId === input.trainer!.trainerId);
      if (!t || t.role !== "trainer" || !t.branchIds.includes(input.branchId)) throw new ApiError("invalid", "Choose a trainer who works at this branch.");
      if (input.trainer.effectiveOn < c.today) throw new ApiError("invalid", "A trainer can’t start in the past.");
      trainerRow = { id: `ta_${memberId}_1`, tenantId: c.tenantId, memberId, trainerId: t.userId, effectiveFrom: input.trainer.effectiveOn, assignedBy: c.principal.userId, reason: "Assigned when the member joined" };
    }
    if (input.payment) {
      if (totals.totalPaise === 0) throw new ApiError("invalid", "There is nothing to pay for this plan.");
      if (input.payment.amountPaise > totals.totalPaise) throw new ApiError("invalid", `The payment is more than the ${formatRupees(totals.totalPaise)} due. Enter ${formatRupees(totals.totalPaise)} or less.`);
      if (input.payment.amountPaise < totals.totalPaise && !(policy?.partialPaymentsEnabled ?? false)) throw new ApiError("invalid", `This gym takes the full ${formatRupees(totals.totalPaise)} at once. Enter the full amount, or choose to pay later.`);
    }

    // Everything is valid: write it.
    const member: Member = {
      id: memberId, tenantId: c.tenantId, name: input.member.name.replace(/\s+/g, " "), phone: input.member.phone, email: input.member.email, dateOfBirth: input.member.dateOfBirth, gender: input.member.gender,
      homeBranchId: input.branchId, joinedOn: c.today, qrToken: `qr-${memberId}-${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36)).replace(/-/g, "").slice(0, 8)}`, emergencyContact: input.member.emergencyContact, leadSource: input.member.leadSource?.trim() || undefined,
    };
    await db.members.add(member);
    for (const [scope, on] of [["data_processing", true], ["photos", input.consents.photos], ["assessments", input.consents.assessments], ["marketing", input.consents.marketing]] as const) {
      if (on) await db.consents.add({ id: `cn_${memberId}_${scope}`, tenantId: c.tenantId, memberId, scope, grantedAt: c.nowIso, noticeVersion: NOTICE_VERSION, recordedBy: c.principal.userId });
    }
    if (trainerRow) await db.trainerAssignments.add(trainerRow);

    const durationDays = plan.durationDays ?? 30;
    const membership: Membership = {
      id: `ms_${memberId}_1`, tenantId: c.tenantId, memberId, planId: plan.id,
      terms: { name: plan.name, kind: plan.kind, pricePaise: plan.pricePaise, taxRateBp: plan.taxRateBp, durationDays: plan.durationDays, visits: plan.visits, branchIds: plan.branchIds, classEntitlements: plan.classEntitlements, ptCredits: plan.ptCredits },
      status: "pending", startsOn, endsOn: addDays(startsOn, durationDays), visitsRemaining: plan.visits ?? null, freezes: [], autoRenew: false, createdAt: c.nowIso,
    };
    let invoice: Invoice | undefined;
    let payment: Payment | undefined;
    if (totals.totalPaise > 0) {
      invoice = {
        id: rid("inv"), tenantId: c.tenantId, number: await allocateNumber(c.tenantId, "invoice", branch, c.today), memberId, membershipId: membership.id, branchId: input.branchId, placeOfSupply: placeOfSupplyFor(branch.stateCode),
        issuedOn: c.today, dueOn: c.today, lines: [{ description: `${plan.name} membership, ${formatDate(startsOn)} to ${formatDate(membership.endsOn!)}`, quantity: 1, unitPaise: plan.pricePaise, taxRateBp: plan.taxRateBp }], ...totals, status: "open", createdAt: c.nowIso,
      };
      membership.invoiceId = invoice.id;
      if (input.payment) {
        payment = {
          id: rid("pay"), tenantId: c.tenantId, invoiceId: invoice.id, memberId, branchId: input.branchId, method: input.payment.method, amountPaise: input.payment.amountPaise, status: "succeeded", receivedAt: c.nowIso, receivedBy: c.principal.userId,
          receiptNumber: await nextReceiptNumber(c.tenantId, c.today), reference: input.payment.reference?.trim() || undefined, idempotencyKey: `${input.key}:pay`, reconciliation: { status: "unmatched" },
        };
        invoice.status = amountDuePaise(invoice, [payment]) <= 0 ? "paid" : "partially_paid";
      }
    }
    // The membership starts when it is paid in full (or at once when there is nothing to pay). A future start date is scheduled.
    const paidInFull = totals.totalPaise === 0 || invoice?.status === "paid";
    if (paidInFull) membership.status = startsOn > c.today ? "scheduled" : "active";
    await db.memberships.add(membership);
    if (invoice) await db.invoices.add(invoice);
    if (payment) await db.payments.add(payment);
    if (paidInFull && plan.ptCredits) {
      const credit: CreditLedgerEntry = { id: `cr_${memberId}_buy_${membership.id}`, tenantId: c.tenantId, memberId, membershipId: membership.id, kind: "purchase", credits: plan.ptCredits, expiresOn: membership.endsOn, createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `join:${membership.id}` };
      await db.creditLedger.add(credit);
    }
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "membership.create", reason: "Registered at the front desk", entityType: "membership", entityId: membership.id, memberId, details: { plan: plan.name, branchId: input.branchId, invoice: invoice?.number ?? null, paidPaise: payment?.amountPaise ?? 0, trainerId: trainerRow?.trainerId ?? null, leadSource: member.leadSource ?? null } }, rid("ae"), now()));

    // The pass and the receipt go to the member’s email (O04). With no email, the desk prints the pass.
    const tenant = await db.tenants.get(c.tenantId);
    const first = member.name.split(" ")[0] ?? member.name;
    const mail = async (template: EmailLogEntry["template"], subject: string, lines: string[]) => {
      await db.emailLog.add({ id: rid("em"), tenantId: c.tenantId, memberId, invoiceId: invoice?.id, template, to: member.email, subject, body: [`Hi ${first},`, "", ...lines, "", tenant?.name ?? "Your gym"].join("\n"), status: member.email ? "sent" : "skipped", detail: member.email ? undefined : "No email address on file for this member.", sentAt: c.nowIso });
    };
    await mail("member_welcome", `Welcome to ${tenant?.name ?? "the gym"}`, [`Your ${plan.name} membership ${membership.status === "active" ? "is active" : membership.status === "scheduled" ? `starts on ${formatDate(startsOn)}` : "starts once the first payment is made"}.`, `Your pass code is ${passCodeFor(member.qrToken)}. Show the QR code in the app, or this code, at the front desk or the door.`]);
    if (payment && invoice) await mail("payment_receipt", `Payment received: ${formatRupees(payment.amountPaise)}`, [`We received ${formatRupees(payment.amountPaise)} for invoice ${invoice.number} on ${formatDate(c.today)}.`, `Receipt number ${payment.receiptNumber}.`]);
    return summary(c.tenantId, member, false);
  });
}

async function summary(tenantId: string, member: Member, repeated: boolean): Promise<RegisterResult> {
  const [memberships, invoices, payments, assignments, users, mail] = await Promise.all([
    db.memberships.where("memberId").equals(member.id).toArray(), db.invoices.where("memberId").equals(member.id).toArray(), db.payments.where("memberId").equals(member.id).toArray(),
    db.trainerAssignments.where("memberId").equals(member.id).toArray(), db.users.where("tenantId").equals(tenantId).toArray(), db.emailLog.where("memberId").equals(member.id).toArray(),
  ]);
  const m = memberships[0]!;
  const inv = invoices[0];
  const pay = payments.find((p) => p.status === "succeeded");
  const a = assignments[0];
  return {
    memberId: member.id, name: member.name, firstName: member.name.split(" ")[0] ?? member.name, qrToken: member.qrToken, passCode: passCodeFor(member.qrToken),
    membership: { planName: m.terms.name, status: m.status, startsOn: m.startsOn, endsOn: m.endsOn, visits: m.visitsRemaining },
    invoice: inv && { id: inv.id, number: inv.number, totalPaise: inv.totalPaise, duePaise: amountDuePaise(inv, payments), status: inv.status },
    payment: pay && { id: pay.id, receiptNumber: pay.receiptNumber, amountPaise: pay.amountPaise, method: pay.method },
    trainer: a && { name: users.find((u) => u.id === a.trainerId)?.name ?? "Trainer", effectiveOn: a.effectiveFrom },
    emailedTo: mail.some((e) => e.status === "sent") ? member.email : undefined, repeated,
  };
}
