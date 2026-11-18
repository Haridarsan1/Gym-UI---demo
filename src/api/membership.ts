import { z } from "zod";
import { db } from "@/demo/db";
import { configureSimulation, getSimulation } from "@/demo/simulate";
import { assertCan } from "@/api/context";
import { ApiError } from "@/api/errors";
import { openMember, type MemberContext } from "@/api/member";
import { amountDuePaise, amountInWords, invoiceLines, invoiceTotals, isOverdue, paidPaise, placeOfSupplyFor, stateOfGstin, STATE_NAMES, SAC_FITNESS, taxBreakup } from "@/domain/billing";
import { creditBalance, type CreditBalance } from "@/domain/credits";
import { addDays, daysBetween } from "@/domain/dates";
import { currentMembership, includedInPlan } from "@/domain/membership";
import {
  autoRenewTerms, PAYMENT_DECLINED, PAY_METHOD_LABEL, planOnOffer, renewalBlockedReason, renewalQuote, SESSION_EXPIRY_DAYS, SESSION_PACKS, SESSION_PRICE_PAISE, SESSION_TAX_RATE_BP, sessionPackQuote,
  type PayMethod, type RenewalQuote,
} from "@/domain/renewal";
import { buildAuditEvent } from "@/domain/audit";
import type { CreditLedgerEntry, EmailLogEntry, GatewayEvent, Invoice, Member, Membership, MembershipPlan, Payment } from "@/domain/types";
import { formatDate, formatRupees } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Membership, renewal, payment and receipts (M01 to M04, M06) for the signed-in member only.
 *
 * Paying goes through a simulated gateway. The member pays; the gateway answers with an event (`payment.succeeded` or
 * `payment.failed`) that has its own id; the event is applied once. Applying is idempotent three ways: the event id is stored,
 * a payment is keyed by its event, and one invoice buys at most one membership and one batch of credits. So the same event
 * arriving twice (the demo control replays it) leaves one payment and one renewal. A failed payment is recorded and activates
 * nothing. Everything an event does happens in one database transaction.
 */

// ── What the screen reads ─────────────────────────────────────────────────────────────────────────

export interface MembershipView {
  id: string;
  status: Membership["status"];
  planName: string;
  startsOn: string;
  endsOn?: string;
  daysLeft?: number;
  visitsRemaining: number | null;
  visitsTotal?: number;
  freeze?: { from: string; to?: string; reason: string; current: boolean };
  canceledEffectiveOn?: string;
  graceUntil?: string;
  /** The terms agreed when it was sold (M01), in words. */
  includes: string[];
  agreedPricePaise: number;
}

export interface InvoiceRow {
  id: string;
  number: string;
  issuedOn: string;
  dueOn: string;
  description: string;
  totalPaise: number;
  paidPaise: number;
  duePaise: number;
  status: Invoice["status"];
  overdue: boolean;
  /** Receipt numbers of the payments made on it. */
  receipts: string[];
}

export interface PaymentRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  method: Payment["method"];
  methodLabel: string;
  amountPaise: number;
  status: Payment["status"];
  at: string;
  reference?: string;
  receiptNumber?: string;
  failureReason?: string;
}

export interface RenewalOption extends RenewalQuote {
  current: boolean;
}

export interface GatewayEventView {
  id: string;
  type: GatewayEvent["type"];
  invoiceNumber: string;
  amountPaise: number;
  method: GatewayEvent["method"];
  receivedAt: string;
  /** How many times the gateway sent it. */
  deliveries: number;
  /** What the invoice was for: decides which count the demo panel highlights. */
  purpose: "renewal" | "sessions" | "invoice";
  /** What it made, counted from the records: more than one of any would be a bug. */
  payments: number;
  memberships: number;
  creditEntries: number;
}

export interface MembershipData {
  today: string;
  nowIso: string;
  gymName: string;
  current: MembershipView | null;
  /** A membership already bought that starts after the current one. */
  next?: { planName: string; startsOn: string; endsOn?: string; status: Membership["status"] };
  credits: CreditBalance;
  /** The invoice that needs paying first, and the total owed. */
  dues?: { invoiceId: string; number: string; duePaise: number; overdue: boolean; totalDuePaise: number };
  renewal: { blockedReason?: string; options: RenewalOption[]; currentPlanId?: string };
  sessions: { pricePaise: number; packs: Array<{ sessions: number; subtotalPaise: number; taxPaise: number; totalPaise: number }>; blockedReason?: string };
  autoRenew: { on: boolean; method?: "upi" | "card"; available: boolean; unavailableReason?: string; terms?: { planName: string; chargeOn: string; reminderOn: string; amountPaise: number; newEndsOn: string } };
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  demo: { paymentFails: boolean; events: GatewayEventView[] };
}

const lineText = (inv: Pick<Invoice, "lines">) => inv.lines[0]?.description ?? "Invoice";

