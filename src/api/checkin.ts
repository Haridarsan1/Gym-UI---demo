import { db } from "@/demo/db";
import { assertCan } from "@/api/context";
import { ApiError } from "@/api/errors";
import { assertInBranch, memberInScope, openDesk, type DeskContext } from "@/api/desk";
import { buildAuditEvent } from "@/domain/audit";
import { now } from "@/api/clock";
import { checkInDecision, enteredOk, staffDenyText, type DenyReason } from "@/domain/checkin";
import { amountDuePaise, isUnpaidCart } from "@/domain/billing";
import { policiesFor } from "@/api/policies";
import { istDateOf } from "@/domain/dates";
import { currentMembership } from "@/domain/membership";
import type { CheckIn, Member } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Check-in at the front desk (M05). Search for a member or scan their QR code; the same rules as the member’s pass (`domain/checkin.ts`)
 * decide, the answer is worked out from local data so it is on screen in well under a second, and every attempt is recorded. A second
 * scan inside the scan window is a repeat: recorded, let through, no extra visit used. A denied member can be let in by an override,
 * which needs a reason and the person’s own permission, and is audited. Everything is limited to the person’s own branches.
 */

export interface MemberHit {
  memberId: string;
  name: string;
  phone?: string;
  branchName: string;
  planName?: string;
  status?: string;
}

const digits = (s: string) => s.replace(/\D/g, "");

/** Members at the desk’s branches whose name, phone or code matches. Needs two characters. */
export async function searchMembers(session: Session | null, query: string): Promise<MemberHit[]> {
  const c = await openDesk(session, "checkin.record");
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const [members, branches, memberships] = await Promise.all([db.members.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.memberships.where("tenantId").equals(c.tenantId).toArray()]);
  const bn = new Map(branches.map((b) => [b.id, b.name]));
  const d = digits(q);
  const hits = members
    .filter((m) => !m.archivedAt && c.branchIds.includes(m.homeBranchId))
    .filter((m) => m.name.toLowerCase().includes(q) || (d.length >= 3 && digits(m.phone).includes(d)) || m.qrToken.toLowerCase().includes(q) || m.id.toLowerCase() === q)
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, 8);
  return hits.map((m) => {
    const cur = currentMembership(memberships.filter((x) => x.memberId === m.id));
    return { memberId: m.id, name: m.name, phone: m.phone, branchName: bn.get(m.homeBranchId) ?? "", planName: cur?.terms.name, status: cur?.status };
  });
}

export interface CheckInOutcome {
  checkInId: string;
  memberId: string;
  name: string;
  firstName: string;
  branchId: string;
  branchName: string;
  result: CheckIn["result"];
  reason?: DenyReason;
  /** The one line the desk reads out or shows: “Checked in”, “Already checked in at 5:42 pm”, “Not checked in”. */
  headline: string;
  /** In words for the desk: why, and what to do next. */
  detail: string;
  planName?: string;
  validTo?: string;
  visitsLeft: number | null;
  /** Open dues (not a cart the member never paid): the amount, and how many invoices. Dues don’t stop entry. */
  dues?: { amountPaise: number; invoices: number };
  /** The membership has run out and the member got in on the grace period. */
  inGrace: boolean;
  at: string;
  /** For a repeat scan: when they were let in the first time. */
  firstAt?: string;
  /** This person may override a denial. */
  canOverride: boolean;
  /** An override let them in. */
  overriddenBy?: string;
  repeated: boolean;
}

/** What a check-in needs. Checked by hand rather than with Zod: this is the desk’s hot path, and the schema library would be downloaded just to open the screen. */
export interface CheckInInput {
  memberId?: string;
  /** What a scanned QR code says. */
  token?: string;
  branchId: string;
  method: "qr" | "desk";
  /** One per attempt, so a double tap or a retry makes one check-in. */
  key: string;
}

