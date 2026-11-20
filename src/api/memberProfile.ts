import { db } from "@/demo/db";
import { memberInScope, openDesk } from "@/api/desk";
import { amountDuePaise, isOverdue, isUnpaidCart, paidPaise } from "@/domain/billing";
import { creditBalance, type CreditBalance } from "@/domain/credits";
import { graceDetail, type GraceSource } from "@/domain/checkin";
import { istDateOf } from "@/domain/dates";
import { appStatus, type AppStatus } from "@/domain/memberInvite";
import { assignmentOn, currentMembership } from "@/domain/membership";
import { effectiveStatus, freezeProblem, LIFECYCLE_DEFAULTS, type LifecycleRules } from "@/domain/lifecycle";
import { passCodeFor } from "@/api/newMember";
import type { Booking, CheckIn, Invoice, Membership } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * One member as the front desk and finance see them (M02 to M06): who they are, the membership and what can be done to it today (each action with the
 * reason it can’t, when it can’t), invoices and dues, payments and credit notes, the training-credit ledger, bookings, check-ins, the emails sent, the trainer and
 * their history, and any refund requests. It never contains health information: assessments, photos and trainers’ private notes have no door here.
 */

export interface InvoiceLineView {
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
  /** An upgrade’s credit note applied to it. */
  creditNote?: { number: string; totalPaise: number };
}

export interface Action {
  allowed: boolean;
  reason?: string;
}

export interface MemberProfileData {
  today: string;
  member: {
    id: string;
    name: string;
    firstName: string;
    phone: string;
    email?: string;
    dateOfBirth?: string;
    gender?: string;
    branchId: string;
    branchName: string;
    joinedOn: string;
    leadSource?: string;
    passCode: string;
    /** Other members on this phone number or email. */
    sharing: Array<{ id: string; name: string }>;
  };
  membership?: {
    id: string;
    planName: string;
    kind: Membership["terms"]["kind"];
    status: Membership["status"];
    startsOn: string;
    endsOn?: string;
    visitsRemaining: number | null;
    freezes: Membership["freezes"];
    canceledEffectiveOn?: string;
    cancelReason?: string;
    autoRenew: boolean;
    invoiceNumber?: string;
    /** The grace period this membership has after its end date, where it comes from, and the numbers behind it (M02). */
    grace: { days: number; source: GraceSource; endsOn?: string; planDays?: number; gymDays: number; override?: number };
  };
  /** Whether the member has a login for the app, and when they were invited or joined (S01). */
  app: { status: AppStatus; invitedOn?: string; joinedOn?: string; email?: string };
  waiting: Array<{ id: string; planName: string; status: Membership["status"]; startsOn: string; endsOn?: string }>;
  actions: { freeze: Action; unfreeze: Action; changePlan: Action; cancel: Action; keep: Action; grace: Action };
  rules: LifecycleRules;
  policy: { partialPaymentsEnabled: boolean };
  dues: { totalPaise: number; invoices: number };
  invoices: InvoiceLineView[];
  payments: Array<{ id: string; at: string; invoiceNumber: string; method: string; amountPaise: number; reference?: string; receiptNumber?: string; status: string; by?: string }>;
  creditNotes: Array<{ id: string; number: string; issuedOn: string; totalPaise: number; invoiceNumber: string; appliedTo?: string; reason: string }>;
  credits: { balance: CreditBalance; ledger: Array<{ id: string; at: string; kind: string; credits: number; reason?: string; expiresOn?: string }> };
  bookings: Array<{ id: string; startsAt: string; trainerName: string; status: Booking["status"]; branchName: string }>;
  checkIns: Array<{ id: string; at: string; branchName: string; method: CheckIn["method"]; result: CheckIn["result"]; note?: string }>;
  emails: Array<{ id: string; at: string; subject: string; template: string; status: string; to?: string }>;
  trainer: { current?: { name: string; from: string }; history: Array<{ name: string; from: string; to?: string; by: string; reason?: string }> };
  refundRequests: Array<{ id: string; at: string; amountPaise: number; status: string; reason: string; invoiceNumber: string; decisionNote?: string }>;
}

const rulesOf = (p?: Partial<LifecycleRules>): LifecycleRules => ({ ...LIFECYCLE_DEFAULTS, ...p });