async function loadAll(c: MemberContext) {
  const [member, tenant, memberships, invoices, payments, plans, ledger, branches, events] = await Promise.all([
    db.members.get(c.memberId),
    db.tenants.get(c.tenantId),
    db.memberships.where("memberId").equals(c.memberId).toArray(),
    db.invoices.where("memberId").equals(c.memberId).toArray(),
    db.payments.where("memberId").equals(c.memberId).toArray(),
    db.membershipPlans.where("tenantId").equals(c.tenantId).toArray(),
    db.creditLedger.where("memberId").equals(c.memberId).toArray(),
    db.branches.where("tenantId").equals(c.tenantId).toArray(),
    db.gatewayEvents.where("memberId").equals(c.memberId).toArray(),
  ]);
  if (!member) throw new ApiError("not_found", "We couldn’t find your membership record. Ask the front desk.");
  return { member, tenant, memberships, invoices, payments, plans, ledger, branches, events };
}

function openInvoices(invoices: Invoice[], payments: Payment[]) {
  return invoices
    .filter((i) => i.status === "open" || i.status === "partially_paid")
    .map((i) => ({ i, due: amountDuePaise(i, payments.filter((p) => p.invoiceId === i.id)) }))
    .filter((x) => x.due > 0)
    .sort((a, b) => a.i.dueOn.localeCompare(b.i.dueOn));
}

export async function getMembership(session: Session | null): Promise<MembershipData> {
  const c = await openMember(session);
  for (const a of ["membership.read", "invoice.read", "credits.read"] as const) assertCan(c.principal, a, c.resource);
  const { member, tenant, memberships, invoices, payments, plans, ledger, branches, events } = await loadAll(c);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const current = currentMembership(memberships);
  const next = memberships.filter((m) => m.status === "scheduled" && m.id !== current?.id).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
  const owed = openInvoices(invoices, payments);
  const firstOwed = owed[0];

  const freeze = current?.freezes.at(-1);
  const view: MembershipView | null = current
    ? {
        id: current.id, status: current.status, planName: current.terms.name, startsOn: current.startsOn, endsOn: current.endsOn, daysLeft: current.endsOn ? daysBetween(c.today, current.endsOn) : undefined,
        visitsRemaining: current.visitsRemaining, visitsTotal: current.terms.visits, canceledEffectiveOn: current.canceledEffectiveOn, graceUntil: current.graceUntil,
        freeze: freeze ? { from: freeze.from, to: freeze.to, reason: freeze.reason, current: freeze.from <= c.today && (freeze.to === undefined || freeze.to >= c.today) } : undefined,
        includes: includedInPlan(current.terms, branches.map((b) => b.name), current.terms.branchIds.map((id) => branchName.get(id) ?? id)),
        agreedPricePaise: current.terms.pricePaise,
      }
    : null;

  // Renewal: only a plan on sale at the member’s branch, shown with its new dates and price before anything is paid.
  // An invoice the gym sent for the renewal has to be paid first. One from the member’s own checkout doesn’t get in the way.
  const openRenewal = owed.find((x) => x.i.purpose?.kind === "renewal" && !x.i.purpose.selfServe);
  const blocked = renewalBlockedReason(current?.status, openRenewal?.i.number, next !== undefined);
  const options: RenewalOption[] = blocked
    ? []
    : plans.filter((p) => planOnOffer(p, member.homeBranchId, c.today)).map((p) => ({ ...renewalQuote(p, current, c.today), current: p.id === current?.planId })).sort((a, b) => a.totalPaise - b.totalPaise);

  // Auto-renew needs a running membership with a plan still on sale.
  const currentPlan = plans.find((p) => p.id === current?.planId);
  const terms = current ? autoRenewTerms(current, currentPlan && planOnOffer(currentPlan, member.homeBranchId, c.today) ? currentPlan : undefined) : undefined;
  const autoRenewReason = !current ? "You have no membership to renew." : current.status !== "active" ? "Auto-renew can be turned on while your membership is active." : !terms ? "Your plan is no longer sold, so it can’t renew by itself. Choose a plan when you renew." : undefined;

  const invoiceNumber = new Map(invoices.map((i) => [i.id, i.number]));
  const rows: InvoiceRow[] = invoices
    .filter((i) => i.status !== "draft")
    .map((i) => {
      const mine = payments.filter((p) => p.invoiceId === i.id);
      const due = amountDuePaise(i, mine);
      return { id: i.id, number: i.number, issuedOn: i.issuedOn, dueOn: i.dueOn, description: lineText(i), totalPaise: i.totalPaise, paidPaise: paidPaise(mine), duePaise: due, status: i.status, overdue: isOverdue(i, mine, c.today), receipts: mine.filter((p) => p.status === "succeeded" && p.receiptNumber).map((p) => p.receiptNumber!) };
    })
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.number.localeCompare(a.number));
  const payRows: PaymentRow[] = payments
    .map((p) => ({ id: p.id, invoiceId: p.invoiceId, invoiceNumber: invoiceNumber.get(p.invoiceId) ?? "", method: p.method, methodLabel: PAY_METHOD_LABEL[p.method], amountPaise: p.amountPaise, status: p.status, at: p.receivedAt, reference: p.reference, receiptNumber: p.receiptNumber, failureReason: p.failureReason }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const eventViews: GatewayEventView[] = events
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, 3)
    .map((e) => ({
      id: e.id, type: e.type, invoiceNumber: invoiceNumber.get(e.invoiceId) ?? "", amountPaise: e.amountPaise, method: e.method, receivedAt: e.receivedAt, deliveries: e.deliveries,
      purpose: invoices.find((i) => i.id === e.invoiceId)?.purpose?.kind ?? "invoice",
      payments: payments.filter((p) => p.gatewayEventId === e.id && p.status === "succeeded").length, memberships: memberships.filter((m) => m.invoiceId === e.invoiceId).length,
      creditEntries: ledger.filter((x) => x.idempotencyKey === `sessions:${e.invoiceId}` || x.idempotencyKey === `renewal-credits:${e.invoiceId}`).length,
    }));

  return {
    today: c.today, nowIso: c.nowIso, gymName: tenant?.name ?? "Your gym", current: view,
    next: next ? { planName: next.terms.name, startsOn: next.startsOn, endsOn: next.endsOn, status: next.status } : undefined,
    credits: creditBalance(ledger),
    dues: firstOwed ? { invoiceId: firstOwed.i.id, number: firstOwed.i.number, duePaise: firstOwed.due, overdue: isOverdue(firstOwed.i, payments.filter((p) => p.invoiceId === firstOwed.i.id), c.today), totalDuePaise: owed.reduce((n, x) => n + x.due, 0) } : undefined,
    renewal: { blockedReason: blocked, options, currentPlanId: current?.planId },
    sessions: {
      pricePaise: SESSION_PRICE_PAISE, packs: SESSION_PACKS.map((n) => sessionPackQuote(n)!),
      blockedReason: !current ? "Ask the front desk to set up your membership, then you can buy sessions." : current.status === "pending" ? "Pay your first invoice to start your membership, then you can buy sessions." : undefined,
    },
    autoRenew: { on: !!current?.autoRenew && current.status === "active", method: current?.autoRenewMethod, available: !autoRenewReason, unavailableReason: autoRenewReason, terms: terms && currentPlan ? { planName: currentPlan.name, ...terms } : undefined },
    invoices: rows, payments: payRows, demo: { paymentFails: getSimulation().paymentFails, events: eventViews },
  };
}

