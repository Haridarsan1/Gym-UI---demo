import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Hand, Hourglass, Snowflake, Sun, XCircle } from "lucide-react";
import { useMemberActions, useMemberProfile, useWizardOptions } from "@/api/deskMoreHooks";
import { isApiError } from "@/api/errors";
import { useToast } from "@/design/Toast";
import type { MemberProfileData } from "@/api/memberProfile";
import { useCan } from "@/app/SessionContext";
import { Avatar } from "@/design/Avatar";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { MembershipStatusPill } from "@/design/StatusPills";
import { CancelSheet, ChangePlanSheet, CollectSheet, FreezeSheet, GraceSheet, KeepSheet, RefundRequestSheet, TransferSheet, UnfreezeSheet } from "@/features/desk/member/Sheets";
import { Activity, Billing, Credits, Messages, Trainer } from "@/features/desk/member/Tabs";
import { formatDate, formatRupees } from "@/lib/when";
import { cn } from "@/lib/format";

const TABS = [
  { value: "membership", label: "Membership" },
  { value: "billing", label: "Invoices and payments" },
  { value: "credits", label: "Training credits" },
  { value: "activity", label: "Bookings and check-ins" },
  { value: "trainer", label: "Trainer" },
  { value: "messages", label: "Messages" },
] as const;
type Tab = (typeof TABS)[number]["value"];
type Sheet = "freeze" | "unfreeze" | "change" | "cancel" | "keep" | "collect" | "refund" | "transfer" | "grace" | null;

/**
 * A member at the desk (M02 to M06, T01, A02): the membership and what can be done to it (each action says why it can’t be), billing with dues, credit notes
 * and refund requests, training credits, bookings and check-ins, the trainer and a way to change them, and the emails sent. No health information appears
 * here, and finance sees the same page without the lifecycle buttons it has no permission for. The tab is in the address.
 */
export default function MemberProfile() {
  const { memberId } = useParams();
  const query = useMemberProfile(memberId);
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this member" skeleton={<SkeletonCard label="Loading member" />}>
      {(p) => <Profile p={p} />}
    </QueryBoundary>
  );
}

function Profile({ p }: { p: MemberProfileData }) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "membership";
  // A link from Dues (?collect=invoice) opens the payment sheet straight away.
  const fromLink = params.get("collect");
  const [sheet, setSheet] = useState<Sheet>(fromLink ? "collect" : null);
  const [invoiceId, setInvoiceId] = useState<string | undefined>(fromLink ?? undefined);
  const canManage = useCan()("message.send");
  const canManageMembership = useCan()("membership.manage");
  const { invite } = useMemberActions(p.member.id);
  const toast = useToast();
  const sendInvite = async () => {
    try {
      const r = await invite.mutateAsync({ memberIds: [p.member.id], key: `invite-${crypto.randomUUID()}` });
      toast(r.skipped[0] ? { title: "Not sent", description: r.skipped[0].reason, tone: "error" } : r.failed ? { title: "The email failed", description: "It is in Communications, where it can be retried.", tone: "error" } : { title: "Invitation sent", description: `An email with a link to set up their login went to ${p.app.email}.`, tone: "success" });
    } catch (e) { toast({ title: "Not sent", description: isApiError(e) ? e.message : "Try again.", tone: "error" }); }
  };
  const canPay = useCan()("payment.record");
  const canRefund = useCan()("refund.request");
  const canAssign = useCan()("trainer.assign");
  const m = p.membership;
  const collect = (id?: string) => { setInvoiceId(id); setSheet("collect"); };
  const pick = (t: Tab) => setParams(t === "membership" ? {} : { tab: t }, { replace: true });

  return (
    <article aria-label={`Member ${p.member.name}`} className="space-y-4">
      <header className="clay p-4 sm:p-5">
        <Link to="/desk/members" className="mb-2 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink"><ArrowLeft className="h-5 w-5" aria-hidden="true" />Members</Link>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={p.member.name} className="h-16 w-16 text-xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight lg:text-3xl">{p.member.name}</h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-clay-muted">
              {m && <MembershipStatusPill status={m.status} />}
              <span>{m ? m.planName : "No membership"}</span>
              <span>{p.member.branchName}</span>
              <span>{p.member.phone}{p.member.email ? `, ${p.member.email}` : ""}</span>
              <span data-testid="app-status">{p.app.status === "joined" ? `App: joined${p.app.joinedOn ? ` on ${formatDate(p.app.joinedOn)}` : ""}` : p.app.status === "invited" ? `App: invited on ${formatDate(p.app.invitedOn!)}, not joined yet` : p.app.email ? "App: not invited" : "App: can’t be invited, no email address"}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && p.app.status !== "joined" && <Button3D variant="white" size="md" disabled={invite.isPending || !p.app.email} onClick={() => void sendInvite()}>{p.app.status === "invited" ? "Send app invite again" : "Send app invite"}</Button3D>}
            {canPay && p.dues.totalPaise > 0 && <Button3D variant="ember" size="md" onClick={() => collect()}>Collect {formatRupees(p.dues.totalPaise)}</Button3D>}
            <Button3DLink to="/desk" variant="white" size="md">Check-in</Button3DLink>
          </div>
        </div>
        {p.member.sharing.length > 0 && (
          <p className="mt-3 rounded-2xl bg-clay-lavender px-4 py-2 text-sm">Shares a phone number or email with {p.member.sharing.map((s, i) => <span key={s.id}>{i > 0 ? ", " : ""}<Link to={`/desk/members/${s.id}`} className="font-semibold underline underline-offset-4">{s.name}</Link></span>)}. At login they choose their own profile.</p>
        )}
      </header>

      <div role="tablist" aria-label="Member sections" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => <button key={t.value} role="tab" id={`tab-${t.value}`} aria-selected={t.value === tab} aria-controls="member-panel" type="button" onClick={() => pick(t.value)} className={cn("min-h-[2.75rem] shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold", t.value === tab ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{t.label}</button>)}
      </div>

      <div role="tabpanel" id="member-panel" aria-labelledby={`tab-${tab}`} className="space-y-4">
        {tab === "membership" && <MembershipTab p={p} canManage={canManageMembership} canPay={canPay} canRefund={canRefund} open={setSheet} collect={collect} />}
        {tab === "billing" && <Billing p={p} canPay={canPay} canRefund={canRefund} collect={collect} refund={() => setSheet("refund")} />}
        {tab === "credits" && <Credits p={p} />}
        {tab === "activity" && <Activity p={p} />}
        {tab === "trainer" && <Trainer p={p} canAssign={canAssign} change={() => setSheet("transfer")} />}
        {tab === "messages" && <Messages p={p} />}
      </div>

      {sheet === "freeze" && <FreezeSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "unfreeze" && <UnfreezeSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "change" && <ChangePlanSheet p={p} onClose={() => setSheet(null)} onCollect={(id) => collect(id)} />}
      {sheet === "cancel" && <CancelSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "grace" && p.membership && <GraceSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "keep" && <KeepSheet p={p} onClose={() => setSheet(null)} />}
      {sheet === "collect" && <CollectSheet p={p} invoiceId={invoiceId} onClose={() => setSheet(null)} />}
      {sheet === "refund" && <RefundRequestSheet p={p} source="manual" onClose={() => setSheet(null)} />}
      {sheet === "transfer" && <TransferWrap p={p} onClose={() => setSheet(null)} />}
    </article>
  );
}