const text = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.length >= min && v.length <= max;
const bad = () => new ApiError("invalid", "We couldn’t read that. Try again.");
function parse(raw: CheckInInput): CheckInInput {
  if (!text(raw?.branchId, 1, 80) || !text(raw.key, 8, 120) || (raw.method !== "qr" && raw.method !== "desk")) throw bad();
  if (raw.memberId !== undefined && !text(raw.memberId, 1, 80)) throw bad();
  if (raw.token !== undefined && !text(raw.token, 8, 120)) throw bad();
  return raw;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());

async function outcomeFor(_c: DeskContext, row: CheckIn, member: Member, canOverride: boolean, repeated: boolean): Promise<CheckInOutcome> {
  const [memberships, invoices, payments, branch, users] = await Promise.all([
    db.memberships.where("memberId").equals(member.id).toArray(), db.invoices.where("memberId").equals(member.id).toArray(), db.payments.where("memberId").equals(member.id).toArray(),
    db.branches.get(row.branchId), row.overriddenBy ? db.users.get(row.overriddenBy) : Promise.resolve(undefined),
  ]);
  const cur = currentMembership(memberships);
  const owed = invoices.filter((i) => (i.status === "open" || i.status === "partially_paid") && !isUnpaidCart(i, payments.filter((p) => p.invoiceId === i.id)));
  const dueAmounts = owed.map((i) => amountDuePaise(i, payments.filter((p) => p.invoiceId === i.id))).filter((n) => n > 0);
  const first = member.name.split(" ")[0] ?? member.name;
  const earlier = (await db.checkIns.where("memberId").equals(member.id).toArray()).filter((x) => x.id !== row.id && enteredOk(x.result) && x.result !== "repeat_scan" && x.branchId === row.branchId && Date.parse(x.at) <= Date.parse(row.at)).sort((a, b) => b.at.localeCompare(a.at))[0];
  const over = !!cur && cur.endsOn !== undefined && cur.endsOn < istDateOf(row.at);
  const reason = (row.message ? (/^reason:(\w+)/.exec(row.message)?.[1] as DenyReason | undefined) : undefined);
  const headline =
    row.result === "allowed" ? "Checked in" : row.result === "allowed_with_dues" ? "Checked in, a payment is due" : row.result === "override" ? "Checked in by override" : row.result === "repeat_scan" ? `Already checked in at ${timeOf(earlier?.at ?? row.at)}` : "Not checked in";
  let detail: string;
  if (row.result === "denied") detail = staffDenyText(reason ?? "no_membership", first, cur ? { startsOn: cur.startsOn, endsOn: cur.endsOn, freezeTo: cur.freezes.at(-1)?.to } : undefined);
  else if (row.result === "repeat_scan") detail = `${first} was let in a moment ago. No extra visit was used.`;
  else if (row.result === "override") detail = `${users?.name ?? "A staff member"} let ${first} in${row.overrideReason ? `: “${row.overrideReason}”` : ""}. No visit was used.`;
  else if (row.result === "allowed_with_dues") detail = `${first} can come in. They owe ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(dueAmounts.reduce((a, b) => a + b, 0) / 100)}; collect it when you can.`;
  else detail = over ? `${first}’s membership ended${cur?.endsOn ? ` on ${cur.endsOn}` : ""}; they came in on the grace period. Ask them to renew.` : row.visitDebited ? `${first} is in. One visit used.` : `${first} is in.`;
  return {
    checkInId: row.id, memberId: member.id, name: member.name, firstName: first, branchId: row.branchId, branchName: branch?.name ?? "", result: row.result, reason, headline, detail,
    planName: cur?.terms.name, validTo: cur?.endsOn, visitsLeft: cur?.terms.kind === "visit" ? (cur.visitsRemaining ?? 0) : null,
    dues: dueAmounts.length ? { amountPaise: dueAmounts.reduce((a, b) => a + b, 0), invoices: dueAmounts.length } : undefined, inGrace: (row.result === "allowed" || row.result === "allowed_with_dues") && over, at: row.at,
    firstAt: row.result === "repeat_scan" ? earlier?.at : undefined, canOverride: canOverride && row.result === "denied", overriddenBy: users?.name, repeated,
  };
}

