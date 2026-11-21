import { Check, Minus } from "lucide-react";
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useSubscription, useSubscriptionActions } from "@/api/ownerHooks";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Field, inputClass } from "@/design/Field";
import { useToast } from "@/design/Toast";
import type { SubscriptionView } from "@/api/subscription";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { FEATURE_LABEL, STATE_LABEL, STATE_RULES } from "@/domain/subscription";
import { cn } from "@/lib/format";
import { formatDate, formatRupees } from "@/lib/when";

const TONE = { trial: "bg-lilac-100 text-lilac-700", paid: "bg-status-active-bg text-status-active-fg", past_due: "bg-status-pending-bg text-status-pending-fg", suspended: "bg-status-expired-bg text-status-expired-fg", canceled: "bg-status-danger-bg text-status-danger-fg" } as const;

/** Subscription (S02), owner only: the gym’s Ember plan and state, what it uses against each limit, what each plan includes, and what each state means. Separate from member billing. */
export default function Subscription() {
  const query = useSubscription();
  return (
    <div className="min-w-0 max-w-5xl space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load the subscription" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Subscription</h1><SkeletonRows rows={5} /></>}>
        {(v) => <Loaded v={v} />}
      </QueryBoundary>
    </div>
  );
}

/** What the state means for the gym today, in words, with the way out: pay and reopen, or ask for another plan. */
function StateCard({ v }: { v: SubscriptionView }) {
  const { reactivate, requestPlan } = useSubscriptionActions();
  const toast = useToast();
  const [planId, setPlanId] = useState("");
  const [note, setNote] = useState("");
  const [rk] = useState(() => `react-${crypto.randomUUID()}`);
  const [pk] = useState(() => `plan-${crypto.randomUUID()}`);
  const b = v.status.banner;
  const due = v.invoices.filter((i) => i.status === "open" && i.dueOn <= v.today).reduce((n, i) => n + i.amountPaise, 0);
  const others = v.plans.filter((p) => p.id !== v.plan.id && !p.archived);
  const fail = (e: unknown) => toast({ title: "Not done", description: isApiError(e) ? e.message : "Try again.", tone: "error" });
  return (
    <>
      {b && (
        <section aria-label="What this means" role="status" className={cn("space-y-3 rounded-3xl p-4 sm:p-5", b.tone === "danger" ? "bg-status-danger-bg text-status-danger-fg" : "bg-status-pending-bg text-status-pending-fg")}>
          <h2 className="flex items-center gap-2 text-xl font-bold"><ShieldAlert className="h-6 w-6" aria-hidden="true" />{b.title}</h2>
          <p className="max-w-[70ch]">{b.body}</p>
          {v.status.reactivatable && <Button3D variant="ember" size="md" disabled={reactivate.isPending} onClick={() => void reactivate.mutateAsync({ key: rk }).then((r) => toast({ title: "The gym is open again", description: r.paidPaise ? `${formatRupees(r.paidPaise)} paid (simulated in this demo). Everything works as before.` : "Everything works as before.", tone: "success" })).catch(fail)}>{reactivate.isPending ? "Reactivating…" : due ? `Pay ${formatRupees(due)} and reactivate` : "Reactivate the gym"}</Button3D>}
        </section>
      )}
      {others.length > 0 && (
        <section aria-labelledby="chg-t" className="clay space-y-3 p-4 sm:p-5">
          <h2 id="chg-t" className="text-lg font-bold">Need more room or a feature?</h2>
          {v.request?.status === "pending" ? <p role="status" className="rounded-2xl bg-clay-canvas p-3">You asked Ember for the <strong>{v.request.planName}</strong> plan on {formatDate(v.request.at.slice(0, 10))}. It is waiting for an answer, and nothing changes until it comes.</p> : (
            <form className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); if (planId) void requestPlan.mutateAsync({ planId, note, key: pk }).then(() => toast({ title: "Request sent to Ember", description: "You will see the answer here.", tone: "success" })).catch(fail); }}>
              <Field label="Ask for another plan" htmlFor="pl-ask"><select id="pl-ask" value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass}><option value="">Choose a plan</option>{others.map((p) => <option key={p.id} value={p.id}>{p.name}{p.monthlyPaise !== null ? `, ${formatRupees(p.monthlyPaise)} a month` : ""}</option>)}</select></Field>
              <Field label="A note for Ember" htmlFor="pl-note" hint="Optional"><input id="pl-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} /></Field>
              <Button3D type="submit" variant="ember" size="md" disabled={!planId || requestPlan.isPending}>Ask Ember</Button3D>
            </form>
          )}
          {v.request && v.request.status !== "pending" && <p className="text-sm text-clay-muted">Your last request, for {v.request.planName}, was {v.request.status}{v.request.decisionNote ? `: ${v.request.decisionNote}` : ""}.</p>}
        </section>
      )}
    </>
  );
}

