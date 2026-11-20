import { TENANT_ID } from "@/app/demoAccounts";
import { invoiceTotals, placeOfSupplyFor } from "@/domain/billing";
import { addDays, istDateTime } from "@/domain/dates";
import type { Branch, Invoice, Member, Membership, Payment, TrainerAssignment } from "@/domain/types";
import { PERSONAS } from "@/demo/personas";
import { hash } from "@/demo/seedPlans";

/**
 * What makes the demo gym look busy to its owner (M4): the sales behind each membership, members who came back, and enough training clients to fill most of a trainer’s week. Nothing
 * here draws from the seed’s random numbers; every choice is a hash of an id, so the rest of the gym is exactly what it was and the same gym comes out every time. The reports read these
 * records through their own definitions (`domain/reports.ts`); a test checks the dashboard’s figures against the records themselves.
 */

const isPersona = (memberId: string) => PERSONAS.some((p) => p.memberId === memberId);

/** The share of members, by branch, who came back for another membership (percent). Bandra is the branch that keeps fewer. */
export const RENEWED_PERCENT: Record<string, number> = { br_andheri: 62, br_powai: 52, br_bandra: 48 };

/**
 * Members who renewed: an earlier, finished membership of the same plan ends the day before the current one starts, for many members whose current membership began in the last
 * month (so it ended inside the dashboard’s default range and counts as renewed). Members whose next membership is still unpaid or was canceled are in the same cohort and are not renewed.
 */
export function addRenewalHistory(input: { today: string; members: Member[]; memberships: Membership[] }): { members: Member[]; memberships: Membership[] } {
  const { today } = input;
  const memberships = [...input.memberships];
  const joined = new Map<string, string>();
  const byMember = new Map(input.members.map((m) => [m.id, m]));
  for (const ms of input.memberships) {
    const m = byMember.get(ms.memberId);
    const waiting = ms.status === "pending" || ms.status === "canceled";
    if (!m || isPersona(m.id) || (ms.status !== "active" && !waiting) || ms.renewsMembershipId || ms.startsOn < addDays(today, -30) || ms.startsOn > today) continue;
    // A renewal that was never paid for (pending) or was canceled does not count as a renewal (O07), so these members make the previous membership a lapse.
    if (hash(`${m.id}renewed`) % 100 >= (waiting ? 85 : (RENEWED_PERCENT[m.homeBranchId] ?? 70))) continue;
    const duration = ms.terms.durationDays ?? 30;
    const end = addDays(ms.startsOn, -1);
    const start = addDays(end, -duration);
    const id = `${ms.id}_prior`;
    memberships.push({
      id, tenantId: TENANT_ID, memberId: m.id, planId: ms.planId, terms: ms.terms, status: "expired", startsOn: start, endsOn: end, visitsRemaining: ms.terms.kind === "visit" ? 0 : null, freezes: [], autoRenew: false, createdAt: `${start}T04:30:00.000Z`,
    });
    joined.set(m.id, start);
    const k = memberships.findIndex((x) => x.id === ms.id);
    memberships[k] = { ...ms, renewsMembershipId: id };
  }
  return { memberships, members: input.members.map((m) => (joined.has(m.id) && joined.get(m.id)! < m.joinedOn ? { ...m, joinedOn: joined.get(m.id)! } : m)) };
}

