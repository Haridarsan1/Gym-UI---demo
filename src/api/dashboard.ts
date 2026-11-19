import { db } from "@/demo/db";
import { ApiError } from "@/api/errors";
import { branchScope, openOwner } from "@/api/owner";
import { addDays, daysBetween } from "@/domain/dates";
import { dues, heatMap, membershipCounts, money, renewals, trainerUtilisation, weeklyMoney, EXPIRY_WINDOW_DAYS, type Dues, type HeatMap, type MembershipCounts, type Money, type Renewals } from "@/domain/reports";
import type { Session } from "@/app/session";

/**
 * The owner’s and branch manager’s dashboard (O06, O07). Every number is made by `domain/reports.ts` from the records of the branches this person may see, so a branch manager’s
 * dashboard is built only from their own branches whatever they ask for. The range defaults to the last 30 days.
 */

/** Checked by hand rather than with Zod, so the owner’s first screen doesn’t download the schema library. */
export interface DashboardQuery { branchId?: string; from?: string; to?: string }
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export interface Alert { kind: "expiring" | "overdue" | "refunds_waiting" | "flagged_payments" | "cash_variance"; text: string; detail: string; report: string }

export interface DashboardData {
  today: string;
  from: string;
  to: string;
  branches: Array<{ id: string; name: string }>;
  /** The branches the numbers are made from: the one chosen, or every branch this person may see. */
  scope: string[];
  money: Money;
  weekly: Array<{ week: string; billedPaise: number; collectedPaise: number }>;
  dues: Dues;
  memberships: MembershipCounts;
  expiryWindowDays: number;
  renewals: Renewals;
  heat: HeatMap;
  utilisation: { trainers: Array<{ trainerId: string; name: string; availableHours: number; coachedHours: number; percent: number | null }>; availableHours: number; coachedHours: number; percent: number | null };
  alerts: Alert[];
}

export async function getDashboard(session: Session | null, raw: DashboardQuery = {}): Promise<DashboardData> {
  if ((raw.from !== undefined && !isDate(raw.from)) || (raw.to !== undefined && !isDate(raw.to)) || (raw.branchId !== undefined && typeof raw.branchId !== "string")) throw new ApiError("invalid", "Choose the dates again.");
  const q = raw;
  const c = await openOwner(session, "dashboard.view");
  const scope = branchScope(c, q.branchId);
  const to = q.to ?? c.today;
  const from = q.from ?? addDays(to, -29);
  if (from > to) throw new ApiError("invalid", "The first date is after the last. Swap them.");
  if (daysBetween(from, to) > 366) throw new ApiError("invalid", "Choose a range of a year or less.");

  const inScope = (id: string) => scope.includes(id);
  const [branches, members, allMemberships, invoices, payments, refunds, checkIns, bookings, availability, shifts, leave, users, requests, closes] = await Promise.all([
    db.branches.where("tenantId").equals(c.tenantId).toArray(), db.members.where("tenantId").equals(c.tenantId).filter((m) => inScope(m.homeBranchId)).toArray(), db.memberships.where("tenantId").equals(c.tenantId).toArray(),
    db.invoices.where("tenantId").equals(c.tenantId).filter((i) => inScope(i.branchId)).toArray(), db.payments.where("tenantId").equals(c.tenantId).filter((p) => inScope(p.branchId)).toArray(),
    db.refunds.where("tenantId").equals(c.tenantId).toArray(), db.checkIns.where("tenantId").equals(c.tenantId).filter((x) => inScope(x.branchId)).toArray(),
    db.bookings.where("tenantId").equals(c.tenantId).filter((b) => inScope(b.branchId)).toArray(), db.trainerAvailability.where("tenantId").equals(c.tenantId).toArray(),
    db.trainerShifts.where("tenantId").equals(c.tenantId).toArray(), db.trainerLeave.where("tenantId").equals(c.tenantId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray(),
    db.refundRequests.where("tenantId").equals(c.tenantId).filter((r) => inScope(r.branchId) && r.status === "pending").toArray(), db.dayCloses.where("tenantId").equals(c.tenantId).filter((d) => inScope(d.branchId)).toArray(),
  ]);
  const memberIds = new Set(members.map((m) => m.id));
  const memberships = allMemberships.filter((m) => memberIds.has(m.memberId));
  const paymentIds = new Set(payments.map((p) => p.id));
  const scopedRefunds = refunds.filter((r) => paymentIds.has(r.paymentId));

  const range = { from, to };
  const m = money({ invoices, payments, refunds: scopedRefunds, ...range });
  const d = dues(invoices, payments, c.today);
  const counts = membershipCounts(memberships, c.today);
  const ren = renewals(memberships, from, to);
  const heat = heatMap(checkIns, from, to);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const u = trainerUtilisation({ availability, shifts, leave, bookings, branchIds: scope, ...range });
  const flagged = payments.filter((p) => p.reconciliation.status === "flagged" && !p.reconciliation.reviewedBy).length;
  const variances = closes.filter((x) => x.status === "closed" && x.variancePaise !== 0 && x.date >= addDays(c.today, -14)).length;
  const alerts: Alert[] = [];
  if (counts.expiring > 0) alerts.push({ kind: "expiring", text: `${counts.expiring} ${counts.expiring === 1 ? "membership ends" : "memberships end"} within ${EXPIRY_WINDOW_DAYS} days`, detail: "Ask them to renew before it lapses.", report: "memberships" });
  if (d.overdueInvoices > 0) alerts.push({ kind: "overdue", text: `${d.overdueInvoices} overdue ${d.overdueInvoices === 1 ? "invoice" : "invoices"}`, detail: "See who owes and since when.", report: "dues" });
  if (requests.length > 0) alerts.push({ kind: "refunds_waiting", text: `${requests.length} refund ${requests.length === 1 ? "request is" : "requests are"} waiting for a decision`, detail: "Finance decides them; see the amounts and reasons.", report: "refunds" });
  if (flagged > 0) alerts.push({ kind: "flagged_payments", text: `${flagged} online ${flagged === 1 ? "payment doesn’t" : "payments don’t"} match the gateway’s payouts`, detail: "Finance is working through them.", report: "collections" });
  if (variances > 0) alerts.push({ kind: "cash_variance", text: `${variances} cash ${variances === 1 ? "day was" : "days were"} closed with a variance in the last two weeks`, detail: "Check the note on each.", report: "cash" });

  return {
    today: c.today, from, to, branches: branches.filter((b) => c.branchIds.includes(b.id)).map((b) => ({ id: b.id, name: b.name })), scope,
    money: m, weekly: weeklyMoney({ invoices, payments, refunds: scopedRefunds, ...range }), dues: d, memberships: counts, expiryWindowDays: EXPIRY_WINDOW_DAYS, renewals: ren, heat,
    utilisation: { ...u, trainers: u.trainers.map((t) => ({ ...t, name: name.get(t.trainerId) ?? "Trainer" })).sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.name.localeCompare(b.name)) }, alerts,
  };
}
