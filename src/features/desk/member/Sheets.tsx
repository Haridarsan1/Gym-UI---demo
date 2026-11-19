import { useState, type ReactNode } from "react";
import { useCancelPreview, useMemberActions, usePlanChoices } from "@/api/deskHooks";
import type { MemberProfileData } from "@/api/memberProfile";
import type { CancelResult, ChangeResult } from "@/api/lifecycle";
import type { CollectResult } from "@/api/payments";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { useToast } from "@/design/Toast";
import { addDays } from "@/domain/dates";
import { Field, inputClass } from "@/features/trainer/assessment/fields";
import { formatDate, formatRupees } from "@/lib/when";
import { rupeesToPaise } from "@/features/desk/newmember/draft";
import { cn } from "@/lib/format";

const newKey = (p: string) => `${p}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
const Problem = ({ children }: { children?: string }) => (children ? <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{children}</p> : null);
const message = (e: unknown, fallback: string) => (isApiError(e) ? e.message : fallback);

function Frame({ label, title, onClose, children, kind = "confirm" }: { label: string; title: string; onClose: () => void; children: ReactNode; kind?: "confirm" | "panel" }) {
  return (
    <Sheet open onClose={onClose} label={label} kind={kind} className="p-5">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </Sheet>
  );
}

// ── Freeze and unfreeze ─────────────────────────────────────────────────────────────────────────

export function FreezeSheet({ p, onClose }: { p: MemberProfileData; onClose: () => void }) {
  const { freeze } = useMemberActions(p.member.id);
  const toast = useToast();
  const [to, setTo] = useState(addDays(p.today, p.rules.freezeMinDays - 1));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [key] = useState(() => newKey("frz"));
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${p.today}T00:00:00Z`)) / 86_400_000) + 1;
  const m = p.membership!;
  const save = async () => {
    setError(undefined);
    try {
      const r = await freeze.mutateAsync({ memberId: p.member.id, from: p.today, to, reason, key });
      toast({ title: `${p.member.firstName}’s membership is frozen`, description: `${r.frozenDays} days. It now ends ${r.endsOn ? formatDate(r.endsOn) : "later"}.`, tone: "success" });
      onClose();
    } catch (e) {
      setError(message(e, "We couldn’t freeze it. Try again."));
    }
  };
  return (
    <Frame label="Freeze membership" title={`Freeze ${p.member.firstName}’s membership`} onClose={onClose}>
      <p className="mt-1 text-clay-muted">The freeze starts today and access is paused. The end date moves back by the days frozen, so nothing is lost. This gym allows {p.rules.freezeMinDays} to {p.rules.freezeMaxDays} days, up to {p.rules.maxFreezesPerMembership} {p.rules.maxFreezesPerMembership === 1 ? "freeze" : "freezes"} a membership.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Last day of the freeze" htmlFor="fz-to"><input id="fz-to" type="date" value={to} min={addDays(p.today, p.rules.freezeMinDays - 1)} max={addDays(p.today, p.rules.freezeMaxDays - 1)} onChange={(e) => setTo(e.target.value)} className={inputClass} /></Field>
        <Field label="Reason" htmlFor="fz-why"><input id="fz-why" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Travel, injury, exams…" /></Field>
      </div>
      <p className="mt-3 font-semibold">{days} days frozen{m.endsOn ? `, ending ${formatDate(addDays(m.endsOn, days))} instead of ${formatDate(m.endsOn)}` : ""}.</p>
      <Problem>{error}</Problem>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button3D variant="ember" size="lg" className="sm:flex-1" disabled={freeze.isPending} onClick={() => void save()}>{freeze.isPending ? "Saving…" : "Freeze membership"}</Button3D><Button3D variant="white" size="lg" onClick={onClose}>Cancel</Button3D></div>
    </Frame>
  );
}