export async function getMemberProfile(session: Session | null, memberId: string): Promise<MemberProfileData> {
  const c = await openDesk(session, "member.read");
  const member = await memberInScope(c, "member.read", memberId);
  const [memberships, invoices, payments, notes, ledger, bookings, checkIns, emails, assignments, users, branches, policy, requests, allMembers] = await Promise.all([
    db.memberships.where("memberId").equals(memberId).toArray(), db.invoices.where("memberId").equals(memberId).toArray(), db.payments.where("memberId").equals(memberId).toArray(),
    db.creditNotes.where("memberId").equals(memberId).toArray(), db.creditLedger.where("memberId").equals(memberId).toArray(), db.bookings.where("memberId").equals(memberId).toArray(),
    db.checkIns.where("memberId").equals(memberId).toArray(), db.emailLog.where("memberId").equals(memberId).toArray(), db.trainerAssignments.where("memberId").equals(memberId).toArray(),
    db.users.where("tenantId").equals(c.tenantId).toArray(), db.branches.where("tenantId").equals(c.tenantId).toArray(), db.gymPolicies.where("tenantId").equals(c.tenantId).first(),
    db.refundRequests.where("memberId").equals(memberId).toArray(), db.members.where("tenantId").equals(c.tenantId).toArray(),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const rules = rulesOf(policy);
  const cur = currentMembership(memberships);
  const status = cur ? effectiveStatus(cur, c.today) : undefined;
  const inv = new Map(invoices.map((i) => [i.id, i]));

  const invoiceViews: InvoiceLineView[] = invoices
    .filter((i) => !isUnpaidCart(i, payments.filter((p) => p.invoiceId === i.id)))
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.number.localeCompare(a.number))
    .map((i) => {
      const mine = payments.filter((p) => p.invoiceId === i.id);
      const cn = notes.find((n) => n.appliedToInvoiceId === i.id);
      return { id: i.id, number: i.number, issuedOn: i.issuedOn, dueOn: i.dueOn, description: i.lines[0]?.description ?? "Invoice", totalPaise: i.totalPaise, paidPaise: paidPaise(mine), duePaise: i.status === "void" ? 0 : amountDuePaise(i, mine), status: i.status, overdue: isOverdue(i, mine, c.today), creditNote: cn && { number: cn.number, totalPaise: cn.totalPaise } };
    });
  const open = invoiceViews.filter((i) => i.duePaise > 0 && i.status !== "void");

  const frozen = status === "frozen";
  const live = status === "active";
  const freezeCheck = cur ? freezeProblem(cur, { from: c.today, to: c.today }, c.today, rules) : "This member has no membership.";
  // The only thing wrong with an immediate freeze of one day is its length; every other reason is a real blocker.
  const freezeBlocked = freezeCheck && !/^A freeze is at (least|most)/.test(freezeCheck) ? freezeCheck : undefined;
  const pendingChange = invoices.some((i) => (i.status === "open" || i.status === "partially_paid") && (i.purpose?.kind === "renewal" || memberships.some((m) => m.id === i.membershipId && m.status === "pending")));
  return {
    today: c.today,
    member: {
      id: member.id, name: member.name, firstName: member.name.split(" ")[0] ?? member.name, phone: member.phone, email: member.email, dateOfBirth: member.dateOfBirth, gender: member.gender, branchId: member.homeBranchId, branchName: branchName.get(member.homeBranchId) ?? "",
      joinedOn: member.joinedOn, leadSource: member.leadSource, passCode: passCodeFor(member.qrToken),
      sharing: allMembers.filter((m) => m.id !== member.id && !m.archivedAt && (m.phone === member.phone || (!!member.email && m.email?.toLowerCase() === member.email.toLowerCase()))).map((m) => ({ id: m.id, name: m.name })),
    },
    membership: cur && status && { id: cur.id, planName: cur.terms.name, kind: cur.terms.kind, status, startsOn: cur.startsOn, endsOn: cur.endsOn, visitsRemaining: cur.visitsRemaining, freezes: cur.freezes, canceledEffectiveOn: cur.canceledEffectiveOn, cancelReason: cur.cancelReason, autoRenew: cur.autoRenew, invoiceNumber: cur.invoiceId ? inv.get(cur.invoiceId)?.number : undefined, grace: { ...graceDetail(cur, policy?.graceDays ?? 0), planDays: cur.terms.graceDays, gymDays: policy?.graceDays ?? 0, override: cur.graceDays } },
    app: { status: appStatus(member), invitedOn: member.appInvite ? istDateOf(member.appInvite.sentAt) : undefined, joinedOn: member.appInvite?.joinedAt ? istDateOf(member.appInvite.joinedAt) : undefined, email: member.email },
    waiting: memberships.filter((m) => m.id !== cur?.id && (m.status === "scheduled" || m.status === "pending")).map((m) => ({ id: m.id, planName: m.terms.name, status: m.status, startsOn: m.startsOn, endsOn: m.endsOn })),
    actions: {
      freeze: freezeBlocked ? { allowed: false, reason: freezeBlocked } : { allowed: !!live, reason: live ? undefined : "Only an active membership can be frozen." },
      unfreeze: { allowed: frozen, reason: frozen ? undefined : "This membership isn’t frozen." },
      changePlan: { allowed: !frozen && !cur?.canceledEffectiveOn && !pendingChange, reason: frozen ? "Frozen. Change the plan once the freeze ends." : cur?.canceledEffectiveOn ? "Being canceled." : pendingChange ? "An invoice for a renewal or upgrade is still open." : undefined },
      cancel: { allowed: !!cur && status !== "canceled" && status !== "expired", reason: !cur ? "No membership." : status === "canceled" ? "Already canceled." : status === "expired" ? "Already ended." : undefined },
      keep: { allowed: !!cur?.canceledEffectiveOn && status !== "canceled", reason: "No cancellation is waiting." },
      grace: { allowed: !!cur && status !== "canceled", reason: "A canceled membership has no grace period." },
    },
    rules, policy: { partialPaymentsEnabled: policy?.partialPaymentsEnabled ?? false }, dues: { totalPaise: open.reduce((n, i) => n + i.duePaise, 0), invoices: open.length },
    invoices: invoiceViews,
    payments: payments.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).map((p) => ({ id: p.id, at: p.receivedAt, invoiceNumber: inv.get(p.invoiceId)?.number ?? "", method: p.method, amountPaise: p.amountPaise, reference: p.reference, receiptNumber: p.receiptNumber, status: p.status, by: p.receivedBy ? name.get(p.receivedBy) : undefined })),
    creditNotes: notes.sort((a, b) => b.issuedOn.localeCompare(a.issuedOn)).map((n) => ({ id: n.id, number: n.number, issuedOn: n.issuedOn, totalPaise: n.totalPaise, invoiceNumber: inv.get(n.invoiceId)?.number ?? "", appliedTo: n.appliedToInvoiceId ? inv.get(n.appliedToInvoiceId)?.number : undefined, reason: n.reason })),
    credits: { balance: creditBalance(ledger), ledger: [...ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map((e) => ({ id: e.id, at: e.createdAt, kind: e.kind, credits: e.credits, reason: e.reason, expiresOn: e.expiresOn })) },
    bookings: bookings.filter((b) => b.kind === "pt_session").sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 12).map((b) => ({ id: b.id, startsAt: b.startsAt, trainerName: name.get(b.trainerId ?? "") ?? "Trainer", status: b.status, branchName: branchName.get(b.branchId) ?? "" })),
    checkIns: checkIns.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15).map((k) => ({ id: k.id, at: k.at, branchName: branchName.get(k.branchId) ?? "", method: k.method, result: k.result, note: k.result === "override" ? k.overrideReason : undefined })),
    emails: emails.sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 12).map((e) => ({ id: e.id, at: e.sentAt, subject: e.subject, template: e.template, status: e.status, to: e.to })),
    trainer: {
      current: ((a) => a && { name: name.get(a.trainerId) ?? "Trainer", from: a.effectiveFrom })(assignmentOn(assignments, c.today)),
      history: [...assignments].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map((a) => ({ name: name.get(a.trainerId) ?? "Trainer", from: a.effectiveFrom, to: a.effectiveTo, by: name.get(a.assignedBy) ?? "Staff", reason: a.reason })),
    },
    refundRequests: requests.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).map((r) => ({ id: r.id, at: r.requestedAt, amountPaise: r.amountPaise, status: r.status, reason: r.reason, invoiceNumber: inv.get(r.invoiceId)?.number ?? "", decisionNote: r.decisionNote })),
  };
}
