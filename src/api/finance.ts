import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { assertInBranch, openDesk, type DeskContext } from "@/api/desk";
import { buildAuditEvent } from "@/domain/audit";
import { amountDuePaise, isOverdue } from "@/domain/billing";
import { rupeesCell, toCsv } from "@/domain/csv";
import { istDateOf } from "@/domain/dates";
import { reconcile, type ReconIssue } from "@/domain/reconciliation";
import type { Invoice, Payment } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Finance screens (M03, M04, O06, O07): invoices and payments with billed and collected shown apart, reconciliation of online collections against the gateway’s
 * payouts, and role-scoped CSV exports. Everything is limited to the branches the person works in. Nothing here reaches health records: exports carry the member’s
 * name and id and money, never phone, email, assessments or photos.
 */

const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
const inScope = (c: DeskContext, branchId: string) => c.branchIds.includes(branchId);

function scope(c: DeskContext, branchId: string | undefined): string[] {
  if (!branchId || branchId === "all") return c.branchIds;
  if (!inScope(c, branchId)) throw new ApiError("forbidden", "That branch isn’t one you work in.");
  return [branchId];
}

// ---------- Invoices and payments ----------

const ListQuery = z.object({
  view: z.enum(["invoices", "payments"]).default("invoices"),
  branchId: z.string().optional(),
  status: z.string().optional(),
  q: z.string().trim().max(60).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.number().int().min(1).default(1),
});
export type FinanceListQuery = z.input<typeof ListQuery>;

export interface InvoiceRow { id: string; number: string; memberId: string; memberName: string; branchName: string; issuedOn: string; totalPaise: number; paidPaise: number; duePaise: number; status: Invoice["status"] | "overdue" }
export interface PaymentRow { id: string; receiptNumber?: string; invoiceId: string; invoiceNumber: string; memberId: string; memberName: string; branchName: string; at: string; method: string; amountPaise: number; status: Payment["status"]; reconciliation: Payment["reconciliation"]["status"]; reference?: string }
export interface FinanceList {
  view: "invoices" | "payments";
  today: string;
  /** Money across everything the filters match, not only this page. Billed is what was invoiced; collected is money received (credit notes are not money). */
  totals: { billedPaise: number; collectedPaise: number; creditNotePaise: number; duePaise: number; refundedPaise: number };
  total: number;
  page: number;
  pageSize: number;
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  branches: Array<{ id: string; name: string }>;
}

const PAGE = 25;