export function UnfreezeSheet({ p, onClose }: { p: MemberProfileData; onClose: () => void }) {
  const { unfreeze } = useMemberActions(p.member.id);
  const toast = useToast();
  const [error, setError] = useState<string>();
  const save = async () => {
    try {
      const r = await unfreeze.mutateAsync();
      toast({ title: `${p.member.firstName} can come in again`, description: r.unusedDays ? `${r.unusedDays} unused days came off the end date.` : undefined, tone: "success" });
      onClose();
    } catch (e) {
      setError(message(e, "We couldn’t unfreeze it. Try again."));
    }
  };
  return (
    <Frame label="Unfreeze membership" title={`Unfreeze ${p.member.firstName}’s membership?`} onClose={onClose}>
      <p className="mt-1 text-clay-muted">Access returns today. The days of the freeze that were not used come off the end date again.</p>
      <Problem>{error}</Problem>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button3D variant="ember" size="lg" className="sm:flex-1" disabled={unfreeze.isPending} onClick={() => void save()}>Unfreeze now</Button3D><Button3D variant="white" size="lg" onClick={onClose}>Not yet</Button3D></div>
    </Frame>
  );
}

// ── Change plan: renew, upgrade with a credit note, or a cheaper plan at the period end ─────────

export function ChangePlanSheet({ p, onClose, onCollect }: { p: MemberProfileData; onClose: () => void; onCollect: (invoiceId: string) => void }) {
  const choices = usePlanChoices(p.member.id, true);
  const { change } = useMemberActions(p.member.id);
  const [planId, setPlanId] = useState("");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ChangeResult | null>(null);
  const [key] = useState(() => newKey("chg"));
  const save = async () => {
    setError(undefined);
    try {
      setResult(await change.mutateAsync({ memberId: p.member.id, planId, key }));
    } catch (e) {
      setError(message(e, "We couldn’t make the change. Try again."));
    }
  };
  if (result) {
    return (
      <Frame label="Plan change made" title={result.kind === "upgrade" ? "Upgrade made" : result.kind === "at_period_end" ? "Plan change booked" : "Renewal invoice made"} onClose={onClose}>
        <ul className="mt-3 space-y-1">
          <li>Invoice <span className="font-semibold">{result.invoice.number}</span>: {formatRupees(result.invoice.totalPaise)}</li>
          {result.creditNote && <li>GST credit note <span className="font-semibold">{result.creditNote.number}</span> for {formatRupees(result.creditNote.totalPaise)}, linked to invoice {result.creditNote.invoiceNumber} and applied to this invoice</li>}
          <li className="font-bold">{result.invoice.duePaise > 0 ? `${formatRupees(result.invoice.duePaise)} to collect` : "Nothing more to pay"}</li>
          <li className="text-clay-muted">{result.kind === "upgrade" ? "The new plan starts today when the payment is in; until then the current plan carries on." : `The new plan starts on ${formatDate(result.startsOn)} once the invoice is paid.`}</li>
        </ul>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {result.invoice.duePaise > 0 && <Button3D variant="ember" size="lg" className="sm:flex-1" onClick={() => { onClose(); onCollect(result.invoice.id); }}>Collect payment</Button3D>}
          <Button3D variant="white" size="lg" onClick={onClose}>Done</Button3D>
        </div>
      </Frame>
    );
  }
  return (
    <Frame label="Change plan" title={`Renew or change ${p.member.firstName}’s plan`} onClose={onClose} kind="panel">
      <QueryBoundary query={choices} errorTitle="We couldn’t load the plans" skeleton={<SkeletonRows rows={4} />}>
        {(d) =>
          d.blocked ? <p className="mt-3 rounded-2xl bg-status-pending-bg p-4 font-semibold text-status-pending-fg">{d.blocked}</p> : (
            <>
              <p className="mt-1 text-clay-muted">{d.current ? `Now on ${d.current.planName}${d.current.endsOn ? `, to ${formatDate(d.current.endsOn)}` : ""}.` : "No plan yet."} Each choice says what it does and what it costs before you confirm.</p>
              <div role="radiogroup" aria-label="Plan" className="mt-3 space-y-2">
                {d.choices.map((c) => (
                  <button key={c.planId} type="button" role="radio" aria-checked={planId === c.planId} onClick={() => setPlanId(c.planId)} className={cn("w-full cursor-pointer rounded-2xl border-2 p-3 text-left", planId === c.planId ? "border-ember-600 bg-ember-50" : "border-clay-line bg-white hover:bg-clay-canvas")}>
                    <span className="flex items-baseline justify-between gap-3"><span className="font-bold">{c.name}</span><span className="font-semibold tabular">{formatRupees(c.change.totalPaise)}</span></span>
                    <span className="block text-sm font-semibold">{c.change.kind === "upgrade" ? `Upgrade now: pay ${formatRupees(c.change.duePaise)}` : c.change.kind === "at_period_end" ? `Starts ${formatDate(c.change.startsOn)}` : `Renewal, starts ${formatDate(c.change.startsOn)}`}</span>
                    {c.change.credit && <span className="block text-sm text-clay-muted">Credit note for {c.change.credit.unusedDays} of {c.change.credit.totalDays} unused days: {formatRupees(c.change.credit.pretaxPaise)} + {formatRupees(c.change.credit.taxPaise)} GST = {formatRupees(c.change.credit.totalPaise)}</span>}
                    {c.change.reason && <span className="block text-sm text-clay-muted">{c.change.reason}</span>}
                  </button>
                ))}
              </div>
              <Problem>{error}</Problem>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row"><Button3D variant="ember" size="lg" className="sm:flex-1" disabled={!planId || change.isPending} onClick={() => void save()}>{change.isPending ? "Saving…" : "Confirm"}</Button3D><Button3D variant="white" size="lg" onClick={onClose}>Cancel</Button3D></div>
            </>
          )
        }
      </QueryBoundary>
    </Frame>
  );
}

