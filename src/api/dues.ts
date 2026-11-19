import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { assertInBranch, openDesk } from "@/api/desk";
import { buildAuditEvent } from "@/domain/audit";
import { amountDuePaise, isOverdue, isUnpaidCart } from "@/domain/billing";
import { addDays, daysBetween, istDateOf } from "@/domain/dates";
import { formatDate, formatRupees } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * Dues (M03, O04): the unpaid and part-paid invoices at the person’s branches, how long each has been overdue, and a reminder that goes to the member by
 * email and is written to the delivery log. A reminder for an invoice can be sent again after `REMINDER_COOLDOWN_DAYS`, so a member is not written to every
 * time someone presses the button. Failed payments (a gateway decline) are listed beside, with why.
 */

export const REMINDER_COOLDOWN_DAYS = 3;

export interface DueRow {
  invoiceId: string;
  number: string;
  memberId: string;
  name: string;
  phone: string;
  branchId: string;
  branchName: string;
  description: string;
  issuedOn: string;
  dueOn: string;
  totalPaise: number;
  duePaise: number;
  /** Days past the due date, or 0 when not yet due. */
  daysOverdue: number;
  partPaid: boolean;
  /** The last reminder, and how many have gone. */
  lastReminderAt?: string;
  reminders: number;
  /** A reminder was sent too recently to send another. */
  coolingUntil?: string;
  hasEmail: boolean;
}

export interface FailedRow {
  paymentId: string;
  memberId: string;
  name: string;
  at: string;
  invoiceNumber: string;
  amountPaise: number;
  method: string;
  reason?: string;
}

export interface DuesData {
  today: string;
  rows: DueRow[];
  totalPaise: number;
  overduePaise: number;
  failed: FailedRow[];
}

export async function getDues(session: Session | null, params: { branchId?: string } = {}): Promise<DuesData> {
  const c = await openDesk(session, "dues.read");
  if (params.branchId) assertInBranch(c, "dues.read", params.branchId);
  const [invoices, payments, members, branches, mail] = await Promise.all([
    db.invoices.where("tenantId").equals(c.tenantId).toArray(), db.payments.where("tenantId").equals(c.tenantId).toArray(), db.members.where("tenantId").equals(c.tenantId).toArray(),
    db.branches.where("tenantId").equals(c.tenantId).toArray(), db.emailLog.where("tenantId").equals(c.tenantId).toArray(),
  ]);
  const mem = new Map(members.map((m) => [m.id, m]));
  const bn = new Map(branches.map((b) => [b.id, b.name]));
  const reminders = mail.filter((e) => e.template === "payment_reminder");
  const rows: DueRow[] = [];
  for (const i of invoices) {
    if ((i.status !== "open" && i.status !== "partially_paid") || !c.branchIds.includes(i.branchId) || (params.branchId && i.branchId !== params.branchId)) continue;
    const mine = payments.filter((p) => p.invoiceId === i.id);
    if (isUnpaidCart(i, mine)) continue;
    const due = amountDuePaise(i, mine);
    const m = mem.get(i.memberId);
    if (due <= 0 || !m) continue;
    const sent = reminders.filter((e) => e.invoiceId === i.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    const last = sent[0]?.sentAt;
    const cooling = last && istDateOf(last) > addDays(c.today, -REMINDER_COOLDOWN_DAYS) ? addDays(istDateOf(last), REMINDER_COOLDOWN_DAYS) : undefined;
    rows.push({
      invoiceId: i.id, number: i.number, memberId: m.id, name: m.name, phone: m.phone, branchId: i.branchId, branchName: bn.get(i.branchId) ?? "", description: i.lines[0]?.description ?? "Invoice", issuedOn: i.issuedOn, dueOn: i.dueOn,
      totalPaise: i.totalPaise, duePaise: due, daysOverdue: isOverdue(i, mine, c.today) ? Math.max(1, daysBetween(i.dueOn, c.today)) : 0, partPaid: i.status === "partially_paid", lastReminderAt: last, reminders: sent.length, coolingUntil: cooling, hasEmail: !!m.email,
    });
  }
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue || b.duePaise - a.duePaise || a.name.localeCompare(b.name));
  const failed: FailedRow[] = payments
    .filter((p) => p.status === "failed" && c.branchIds.includes(p.branchId) && (!params.branchId || p.branchId === params.branchId) && p.receivedAt >= addDays(c.today, -14))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .map((p) => ({ paymentId: p.id, memberId: p.memberId, name: mem.get(p.memberId)?.name ?? "Member", at: p.receivedAt, invoiceNumber: invoices.find((i) => i.id === p.invoiceId)?.number ?? "", amountPaise: p.amountPaise, method: p.method, reason: p.failureReason }));
  return { today: c.today, rows, totalPaise: rows.reduce((n, r) => n + r.duePaise, 0), overduePaise: rows.filter((r) => r.daysOverdue > 0).reduce((n, r) => n + r.duePaise, 0), failed };
}

