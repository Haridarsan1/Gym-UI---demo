import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { branchScope, openOwner, type OwnerContext } from "@/api/owner";
import { buildAuditEvent } from "@/domain/audit";
import { amountDuePaise, isOverdue } from "@/domain/billing";
import { creditBalance } from "@/domain/credits";
import { rupeesCell, toCsv } from "@/domain/csv";
import { addDays, daysBetween, eachDay, istDateOf } from "@/domain/dates";
import { effectiveStatus } from "@/domain/lifecycle";
import { EXPIRY_WINDOW_DAYS, heatMap, isActiveOn, money, renewals as renewalCohort, trainerUtilisation, RENEWAL_GRACE_DAYS } from "@/domain/reports";
import type { Session } from "@/app/session";

/**
 * The reports (O06, O07) for the owner and branch managers. Each is a definition in `domain/reports.ts` over the records of the branches this person may see, for a branch (or all of
 * theirs) and a range of dates, and each can be exported as CSV with exactly the rows and columns on screen. Names, ids and money; no phone numbers, emails or health records.
 */

export const REPORTS = {
  memberships: { title: "Memberships", definition: "Active and frozen memberships on the last date of the range, and which end within 14 days." },
  renewals: { title: "Renewals", definition: "Memberships that ended in the range, and whether the member has since started another within 30 days of it ending. The rate is renewed over ended." },
  checkins: { title: "Check-ins", definition: "Visits by day (allowed, allowed with dues and overrides; a repeat scan is not a visit), with turned-away attempts shown apart, and the busiest hour of each day." },
  trainers: { title: "Trainer utilisation", definition: "Coached hours (attended personal-training sessions) against the hours each trainer was available to be booked, less leave." },
  credits: { title: "Training credits", definition: "Per member: credits bought, used and held for booked sessions in the range, and what is left and expires within 14 days." },
  invoices: { title: "Invoices", definition: "Invoices issued in the range, with what was paid and what is still due. Void invoices are left out." },
  collections: { title: "Collections", definition: "Money received in the range (succeeded payments; credit notes are not money), by method, with whether it has been matched to the gateway’s payouts." },
  dues: { title: "Dues", definition: "Every invoice with money still owing today, longest overdue first." },
  refunds: { title: "Refunds", definition: "Refunds paid back and requests waiting or rejected, in the range." },
  cash: { title: "Cash day closes", definition: "The cash counted against the cash expected for each branch and day closed in the range, with the note for any difference." },
} as const;
export type ReportId = keyof typeof REPORTS;
export const REPORT_IDS = Object.keys(REPORTS) as ReportId[];

