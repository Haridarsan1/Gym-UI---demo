import { useState } from "react";
import { ArrowLeft, Check, LifeBuoy, Minus } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAdminActions, useTenant } from "@/api/adminHooks";
import type { TenantDetail as Detail } from "@/api/platform";
import { isApiError } from "@/api/errors";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { Field, inputClass } from "@/design/Field";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { HealthPill, TenantStatePill } from "@/design/StatusPills";
import { useToast } from "@/design/Toast";
import { STATE_LABEL, STATE_RULES, FEATURE_LABEL } from "@/domain/subscription";
import { istDateOf } from "@/domain/dates";
import { cn } from "@/lib/format";
import { formatDate, formatRupees, formatTime } from "@/lib/when";
import { OnboardingBar } from "@/features/admin/Tenants";

const STATES = ["trial", "paid", "past_due", "suspended", "canceled"] as const;

/**
 * One gym as an account (R01, S01, S02): its plan and limits, what it uses, what it is entitled to, its billing dates and Ember’s software invoices to it (separate from what its members pay it),
 * its set-up, requests for another plan and the support access there has been. State changes need a reason, which the gym’s owner can read in their own audit log.
 */
export default function TenantDetail() {
  const { tenantId = "" } = useParams();
  const query = useTenant(tenantId);
  return (
    <div className="max-w-6xl space-y-5">
      <Link to="/admin" className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink"><ArrowLeft className="h-5 w-5" aria-hidden="true" />Tenants</Link>
      <QueryBoundary query={query} errorTitle="We couldn’t load this gym" skeleton={<SkeletonRows rows={6} />}>{(d) => <Loaded d={d} />}</QueryBoundary>
    </div>
  );
}