// ── Cancel, with what the member may be eligible for, and “Request refund” ──────────────────────

export function CancelSheet({ p, onClose }: { p: MemberProfileData; onClose: () => void }) {
  const { cancel } = useMemberActions(p.member.id);
  const toast = useToast();
  const [on, setOn] = useState(p.today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<CancelResult | null>(null);
  const [asking, setAsking] = useState(false);
  const preview = useCancelPreview(p.member.id, on, !done && /^\d{4}-\d{2}-\d{2}$/.test(on));
  const save = async () => {
    setError(undefined);
    try {
      const r = await cancel.mutateAsync({ memberId: p.member.id, effectiveOn: on, reason });
      setDone(r);
      toast({ title: `${p.member.firstName}’s membership is canceled`, description: r.takesEffectNow ? "Access has ended." : `Access continues until ${formatDate(r.effectiveOn)}.`, tone: "success" });
    } catch (e) {
      setError(message(e, "We couldn’t cancel it. Try again."));
    }
  };
  if (done) {
    return (
      <Frame label="Membership canceled" title="Membership canceled" onClose={onClose}>
        <p className="mt-2">{done.takesEffectNow ? "Access has ended." : `Access continues until ${formatDate(done.effectiveOn)}, then it ends.`}</p>
        <div className="mt-3 rounded-2xl bg-clay-lavender p-4">
          <p className="font-bold">{done.eligible.amountPaise > 0 ? `${p.member.firstName} may be eligible for ${formatRupees(done.eligible.amountPaise)}` : "No refund is due under the gym’s policy"}</p>
          <p className="text-sm text-clay-muted">{done.eligible.explanation} Nothing is refunded automatically: a refund is asked for here and approved by finance.</p>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {done.eligible.amountPaise > 0 && done.eligible.invoiceId && <Button3D variant="ember" size="lg" className="sm:flex-1" onClick={() => setAsking(true)}>Request refund</Button3D>}
          <Button3D variant="white" size="lg" onClick={onClose}>Done</Button3D>
        </div>
        {asking && <RefundRequestSheet p={p} invoiceId={done.eligible.invoiceId!} amountPaise={done.eligible.amountPaise} reason={`Cancellation: ${reason.trim()}`} source="cancellation" onClose={() => setAsking(false)} />}
      </Frame>
    );
  }
  const e = preview.data;
  return (
    <Frame label="Cancel membership" title={`Cancel ${p.member.firstName}’s membership`} onClose={onClose}>
      <p className="mt-1 text-clay-muted">Access continues until the date you choose. Nothing is refunded automatically.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Takes effect on" htmlFor="cn-on" hint="Today, or a later day while the membership runs."><input id="cn-on" type="date" value={on} min={p.today} max={p.membership?.endsOn} onChange={(x) => setOn(x.target.value)} className={inputClass} /></Field>
        <Field label="Reason" htmlFor="cn-why" hint="Kept with the membership and audited."><input id="cn-why" value={reason} onChange={(x) => setReason(x.target.value)} className={inputClass} /></Field>
      </div>
      {e && (
        <div className="mt-3 rounded-2xl bg-clay-lavender p-4" aria-live="polite">
          <p className="font-bold">{e.amountPaise > 0 ? `May be eligible for ${formatRupees(e.amountPaise)} under policy` : "No refund is due under the gym’s policy"}</p>
          <p className="text-sm text-clay-muted">{e.explanation}{e.invoiceNumber ? ` Paid on invoice ${e.invoiceNumber}.` : ""}</p>
        </div>
      )}
      <Problem>{error}</Problem>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button3D variant="ink" size="lg" className="sm:flex-1" disabled={cancel.isPending} onClick={() => void save()}>{cancel.isPending ? "Saving…" : "Cancel membership"}</Button3D><Button3D variant="white" size="lg" onClick={onClose}>Keep membership</Button3D></div>
    </Frame>
  );
}

export function KeepSheet({ p, onClose }: { p: MemberProfileData; onClose: () => void }) {
  const { keep } = useMemberActions(p.member.id);
  const toast = useToast();
  const [error, setError] = useState<string>();
  return (
    <Frame label="Keep membership" title="Take the cancellation back?" onClose={onClose}>
      <p className="mt-1 text-clay-muted">{p.member.firstName}’s membership was set to end on {p.membership?.canceledEffectiveOn ? formatDate(p.membership.canceledEffectiveOn) : "a later date"}. Taking it back keeps it running.</p>
      <Problem>{error}</Problem>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button3D variant="ember" size="lg" className="sm:flex-1" onClick={() => keep.mutateAsync().then(() => { toast({ title: "Cancellation taken back", tone: "success" }); onClose(); }).catch((e) => setError(message(e, "We couldn’t do that.")))}>Keep the membership</Button3D><Button3D variant="white" size="lg" onClick={onClose}>Close</Button3D></div>
    </Frame>
  );
}

// ── Request refund ──────────────────────────────────────────────────────────────────────────────

export function RefundRequestSheet({ p, invoiceId, amountPaise, reason: initial, source, onClose }: { p: MemberProfileData; invoiceId?: string; amountPaise?: number; reason?: string; source: "cancellation" | "manual"; onClose: () => void }) {
  const { requestRefund } = useMemberActions(p.member.id);
  const toast = useToast();
  const paid = p.invoices.filter((i) => i.paidPaise > 0);
  const [inv, setInv] = useState(invoiceId ?? paid[0]?.id ?? "");
  const [amount, setAmount] = useState(amountPaise ? String(amountPaise / 100) : "");
  const [reason, setReason] = useState(initial ?? "");
  const [error, setError] = useState<string>();
  const [key] = useState(() => newKey("rq"));
  const save = async () => {
    const paise = rupeesToPaise(amount);
    if (!paise) return setError("Enter the amount to refund in rupees.");
    setError(undefined);
    try {
      await requestRefund.mutateAsync({ memberId: p.member.id, invoiceId: inv, amountPaise: paise, reason, source, key });
      toast({ title: "Refund requested", description: "Finance will approve or reject it. You will see the answer on the member’s profile.", tone: "success" });
      onClose();
    } catch (e) {
      setError(message(e, "We couldn’t send the request. Try again."));
    }
  };
  return (
    <Frame label="Request refund" title={`Request a refund for ${p.member.firstName}`} onClose={onClose}>
      <p className="mt-1 text-clay-muted">The front desk can’t approve refunds. This goes to finance with the member, invoice, amount and reason.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Invoice" htmlFor="rq-inv"><select id="rq-inv" value={inv} onChange={(e) => setInv(e.target.value)} className={inputClass}>{paid.map((i) => <option key={i.id} value={i.id}>{i.number}, paid {formatRupees(i.paidPaise)}</option>)}</select></Field>
        <Field label="Amount (₹)" htmlFor="rq-amt"><input id="rq-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></Field>
      </div>
      <Field label="Reason" htmlFor="rq-why"><textarea id="rq-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={cn(inputClass, "py-2")} /></Field>
      <Problem>{error}</Problem>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button3D variant="ember" size="lg" className="sm:flex-1" disabled={requestRefund.isPending} onClick={() => void save()}>{requestRefund.isPending ? "Sending…" : "Send to finance"}</Button3D><Button3D variant="white" size="lg" onClick={onClose}>Cancel</Button3D></div>
    </Frame>
  );
}

// ── Collect payment (also used by the Collect payment screen) ───────────────────────────────────

const METHODS = [{ v: "cash", l: "Cash" }, { v: "upi", l: "UPI" }, { v: "card", l: "Card" }, { v: "transfer", l: "Bank transfer" }] as const;

export function CollectSheet({ p, invoiceId, onClose }: { p: MemberProfileData; invoiceId?: string; onClose: () => void }) {
  const { collect } = useMemberActions(p.member.id);
  const open = p.invoices.filter((i) => i.duePaise > 0 && i.status !== "void");
  const [inv, setInv] = useState(invoiceId && open.some((i) => i.id === invoiceId) ? invoiceId : (open[0]?.id ?? ""));
  const chosen = open.find((i) => i.id === inv);
  const [method, setMethod] = useState<"cash" | "upi" | "card" | "transfer">("cash");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<CollectResult | null>(null);
  const [key] = useState(() => newKey("pay"));
  const due = chosen?.duePaise ?? 0;
  const save = async () => {
    const paise = rupeesToPaise(amount === "" ? String(due / 100) : amount);
    if (!paise || !chosen) return setError("Enter the amount received in rupees.");
    setError(undefined);
    try {
      setDone(await collect.mutateAsync({ invoiceId: chosen.id, method, amountPaise: paise, reference: ref, key }));
    } catch (e) {
      setError(message(e, "We couldn’t record the payment. Nothing was saved. Try again."));
    }
  };
  if (done) {
    return (
      <Frame label="Payment recorded" title="Payment recorded" onClose={onClose}>
        <ul className="mt-3 space-y-1">
          <li>{formatRupees(done.amountPaise)} received for invoice <span className="font-semibold">{done.invoice.number}</span></li>
          <li>Receipt <span className="font-semibold">{done.receiptNumber}</span>{done.emailedTo ? `, emailed to ${done.emailedTo}` : ", not emailed (no address)"}</li>
          <li className="font-bold">{done.invoice.duePaise > 0 ? `${formatRupees(done.invoice.duePaise)} still due` : "Paid in full"}</li>
          {done.effects.membership && <li className="rounded-2xl bg-status-active-bg p-3 font-semibold text-status-active-fg">{done.effects.kind === "upgrade" ? "Upgrade started" : done.effects.kind === "renewal" ? "Renewal booked" : "Membership started"}: {done.effects.membership.planName}, {done.effects.membership.status === "active" ? "active" : "starts"} {formatDate(done.effects.membership.startsOn)}</li>}
          {done.effects.sessionsAdded && <li className="rounded-2xl bg-status-active-bg p-3 font-semibold text-status-active-fg">{done.effects.sessionsAdded} training sessions added</li>}
        </ul>
        <div className="mt-5 flex"><Button3D variant="ember" size="lg" onClick={onClose}>Done</Button3D></div>
      </Frame>
    );
  }
  return (
    <Frame label="Collect payment" title={`Collect a payment from ${p.member.firstName}`} onClose={onClose}>
      {open.length === 0 ? <p className="mt-3 text-clay-muted">There is nothing to collect. Every invoice is paid.</p> : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Invoice" htmlFor="co-inv"><select id="co-inv" value={inv} onChange={(e) => { setInv(e.target.value); setAmount(""); }} className={inputClass}>{open.map((i) => <option key={i.id} value={i.id}>{i.number}, {formatRupees(i.duePaise)} due</option>)}</select></Field>
            <Field label="Amount received (₹)" htmlFor="co-amt" hint={p.policy.partialPaymentsEnabled ? "Less than the amount due is a part payment." : "This gym takes the full amount at once."}><input id="co-amt" inputMode="decimal" value={amount === "" ? String(due / 100) : amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></Field>
          </div>
          <div role="radiogroup" aria-label="Payment method" className="mt-4 flex flex-wrap gap-2">
            {METHODS.map((m) => <button key={m.v} type="button" role="radio" aria-checked={method === m.v} onClick={() => setMethod(m.v)} className={cn("min-h-[2.75rem] cursor-pointer rounded-full px-5 font-semibold", method === m.v ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{m.l}</button>)}
          </div>
          {method !== "cash" && <div className="mt-3"><Field label={method === "upi" ? "UPI reference" : method === "card" ? "Card slip number or last 4 digits" : "Transfer reference"} htmlFor="co-ref"><input id="co-ref" value={ref} onChange={(e) => setRef(e.target.value)} className={inputClass} autoComplete="off" /></Field></div>}
          <Problem>{error}</Problem>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button3D variant="ember" size="lg" className="sm:flex-1" disabled={collect.isPending} onClick={() => void save()}>{collect.isPending ? "Saving…" : "Record payment"}</Button3D><Button3D variant="white" size="lg" onClick={onClose}>Cancel</Button3D></div>
        </>
      )}
    </Frame>
  );
}

// ── Change trainer (A02) ────────────────────────────────────────────────────────────────────────

export function TransferSheet({ p, trainers, onClose }: { p: MemberProfileData; trainers: Array<{ id: string; name: string }>; onClose: () => void }) {
  const { transfer } = useMemberActions(p.member.id);
  const toast = useToast();
  const [to, setTo] = useState("");
  const [on, setOn] = useState(p.today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const save = async () => {
    setError(undefined);
    try {
      await transfer.mutateAsync({ memberId: p.member.id, toTrainerId: to, effectiveOn: on, reason });
      toast({ title: "Trainer changed", description: `${trainers.find((t) => t.id === to)?.name} has ${p.member.firstName} from ${formatDate(on)}. What the earlier trainer wrote keeps its author.`, tone: "success" });
      onClose();
    } catch (e) {
      setError(message(e, "We couldn’t change the trainer. Try again."));
    }
  };
  return (
    <Frame label="Change trainer" title={`Change ${p.member.firstName}’s trainer`} onClose={onClose}>
      <p className="mt-1 text-clay-muted">The old assignment ends the day before. The new trainer sees the plans, logs and shared reviews with their authors; the earlier trainer loses access; private notes stay with the trainer who wrote them.</p>
      <div role="radiogroup" aria-label="New trainer" className="mt-3 grid gap-2 sm:grid-cols-2">
        {trainers.filter((t) => t.name !== p.trainer.current?.name).map((t) => <button key={t.id} type="button" role="radio" aria-checked={to === t.id} onClick={() => setTo(t.id)} className={cn("min-h-[2.75rem] cursor-pointer rounded-2xl border-2 p-3 text-left font-semibold", to === t.id ? "border-ember-600 bg-ember-50" : "border-clay-line bg-white hover:bg-clay-canvas")}>{t.name}</button>)}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="tr-on"><input id="tr-on" type="date" value={on} min={p.today} onChange={(e) => setOn(e.target.value)} className={inputClass} /></Field>
        <Field label="Reason" htmlFor="tr-why"><input id="tr-why" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></Field>
      </div>
      <Problem>{error}</Problem>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button3D variant="ember" size="lg" className="sm:flex-1" disabled={!to || transfer.isPending} onClick={() => void save()}>{transfer.isPending ? "Saving…" : "Change trainer"}</Button3D><Button3D variant="white" size="lg" onClick={onClose}>Cancel</Button3D></div>
    </Frame>
  );
}