// ── The tax receipt ───────────────────────────────────────────────────────────────────────────────

export interface ReceiptData {
  /** “Tax invoice and receipt” once paid in full, otherwise “Tax invoice”. */
  title: string;
  supplier: { name: string; legalName: string; address?: string; gstin?: string; stateName: string; stateCode: string };
  invoice: { id: string; number: string; issuedOn: string; dueOn: string; status: Invoice["status"]; overdue: boolean; sac: string };
  billTo: { name: string; phone: string; email?: string; branchName: string };
  placeOfSupply: { code: string; name: string };
  lines: Array<{ description: string; sac: string; quantity: number; unitPaise: number; taxablePaise: number; taxRateBp: number }>;
  totals: { subtotalPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; taxPaise: number; totalPaise: number };
  /** Half the GST rate for CGST and SGST, or the whole rate for IGST (when every line has the same rate). */
  rateBp?: number;
  amountInWords: string;
  payments: Array<{ id: string; at: string; methodLabel: string; amountPaise: number; receiptNumber?: string; reference?: string }>;
  paidPaise: number;
  duePaise: number;
}

export async function getReceipt(session: Session | null, invoiceId: string): Promise<ReceiptData> {
  const c = await openMember(session);
  assertCan(c.principal, "invoice.read", c.resource);
  const invoice = await db.invoices.get(invoiceId);
  // Someone else’s invoice looks exactly like one that doesn’t exist.
  if (!invoice || invoice.memberId !== c.memberId || invoice.status === "draft") throw new ApiError("not_found", "We couldn’t find that invoice. Open it from your invoices list.");
  const [member, tenant, branch, payments] = await Promise.all([db.members.get(c.memberId), db.tenants.get(c.tenantId), db.branches.get(invoice.branchId), db.payments.where("invoiceId").equals(invoice.id).toArray()]);
  const supplierState = tenant?.gstin ? stateOfGstin(tenant.gstin) : (branch?.stateCode ?? invoice.placeOfSupply);
  const rows = invoiceLines(invoice.lines, invoice.discountPaise);
  const split = taxBreakup(invoice.taxPaise, supplierState, invoice.placeOfSupply);
  const rates = new Set(invoice.lines.map((l) => l.taxRateBp));
  const paid = paidPaise(payments);
  const due = amountDuePaise(invoice, payments);
  const done = payments.filter((p) => p.status === "succeeded").sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  return {
    title: invoice.status === "paid" ? "Tax invoice and receipt" : "Tax invoice",
    supplier: { name: tenant?.name ?? "", legalName: tenant?.legalName ?? tenant?.name ?? "", address: tenant?.address, gstin: tenant?.gstin, stateCode: supplierState, stateName: STATE_NAMES[supplierState] ?? supplierState },
    invoice: { id: invoice.id, number: invoice.number, issuedOn: invoice.issuedOn, dueOn: invoice.dueOn, status: invoice.status, overdue: isOverdue(invoice, payments, c.today), sac: SAC_FITNESS },
    billTo: { name: member?.name ?? "", phone: member?.phone ?? "", email: member?.email, branchName: branch?.name ?? "" },
    placeOfSupply: { code: invoice.placeOfSupply, name: STATE_NAMES[invoice.placeOfSupply] ?? invoice.placeOfSupply },
    lines: invoice.lines.map((l, i) => ({ description: l.description, sac: SAC_FITNESS, quantity: l.quantity, unitPaise: l.unitPaise, taxablePaise: rows[i]!.taxablePaise, taxRateBp: l.taxRateBp })),
    totals: { subtotalPaise: invoice.subtotalPaise, discountPaise: invoice.discountPaise, taxablePaise: invoice.subtotalPaise - invoice.discountPaise, ...split, taxPaise: invoice.taxPaise, totalPaise: invoice.totalPaise },
    rateBp: rates.size === 1 ? (split.igstPaise ? [...rates][0] : [...rates][0]! / 2) : undefined,
    amountInWords: amountInWords(invoice.totalPaise),
    payments: done.map((p) => ({ id: p.id, at: p.receivedAt, methodLabel: PAY_METHOD_LABEL[p.method], amountPaise: p.amountPaise, receiptNumber: p.receiptNumber, reference: p.reference })),
    paidPaise: paid, duePaise: due,
  };
}

