import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { ApiError } from "@/api/errors";
import { openMember } from "@/api/member";
import { amountDuePaise, isUnpaidCart } from "@/domain/billing";
import { checkInDecision, enteredOk, whyNotValid, type DenyReason } from "@/domain/checkin";
import { daysBetween } from "@/domain/dates";
import { currentMembership } from "@/domain/membership";
import type { CheckIn, Membership } from "@/domain/types";
import { formatDate } from "@/lib/when";
import type { Session } from "@/app/session";

/**
 * The member’s check-in pass (M05): the code the front desk scans, whether it will open the door, and the last visits. The
 * rules are in `domain/checkin.ts`, shared with the desk.
 */

export interface CheckInView {
  id: string;
  at: string;
  branchName: string;
  result: CheckIn["result"];
  /** In words, for the list. */
  outcome: string;
  /** A visit was used from a visit pass. */
  visitUsed: boolean;
}

export interface PassData {
  today: string;
  nowIso: string;
  name: string;
  gymName: string;
  branchName: string;
  /** The value in the QR code. */
  token: string;
  /** What to print under the name so staff can find the member by eye. */
  memberCode: string;
  ready: boolean;
  headline: string;
  detail: string;
  /** Visit pass: visits left. */
  visitsLeft: number | null;
  recent: CheckInView[];
  /** The most recent time the pass was scanned and let the member in. */
  lastEntry?: { at: string; branchName: string };
}

export function denyText(reason: DenyReason, m: Pick<Membership, "startsOn" | "endsOn"> & { freezeTo?: string } | undefined): string {
  switch (reason) {
    case "no_membership": return "There is no membership on your account. Ask the front desk to set one up.";
    case "pending": return "Your membership starts after your first payment. Pay the open invoice and your pass will work.";
    case "scheduled": return m ? `Your membership starts on ${formatDate(m.startsOn)}.` : "Your membership hasn’t started yet.";
    case "frozen": return m?.freezeTo ? `Your membership is frozen until ${formatDate(m.freezeTo)}. Your pass works again then.` : "Your membership is frozen, so your pass is paused.";
    case "expired": return m?.endsOn ? `Your membership ended on ${formatDate(m.endsOn)}. Renew it and your pass works again.` : "Your membership has ended. Renew it and your pass works again.";
    case "canceled": return "Your membership was canceled. Ask the front desk if you want to rejoin.";
    case "branch": return "Your plan doesn’t cover this branch. The front desk can help.";
    case "no_visits": return "You have used all the visits on your pass. Renew it to come in again.";
  }
}

function outcomeText(c: CheckIn, visitDebited: boolean): string {
  switch (c.result) {
    case "allowed": return visitDebited ? "Checked in, one visit used" : "Checked in";
    case "allowed_with_dues": return "Checked in, a payment is due";
    case "override": return "Checked in by the front desk";
    case "repeat_scan": return "Scanned again, no extra visit used";
    case "denied": return c.message ?? "Not checked in";
  }
}