const canOverrideNow = (c: DeskContext, branchId: string) => {
  try {
    assertCan(c.principal, "checkin.override", { tenantId: c.tenantId, branchId });
    return true;
  } catch {
    return false;
  }
};

/**
 * Checks a member in at a branch. The result is recorded (a denial too, so the desk can see who was turned away), a visit is taken off
 * a visit pass, and the same key again returns the same result without a second record or a second visit.
 */
export async function checkInMember(session: Session | null, raw: CheckInInput): Promise<CheckInOutcome> {
  const input = parse(raw);
  const c = await openDesk(session, "checkin.record");
  assertInBranch(c, "checkin.record", input.branchId);
  if (!input.memberId && !input.token) throw new ApiError("invalid", "Choose a member or scan a pass.");
  return db.transaction("rw", db.tables, async () => {
    const id = `ci_${input.key}`;
    const again = await db.checkIns.get(id);
    let member: Member | undefined;
    if (input.token) member = (await db.members.where("tenantId").equals(c.tenantId).toArray()).find((m) => m.qrToken === input.token);
    else member = await db.members.get(input.memberId!);
    if (!member || member.tenantId !== c.tenantId || member.archivedAt) throw new ApiError("not_found", input.token ? "That pass isn’t one of this gym’s. Search for the member instead." : "We couldn’t find this member.");
    if (again) return outcomeFor(c, again, member, canOverrideNow(c, again.branchId), true);
    const [memberships, recent, invoices, payments] = await Promise.all([
      db.memberships.where("memberId").equals(member.id).toArray(), db.checkIns.where("memberId").equals(member.id).toArray(), db.invoices.where("memberId").equals(member.id).toArray(), db.payments.where("memberId").equals(member.id).toArray(),
    ]);
    const cur = currentMembership(memberships);
    const dues = invoices.some((i) => (i.status === "open" || i.status === "partially_paid") && !isUnpaidCart(i, payments.filter((p) => p.invoiceId === i.id)) && amountDuePaise(i, payments.filter((p) => p.invoiceId === i.id)) > 0);
    const policy = await policiesFor(c.tenantId);
    const d = checkInDecision({ membership: cur, branchId: input.branchId, today: c.today, nowIso: c.nowIso, recent, hasOpenDues: dues, scanWindowMinutes: policy.repeatScanWindowMinutes, gymGraceDays: policy.graceDays });
    const row: CheckIn = {
      id, tenantId: c.tenantId, memberId: member.id, branchId: input.branchId, membershipId: cur?.id, at: c.nowIso, method: input.method, result: d.result,
      message: d.reason ? `reason:${d.reason}` : undefined, visitDebited: d.visitDebited, recordedBy: c.principal.userId,
    };
    await db.checkIns.add(row);
    if (d.visitDebited && cur) await db.memberships.update(cur.id, { visitsRemaining: Math.max(0, (cur.visitsRemaining ?? 1) - 1) });
    return outcomeFor(c, row, member, canOverrideNow(c, input.branchId), false);
  });
}

export interface OverrideInput {
  checkInId: string;
  reason: string;
  key: string;
}

/**
 * Lets a turned-away member in anyway. Needs the person’s own override permission (set by the owner) and a reason, which is kept and
 * audited. It is a new check-in beside the denial, so the record shows both. It uses no visit.
 */