// ── Paying ────────────────────────────────────────────────────────────────────────────────────────

const Key = z.string().min(8);
const CheckoutInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("invoice"), invoiceId: z.string().min(1) }),
  z.object({ kind: z.literal("renewal"), planId: z.string().min(1) }),
  z.object({ kind: z.literal("sessions"), sessions: z.number().int().positive() }),
]);
const PayInput = z.object({ invoiceId: z.string().min(1), method: z.enum(["upi", "card", "netbanking"]), idempotencyKey: Key });
const AutoRenewInput = z.object({ on: z.boolean(), method: z.enum(["upi", "card"]).optional() });
export type CheckoutInput = z.input<typeof CheckoutInput>;
export type PayInput = z.input<typeof PayInput>;
export type AutoRenewInput = z.input<typeof AutoRenewInput>;

const parse = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError("invalid", "We couldn’t read that request. Reload the page and try again.");
  return r.data;
};

const rid = (prefix: string) => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

/** The next printed number: the highest in use plus one, with the same prefix and year. */
async function nextNumber(prefix: "INV" | "RCP", existing: Array<string | undefined>, year: string): Promise<string> {
  const head = `${prefix}-${year}-`;
  const top = existing.reduce((n, x) => (x?.startsWith(head) ? Math.max(n, Number(x.slice(head.length)) || 0) : n), 0);
  return `${head}${String(top + 1).padStart(4, "0")}`;
}

export interface CheckoutView {
  invoiceId: string;
  number: string;
  kind: "invoice" | "renewal" | "sessions" | "other";
  description: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  duePaise: number;
  /** What paying will do, in words. */
  effects: string[];
}

function effectsOf(inv: Invoice, plans: MembershipPlan[], current: Membership | undefined, today: string): string[] {
  if (inv.purpose?.kind === "renewal") {
    const plan = plans.find((p) => p.id === inv.purpose?.planId);
    if (!plan) return ["Paying this invoice renews your membership."];
    const q = renewalQuote(plan, current, today);
    return [`${plan.name} runs ${formatDate(q.startsOn)} to ${formatDate(q.endsOn)}.`, q.status === "scheduled" ? "Your current membership carries on until then." : "It starts today."];
  }
  if (inv.purpose?.kind === "sessions") return [`${inv.purpose.sessions} training sessions are added to your balance, good for ${SESSION_EXPIRY_DAYS} days.`];
  return [];
}

/**
 * Starts a payment for an open invoice, a renewal or a pack of sessions. A renewal or pack makes its invoice here; asking again
 * for the same thing returns the invoice already open instead of making another, so a retry never doubles the bill.
 */