/** Members who have no trainer yet are given one at the branches where a trainer has far too few clients to fill their week. */
export function addTrainingClients(input: { members: Member[]; memberships: Membership[]; trainerAssignments: TrainerAssignment[]; deskFor: (branchId: string) => string }): TrainerAssignment[] {
  const extra: Array<{ trainerId: string; branchId: string; take: number }> = [
    { trainerId: "u_trainer_vikrant", branchId: "br_andheri", take: 4 },
    { trainerId: "u_trainer_vikrant", branchId: "br_powai", take: 4 },
    { trainerId: "u_trainer_sanjay", branchId: "br_powai", take: 4 },
    { trainerId: "u_trainer_sanjay", branchId: "br_bandra", take: 5 },
    { trainerId: "u_trainer_farah", branchId: "br_bandra", take: 2 },
    { trainerId: "u_trainer_kavya", branchId: "br_powai", take: 3 },
  ];
  const assigned = new Set(input.trainerAssignments.filter((a) => !a.effectiveTo).map((a) => a.memberId));
  const out = [...input.trainerAssignments];
  for (const e of extra) {
    const pool = input.members
      .filter((m) => m.homeBranchId === e.branchId && !assigned.has(m.id) && !isPersona(m.id) && !(e.trainerId === "u_trainer_kavya" && hash(`${m.id}pack`) % 6 === 0) /* Kavya’s list stays the quiet one the trainer tests describe */ && input.memberships.some((x) => x.memberId === m.id && x.status === "active"))
      .sort((a, b) => hash(`${a.id}${e.trainerId}`) - hash(`${b.id}${e.trainerId}`))
      .slice(0, e.take);
    for (const m of pool) {
      assigned.add(m.id);
      out.push({ id: `ta_${m.id}_1`, tenantId: TENANT_ID, memberId: m.id, trainerId: e.trainerId, effectiveFrom: m.joinedOn, assignedBy: input.deskFor(m.homeBranchId) });
    }
  }
  return out;
}

/**
 * The sale behind every membership started in the last four months that the sample members do not already have: an invoice with GST on the day it started, paid in full the same
 * day (cash at the desk, or UPI or card through the gateway). A membership still waiting to start was sold a few days ago. Pending ones have no invoice: nobody has paid or been billed.
 */
export function buildSales(input: { today: string; members: Member[]; memberships: Membership[]; branches: Array<Pick<Branch, "id" | "stateCode">>; deskFor: (branchId: string) => string }): { invoices: Invoice[]; payments: Payment[] } {
  const { today } = input;
  const state = new Map(input.branches.map((b) => [b.id, b.stateCode]));
  const byMember = new Map(input.members.map((m) => [m.id, m]));
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const cutoff = addDays(today, -120);
  const methods: Payment["method"][] = ["cash", "cash", "cash", "upi", "upi", "upi", "upi", "card", "card", "upi"];
  for (const ms of [...input.memberships].sort((a, b) => a.id.localeCompare(b.id))) {
    const m = byMember.get(ms.memberId);
    if (!m || isPersona(m.id) || ms.status === "pending" || ms.status === "canceled" || ms.terms.pricePaise === 0) continue;
    const issuedOn = ms.status === "scheduled" ? addDays(today, -(1 + (hash(ms.id) % 4))) : ms.startsOn;
    if (issuedOn < cutoff || issuedOn > today) continue;
    const lines = [{ description: `${ms.terms.name} membership`, quantity: 1, unitPaise: ms.terms.pricePaise, taxRateBp: ms.terms.taxRateBp }];
    const totals = invoiceTotals(lines);
    const id = `inv_sale_${ms.id}`;
    const method = methods[hash(`${ms.id}pay`) % methods.length]!;
    const online = method !== "cash";
    const minute = String(hash(`${ms.id}min`) % 60).padStart(2, "0");
    const hour = String(9 + (hash(`${ms.id}hr`) % 10)).padStart(2, "0");
    invoices.push({ id, tenantId: TENANT_ID, number: "", memberId: m.id, membershipId: ms.id, branchId: m.homeBranchId, placeOfSupply: placeOfSupplyFor(state.get(m.homeBranchId)!), issuedOn, dueOn: addDays(issuedOn, 3), lines, ...totals, status: "paid", createdAt: istDateTime(issuedOn, `${hour}:${minute}`) });
    const n = payments.length;
    payments.push({
      id: `pay_sale_${ms.id}`, tenantId: TENANT_ID, invoiceId: id, memberId: m.id, branchId: m.homeBranchId, method, amountPaise: totals.totalPaise, status: "succeeded", receivedAt: istDateTime(issuedOn, `${hour}:${minute}`),
      receivedBy: online ? undefined : input.deskFor(m.homeBranchId), receiptNumber: `RCP-2026-${String(1000 + n)}`,
      reference: online ? `${method === "upi" ? "UPI" : "CARD"}${String(100_000_000_000 + (hash(`${ms.id}ref`) % 899_999_999_999))}` : undefined, gatewayEventId: online ? `gw_evt_sale_${ms.id}` : undefined,
      idempotencyKey: `seed-sale-${ms.id}`, reconciliation: { status: "unmatched" },
    });
  }
  return { invoices, payments };
}