function Loaded({ v }: { v: SubscriptionView }) {
  const features = [...new Set(v.plans.flatMap((p) => p.features))].filter((f) => f !== "everything");
  return (
    <>
      <header>
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Subscription</h1>
        <p className="max-w-[70ch] text-clay-muted">Your Ember plan, what you use of it, and what it includes. This is what {v.gym} pays Ember for the software. It is separate from what your members pay you.</p>
      </header>

      <StateCard v={v} />

      <section aria-labelledby="plan-title" className="clay space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="plan-title" className="text-xl font-bold">{v.plan.name}</h2><p className="text-clay-muted">{v.plan.monthlyPaise === null ? "Agreed with Ember" : `${formatRupees(v.plan.monthlyPaise)} a month`}</p></div>
          <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold", TONE[v.state])}>{STATE_LABEL[v.state]}</span>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {v.trialEndsAt && <div><dt className="text-sm text-clay-muted">Trial ends</dt><dd className="font-bold">{formatDate(v.trialEndsAt)}<span className="block text-sm font-normal text-clay-muted">{v.daysLeft} {v.daysLeft === 1 ? "day" : "days"} left</span></dd></div>}
          {v.renewsOn && <div><dt className="text-sm text-clay-muted">{v.state === "trial" ? "First bill" : "Renews on"}</dt><dd className="font-bold">{formatDate(v.renewsOn)}</dd></div>}
          <div><dt className="text-sm text-clay-muted">Billing</dt><dd className="font-bold">{v.plan.monthlyPaise === null ? "By agreement" : "Monthly, by invoice"}</dd></div>
        </dl>
        <p className="rounded-2xl bg-clay-canvas p-3 text-[0.95rem]"><span className="font-semibold">Right now: </span>{v.rule.now} <span className="font-semibold">Next: </span>{v.rule.ends}</p>
      </section>

      <section aria-labelledby="use-title" className="clay p-4 sm:p-5">
        <h2 id="use-title" className="text-lg font-bold">What you use</h2>
        <ul aria-label="Usage against your limits" className="mt-3 space-y-4">
          {v.usage.map((u) => {
            const pct = u.limit === null ? 0 : Math.min(100, Math.round((u.used / u.limit) * 100));
            return (
              <li key={u.key}>
                <div className="flex items-baseline justify-between gap-3"><span className="font-semibold">{u.label}</span><span className="tabular">{u.used} of {u.limit === null ? "no limit" : u.limit}</span></div>
                {u.limit !== null && <div role="img" aria-label={`${u.label}: ${pct}% of the limit used`} className="mt-1 h-3 overflow-hidden rounded-full bg-clay-lavender"><div className={cn("h-full rounded-full", u.level === "full" ? "bg-status-danger-fg" : u.level === "near" ? "bg-[#D29A3A]" : "bg-ember-650")} style={{ width: `${pct}%` }} /></div>}
                {u.level === "near" && <p className="mt-1 text-sm text-status-pending-fg">You are close to this limit. Ask Ember for a larger plan before you reach it.</p>}
                {u.level === "full" && <p className="mt-1 text-sm font-semibold text-status-danger-fg">You are at this limit. {u.key === "activeMembers" ? "A new member can’t be added, and an import will stop at it." : "Nothing more of this can be added."}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="cmp-title" className="clay min-w-0 overflow-hidden p-4 sm:p-5">
        <h2 id="cmp-title" className="text-lg font-bold">Plans</h2>
        <ul aria-label="Plans" className="mt-3 grid gap-3 sm:hidden">
          {v.plans.map((p) => (
            <li key={p.id} className={cn("clay-flat p-3", p.id === v.plan.id && "ring-2 ring-ember-400")}>
              <p className="font-bold">{p.name}{p.id === v.plan.id && <span className="ml-2 text-sm font-semibold text-ember-800">Your plan</span>}</p>
              <p className="tabular text-clay-muted">{p.monthlyPaise === null ? "Agreed with Ember" : `${formatRupees(p.monthlyPaise)} a month`}</p>
              <p className="mt-1 text-sm">{[["branches", "branches"], ["staff", "staff accounts"], ["activeMembers", "active members"]].map(([k, l]) => `${p.limits[k as "branches"] === null ? "No limit on" : p.limits[k as "branches"]} ${l}`).join(", ")}.</p>
              <p className="mt-1 text-sm text-clay-muted">{p.features.includes("everything") ? "Everything, with a custom agreement." : `Includes ${p.features.map((f) => (FEATURE_LABEL[f] ?? f).toLowerCase()).join(", ")}.`}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">What each Ember plan includes</caption>
            <thead><tr className="border-b border-clay-line text-clay-muted"><th scope="col" className="py-2 pr-3 font-semibold">&nbsp;</th>{v.plans.map((p) => <th key={p.id} scope="col" className={cn("px-3 py-2 font-semibold", p.id === v.plan.id && "text-ember-800")}>{p.name}{p.id === v.plan.id && <span className="block text-xs font-normal">Your plan</span>}</th>)}</tr></thead>
            <tbody>
              <tr className="border-b border-clay-line"><th scope="row" className="py-2 pr-3 font-semibold">Price</th>{v.plans.map((p) => <td key={p.id} className="px-3 py-2 tabular">{p.monthlyPaise === null ? "Agreed" : `${formatRupees(p.monthlyPaise)} a month`}</td>)}</tr>
              {([["branches", "Branches"], ["staff", "Staff accounts"], ["activeMembers", "Active members"]] as const).map(([k, label]) => <tr key={k} className="border-b border-clay-line"><th scope="row" className="py-2 pr-3 font-semibold">{label}</th>{v.plans.map((p) => <td key={p.id} className="px-3 py-2 tabular">{p.limits[k] === null ? "No limit" : p.limits[k]}</td>)}</tr>)}
              {features.map((f) => <tr key={f} className="border-b border-clay-line last:border-0"><th scope="row" className="py-2 pr-3 font-semibold">{FEATURE_LABEL[f] ?? f}</th>{v.plans.map((p) => { const has = p.features.includes(f) || p.features.includes("everything"); return <td key={p.id} className="px-3 py-2">{has ? <><Check className="h-4 w-4 text-status-active-fg" aria-hidden="true" /><span className="sr-only">Included</span></> : <><Minus className="h-4 w-4 text-clay-subtle" aria-hidden="true" /><span className="sr-only">Not included</span></>}</td>; })}</tr>)}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-clay-muted">To change plan, use “Ask for another plan” above. Your members and records stay exactly as they are.</p>
      </section>

      <section aria-labelledby="states-title" className="clay p-4 sm:p-5">
        <h2 id="states-title" className="text-lg font-bold">What each state means</h2>
        <dl className="mt-2 divide-y divide-clay-line">
          {(Object.keys(STATE_RULES) as Array<keyof typeof STATE_RULES>).map((s) => <div key={s} className={cn("py-3 first:pt-0 last:pb-0", s === v.state && "font-medium")}><dt className="font-bold">{STATE_LABEL[s]}{s === v.state && <span className="ml-2 text-sm font-semibold text-ember-800">Yours</span>}</dt><dd className="text-[0.95rem] text-clay-muted">{STATE_RULES[s].now} {STATE_RULES[s].ends}</dd></div>)}
        </dl>
      </section>

      <section aria-labelledby="inv-title" className="space-y-3">
        <h2 id="inv-title" className="text-lg font-bold">Software invoices</h2>
        {v.invoices.length === 0 ? <EmptyState title="No software invoices yet">{v.state === "trial" && v.trialEndsAt ? `Your trial runs to ${formatDate(v.trialEndsAt)}. Ember’s first invoice comes after it.` : "Ember’s invoices for the software appear here."}</EmptyState> : (
          <ul aria-label="Software invoices" className="clay divide-y divide-clay-line p-4 sm:p-5">{v.invoices.map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"><span className="min-w-0"><span className="font-semibold">{i.number}</span> <span className="text-sm text-clay-muted">{formatDate(i.issuedOn)}, due {formatDate(i.dueOn)}</span><span className="block text-sm text-clay-muted">{i.description}</span></span><span className="text-right"><span className="tabular block font-semibold">{formatRupees(i.amountPaise)} <span className="text-sm font-normal text-clay-muted">with GST</span></span><span className="block text-sm text-clay-muted">{i.status === "paid" ? `Paid ${i.paidOn ? formatDate(i.paidOn) : ""}` : i.status === "open" ? (i.dueOn < v.today ? "Overdue" : "Not due yet") : "Void"}</span></span></li>)}</ul>
        )}
      </section>
    </>
  );
}