export async function getFinanceList(session: Session | null, raw: FinanceListQuery): Promise<FinanceList> {
  const q = ListQuery.parse(raw);
  const c = await openDesk(session, "report.view");
  const branchIds = scope(c, q.branchId);
  for (const b of branchIds) assertInBranch(c, "report.view", b);
  const [branches, members, invoices, payments, refunds] = await Promise.all([
    db.branches.where("tenantId").equals(c.tenantId).toArray(), db.members.where("tenantId").equals(c.tenantId).toArray(),
    db.invoices.where("tenantId").equals(c.tenantId).filter((i) => branchIds.includes(i.branchId)).toArray(),
    db.payments.where("tenantId").equals(c.tenantId).filter((p) => branchIds.includes(p.branchId)).toArray(),
    db.refunds.where("tenantId").equals(c.tenantId).toArray(),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const memberPhone = new Map(members.map((m) => [m.id, m.phone]));
  const byInvoice = new Map<string, Payment[]>();
  for (const p of payments) byInvoice.set(p.invoiceId, [...(byInvoice.get(p.invoiceId) ?? []), p]);
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const needle = q.q?.toLowerCase();
  const matchesText = (...parts: Array<string | undefined>) => !needle || parts.some((x) => x?.toLowerCase().includes(needle));
  const inRange = (date: string) => (!q.from || date >= q.from) && (!q.to || date <= q.to);

  const statusOf = (i: Invoice): InvoiceRow["status"] => (isOverdue(i, byInvoice.get(i.id) ?? [], c.today) ? "overdue" : i.status);
  const invoiceRows = invoices
    .filter((i) => inRange(i.issuedOn) && (!q.status || q.status === "all" || statusOf(i) === q.status) && matchesText(i.number, memberName.get(i.memberId), memberPhone.get(i.memberId)))
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.number.localeCompare(a.number));
  const paymentRows = payments
    .filter((p) => inRange(istDateOf(p.receivedAt)) && (!q.status || q.status === "all" || p.status === q.status) && matchesText(p.receiptNumber, p.reference, invoiceById.get(p.invoiceId)?.number, memberName.get(p.memberId)))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  const live = invoiceRows.filter((i) => i.status !== "void" && i.status !== "draft");
  const paymentsOf = (i: Invoice) => (byInvoice.get(i.id) ?? []).filter((p) => p.status === "succeeded");
  const sumOf = (list: Payment[]) => list.reduce((n, p) => n + p.amountPaise, 0);
  const shownPayments = q.view === "payments" ? paymentRows.filter((p) => p.status === "succeeded") : live.flatMap(paymentsOf);
  const refundedPaise = refunds.filter((r) => shownPayments.some((p) => p.id === r.paymentId)).reduce((n, r) => n + r.amountPaise, 0);
  const totals = {
    billedPaise: live.reduce((n, i) => n + i.totalPaise, 0),
    collectedPaise: sumOf(shownPayments.filter((p) => p.method !== "credit_note")),
    creditNotePaise: sumOf(shownPayments.filter((p) => p.method === "credit_note")),
    duePaise: live.reduce((n, i) => n + amountDuePaise(i, byInvoice.get(i.id) ?? []), 0),
    refundedPaise,
  };
  const list = q.view === "invoices" ? invoiceRows : paymentRows;
  const start = (q.page - 1) * PAGE;
  return {
    view: q.view, today: c.today, totals, total: list.length, page: q.page, pageSize: PAGE, branches: branches.filter((b) => c.branchIds.includes(b.id)).map((b) => ({ id: b.id, name: b.name })),
    invoices: q.view === "invoices" ? invoiceRows.slice(start, start + PAGE).map((i) => ({ id: i.id, number: i.number, memberId: i.memberId, memberName: memberName.get(i.memberId) ?? "Member", branchName: branchName.get(i.branchId) ?? "", issuedOn: i.issuedOn, totalPaise: i.totalPaise, paidPaise: sumOf(paymentsOf(i)), duePaise: amountDuePaise(i, byInvoice.get(i.id) ?? []), status: statusOf(i) })) : [],
    payments: q.view === "payments" ? paymentRows.slice(start, start + PAGE).map((p) => ({ id: p.id, receiptNumber: p.receiptNumber, invoiceId: p.invoiceId, invoiceNumber: invoiceById.get(p.invoiceId)?.number ?? "", memberId: p.memberId, memberName: memberName.get(p.memberId) ?? "Member", branchName: branchName.get(p.branchId) ?? "", at: p.receivedAt, method: p.method, amountPaise: p.amountPaise, status: p.status, reconciliation: p.reconciliation.status, reference: p.reference })) : [],
  };
}

// ---------- Reconciliation ----------

export interface IssueCard {
  key: string;
  kind: ReconIssue["kind"];
  title: string;
  detail: string;
  /** What “Accept” records: the payment or the event finance reviewed. */
  target?: { kind: "payment" | "event"; id: string };
  memberId?: string;
  invoiceNumber?: string;
  amountPaise?: number;
}
export interface SettlementCard { id: string; reference: string; settledOn: string; lines: number; grossPaise: number; feePaise: number; netPaise: number; matched: number; issues: number }
export interface ReconciliationData {
  today: string;
  totals: { onlinePaise: number; matchedPaise: number; flaggedPaise: number; waitingPaise: number };
  settlements: SettlementCard[];
  issues: IssueCard[];
  /** Cash is reconciled by the day close: the last days at the branches, with any variance. */
  cash: Array<{ branchId: string; branchName: string; date: string; expectedPaise: number; countedPaise: number; variancePaise: number; status: "closed" | "reopened" }>;
}

async function loadRecon(c: DeskContext) {
  const [payments, settlements, events] = await Promise.all([
    db.payments.where("tenantId").equals(c.tenantId).filter((p) => c.branchIds.includes(p.branchId)).toArray(),
    db.gatewaySettlements.where("tenantId").equals(c.tenantId).toArray(),
    db.gatewayEvents.where("tenantId").equals(c.tenantId).toArray(),
  ]);
  const own = new Set(payments.map((p) => p.id));
  const visibleEvents = events.filter((e) => own.has(e.paymentId));
  return { payments, settlements, events: visibleEvents, result: reconcile({ payments, settlements, events: visibleEvents, today: c.today }) };
}

export async function getReconciliation(session: Session | null): Promise<ReconciliationData> {
  const c = await openDesk(session, "reconciliation.manage");
  const { payments, settlements, events, result } = await loadRecon(c);
  const [members, invoices, branches, closes] = await Promise.all([db.members.where("tenantId").equals(c.tenantId).toArray(), db.invoices.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.dayCloses.where("tenantId").equals(c.tenantId).toArray()]);
  const name = new Map(members.map((m) => [m.id, m.name]));
  const inv = new Map(invoices.map((i) => [i.id, i]));
  const pay = new Map(payments.map((p) => [p.id, p]));
  const rs = (id: string) => ({ memberId: pay.get(id)?.memberId, invoiceNumber: inv.get(pay.get(id)?.invoiceId ?? "")?.number });
  const rupee = (n: number) => `₹${(n / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const issues: IssueCard[] = result.issues.map((i): IssueCard => {
    if (i.kind === "duplicate_event") return { key: `dup:${i.eventId}`, kind: i.kind, title: `Gateway event delivered ${i.deliveries} times`, detail: `${name.get(pay.get(i.paymentId)?.memberId ?? "") ?? "A member"}’s payment was recorded once. The repeats changed nothing. Accept it once you have looked.`, target: { kind: "event", id: i.eventId }, amountPaise: pay.get(i.paymentId)?.amountPaise, ...rs(i.paymentId) };
    if (i.kind === "amount_differs") return { key: `diff:${i.paymentId}`, kind: i.kind, title: "The payout is a different amount", detail: `Ember took ${rupee(i.paymentPaise)} from ${name.get(pay.get(i.paymentId)?.memberId ?? "") ?? "a member"}. The gateway paid out ${rupee(i.settledPaise)}.`, target: { kind: "payment", id: i.paymentId }, amountPaise: i.paymentPaise - i.settledPaise, ...rs(i.paymentId) };
    if (i.kind === "not_settled") return { key: `unset:${i.paymentId}`, kind: i.kind, title: `No payout after ${i.daysAgo} days`, detail: `${name.get(pay.get(i.paymentId)?.memberId ?? "") ?? "A member"} paid ${rupee(pay.get(i.paymentId)?.amountPaise ?? 0)}, and no gateway payout lists it. Check the gateway dashboard.`, target: { kind: "payment", id: i.paymentId }, amountPaise: pay.get(i.paymentId)?.amountPaise, ...rs(i.paymentId) };
    return { key: `ghost:${i.settlementId}:${i.reference}`, kind: i.kind, title: "A payout line Ember doesn’t know", detail: `${rupee(i.amountPaise)} with reference ${i.reference} is in a payout but there is no payment for it in Ember. Check the gateway dashboard.`, amountPaise: i.amountPaise };
  });
  const issueCount = new Map<string, number>();
  for (const i of result.issues) if ("settlementId" in i) issueCount.set(i.settlementId, (issueCount.get(i.settlementId) ?? 0) + 1);
  const cards = settlements.sort((a, b) => b.settledOn.localeCompare(a.settledOn)).map((s): SettlementCard => {
    const gross = s.lines.reduce((n, l) => n + l.amountPaise, 0);
    return { id: s.id, reference: s.reference, settledOn: s.settledOn, lines: s.lines.length, grossPaise: gross, feePaise: s.feePaise, netPaise: gross - s.feePaise, matched: [...result.statuses.values()].filter((x) => x.settlementId === s.id && x.status === "matched").length, issues: issueCount.get(s.id) ?? 0 };
  });
  void events;
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const cash = closes.filter((d) => c.branchIds.includes(d.branchId)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map((d) => ({ branchId: d.branchId, branchName: branchName.get(d.branchId) ?? "", date: d.date, expectedPaise: d.expectedPaise, countedPaise: d.countedPaise, variancePaise: d.variancePaise, status: d.status }));
  return { today: c.today, totals: result.totals, settlements: cards, issues, cash };
}

/** Writes the matching result onto the payments, so a payment’s status is the same everywhere it is shown. Safe to run again. */
export async function runReconciliation(session: Session | null): Promise<{ matched: number; flagged: number; waiting: number }> {
  const c = await openDesk(session, "reconciliation.manage");
  return db.transaction("rw", db.tables, async () => {
    const { result } = await loadRecon(c);
    let matched = 0, flagged = 0, waiting = 0;
    for (const [id, status] of result.statuses) {
      if (status.status === "matched") matched++; else if (status.status === "flagged") flagged++; else waiting++;
      await db.payments.update(id, { reconciliation: status });
    }
    return { matched, flagged, waiting };
  });
}

const Review = z.object({ kind: z.enum(["payment", "event"]), id: z.string().min(1), note: z.string().trim().min(3, "Say what you checked, so the next person knows.").max(300) });

/** Finance has looked at a flagged payment or a repeated event and accepts it. Recorded with who and why, and audited. */
export async function reviewIssue(session: Session | null, raw: z.input<typeof Review>): Promise<void> {
  const parsed = Review.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the note and try again.");
  const input = parsed.data;
  const c = await openDesk(session, "reconciliation.manage");
  await db.transaction("rw", db.tables, async () => {
    if (input.kind === "payment") {
      const p = await db.payments.get(input.id);
      if (!p || p.tenantId !== c.tenantId || !inScope(c, p.branchId)) throw new ApiError("not_found", "We couldn’t find that payment.");
      await db.payments.update(p.id, { reconciliation: { status: "matched", note: `Accepted: ${input.note}`, settlementId: p.reconciliation.settlementId, reviewedBy: c.principal.userId } });
      await db.auditEvents.add(buildAuditEvent(c.principal, { action: "record.edit", reason: input.note, entityType: "payment", entityId: p.id, memberId: p.memberId, details: { reconciliation: "accepted" } }, rid("ae"), now()));
    } else {
      const e = await db.gatewayEvents.get(input.id);
      const p = e ? await db.payments.get(e.paymentId) : undefined;
      if (!e || e.tenantId !== c.tenantId || !p || !inScope(c, p.branchId)) throw new ApiError("not_found", "We couldn’t find that gateway event.");
      await db.gatewayEvents.update(e.id, { reviewedBy: c.principal.userId, reviewNote: input.note });
      await db.auditEvents.add(buildAuditEvent(c.principal, { action: "record.edit", reason: input.note, entityType: "gateway_event", entityId: e.id, memberId: e.memberId, details: { deliveries: e.deliveries, accepted: true } }, rid("ae"), now()));
    }
  });
}

// ---------- Exports ----------

export const EXPORT_KINDS = {
  invoices: { label: "Invoices", detail: "Every GST invoice: number, date, member, branch, taxable value, GST, total, paid, due and status." },
  payments: { label: "Payments", detail: "Every payment: receipt, date, member, method, amount, status and reconciliation." },
  refunds: { label: "Refunds", detail: "Refunds paid back: date, member, invoice, amount, reason and who approved." },
  credit_notes: { label: "Credit notes", detail: "GST credit notes: number, original invoice, taxable value, GST and total." },
  dues: { label: "Dues", detail: "Invoices with money still owing: due date, days overdue and the amount." },
} as const;
export type ExportKind = keyof typeof EXPORT_KINDS;

const ExportInput = z.object({ kind: z.enum(["invoices", "payments", "refunds", "credit_notes", "dues"]), branchId: z.string().optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
export interface ExportFile { filename: string; csv: string; rows: number; branchNames: string[] }

/** One CSV for the branches the person can see. Carries names and money, never contact details or health records. Writes an audit event. */
export async function createExport(session: Session | null, raw: z.input<typeof ExportInput>): Promise<ExportFile> {
  const parsed = ExportInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Choose what to export.");
  const q = parsed.data;
  const c = await openDesk(session, "report.export");
  const branchIds = scope(c, q.branchId);
  for (const b of branchIds) assertInBranch(c, "report.export", b);
  if (q.from && q.to && q.from > q.to) throw new ApiError("invalid", "The first date is after the last. Swap them.");
  const [branches, members, invoices, payments, refunds, notes] = await Promise.all([
    db.branches.where("tenantId").equals(c.tenantId).toArray(), db.members.where("tenantId").equals(c.tenantId).toArray(),
    db.invoices.where("tenantId").equals(c.tenantId).filter((i) => branchIds.includes(i.branchId)).toArray(), db.payments.where("tenantId").equals(c.tenantId).filter((p) => branchIds.includes(p.branchId)).toArray(),
    db.refunds.where("tenantId").equals(c.tenantId).toArray(), db.creditNotes.where("tenantId").equals(c.tenantId).toArray(),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const inv = new Map(invoices.map((i) => [i.id, i]));
  const pay = new Map(payments.map((p) => [p.id, p]));
  const inRange = (d: string) => (!q.from || d >= q.from) && (!q.to || d <= q.to);
  const byInvoice = new Map<string, Payment[]>();
  for (const p of payments) byInvoice.set(p.invoiceId, [...(byInvoice.get(p.invoiceId) ?? []), p]);
  const paidOf = (i: Invoice) => (byInvoice.get(i.id) ?? []).filter((p) => p.status === "succeeded").reduce((n, p) => n + p.amountPaise, 0);
  let header: string[];
  let rows: Array<Array<string | number | undefined>>;
  switch (q.kind) {
    case "invoices":
      header = ["Invoice number", "Date", "Member id", "Member", "Branch", "Taxable value", "GST", "Total", "Paid", "Due", "Status"];
      rows = invoices.filter((i) => inRange(i.issuedOn)).sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.number.localeCompare(b.number)).map((i) => [i.number, i.issuedOn, i.memberId, memberName.get(i.memberId), branchName.get(i.branchId), rupeesCell(i.subtotalPaise - i.discountPaise), rupeesCell(i.taxPaise), rupeesCell(i.totalPaise), rupeesCell(paidOf(i)), rupeesCell(amountDuePaise(i, byInvoice.get(i.id) ?? [])), i.status]);
      break;
    case "payments":
      header = ["Receipt", "Date", "Invoice number", "Member id", "Member", "Branch", "Method", "Amount", "Status", "Reference", "Reconciliation"];
      rows = payments.filter((p) => inRange(istDateOf(p.receivedAt))).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).map((p) => [p.receiptNumber, istDateOf(p.receivedAt), inv.get(p.invoiceId)?.number, p.memberId, memberName.get(p.memberId), branchName.get(p.branchId), p.method, rupeesCell(p.amountPaise), p.status, p.reference, p.reconciliation.status]);
      break;
    case "refunds":
      header = ["Date", "Invoice number", "Member id", "Member", "Branch", "Amount", "Reason", "Requested by", "Approved by", "Credits taken back"];
      rows = refunds.filter((r) => pay.has(r.paymentId) && inRange(istDateOf(r.createdAt))).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => { const p = pay.get(r.paymentId)!; return [istDateOf(r.createdAt), inv.get(r.invoiceId)?.number, p.memberId, memberName.get(p.memberId), branchName.get(p.branchId), rupeesCell(r.amountPaise), r.reason, r.requestedBy, r.approvedBy, r.creditsReversed]; });
      break;
    case "credit_notes":
      header = ["Credit note number", "Date", "Original invoice", "Member id", "Member", "Branch", "Taxable value", "GST", "Total"];
      rows = notes.filter((n) => inv.has(n.invoiceId) && inRange(n.issuedOn)).sort((a, b) => a.number.localeCompare(b.number)).map((n) => [n.number, n.issuedOn, inv.get(n.invoiceId)?.number, n.memberId, memberName.get(n.memberId), branchName.get(inv.get(n.invoiceId)!.branchId), rupeesCell(n.subtotalPaise), rupeesCell(n.taxPaise), rupeesCell(n.totalPaise)]);
      break;
    case "dues":
      header = ["Invoice number", "Due date", "Days overdue", "Member id", "Member", "Branch", "Total", "Due"];
      rows = invoices.filter((i) => (!q.from && !q.to) || inRange(i.dueOn)).filter((i) => amountDuePaise(i, byInvoice.get(i.id) ?? []) > 0).sort((a, b) => a.dueOn.localeCompare(b.dueOn)).map((i) => [i.number, i.dueOn, Math.max(0, Math.floor((Date.parse(`${c.today}T00:00:00Z`) - Date.parse(`${i.dueOn}T00:00:00Z`)) / 86_400_000)), i.memberId, memberName.get(i.memberId), branchName.get(i.branchId), rupeesCell(i.totalPaise), rupeesCell(amountDuePaise(i, byInvoice.get(i.id) ?? []))]);
      break;
  }
  const names = branchIds.map((b) => branchName.get(b) ?? b);
  await db.auditEvents.add(buildAuditEvent(c.principal, { action: "export.create", entityType: "export", entityId: q.kind, details: { kind: q.kind, rows: rows.length, branches: names, from: q.from, to: q.to } }, rid("ae"), now()));
  return { filename: `ember-${q.kind.replace("_", "-")}-${branchIds.length === 1 ? names[0]!.toLowerCase() : "all-branches"}-${c.today}.csv`, csv: toCsv(header, rows), rows: rows.length, branchNames: names };
}