export async function getPass(session: Session | null): Promise<PassData> {
  const c = await openMember(session);
  assertCan(c.principal, "checkin.read", c.resource);
  assertCan(c.principal, "membership.read", c.resource);
  const [member, tenant, memberships, checkIns, branches, invoices, payments] = await Promise.all([
    db.members.get(c.memberId), db.tenants.get(c.tenantId), db.memberships.where("memberId").equals(c.memberId).toArray(), db.checkIns.where("memberId").equals(c.memberId).toArray(),
    db.branches.where("tenantId").equals(c.tenantId).toArray(), db.invoices.where("memberId").equals(c.memberId).toArray(), db.payments.where("memberId").equals(c.memberId).toArray(),
  ]);
  if (!member) throw new ApiError("not_found", "We couldn’t find your membership record. Ask the front desk.");
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const current = currentMembership(memberships);
  const bad = whyNotValid(current, c.today);
  const freezeTo = current?.freezes.at(-1)?.to;
  const covers = current ? current.terms.branchIds.includes(member.homeBranchId) : false;
  const noVisits = current?.terms.kind === "visit" && (current.visitsRemaining ?? 0) <= 0;
  const reason: DenyReason | undefined = bad?.reason ?? (!covers ? "branch" : noVisits ? "no_visits" : undefined);
  const dues = invoices.filter((i) => (i.status === "open" || i.status === "partially_paid") && !isUnpaidCart(i, payments.filter((p) => p.invoiceId === i.id)) && amountDuePaise(i, payments.filter((p) => p.invoiceId === i.id)) > 0).length;
  const left = current?.endsOn ? daysBetween(c.today, current.endsOn) : undefined;

  const sorted = [...checkIns].sort((a, b) => b.at.localeCompare(a.at));
  const last = sorted.find((x) => enteredOk(x.result) && x.result !== "repeat_scan");
  return {
    today: c.today, nowIso: c.nowIso, name: member.name, gymName: tenant?.name ?? "Your gym", branchName: branchName.get(member.homeBranchId) ?? "", token: member.qrToken,
    memberCode: member.qrToken.replace(/^qr-/, "").replace(/^mem_/, "").toUpperCase().slice(0, 18),
    ready: !reason,
    headline: reason ? "This pass won’t open the door right now" : "Ready to scan",
    detail: reason
      ? denyText(reason, current ? { startsOn: current.startsOn, endsOn: current.endsOn, freezeTo } : undefined)
      : bad === undefined && current?.status !== "active"
        ? "Your pass works."
        : left !== undefined && left <= 7 && left >= 0
          ? `Show this code at the front desk or the door. Your membership ends ${left === 0 ? "today" : `in ${left} ${left === 1 ? "day" : "days"}`}.`
          : `Show this code at the front desk or the door.${dues ? " You have a payment due, which doesn’t stop you coming in." : ""}`,
    visitsLeft: current?.visitsRemaining ?? null,
    recent: sorted.slice(0, 8).map((x) => ({ id: x.id, at: x.at, branchName: branchName.get(x.branchId) ?? "", result: x.result, outcome: outcomeText(x, x.visitDebited), visitUsed: x.visitDebited })),
    lastEntry: last ? { at: last.at, branchName: branchName.get(last.branchId) ?? "" } : undefined,
  };
}

export interface ScanResult {
  result: CheckIn["result"];
  /** In words for the member. */
  message: string;
  at: string;
}

/**
 * Demo control: scan this member’s pass at their branch’s door. Runs the same rules as the front desk, writes the check-in
 * (a repeat inside the scan window is recorded but uses no extra visit), and takes a visit off a visit pass. One transaction.
 */
export async function simulateDoorScan(session: Session | null): Promise<ScanResult> {
  const c = await openMember(session);
  assertCan(c.principal, "checkin.read", c.resource);
  return db.transaction("rw", db.tables, async () => {
    const member = await db.members.get(c.memberId);
    if (!member) throw new ApiError("not_found", "We couldn’t find your membership record. Ask the front desk.");
    const [memberships, recent, invoices, payments, staff] = await Promise.all([
      db.memberships.where("memberId").equals(c.memberId).toArray(), db.checkIns.where("memberId").equals(c.memberId).toArray(), db.invoices.where("memberId").equals(c.memberId).toArray(),
      db.payments.where("memberId").equals(c.memberId).toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray(),
    ]);
    const current = currentMembership(memberships);
    const dues = invoices.some((i) => (i.status === "open" || i.status === "partially_paid") && !isUnpaidCart(i, payments.filter((p) => p.invoiceId === i.id)) && amountDuePaise(i, payments.filter((p) => p.invoiceId === i.id)) > 0);
    const d = checkInDecision({ membership: current, branchId: member.homeBranchId, today: c.today, nowIso: c.nowIso, recent, hasOpenDues: dues });
    const message = d.reason ? denyText(d.reason, current ? { startsOn: current.startsOn, endsOn: current.endsOn, freezeTo: current.freezes.at(-1)?.to } : undefined) : d.result === "repeat_scan" ? "You scanned a moment ago, so no extra visit was used." : "Checked in.";
    const door = staff.find((s) => s.role === "front_desk" && s.branchIds.includes(member.homeBranchId))?.userId ?? staff.find((s) => s.role === "owner")?.userId ?? c.principal.userId;
    await db.checkIns.add({
      id: `ci_${c.memberId}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`, tenantId: c.tenantId, memberId: c.memberId, branchId: member.homeBranchId, membershipId: current?.id, at: c.nowIso, method: "qr",
      result: d.result, message: d.reason ? message : undefined, visitDebited: d.visitDebited, recordedBy: door,
    });
    if (d.visitDebited && current) await db.memberships.update(current.id, { visitsRemaining: Math.max(0, (current.visitsRemaining ?? 1) - 1) });
    return { result: d.result, message, at: c.nowIso };
  });
}