export type Cell = string | number | null;
export interface Column { key: string; header: string; /** How a number is shown. */ kind?: "rupees" | "percent" | "hours" | "count"; align?: "right" }
export interface ReportQuery { report: string; branchId?: string; from?: string; to?: string }
export interface ReportData {
  id: ReportId;
  title: string;
  definition: string;
  from: string;
  to: string;
  /** The branches the rows are made from. */
  branches: string[];
  summary: Array<{ label: string; value: Cell; kind?: Column["kind"] }>;
  columns: Column[];
  rows: Array<Record<string, Cell>>;
  /** For cash day closes: the days an owner may reopen. */
  reopenable?: Array<{ branchId: string; date: string; label: string }>;
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

async function build(c: OwnerContext, q: ReportQuery): Promise<ReportData> {
  if (!REPORT_IDS.includes(q.report as ReportId)) throw new ApiError("invalid", "Choose a report from the list.");
  if ((q.from !== undefined && !isDate(q.from)) || (q.to !== undefined && !isDate(q.to))) throw new ApiError("invalid", "Choose the dates again.");
  const id = q.report as ReportId;
  const scope = branchScope(c, q.branchId);
  const to = q.to ?? c.today;
  const from = q.from ?? addDays(to, -29);
  if (from > to) throw new ApiError("invalid", "The first date is after the last. Swap them.");
  if (daysBetween(from, to) > 366) throw new ApiError("invalid", "Choose a range of a year or less.");
  const t = c.tenantId;
  const inScope = (b: string) => scope.includes(b);
  const [branches, members, allMemberships, plans, users] = await Promise.all([db.branches.where("tenantId").equals(t).toArray(), db.members.where("tenantId").equals(t).filter((m) => inScope(m.homeBranchId)).toArray(), db.memberships.where("tenantId").equals(t).toArray(), db.membershipPlans.where("tenantId").equals(t).toArray(), db.users.where("tenantId").equals(t).toArray()]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const member = new Map(members.map((m) => [m.id, m]));
  const memberships = allMemberships.filter((m) => member.has(m.memberId));
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const mName = (memberId: string) => member.get(memberId)?.name ?? "Member";
  const mBranch = (memberId: string) => branchName.get(member.get(memberId)?.homeBranchId ?? "") ?? "";
  const base = { id, title: REPORTS[id].title, definition: REPORTS[id].definition, from, to, branches: scope.map((b) => branchName.get(b) ?? b) };
  const out = (summary: ReportData["summary"], columns: Column[], rows: ReportData["rows"], extra: Partial<ReportData> = {}): ReportData => ({ ...base, summary, columns, rows, ...extra });

  switch (id) {
    case "memberships": {
      const rows = memberships.filter((m) => isActiveOn(m, to) || (effectiveStatus(m, to) === "frozen" && m.startsOn <= to)).map((m) => {
        const frozen = effectiveStatus(m, to) === "frozen";
        const left = m.endsOn ? daysBetween(to, m.endsOn) : null;
        return { member: mName(m.memberId), branch: mBranch(m.memberId), plan: planName.get(m.planId) ?? m.terms.name, starts: m.startsOn, ends: m.endsOn ?? "", left, status: frozen ? "Frozen" : left !== null && left <= EXPIRY_WINDOW_DAYS ? "Ending soon" : "Active" };
      }).sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999) || a.member.localeCompare(b.member));
      return out([{ label: "Active", value: rows.filter((r) => r.status !== "Frozen").length, kind: "count" }, { label: "Ending soon", value: rows.filter((r) => r.status === "Ending soon").length, kind: "count" }, { label: "Frozen", value: rows.filter((r) => r.status === "Frozen").length, kind: "count" }], [{ key: "member", header: "Member" }, { key: "branch", header: "Branch" }, { key: "plan", header: "Plan" }, { key: "starts", header: "Starts" }, { key: "ends", header: "Ends" }, { key: "left", header: "Days left", align: "right" }, { key: "status", header: "Status" }], rows);
    }
    case "renewals": {
      const r = renewalCohort(memberships, from, to);
      const cohort = memberships.filter((m) => m.endsOn !== undefined && inRange(m.endsOn, from, to) && !(m.canceledEffectiveOn !== undefined && m.canceledEffectiveOn <= m.endsOn));
      const rows = cohort.map((m) => {
        const next = memberships.filter((x) => x.memberId === m.memberId && x.id !== m.id && x.startsOn > m.startsOn && x.startsOn <= addDays(m.endsOn!, RENEWAL_GRACE_DAYS) && x.status !== "canceled" && x.status !== "pending").sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
        return { member: mName(m.memberId), branch: mBranch(m.memberId), plan: planName.get(m.planId) ?? m.terms.name, ended: m.endsOn!, renewed: next ? "Yes" : "No", renewedOn: next?.startsOn ?? "" };
      }).sort((a, b) => a.ended.localeCompare(b.ended) || a.member.localeCompare(b.member));
      return out([{ label: "Ended in the range", value: r.due, kind: "count" }, { label: "Renewed", value: r.renewed, kind: "count" }, { label: "Renewal rate", value: r.ratePercent, kind: "percent" }], [{ key: "member", header: "Member" }, { key: "branch", header: "Branch" }, { key: "plan", header: "Plan" }, { key: "ended", header: "Ended" }, { key: "renewed", header: "Renewed" }, { key: "renewedOn", header: "New plan starts" }], rows);
    }
    case "checkins": {
      const checkIns = await db.checkIns.where("tenantId").equals(t).filter((x) => inScope(x.branchId) && inRange(istDateOf(x.at), from, to)).toArray();
      const rows = eachDay(from, to).map((date) => {
        const day = checkIns.filter((x) => istDateOf(x.at) === date);
        const h = heatMap(day, date, date);
        const peak = h.peaks[0];
        return { date, visits: h.total, denied: day.filter((x) => x.result === "denied").length, overrides: day.filter((x) => x.result === "override").length, busiest: peak ? `${peak.hour % 12 === 0 ? 12 : peak.hour % 12} ${peak.hour < 12 ? "am" : "pm"}` : "" };
      }).filter((r) => r.visits > 0 || r.denied > 0).reverse();
      const total = heatMap(checkIns, from, to);
      return out([{ label: "Visits", value: total.total, kind: "count" }, { label: "Turned away", value: rows.reduce((n, r) => n + r.denied, 0), kind: "count" }, { label: "Overrides", value: rows.reduce((n, r) => n + r.overrides, 0), kind: "count" }], [{ key: "date", header: "Date" }, { key: "visits", header: "Visits", align: "right" }, { key: "denied", header: "Turned away", align: "right" }, { key: "overrides", header: "Overrides", align: "right" }, { key: "busiest", header: "Busiest hour" }], rows);
    }
    case "trainers": {
      const [bookings, availability, shifts, leave] = await Promise.all([db.bookings.where("tenantId").equals(t).filter((b) => inScope(b.branchId)).toArray(), db.trainerAvailability.where("tenantId").equals(t).toArray(), db.trainerShifts.where("tenantId").equals(t).toArray(), db.trainerLeave.where("tenantId").equals(t).toArray()]);
      const u = trainerUtilisation({ availability, shifts, leave, bookings, branchIds: scope, from, to });
      const rows = u.trainers.map((x) => {
        const mine = bookings.filter((b) => b.trainerId === x.trainerId && b.kind === "pt_session" && inRange(istDateOf(b.startsAt), from, to));
        return { trainer: userName.get(x.trainerId) ?? "Trainer", available: x.availableHours, coached: x.coachedHours, percent: x.percent, attended: mine.filter((b) => b.status === "attended").length, noShows: mine.filter((b) => b.status === "no_show").length };
      }).sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.trainer.localeCompare(b.trainer));
      return out([{ label: "Hours available", value: u.availableHours, kind: "hours" }, { label: "Hours coached", value: u.coachedHours, kind: "hours" }, { label: "Utilisation", value: u.percent, kind: "percent" }], [{ key: "trainer", header: "Trainer" }, { key: "available", header: "Hours available", kind: "hours", align: "right" }, { key: "coached", header: "Hours coached", kind: "hours", align: "right" }, { key: "percent", header: "Utilisation", kind: "percent", align: "right" }, { key: "attended", header: "Attended", align: "right" }, { key: "noShows", header: "No-shows", align: "right" }], rows);
    }
    case "credits": {
      const ledger = (await db.creditLedger.where("tenantId").equals(t).toArray()).filter((e) => member.has(e.memberId));
      const rows = [...member.keys()].map((memberId) => {
        const mine = ledger.filter((e) => e.memberId === memberId);
        if (mine.length === 0) return null;
        const inR = mine.filter((e) => inRange(istDateOf(e.createdAt), from, to));
        const sum = (list: typeof mine, kind: string) => list.filter((e) => e.kind === kind).reduce((n, e) => n + e.credits, 0);
        const bal = creditBalance(mine);
        const expiring = mine.filter((e) => e.kind === "purchase" && e.expiresOn && e.expiresOn >= to && e.expiresOn <= addDays(to, EXPIRY_WINDOW_DAYS)).length > 0 ? bal.available : 0;
        return { member: mName(memberId), branch: mBranch(memberId), bought: sum(inR, "purchase"), used: sum(inR, "consumption"), held: bal.reserved, available: bal.available, expiring };
      }).filter((r): r is NonNullable<typeof r> => r !== null && (r.bought > 0 || r.used > 0 || r.held > 0 || r.available > 0)).sort((a, b) => b.expiring - a.expiring || a.member.localeCompare(b.member));
      return out([{ label: "Bought in range", value: rows.reduce((n, r) => n + r.bought, 0), kind: "count" }, { label: "Used in range", value: rows.reduce((n, r) => n + r.used, 0), kind: "count" }, { label: "Available now", value: rows.reduce((n, r) => n + r.available, 0), kind: "count" }], [{ key: "member", header: "Member" }, { key: "branch", header: "Branch" }, { key: "bought", header: "Bought", align: "right" }, { key: "used", header: "Used", align: "right" }, { key: "held", header: "Held", align: "right" }, { key: "available", header: "Available", align: "right" }, { key: "expiring", header: "Expiring soon", align: "right" }], rows);
    }
    case "invoices": {
      const [invoices, payments] = await Promise.all([db.invoices.where("tenantId").equals(t).filter((i) => inScope(i.branchId)).toArray(), db.payments.where("tenantId").equals(t).filter((p) => inScope(p.branchId)).toArray()]);
      const rows = invoices.filter((i) => i.status !== "void" && i.status !== "draft" && inRange(i.issuedOn, from, to)).map((i) => {
        const mine = payments.filter((p) => p.invoiceId === i.id);
        return { number: i.number, date: i.issuedOn, member: mName(i.memberId), branch: branchName.get(i.branchId) ?? "", total: i.totalPaise, paid: mine.filter((p) => p.status === "succeeded").reduce((n, p) => n + p.amountPaise, 0), due: amountDuePaise(i, mine), status: isOverdue(i, mine, c.today) ? "Overdue" : i.status === "partially_paid" ? "Part paid" : i.status === "paid" ? "Paid" : "Open" };
      }).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
      return out([{ label: "Billed", value: rows.reduce((n, r) => n + r.total, 0), kind: "rupees" }, { label: "Paid so far", value: rows.reduce((n, r) => n + r.paid, 0), kind: "rupees" }, { label: "Still due", value: rows.reduce((n, r) => n + r.due, 0), kind: "rupees" }], [{ key: "number", header: "Invoice" }, { key: "date", header: "Date" }, { key: "member", header: "Member" }, { key: "branch", header: "Branch" }, { key: "total", header: "Total", kind: "rupees", align: "right" }, { key: "paid", header: "Paid", kind: "rupees", align: "right" }, { key: "due", header: "Due", kind: "rupees", align: "right" }, { key: "status", header: "Status" }], rows);
    }
    case "collections": {
      const [payments, invoices, refunds] = await Promise.all([db.payments.where("tenantId").equals(t).filter((p) => inScope(p.branchId)).toArray(), db.invoices.where("tenantId").equals(t).toArray(), db.refunds.where("tenantId").equals(t).toArray()]);
      const num = new Map(invoices.map((i) => [i.id, i.number]));
      const METHOD: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", netbanking: "Net banking", transfer: "Bank transfer", online: "Online" };
      const rows = payments.filter((p) => p.status === "succeeded" && p.method !== "credit_note" && inRange(istDateOf(p.receivedAt), from, to)).map((p) => ({ receipt: p.receiptNumber ?? "", date: istDateOf(p.receivedAt), member: mName(p.memberId), branch: branchName.get(p.branchId) ?? "", invoice: num.get(p.invoiceId) ?? "", method: METHOD[p.method] ?? p.method, amount: p.amountPaise, matching: ["cash", "transfer"].includes(p.method) ? "Not applicable" : p.reconciliation.status === "matched" ? "Matched" : p.reconciliation.status === "flagged" ? "Flagged" : "Waiting for payout" })).sort((a, b) => b.date.localeCompare(a.date) || b.receipt.localeCompare(a.receipt));
      const m = money({ invoices: [], payments, refunds: refunds.filter((r) => payments.some((p) => p.id === r.paymentId)), from, to });
      return out([{ label: "Collected", value: m.collectedPaise, kind: "rupees" }, { label: "Refunded", value: m.refundedPaise, kind: "rupees" }, { label: "Flagged", value: rows.filter((r) => r.matching === "Flagged").length, kind: "count" }], [{ key: "receipt", header: "Receipt" }, { key: "date", header: "Date" }, { key: "member", header: "Member" }, { key: "branch", header: "Branch" }, { key: "invoice", header: "Invoice" }, { key: "method", header: "Method" }, { key: "amount", header: "Amount", kind: "rupees", align: "right" }, { key: "matching", header: "Matching" }], rows);
    }
    case "dues": {
      const [invoices, payments] = await Promise.all([db.invoices.where("tenantId").equals(t).filter((i) => inScope(i.branchId)).toArray(), db.payments.where("tenantId").equals(t).filter((p) => inScope(p.branchId)).toArray()]);
      const rows = invoices.filter((i) => i.status === "open" || i.status === "partially_paid").map((i) => {
        const mine = payments.filter((p) => p.invoiceId === i.id);
        return { number: i.number, member: mName(i.memberId), branch: branchName.get(i.branchId) ?? "", dueOn: i.dueOn, late: isOverdue(i, mine, c.today) ? daysBetween(i.dueOn, c.today) : 0, due: amountDuePaise(i, mine) };
      }).filter((r) => r.due > 0).sort((a, b) => b.late - a.late || b.due - a.due);
      return out([{ label: "Owed", value: rows.reduce((n, r) => n + r.due, 0), kind: "rupees" }, { label: "Overdue", value: rows.filter((r) => r.late > 0).reduce((n, r) => n + r.due, 0), kind: "rupees" }, { label: "Invoices", value: rows.length, kind: "count" }], [{ key: "number", header: "Invoice" }, { key: "member", header: "Member" }, { key: "branch", header: "Branch" }, { key: "dueOn", header: "Due on" }, { key: "late", header: "Days overdue", align: "right" }, { key: "due", header: "Amount due", kind: "rupees", align: "right" }], rows);
    }
    case "refunds": {
      const [refunds, requests, payments, invoices] = await Promise.all([db.refunds.where("tenantId").equals(t).toArray(), db.refundRequests.where("tenantId").equals(t).filter((r) => inScope(r.branchId)).toArray(), db.payments.where("tenantId").equals(t).filter((p) => inScope(p.branchId)).toArray(), db.invoices.where("tenantId").equals(t).toArray()]);
      const num = new Map(invoices.map((i) => [i.id, i.number]));
      const pay = new Map(payments.map((p) => [p.id, p]));
      const paid = refunds.filter((r) => pay.has(r.paymentId) && inRange(istDateOf(r.createdAt), from, to)).map((r) => ({ date: istDateOf(r.createdAt), member: mName(pay.get(r.paymentId)!.memberId), branch: branchName.get(pay.get(r.paymentId)!.branchId) ?? "", invoice: num.get(r.invoiceId) ?? "", amount: r.amountPaise, status: "Refunded", reason: r.reason, by: userName.get(r.approvedBy ?? "") ?? "" }));
      const open = requests.filter((r) => r.status !== "approved" && inRange(istDateOf(r.requestedAt), from, to)).map((r) => ({ date: istDateOf(r.requestedAt), member: mName(r.memberId), branch: branchName.get(r.branchId) ?? "", invoice: num.get(r.invoiceId) ?? "", amount: r.amountPaise, status: r.status === "pending" ? "Waiting for finance" : "Rejected", reason: r.reason, by: userName.get(r.decidedBy ?? "") ?? "" }));
      const rows = [...paid, ...open].sort((a, b) => b.date.localeCompare(a.date));
      return out([{ label: "Refunded", value: paid.reduce((n, r) => n + r.amount, 0), kind: "rupees" }, { label: "Waiting", value: open.filter((r) => r.status === "Waiting for finance").length, kind: "count" }, { label: "Rejected", value: open.filter((r) => r.status === "Rejected").length, kind: "count" }], [{ key: "date", header: "Date" }, { key: "member", header: "Member" }, { key: "branch", header: "Branch" }, { key: "invoice", header: "Invoice" }, { key: "amount", header: "Amount", kind: "rupees", align: "right" }, { key: "status", header: "Status" }, { key: "reason", header: "Reason" }, { key: "by", header: "Decided by" }], rows);
    }
    case "cash": {
      const closes = (await db.dayCloses.where("tenantId").equals(t).toArray()).filter((d) => inScope(d.branchId) && inRange(d.date, from, to)).sort((a, b) => b.date.localeCompare(a.date) || a.branchId.localeCompare(b.branchId));
      const rows = closes.map((d) => ({ date: d.date, branch: branchName.get(d.branchId) ?? "", expected: d.expectedPaise, counted: d.countedPaise, variance: d.variancePaise, status: d.status === "closed" ? "Closed" : "Reopened", note: d.status === "reopened" ? `Reopened by ${userName.get(d.reopenedBy ?? "") ?? "the owner"}: ${d.reopenReason ?? ""}` : d.note ?? "", by: userName.get(d.closedBy) ?? "" }));
      return out([{ label: "Days closed", value: closes.filter((d) => d.status === "closed").length, kind: "count" }, { label: "With a variance", value: closes.filter((d) => d.status === "closed" && d.variancePaise !== 0).length, kind: "count" }, { label: "Net variance", value: closes.filter((d) => d.status === "closed").reduce((n, d) => n + d.variancePaise, 0), kind: "rupees" }], [{ key: "date", header: "Date" }, { key: "branch", header: "Branch" }, { key: "expected", header: "Expected", kind: "rupees", align: "right" }, { key: "counted", header: "Counted", kind: "rupees", align: "right" }, { key: "variance", header: "Variance", kind: "rupees", align: "right" }, { key: "status", header: "Status" }, { key: "note", header: "Note" }, { key: "by", header: "Closed by" }], rows, { reopenable: c.principal.role === "owner" ? closes.filter((d) => d.status === "closed").map((d) => ({ branchId: d.branchId, date: d.date, label: `${branchName.get(d.branchId) ?? ""}, ${d.date}` })) : [] });
    }
  }
}

export async function getReport(session: Session | null, q: ReportQuery): Promise<ReportData> {
  const c = await openOwner(session, "report.view");
  return build(c, q);
}

const cell = (col: Column, v: Cell): string | number => (v === null || v === "" ? "" : col.kind === "rupees" ? rupeesCell(Number(v)) : v);

/** The CSV of exactly what the report shows, for the branches this person may see. Writes an audit event. */
export async function exportReport(session: Session | null, q: ReportQuery): Promise<{ filename: string; csv: string; rows: number }> {
  const c = await openOwner(session, "report.export");
  const r = await build(c, q);
  const csv = toCsv(r.columns.map((x) => x.header), r.rows.map((row) => r.columns.map((col) => cell(col, row[col.key] ?? null))));
  await db.auditEvents.add(buildAuditEvent(c.principal, { action: "export.create", entityType: "export", entityId: r.id, details: { report: r.id, rows: r.rows.length, branches: r.branches, from: r.from, to: r.to } }, `ae_${crypto.randomUUID()}`, now()));
  return { filename: `ember-${r.id}-${r.branches.length === 1 ? r.branches[0]!.toLowerCase() : "all-branches"}-${r.from}-to-${r.to}.csv`, csv, rows: r.rows.length };
}