function TransferWrap({ p, onClose }: { p: MemberProfileData; onClose: () => void }) {
  const o = useWizardOptions(p.member.branchId);
  return <TransferSheet p={p} trainers={o.data?.trainers ?? []} onClose={onClose} />;
}

function MembershipTab({ p, canManage, canPay, canRefund, open, collect }: { p: MemberProfileData; canManage: boolean; canPay: boolean; canRefund: boolean; open: (s: Sheet) => void; collect: (id?: string) => void }) {
  const m = p.membership;
  const A = p.actions;
  const btn = (label: string, icon: React.ReactNode, sheet: Sheet, a: { allowed: boolean; reason?: string }, variant: "white" | "ember" | "ink" = "white") => (
    <div key={label}>
      <Button3D variant={variant} size="md" disabled={!a.allowed} onClick={() => open(sheet)}>{icon}{label}</Button3D>
      {!a.allowed && a.reason && <p className="mt-1 max-w-[16rem] text-sm text-clay-muted">{a.reason}</p>}
    </div>
  );
  return (
    <>
      <section aria-labelledby="ms-title" className="clay p-4 sm:p-5">
        <h2 id="ms-title" className="text-lg font-bold">Membership</h2>
        {!m ? <p className="mt-2 text-clay-muted">{p.member.firstName} has no membership yet. {canManage && "Choose a plan below to start one."}</p> : (
          <>
            <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-sm text-clay-muted">Plan</dt><dd className="font-bold">{m.planName}</dd></div>
              <div><dt className="text-sm text-clay-muted">Status</dt><dd className="font-bold capitalize">{m.status}</dd></div>
              <div><dt className="text-sm text-clay-muted">Runs</dt><dd className="font-bold">{formatDate(m.startsOn)}{m.endsOn ? ` to ${formatDate(m.endsOn)}` : ""}</dd></div>
              {m.visitsRemaining !== null && <div><dt className="text-sm text-clay-muted">Visits left</dt><dd className="font-bold tabular">{m.visitsRemaining}</dd></div>}
              {m.invoiceNumber && <div><dt className="text-sm text-clay-muted">Bought on invoice</dt><dd className="font-bold">{m.invoiceNumber}</dd></div>}
              <div><dt className="text-sm text-clay-muted">Auto-renew</dt><dd className="font-bold">{m.autoRenew ? "On" : "Off"}</dd></div>
              <div><dt className="text-sm text-clay-muted">Grace after it ends</dt><dd className="font-bold">{m.grace.days === 0 ? "None" : `${m.grace.days} ${m.grace.days === 1 ? "day" : "days"}`}{m.grace.override !== undefined ? <span className="font-normal text-clay-muted"> (set for this member)</span> : m.grace.planDays !== undefined ? <span className="font-normal text-clay-muted"> (plan)</span> : null}</dd></div>
            </dl>
            {m.status === "frozen" && m.freezes.at(-1) && <p className="mt-3 rounded-2xl bg-lilac-100 px-4 py-2 font-semibold text-lilac-700">Frozen {formatDate(m.freezes.at(-1)!.from)} to {m.freezes.at(-1)!.to ? formatDate(m.freezes.at(-1)!.to!) : "until further notice"}: {m.freezes.at(-1)!.reason}</p>}
            {m.canceledEffectiveOn && <p className="mt-3 rounded-2xl bg-status-pending-bg px-4 py-2 font-semibold text-status-pending-fg">{m.status === "canceled" ? "Canceled" : "Being canceled"} from {formatDate(m.canceledEffectiveOn)}{m.cancelReason ? `: ${m.cancelReason}` : ""}. {m.status !== "canceled" && "Access continues until then."}</p>}
          </>
        )}
        {p.waiting.length > 0 && <ul aria-label="Waiting memberships" className="mt-3 space-y-1 text-sm">{p.waiting.map((w) => <li key={w.id}>Then {w.planName}, {w.status === "pending" ? "waiting for payment" : `from ${formatDate(w.startsOn)}`}</li>)}</ul>}
        {canManage && (
          <div className="mt-4 flex flex-wrap items-start gap-3">
            {btn("Renew or change plan", <CalendarClock className="h-4 w-4" aria-hidden="true" />, "change", A.changePlan, "ember")}
            {btn("Freeze", <Snowflake className="h-4 w-4" aria-hidden="true" />, "freeze", A.freeze)}
            {A.unfreeze.allowed && btn("Unfreeze", <Sun className="h-4 w-4" aria-hidden="true" />, "unfreeze", A.unfreeze)}
            {A.keep.allowed && btn("Take the cancellation back", <Hand className="h-4 w-4" aria-hidden="true" />, "keep", A.keep)}
            {btn("Grace period", <Hourglass className="h-4 w-4" aria-hidden="true" />, "grace", A.grace)}
            {btn("Cancel membership", <XCircle className="h-4 w-4" aria-hidden="true" />, "cancel", A.cancel)}
          </div>
        )}
      </section>

      <section aria-labelledby="dues-title" className="clay p-4 sm:p-5">
        <h2 id="dues-title" className="text-lg font-bold">Dues</h2>
        {p.dues.invoices === 0 ? <p className="mt-2 text-clay-muted">Nothing is owed.</p> : (
          <>
            <p className="mt-1">{formatRupees(p.dues.totalPaise)} owed on {p.dues.invoices} {p.dues.invoices === 1 ? "invoice" : "invoices"}.</p>
            <ul aria-label="Open invoices" className="mt-2 space-y-2">
              {p.invoices.filter((i) => i.duePaise > 0 && i.status !== "void").map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-clay-canvas p-3">
                  <span><span className="font-semibold">{i.number}</span> <span className="text-clay-muted">{i.description}</span><span className="block text-sm text-clay-muted">{formatRupees(i.duePaise)} due{i.overdue ? `, overdue since ${formatDate(i.dueOn)}` : ""}{i.creditNote ? `, after credit note ${i.creditNote.number}` : ""}</span></span>
                  {canPay && <Button3D size="md" variant="ember" onClick={() => collect(i.id)}>Collect payment</Button3D>}
                </li>
              ))}
            </ul>
          </>
        )}
        {p.refundRequests.length > 0 && (
          <div className="mt-4"><h3 className="font-bold">Refund requests</h3>
            <ul aria-label="Refund requests" className="mt-1 space-y-1 text-[0.95rem]">{p.refundRequests.map((r) => <li key={r.id}>{formatRupees(r.amountPaise)} on {r.invoiceNumber}: <span className="font-semibold">{r.status === "pending" ? "waiting for finance" : r.status === "approved" ? "approved" : "rejected"}</span>{r.decisionNote ? `, “${r.decisionNote}”` : ""}</li>)}</ul>
          </div>
        )}
        {canRefund && p.invoices.some((i) => i.paidPaise > 0) && <div className="mt-3"><Button3D size="md" variant="white" onClick={() => open("refund")}>Request refund</Button3D></div>}
      </section>
    </>
  );
}