export async function overrideCheckIn(session: Session | null, raw: OverrideInput): Promise<CheckInOutcome> {
  if (!text(raw?.checkInId, 1, 120) || typeof raw.reason !== "string" || !text(raw.key, 8, 120)) throw bad();
  const input = raw;
  const c = await openDesk(session, "checkin.override");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new ApiError("invalid", "Say why you are letting them in. The reason is kept and audited.");
  return db.transaction("rw", db.tables, async () => {
    const id = `ci_${input.key}`;
    const denied = await db.checkIns.get(input.checkInId);
    if (!denied || denied.tenantId !== c.tenantId) throw new ApiError("not_found", "We couldn’t find that check-in.");
    assertInBranch(c, "checkin.override", denied.branchId);
    const member = await memberInScope(c, "checkin.record", denied.memberId);
    const prior = await db.checkIns.get(id);
    if (prior) return outcomeFor(c, prior, member, false, true);
    const cap = c.principal.limits?.maxOverridesPerDay;
    if (cap != null) {
      const used = (await db.checkIns.where("tenantId").equals(c.tenantId).filter((x) => x.result === "override" && x.recordedBy === c.principal.userId && istDateOf(x.at) === c.today).toArray()).length;
      if (used >= cap) throw new ApiError("forbidden", `You have used your ${cap} ${cap === 1 ? "override" : "overrides"} for today. Ask a manager to let ${member.name.split(" ")[0]} in.`);
    }
    if (denied.result !== "denied") throw new ApiError("conflict", "That check-in wasn’t turned away, so there is nothing to override.");
    const row: CheckIn = { id, tenantId: c.tenantId, memberId: member.id, branchId: denied.branchId, membershipId: denied.membershipId, at: c.nowIso, method: "desk", result: "override", message: denied.message, visitDebited: false, recordedBy: c.principal.userId, overriddenBy: c.principal.userId, overrideReason: reason };
    await db.checkIns.add(row);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "checkin.override", reason, entityType: "check_in", entityId: id, memberId: member.id, details: { denied: denied.message?.replace("reason:", "") ?? null, branchId: denied.branchId } }, `ae_${crypto.randomUUID()}`, now()));
    return outcomeFor(c, row, member, false, false);
  });
}

export interface TodayRow {
  id: string;
  memberId: string;
  name: string;
  at: string;
  result: CheckIn["result"];
  method: CheckIn["method"];
  /** Why they were turned away, or the override reason, in words. */
  note?: string;
  by: string;
}

export interface TodayData {
  today: string;
  branchName: string;
  /** Members who got in (repeats and overrides included, once each). */
  entered: number;
  denied: number;
  overrides: number;
  rows: TodayRow[];
}

/** Today’s check-ins at one branch, newest first: who, when, how, the result, and who recorded it. */
export async function getTodayCheckIns(session: Session | null, branchId: string): Promise<TodayData> {
  const c = await openDesk(session, "checkin.read");
  assertInBranch(c, "checkin.read", branchId);
  const [rows, members, users, branch] = await Promise.all([db.checkIns.where("tenantId").equals(c.tenantId).toArray(), db.members.where("tenantId").equals(c.tenantId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray(), db.branches.get(branchId)]);
  const name = new Map(members.map((m) => [m.id, m.name]));
  const staff = new Map(users.map((u) => [u.id, u.name]));
  const mine = rows.filter((r) => r.branchId === branchId && istDateOf(r.at) === c.today).sort((a, b) => b.at.localeCompare(a.at));
  return {
    today: c.today, branchName: branch?.name ?? "",
    entered: new Set(mine.filter((r) => enteredOk(r.result)).map((r) => r.memberId)).size, denied: mine.filter((r) => r.result === "denied").length, overrides: mine.filter((r) => r.result === "override").length,
    rows: mine.slice(0, 60).map((r) => ({
      id: r.id, memberId: r.memberId, name: name.get(r.memberId) ?? "Member", at: r.at, result: r.result, method: r.method, by: r.method === "qr" && r.recordedBy ? (staff.get(r.recordedBy) ?? "Staff") : (staff.get(r.recordedBy) ?? "Staff"),
      note: r.result === "override" ? r.overrideReason : r.result === "denied" ? (r.message ?? "").replace("reason:", "").replace(/_/g, " ") : undefined,
    })),
  };
}