export async function startCheckout(session: Session | null, raw: CheckoutInput): Promise<CheckoutView> {
  const input = parse(CheckoutInput, raw);
  const c = await openMember(session);
  assertCan(c.principal, "payment.pay", c.resource);
  return db.transaction("rw", db.tables, async () => {
    const { member, memberships, invoices, payments, plans, branches } = await loadAll(c);
    const current = currentMembership(memberships);
    const owed = openInvoices(invoices, payments);
    let invoice: Invoice | undefined;

    if (input.kind === "invoice") {
      invoice = invoices.find((i) => i.id === input.invoiceId);
      if (!invoice) throw new ApiError("not_found", "We couldn’t find that invoice. Open it from your invoices list.");
      if (!owed.some((x) => x.i.id === invoice!.id)) throw new ApiError("conflict", invoice.status === "paid" ? "This invoice is already paid." : "This invoice can’t be paid online. Ask the front desk.");
    } else if (input.kind === "renewal") {
      const plan = plans.find((p) => p.id === input.planId);
      const hasNext = memberships.some((m) => m.status === "scheduled" && m.id !== current?.id);
      const gymSent = owed.find((x) => x.i.purpose?.kind === "renewal" && !x.i.purpose.selfServe)?.i.number;
      const blocked = renewalBlockedReason(current?.status, gymSent, hasNext);
      // Asking again for the same plan returns the invoice already open.
      const sameOpen = owed.find((x) => x.i.purpose?.kind === "renewal" && x.i.purpose.planId === input.planId);
      if (blocked && !(sameOpen && !hasNext && current?.status !== "frozen")) throw new ApiError("conflict", blocked);
      if (!plan || !planOnOffer(plan, member.homeBranchId, c.today)) throw new ApiError("invalid", "That plan isn’t available at your branch. Choose another plan.");
      if (sameOpen) invoice = sameOpen.i;
      else {
        const q = renewalQuote(plan, current, c.today);
        invoice = await createInvoice(c, member, branches.find((b) => b.id === member.homeBranchId)?.stateCode ?? "27", invoices, {
          description: `${plan.name} membership, ${formatDate(q.startsOn)} to ${formatDate(q.endsOn)}`, quantity: 1, unitPaise: plan.pricePaise, taxRateBp: plan.taxRateBp, purpose: { kind: "renewal", planId: plan.id, selfServe: true }, membershipId: current?.id,
        });
      }
    } else {
      const pack = sessionPackQuote(input.sessions);
      if (!pack) throw new ApiError("invalid", "Choose one of the packs shown.");
      if (!current || current.status === "pending") throw new ApiError("forbidden", !current ? "Ask the front desk to set up your membership, then you can buy sessions." : "Pay your first invoice to start your membership, then you can buy sessions.");
      const same = owed.find((x) => x.i.purpose?.kind === "sessions" && x.i.purpose.sessions === input.sessions);
      invoice = same?.i ?? (await createInvoice(c, member, branches.find((b) => b.id === member.homeBranchId)?.stateCode ?? "27", invoices, {
        description: `Personal training: ${input.sessions} sessions`, quantity: input.sessions, unitPaise: SESSION_PRICE_PAISE, taxRateBp: SESSION_TAX_RATE_BP, purpose: { kind: "sessions", sessions: input.sessions, selfServe: true }, membershipId: current.id,
      }));
    }

    const fresh = await db.invoices.get(invoice.id);
    const inv = fresh ?? invoice;
    const due = amountDuePaise(inv, payments.filter((p) => p.invoiceId === inv.id));
    return {
      invoiceId: inv.id, number: inv.number, kind: inv.purpose?.kind ?? "other", description: lineText(inv), subtotalPaise: inv.subtotalPaise - inv.discountPaise, taxPaise: inv.taxPaise, totalPaise: inv.totalPaise, duePaise: due,
      effects: effectsOf(inv, plans, current, c.today),
    } satisfies CheckoutView;
  });
}

async function createInvoice(
  c: MemberContext,
  member: Member,
  stateCode: string,
  existing: Invoice[],
  line: { description: string; quantity: number; unitPaise: number; taxRateBp: number; purpose: NonNullable<Invoice["purpose"]>; membershipId?: string },
): Promise<Invoice> {
  const year = c.today.slice(0, 4);
  const all = await db.invoices.where("tenantId").equals(c.tenantId).toArray();
  // Another renewal invoice that is still unpaid is replaced by this one: the member has changed their mind about the plan.
  for (const old of existing.filter((i) => i.status === "open" && i.purpose?.kind === "renewal" && i.purpose.selfServe && line.purpose.kind === "renewal")) {
    if ((await db.payments.where("invoiceId").equals(old.id).filter((p) => p.status === "succeeded").count()) === 0) await db.invoices.update(old.id, { status: "void" });
  }
  const lines = [{ description: line.description, quantity: line.quantity, unitPaise: line.unitPaise, taxRateBp: line.taxRateBp }];
  const invoice: Invoice = {
    id: rid("inv"), tenantId: c.tenantId, number: await nextNumber("INV", all.map((i) => i.number), year), memberId: c.memberId, membershipId: line.membershipId, branchId: member.homeBranchId,
    placeOfSupply: placeOfSupplyFor(stateCode), issuedOn: c.today, dueOn: c.today, lines, ...invoiceTotals(lines), status: "open", purpose: line.purpose, createdAt: c.nowIso,
  };
  await db.invoices.add(invoice);
  return invoice;
}

export interface PayResult {
  status: "succeeded" | "failed";
  invoiceNumber: string;
  amountPaise: number;
  method: PayMethod;
  /** In words: what happened and what to do next. */
  message: string;
  paymentId: string;
  eventId: string;
  receiptNumber?: string;
  invoiceId: string;
  /** What the payment did. Empty for a failed payment, which changes nothing. */
  effects: { kind: "renewal" | "sessions" | "invoice"; membership?: { planName: string; startsOn: string; endsOn?: string; status: Membership["status"] }; sessionsAdded?: number; balance?: CreditBalance };
  repeated: boolean;
}

interface GatewayInput {
  eventId: string;
  type: GatewayEvent["type"];
  invoiceId: string;
  method: PayMethod;
  amountPaise: number;
  reference: string;
  paymentKey: string;
}

/**
 * Applies one gateway event, once. Called for a payment the member just made and again by the demo control that replays an
 * event. Must run inside a transaction.
 */