/** Sends a payment reminder for one invoice by email. Refused if one went in the last few days, or if the invoice has been paid. */
export async function sendReminder(session: Session | null, input: { invoiceId: string }): Promise<{ sentTo?: string; skipped: boolean }> {
  const c = await openDesk(session, "message.send");
  return db.transaction("rw", db.tables, async () => {
    const invoice = await db.invoices.get(input.invoiceId);
    if (!invoice || invoice.tenantId !== c.tenantId || !c.branchIds.includes(invoice.branchId)) throw new ApiError("not_found", "We couldn’t find that invoice. It may belong to another branch.");
    const [payments, member, tenant, earlier] = await Promise.all([db.payments.where("invoiceId").equals(invoice.id).toArray(), db.members.get(invoice.memberId), db.tenants.get(c.tenantId), db.emailLog.where("memberId").equals(invoice.memberId).toArray()]);
    const due = amountDuePaise(invoice, payments);
    if ((invoice.status !== "open" && invoice.status !== "partially_paid") || due <= 0) throw new ApiError("conflict", "This invoice is already paid, so no reminder is needed.");
    const last = earlier.filter((e) => e.template === "payment_reminder" && e.invoiceId === invoice.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    if (last && istDateOf(last.sentAt) > addDays(c.today, -REMINDER_COOLDOWN_DAYS)) throw new ApiError("conflict", `A reminder went on ${formatDate(istDateOf(last.sentAt))}. Another can go from ${formatDate(addDays(istDateOf(last.sentAt), REMINDER_COOLDOWN_DAYS))}.`);
    const first = member?.name.split(" ")[0] ?? "there";
    const overdue = isOverdue(invoice, payments, c.today);
    await db.emailLog.add({
      id: `em_${crypto.randomUUID()}`, tenantId: c.tenantId, memberId: invoice.memberId, invoiceId: invoice.id, template: "payment_reminder", to: member?.email, subject: `${overdue ? "Overdue: " : ""}${formatRupees(due)} is due on invoice ${invoice.number}`,
      body: [`Hi ${first},`, "", `${formatRupees(due)} is ${overdue ? "overdue" : "due"} on invoice ${invoice.number} (due ${formatDate(invoice.dueOn)}).`, "You can pay in the app, or at the front desk.", "", tenant?.name ?? "Your gym"].join("\n"),
      status: member?.email ? "sent" : "skipped", detail: member?.email ? undefined : "No email address on file for this member.", sentAt: c.nowIso,
    });
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "payment.record", reason: "Payment reminder sent", entityType: "invoice", entityId: invoice.id, memberId: invoice.memberId, details: { reminder: true, invoice: invoice.number, duePaise: due } }, `ae_${crypto.randomUUID()}`, now()));
    return { sentTo: member?.email, skipped: !member?.email };
  });
}