function Loaded({ d }: { d: Detail }) {
  const a = useAdminActions();
  const toast = useToast();
  const [state, setState] = useState<(typeof STATES)[number] | "">("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [planId, setPlanId] = useState(d.plan.id);
  const [stateKey] = useState(() => `state-${crypto.randomUUID()}`);
  const fail = (e: unknown) => toast({ title: "Not done", description: isApiError(e) ? e.message : "Try again.", tone: "error" });
  const changeState = async () => {
    if (!state) return;
    setError(undefined);
    try { await a.setState.mutateAsync({ key: `${stateKey}-${state}`, tenantId: d.id, state, reason }); toast({ title: `Now ${STATE_LABEL[state].toLowerCase()}`, description: "The gym’s app follows at once, and its owner can read the reason.", tone: "success" }); setConfirming(false); setState(""); setReason(""); }
    catch (e) { setError(isApiError(e) ? e.message : "We couldn’t change the state. Try again."); }
  };
  const pending = d.requests.filter((r) => r.status === "pending");
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">{d.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2"><TenantStatePill state={d.effective} /><HealthPill level={d.health.level} /><span className="text-clay-muted">{d.plan.name}{d.city ? `, ${d.city}` : ""}</span></p>
          {d.health.reasons.length > 0 && <ul aria-label="Why" className="mt-2 list-disc pl-5 text-[0.95rem] text-clay-muted">{d.health.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </div>
        <Button3DLink to={`/admin/support?tenant=${d.id}`} variant="white" size="md"><LifeBuoy className="h-4 w-4" aria-hidden="true" />Request support access</Button3DLink>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="space-y-5">
          <section aria-labelledby="plan-t" className="clay space-y-3 p-4 sm:p-5">
            <h2 id="plan-t" className="text-lg font-bold">Plan and limits</h2>
            <p className="text-clay-muted">{d.plan.name}, {d.plan.monthlyPaise === null ? "agreed with the gym" : `${formatRupees(d.plan.monthlyPaise)} a month before GST`}.</p>
            <ul aria-label="Use against limits" className="space-y-3">
              {d.usage.map((u) => { const pct = u.limit === null ? 0 : Math.min(100, Math.round((u.used / u.limit) * 100)); return (
                <li key={u.key}><div className="flex items-baseline justify-between gap-3"><span className="font-semibold">{u.label}</span><span className="tabular">{u.used} of {u.limit === null ? "no limit" : u.limit}</span></div>{u.limit !== null && <div role="img" aria-label={`${u.label}: ${pct}% of the limit`} className="mt-1 h-2.5 overflow-hidden rounded-full bg-clay-lavender"><div className={cn("h-full rounded-full", u.level === "full" ? "bg-status-danger-fg" : u.level === "near" ? "bg-[#D29A3A]" : "bg-ember-650")} style={{ width: `${pct}%` }} /></div>}</li>
              ); })}
            </ul>
            <div className="flex flex-wrap items-end gap-3 border-t border-clay-line pt-3">
              <label className="block"><span className="text-sm font-semibold">Move to another plan</span><select value={planId} onChange={(e) => setPlanId(e.target.value)} className={cn(inputClass, "min-w-[12rem]")}>{d.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <Button3D variant="white" size="md" disabled={planId === d.plan.id || a.changePlan.isPending} onClick={() => void a.changePlan.mutateAsync({ key: `plan-${crypto.randomUUID()}`, tenantId: d.id, planId }).then((r) => toast({ title: "Plan changed", description: `${r.from} to ${r.to}. Limits and features change at once.`, tone: "success" })).catch(fail)}>Change plan</Button3D>
            </div>
          </section>

          <section aria-labelledby="ent-t" className="clay p-4 sm:p-5">
            <h2 id="ent-t" className="text-lg font-bold">Features it is entitled to</h2>
            <ul aria-label="What’s included" className="mt-2 grid gap-1.5 sm:grid-cols-2">{d.entitlements.map((e) => <li key={e.key} className={cn("flex items-center gap-2", !e.included && "text-clay-subtle")}>{e.included ? <Check className="h-4 w-4 text-status-active-fg" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}<span>{FEATURE_LABEL[e.key] ?? e.key}</span><span className="sr-only">{e.included ? "included" : "not included"}</span></li>)}</ul>
          </section>

          <section aria-labelledby="inv-t" className="clay space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="inv-t" className="text-lg font-bold">Software invoices</h2><Button3D variant="white" size="md" disabled={a.issueInvoice.isPending || d.plan.monthlyPaise === null} onClick={() => void a.issueInvoice.mutateAsync({ tenantId: d.id, key: `inv-${crypto.randomUUID()}` }).then((i) => toast({ title: "Invoice issued", description: `${i.number}, ${formatRupees(i.amountPaise)} with GST.`, tone: "success" })).catch(fail)}>Issue the next invoice</Button3D></div>
            <p className="text-[0.95rem] text-clay-muted">What {d.name} pays Ember for the software. Separate from the invoices it raises for its members.</p>
            {d.invoices.length === 0 ? <p className="rounded-2xl bg-clay-canvas p-3 text-[0.95rem] text-clay-muted">No invoices yet.{d.state === "trial" ? " The first one comes when the trial ends." : ""}</p> : (
              <ul aria-label="Software invoices" className="divide-y divide-clay-line">
                {d.invoices.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0"><span className="font-semibold">{i.number}</span> <span className="text-sm text-clay-muted">{formatDate(i.issuedOn)}, due {formatDate(i.dueOn)}</span><span className="block text-sm text-clay-muted">{i.description}</span></span>
                    <span className="flex items-center gap-3"><span className="text-right"><span className="tabular block font-semibold">{formatRupees(i.amountPaise)}</span><span className="block text-sm text-clay-muted">{i.status === "paid" ? `Paid ${i.paidOn ? formatDate(i.paidOn) : ""}` : i.status === "open" ? "Open" : "Void"}</span></span>{i.status === "open" && <Button3D variant="white" size="md" disabled={a.markPaid.isPending} onClick={() => void a.markPaid.mutateAsync({ invoiceId: i.id }).then((r) => toast({ title: r.reactivated ? "Paid, gym reactivated" : "Marked paid", tone: "success" })).catch(fail)} aria-label={`Mark paid: ${i.number}`}>Mark paid</Button3D>}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {d.requests.length > 0 && (
            <section aria-labelledby="req-t" className="clay space-y-2 p-4 sm:p-5">
              <h2 id="req-t" className="text-lg font-bold">Requests for another plan{pending.length ? ` (${pending.length} waiting)` : ""}</h2>
              <ul aria-label="Plan requests" className="divide-y divide-clay-line">
                {d.requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0"><span className="font-semibold">{r.requestedByName} asked for {r.planName}</span> <span className="text-sm text-clay-muted">{formatDate(istDateOf(r.at))}</span>{r.note && <span className="block text-sm text-clay-muted">“{r.note}”</span>}<span className="block text-sm text-clay-muted">{r.status === "pending" ? "Waiting" : r.status === "approved" ? "Approved" : "Declined"}</span></span>
                    {r.status === "pending" && <span className="flex gap-2"><Button3D variant="ember" size="md" disabled={a.decide.isPending} onClick={() => void a.decide.mutateAsync({ key: `dec-${crypto.randomUUID()}`, requestId: r.id, approve: true }).then(() => toast({ title: "Approved", description: `${d.name} is now on ${r.planName}.`, tone: "success" })).catch(fail)}>Approve</Button3D><Button3D variant="white" size="md" disabled={a.decide.isPending} onClick={() => void a.decide.mutateAsync({ key: `dec-${crypto.randomUUID()}`, requestId: r.id, approve: false }).then(() => toast({ title: "Declined", tone: "success" })).catch(fail)}>Decline</Button3D></span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="sup-t" className="clay space-y-2 p-4 sm:p-5">
            <h2 id="sup-t" className="text-lg font-bold">Support access</h2>
            {d.support.length === 0 ? <p className="text-[0.95rem] text-clay-muted">No one from Ember has had access to {d.name}.</p> : (
              <ul aria-label="Support sessions" className="divide-y divide-clay-line">{d.support.map((s) => <li key={s.id} className="py-2.5 text-[0.95rem]"><span className="font-semibold">{s.adminName}</span>, {s.minutes} minutes from {formatTime(s.startedAt)} on {formatDate(istDateOf(s.startedAt))}<span className="block text-clay-muted">“{s.reason}”. {s.endedAt ? (s.endedBy === "time" ? "Ended by itself when the time ran out." : "Ended early.") : `Active until ${formatTime(s.expiresAt)}.`}</span></li>)}</ul>
            )}
          </section>
        </div>

        <aside aria-label="Account" className="space-y-5 lg:sticky lg:top-4">
          <section aria-labelledby="st-t" className="clay space-y-3 p-4">
            <h2 id="st-t" className="text-lg font-bold">Subscription</h2>
            <p className="text-[0.95rem]"><span className="font-semibold">{STATE_LABEL[d.effective]}.</span> {STATE_RULES[d.effective].now}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {d.billing.trialEndsOn && <><dt className="text-clay-muted">Trial ends</dt><dd>{formatDate(d.billing.trialEndsOn)}</dd></>}
              {d.billing.renewsOn && <><dt className="text-clay-muted">{d.state === "trial" ? "First bill" : "Renews"}</dt><dd>{formatDate(d.billing.renewsOn)}</dd></>}
              {d.billing.pastDueSince && <><dt className="text-clay-muted">Overdue since</dt><dd>{formatDate(d.billing.pastDueSince)}</dd></>}
              {d.status.graceEndsOn && <><dt className="text-clay-muted">Grace ends</dt><dd>{formatDate(d.status.graceEndsOn)}</dd></>}
              {d.billing.suspendedOn && <><dt className="text-clay-muted">Suspended</dt><dd>{formatDate(d.billing.suspendedOn)}</dd></>}
              {d.billing.canceledOn && <><dt className="text-clay-muted">Canceled</dt><dd>{formatDate(d.billing.canceledOn)}</dd></>}
              {d.status.exportUntil && <><dt className="text-clay-muted">Can download until</dt><dd>{formatDate(d.status.exportUntil)}</dd></>}
            </dl>
            <div className="space-y-2 border-t border-clay-line pt-3">
              <label className="block"><span className="text-sm font-semibold">Change the state</span><select value={state} onChange={(e) => setState(e.target.value as typeof state)} className={inputClass}><option value="">Choose a state</option>{STATES.filter((s) => s !== d.state).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}</select></label>
              {state && <p className="rounded-2xl bg-clay-canvas p-3 text-sm">{STATE_RULES[state].now} {STATE_RULES[state].ends}</p>}
              <Button3D variant={state === "suspended" || state === "canceled" ? "ink" : "ember"} size="md" className="w-full" disabled={!state} onClick={() => { setError(undefined); setConfirming(true); }}>Change state</Button3D>
            </div>
          </section>
          <section aria-labelledby="ob-t" className="clay space-y-3 p-4">
            <h2 id="ob-t" className="text-lg font-bold">Set-up</h2>
            <OnboardingBar percent={d.onboarding.percent} steps={d.onboarding.steps} />
            <ol aria-label="Set-up steps" className="space-y-2">{d.onboarding.steps.map((s) => <li key={s.key} className="flex items-start gap-2 text-[0.95rem]"><span aria-hidden="true" className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white", s.done ? "bg-status-active-fg" : "bg-clay-subtle")}>{s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}</span><span><span className="font-semibold">{s.label}</span><span className="sr-only">{s.done ? ", done" : ", not done"}</span><span className="block text-sm text-clay-muted">{s.detail}</span></span></li>)}</ol>
          </section>
          <section aria-labelledby="ow-t" className="clay p-4"><h2 id="ow-t" className="text-lg font-bold">Owner</h2>{d.owner ? <p className="mt-1">{d.owner.name}<span className="block text-sm text-clay-muted">{d.owner.email}{d.owner.status === "invited" ? ", invited, hasn’t accepted" : ""}</span></p> : <p className="mt-1 text-clay-muted">No owner yet.</p>}<p className="mt-2 text-sm text-clay-muted">Created {formatDate(d.createdOn)}{d.lastActivityOn ? `. Last activity ${formatDate(d.lastActivityOn)}.` : ". No activity yet."}</p></section>
        </aside>
      </div>

      <Sheet open={confirming} onClose={() => setConfirming(false)} label="Change the subscription state" kind="confirm">
        {state && (
          <div className="space-y-3 p-5">
            <h2 className="text-xl font-bold">Make {d.name} {STATE_LABEL[state].toLowerCase()}?</h2>
            <p>{STATE_RULES[state].now} {STATE_RULES[state].ends}</p>
            <Field label="Reason" htmlFor="st-reason" hint="The gym’s owner can read this in their audit log."><input id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} data-autofocus /></Field>
            {error && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
            <div className="flex flex-wrap gap-3"><Button3D variant="ember" size="md" disabled={a.setState.isPending} onClick={() => void changeState()}>{a.setState.isPending ? "Changing…" : `Make ${STATE_LABEL[state].toLowerCase()}`}</Button3D><Button3D variant="white" size="md" onClick={() => setConfirming(false)}>Cancel</Button3D></div>
          </div>
        )}
      </Sheet>
    </>
  );
}