async function applyGatewayEvent(c: MemberContext, ev: GatewayInput): Promise<{ duplicate: boolean; payment: Payment; effects: PayResult["effects"] }> {
  const seen = await db.gatewayEvents.get(ev.eventId);
  if (seen) {
    await db.gatewayEvents.update(seen.id, { deliveries: seen.deliveries + 1, lastDeliveredAt: c.nowIso });
    const payment = await db.payments.get(seen.paymentId);
    return { duplicate: true, payment: payment!, effects: { kind: "invoice" } };
  }
  const invoice = await db.invoices.get(ev.invoiceId);
  if (!invoice || invoice.memberId !== c.memberId) throw new ApiError("not_found", "We couldn’t find that invoice.");
  const paymentsSoFar = await db.payments.where("invoiceId").equals(invoice.id).toArray();
  const allPayments = await db.payments.where("tenantId").equals(c.tenantId).toArray();
  const succeeded = ev.type === "payment.succeeded";
  const year = c.today.slice(0, 4);
  const payment: Payment = {
    id: rid("pay"), tenantId: c.tenantId, invoiceId: invoice.id, memberId: c.memberId, branchId: invoice.branchId, method: ev.method, amountPaise: ev.amountPaise, status: succeeded ? "succeeded" : "failed", receivedAt: c.nowIso,
    receiptNumber: succeeded ? await nextNumber("RCP", allPayments.map((p) => p.receiptNumber), year) : undefined, reference: ev.reference, gatewayEventId: ev.eventId,
    failureReason: succeeded ? undefined : PAYMENT_DECLINED, idempotencyKey: ev.paymentKey, reconciliation: { status: "unmatched" },
  };
  await db.payments.add(payment); // the unique idempotency key refuses a second payment for the same event or attempt
  await db.gatewayEvents.add({
    id: ev.eventId, tenantId: c.tenantId, memberId: c.memberId, invoiceId: invoice.id, type: ev.type, method: ev.method, amountPaise: ev.amountPaise, reference: ev.reference, paymentId: payment.id,
    receivedAt: c.nowIso, deliveries: 1, lastDeliveredAt: c.nowIso,
  });
  if (!succeeded) return { duplicate: false, payment, effects: { kind: "invoice" } };

  const stillDue = amountDuePaise(invoice, [...paymentsSoFar, payment]);
  const status: Invoice["status"] = stillDue <= 0 ? "paid" : "partially_paid";
  await db.invoices.update(invoice.id, { status });
  const effects: PayResult["effects"] = { kind: "invoice" };
  const [member, tenant, memberships, plans, ledger] = await Promise.all([
    db.members.get(c.memberId), db.tenants.get(c.tenantId), db.memberships.where("memberId").equals(c.memberId).toArray(), db.membershipPlans.where("tenantId").equals(c.tenantId).toArray(), db.creditLedger.where("memberId").equals(c.memberId).toArray(),
  ]);

  if (status === "paid" && invoice.purpose?.kind === "renewal") {
    const plan = plans.find((p) => p.id === invoice.purpose?.planId);
    // One invoice buys one membership, however many times its payment arrives.
    const already = memberships.find((m) => m.invoiceId === invoice.id);
    if (plan && !already) {
      const current = currentMembership(memberships);
      const q = renewalQuote(plan, current, c.today);
      const next: Membership = {
        id: `ms_${c.memberId}_${invoice.id}`, tenantId: c.tenantId, memberId: c.memberId, planId: plan.id,
        terms: { name: plan.name, kind: plan.kind, pricePaise: invoice.lines[0]?.unitPaise ?? plan.pricePaise, taxRateBp: plan.taxRateBp, durationDays: plan.durationDays, visits: plan.visits, branchIds: plan.branchIds, classEntitlements: plan.classEntitlements, ptCredits: plan.ptCredits },
        status: q.status, startsOn: q.startsOn, endsOn: q.endsOn, visitsRemaining: plan.visits ?? null, freezes: [], autoRenew: current?.autoRenew ?? false, autoRenewMethod: current?.autoRenewMethod,
        renewsMembershipId: current?.id, invoiceId: invoice.id, createdAt: c.nowIso,
      };
      await db.memberships.add(next);
      // A membership that has run out is closed when the new one starts today. One still running is left alone.
      if (q.status === "active" && current && current.status === "active") await db.memberships.update(current.id, { status: "expired" });
      if (plan.ptCredits) {
        const credit: CreditLedgerEntry = { id: `cr_${c.memberId}_renew_${invoice.id}`, tenantId: c.tenantId, memberId: c.memberId, membershipId: next.id, kind: "purchase", credits: plan.ptCredits, expiresOn: q.endsOn, createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `renewal-credits:${invoice.id}`, reason: `${plan.name} includes ${plan.ptCredits} sessions` };
        await db.creditLedger.add(credit);
      }
      await db.auditEvents.add(buildAuditEvent(c.principal, {
        action: q.upgrade ? "membership.upgrade" : "membership.renew", reason: "Paid online by the member", entityType: "membership", entityId: next.id, memberId: c.memberId,
        details: { invoice: invoice.number, plan: plan.name, startsOn: q.startsOn, endsOn: q.endsOn, paymentId: payment.id, gatewayEventId: ev.eventId },
      }, rid("ae"), new Date(c.nowIso)));
      // The member has paid for a plan, so renewal invoices they started for other plans and never paid are dropped.
      for (const other of await db.invoices.where("memberId").equals(c.memberId).filter((i) => i.id !== invoice.id && i.status === "open" && i.purpose?.kind === "renewal" && i.purpose.selfServe === true).toArray()) await db.invoices.update(other.id, { status: "void" });
      effects.kind = "renewal";
      effects.membership = { planName: plan.name, startsOn: q.startsOn, endsOn: q.endsOn, status: q.status };
    }
  } else if (status === "paid" && invoice.purpose?.kind === "sessions" && invoice.purpose.sessions) {
    const key = `sessions:${invoice.id}`;
    if (!ledger.some((e) => e.idempotencyKey === key)) {
      const membershipId = currentMembership(memberships)?.id;
      const credit: CreditLedgerEntry = { id: `cr_${c.memberId}_buy_${invoice.id}`, tenantId: c.tenantId, memberId: c.memberId, membershipId, kind: "purchase", credits: invoice.purpose.sessions, expiresOn: addDays(c.today, SESSION_EXPIRY_DAYS), createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: key, reason: `Bought online, invoice ${invoice.number}` };
      await db.creditLedger.add(credit);
      effects.kind = "sessions";
      effects.sessionsAdded = invoice.purpose.sessions;
      effects.balance = creditBalance([...ledger, credit]);
    }
  } else if (status === "paid" && invoice.membershipId) {
    // A first invoice for a pending membership: paying it starts the membership. Unpaid invoice and membership state are separate (M02).
    const m = memberships.find((x) => x.id === invoice.membershipId);
    if (m?.status === "pending") {
      await db.memberships.update(m.id, { status: "active" });
      effects.membership = { planName: m.terms.name, startsOn: m.startsOn, endsOn: m.endsOn, status: "active" };
    }
  }

  // Emails: the receipt always goes (it is a legal record), and so does the renewal note. They are written to the delivery log (O04).
  const to = member?.email;
  const first = member?.name.split(" ")[0] ?? "there";
  const sign = tenant?.name ?? "Your gym";
  const mail = async (template: EmailLogEntry["template"], subject: string, lines: string[]) => {
    await db.emailLog.add({ id: rid("em"), tenantId: c.tenantId, memberId: c.memberId, invoiceId: invoice.id, template, to, subject, body: [`Hi ${first},`, "", ...lines, "", sign].join("\n"), status: to ? "sent" : "skipped", detail: to ? undefined : "No email address on file for this member.", sentAt: c.nowIso });
  };
  await mail("payment_receipt", `Payment received: ${formatRupees(ev.amountPaise)}`, [`We received ${formatRupees(ev.amountPaise)} for invoice ${invoice.number} on ${formatDate(c.today)}.`, `Receipt number ${payment.receiptNumber}. You can open and save the tax receipt any time from Membership in the app.`]);
  if (effects.kind === "renewal" && effects.membership) await mail("membership_renewed", `Membership renewed until ${formatDate(effects.membership.endsOn!)}`, [`Your ${effects.membership.planName} membership runs ${formatDate(effects.membership.startsOn)} to ${formatDate(effects.membership.endsOn!)}.`]);
  if (effects.kind === "sessions") await mail("sessions_purchased", `${effects.sessionsAdded} training sessions added`, [`${effects.sessionsAdded} training sessions were added to your balance. You now have ${effects.balance?.available} to book.`]);
  return { duplicate: false, payment, effects };
}

