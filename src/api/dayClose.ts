import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { assertInBranch, openDesk, type DeskContext } from "@/api/desk";
import { buildAuditEvent } from "@/domain/audit";
import { cashVariance, closeProblem, expectedCash } from "@/domain/dayClose";
import { istDateOf } from "@/domain/dates";
import type { DayClose, Payment } from "@/domain/types";
import { formatDate } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * The cash day close (M3). Counting the drawer for one branch and day: what Ember expects (cash taken, less cash handed back), what was counted, the variance and a note.
 * Closing locks that day’s cash records: no cash payment or cash refund can be added to it, and a correction is a new entry on a day that is open. Only the owner reopens a
 * closed day, with a reason. Both are audited.
 */

const rid = (p: string) => `${p}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
export const dayCloseId = (branchId: string, date: string) => `dc_${branchId}_${date}`;

/** Called inside the transaction that records cash. Refuses it when that branch’s day is closed. */
export async function assertDayOpen(branchId: string, date: string): Promise<void> {
  const row = await db.dayCloses.get(dayCloseId(branchId, date));
  if (row?.status === "closed") throw new ApiError("conflict", `Cash for ${formatDate(date)} is closed. Record this on a day that is open, or ask the owner to reopen ${formatDate(date)}.`);
}

export interface CashLine { id: string; at: string; memberName: string; label: string; amountPaise: number; receipt?: string }
export interface DayCloseData {
  date: string;
  today: string;
  branch: { id: string; name: string };
  receivedPaise: number;
  refundedPaise: number;
  expectedPaise: number;
  payments: CashLine[];
  refunds: CashLine[];
  close?: DayClose;
  /** The last closes at this branch, newest first. */
  history: DayClose[];
  canClose: boolean;
  canReopen: boolean;
}

const Query = z.object({ branchId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

async function cashOf(c: DeskContext, branchId: string, date: string) {
  const [payments, allRefunds, members] = await Promise.all([
    db.payments.where("tenantId").equals(c.tenantId).filter((p) => p.branchId === branchId && p.method === "cash" && istDateOf(p.receivedAt) === date).toArray(),
    db.refunds.where("tenantId").equals(c.tenantId).filter((r) => istDateOf(r.createdAt) === date).toArray(),
    db.members.where("homeBranchId").equals(branchId).toArray(),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const paid = new Map<string, Payment>();
  for (const r of allRefunds) { const p = await db.payments.get(r.paymentId); if (p) paid.set(r.paymentId, p); }
  const refunds = allRefunds.filter((r) => paid.get(r.paymentId)?.method === "cash" && paid.get(r.paymentId)?.branchId === branchId);
  const sum = expectedCash(branchId, date, payments, refunds.map((r) => ({ amountPaise: r.amountPaise, method: "cash", status: r.status, createdAt: r.createdAt, branchId })));
  return { payments, refunds, names, paid, sum };
}

export async function getDayClose(session: Session | null, raw: z.input<typeof Query>): Promise<DayCloseData> {
  const q = Query.parse(raw);
  const c = await openDesk(session, "cash.close");
  assertInBranch(c, "cash.close", q.branchId);
  const branch = await db.branches.get(q.branchId);
  if (!branch || branch.tenantId !== c.tenantId) throw new ApiError("not_found", "We couldn’t find that branch.");
  const date = q.date ?? c.today;
  const { payments, refunds, names, paid, sum } = await cashOf(c, q.branchId, date);
  const history = (await db.dayCloses.where("branchId").equals(q.branchId).toArray()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  return {
    date, today: c.today, branch: { id: branch.id, name: branch.name }, receivedPaise: sum.receivedPaise, refundedPaise: sum.refundedPaise, expectedPaise: sum.expectedPaise,
    payments: payments.filter((p) => p.status === "succeeded").sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).map((p) => ({ id: p.id, at: p.receivedAt, memberName: names.get(p.memberId) ?? "Member", label: "Cash received", amountPaise: p.amountPaise, receipt: p.receiptNumber })),
    refunds: refunds.map((r) => ({ id: r.id, at: r.createdAt, memberName: names.get(paid.get(r.paymentId)!.memberId) ?? "Member", label: "Cash refunded", amountPaise: r.amountPaise })),
    close: history.find((h) => h.date === date), history, canClose: true, canReopen: c.principal.role === "owner",
  };
}

const Close = z.object({ branchId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), countedPaise: z.number().int(), note: z.string().trim().max(300).default("") });
export type CloseInput = z.input<typeof Close>;

export async function closeDay(session: Session | null, raw: CloseInput): Promise<DayClose> {
  const parsed = Close.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Enter the cash you counted, in rupees.");
  const input = parsed.data;
  const c = await openDesk(session, "cash.close");
  assertInBranch(c, "cash.close", input.branchId);
  return db.transaction("rw", db.tables, async () => {
    const id = dayCloseId(input.branchId, input.date);
    const existing = await db.dayCloses.get(id);
    if (existing?.status === "closed") return existing; // closing twice changes nothing
    const { sum } = await cashOf(c, input.branchId, input.date);
    const problem = closeProblem({ countedPaise: input.countedPaise, expectedPaise: sum.expectedPaise, note: input.note, date: input.date, today: c.today });
    if (problem) throw new ApiError("invalid", problem);
    const row: DayClose = { id, tenantId: c.tenantId, branchId: input.branchId, date: input.date, status: "closed", expectedPaise: sum.expectedPaise, countedPaise: input.countedPaise, variancePaise: cashVariance(sum.expectedPaise, input.countedPaise), note: input.note || undefined, closedBy: c.principal.userId, closedAt: c.nowIso };
    await db.dayCloses.put(row);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "dayclose.close", reason: input.note || undefined, entityType: "day_close", entityId: id, details: { branchId: input.branchId, date: input.date, expectedPaise: row.expectedPaise, countedPaise: row.countedPaise, variancePaise: row.variancePaise } }, rid("ae"), now()));
    return row;
  });
}

const Reopen = z.object({ branchId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(3, "Say why the day is being reopened.") });

/** Only the owner. A reopened day takes cash again, and is closed again with a new count. */
export async function reopenDay(session: Session | null, raw: z.input<typeof Reopen>): Promise<DayClose> {
  const parsed = Reopen.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Say why the day is being reopened.");
  const input = parsed.data;
  const c = await openDesk(session, "cash.reopen");
  assertInBranch(c, "cash.reopen", input.branchId);
  return db.transaction("rw", db.tables, async () => {
    const id = dayCloseId(input.branchId, input.date);
    const row = await db.dayCloses.get(id);
    if (!row || row.tenantId !== c.tenantId) throw new ApiError("not_found", "That day hasn’t been closed.");
    if (row.status === "reopened") return row;
    const next: DayClose = { ...row, status: "reopened", reopenedBy: c.principal.userId, reopenedAt: c.nowIso, reopenReason: input.reason };
    await db.dayCloses.put(next);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "dayclose.reopen", reason: input.reason, entityType: "day_close", entityId: id, details: { branchId: input.branchId, date: input.date, earlierVariancePaise: row.variancePaise } }, rid("ae"), now()));
    return next;
  });
}