/**
 * The member pays an open invoice through the simulated gateway. By default the payment succeeds; the demo control “Make
 * payments fail” makes the gateway decline it. `idempotencyKey` names this attempt: sending it again after a dropped connection
 * returns the same result and charges once. After a decline the screen uses a new key for the next try.
 */
export async function payInvoice(session: Session | null, raw: PayInput): Promise<PayResult> {
  const input = parse(PayInput, raw);
  const c = await openMember(session);
  assertCan(c.principal, "payment.pay", c.resource);
  const fails = getSimulation().paymentFails;
  return db.transaction("rw", db.tables, async () => {
    const paymentKey = `attempt:${input.idempotencyKey}`;
    const done = await db.payments.where("idempotencyKey").equals(paymentKey).first();
    const invoice = await db.invoices.get(input.invoiceId);
    if (!invoice || invoice.memberId !== c.memberId || invoice.status === "draft") throw new ApiError("not_found", "We couldn’t find that invoice. Open it from your invoices list.");
    if (done) return resultFor(c, invoice, done, { kind: "invoice" }, true);
    const payments = await db.payments.where("invoiceId").equals(invoice.id).toArray();
    const due = amountDuePaise(invoice, payments);
    if (due <= 0) throw new ApiError("conflict", "This invoice is already paid. Nothing more is owed.");
    const eventId = rid(fails ? "gw_evt_fail" : "gw_evt");
    const r = await applyGatewayEvent(c, { eventId, type: fails ? "payment.failed" : "payment.succeeded", invoiceId: invoice.id, method: input.method, amountPaise: due, reference: `${input.method === "upi" ? "UPI" : input.method === "card" ? "CARD" : "NB"}${Math.floor(1e11 + Math.random() * 9e11)}`, paymentKey });
    return resultFor(c, invoice, r.payment, r.effects, false);
  });
}

async function resultFor(c: MemberContext, invoice: Invoice, payment: Payment, effects: PayResult["effects"], repeated: boolean): Promise<PayResult> {
  const ok = payment.status === "succeeded";
  let fx = effects;
  if (repeated && ok) {
    // A repeat of a call that already went through: describe what that payment made, without making it again.
    const [memberships, ledger] = await Promise.all([db.memberships.where("memberId").equals(c.memberId).toArray(), db.creditLedger.where("memberId").equals(c.memberId).toArray()]);
    const m = memberships.find((x) => x.invoiceId === invoice.id);
    if (m) fx = { kind: "renewal", membership: { planName: m.terms.name, startsOn: m.startsOn, endsOn: m.endsOn, status: m.status } };
    else if (invoice.purpose?.kind === "sessions") fx = { kind: "sessions", sessionsAdded: invoice.purpose.sessions, balance: creditBalance(ledger) };
  }
  return {
    status: payment.status === "succeeded" ? "succeeded" : "failed", invoiceNumber: invoice.number, invoiceId: invoice.id, amountPaise: payment.amountPaise, method: payment.method as PayMethod, paymentId: payment.id,
    eventId: payment.gatewayEventId ?? "", receiptNumber: payment.receiptNumber, repeated,
    message: ok ? `${formatRupees(payment.amountPaise)} received for invoice ${invoice.number}.` : (payment.failureReason ?? PAYMENT_DECLINED),
    effects: ok ? fx : { kind: "invoice" },
  };
}

export interface ReplayResult {
  eventId: string;
  /** How many times the gateway has now sent this event. */
  deliveries: number;
  /** Payments and memberships that exist for it: one of each, however many times it arrived. */
  payments: number;
  memberships: number;
  creditEntries: number;
  /** True when this delivery was recognised as a repeat and changed nothing. */
  ignored: boolean;
}

/**
 * Demo control (M04): the gateway sends the same “payment succeeded” event again. It must change nothing. The result counts
 * what exists for the event so the screen can show one payment and one renewal.
 */
export async function replayGatewayEvent(session: Session | null, eventId: string): Promise<ReplayResult> {
  const c = await openMember(session);
  assertCan(c.principal, "payment.pay", c.resource);
  return db.transaction("rw", db.tables, async () => {
    const e = await db.gatewayEvents.get(eventId);
    if (!e || e.memberId !== c.memberId) throw new ApiError("not_found", "We couldn’t find that payment event. Make a payment first, then replay it.");
    const invoice = (await db.invoices.get(e.invoiceId))!;
    const r = await applyGatewayEvent(c, { eventId: e.id, type: e.type, invoiceId: e.invoiceId, method: e.method, amountPaise: e.amountPaise, reference: e.reference, paymentKey: `attempt:replay:${e.id}` });
    const [payments, memberships, ledger, after] = await Promise.all([
      db.payments.where("gatewayEventId").equals(e.id).filter((p) => p.status === "succeeded").count(), db.memberships.where("invoiceId").equals(e.invoiceId).count(),
      db.creditLedger.where("memberId").equals(c.memberId).filter((x) => x.idempotencyKey === `sessions:${invoice.id}` || x.idempotencyKey === `renewal-credits:${invoice.id}`).count(), db.gatewayEvents.get(e.id),
    ]);
    return { eventId: e.id, deliveries: after?.deliveries ?? 1, payments, memberships, creditEntries: ledger, ignored: r.duplicate };
  });
}

// ── Auto-renew ────────────────────────────────────────────────────────────────────────────────────

/** Turns auto-renew on or off (M04). Opt-in: the screen explains the charge day and amount first. Written to the audit log. */
export async function setAutoRenew(session: Session | null, raw: AutoRenewInput): Promise<{ on: boolean; method?: "upi" | "card" }> {
  const input = parse(AutoRenewInput, raw);
  const c = await openMember(session);
  assertCan(c.principal, "membership.autorenew", c.resource);
  return db.transaction("rw", db.tables, async () => {
    const memberships = await db.memberships.where("memberId").equals(c.memberId).toArray();
    const current = currentMembership(memberships);
    if (!current || current.status !== "active") throw new ApiError("conflict", "Auto-renew can be turned on while your membership is active.");
    if (input.on && !input.method) throw new ApiError("invalid", "Choose UPI or card for the automatic payment.");
    await db.memberships.update(current.id, { autoRenew: input.on, autoRenewMethod: input.on ? input.method : undefined });
    await db.auditEvents.add(buildAuditEvent(c.principal, {
      action: "membership.autorenew", reason: input.on ? "Member opted in" : "Member opted out", entityType: "membership", entityId: current.id, memberId: c.memberId, details: { on: input.on, method: input.method },
    }, rid("ae"), new Date(c.nowIso)));
    return { on: input.on, method: input.on ? input.method : undefined };
  });
}

/** Demo control: make the simulated gateway decline payments (or stop). Only changes the demo gateway, nothing of the member’s. */
export async function setDemoPaymentFailure(session: Session | null, on: boolean): Promise<{ paymentFails: boolean }> {
  const c = await openMember(session);
  assertCan(c.principal, "payment.pay", c.resource);
  configureSimulation({ paymentFails: on });
  return { paymentFails: on };
}
