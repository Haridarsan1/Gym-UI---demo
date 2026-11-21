import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useReconciliation, useReconciliationActions } from "@/api/financeHooks";
import type { IssueCard } from "@/api/finance";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { useToast } from "@/design/Toast";
import { formatDate, formatRupees } from "@/lib/when";
import { cn } from "@/lib/format";

/**
 * Reconciliation (M03, M04): online collections against the gateway’s payouts, anything that doesn’t match, and the cash day closes. A repeated gateway event
 * made one payment; it stays listed until finance has looked and accepted it with a note.
 */
export default function Reconciliation() {
  const query = useReconciliation();
  const { run, review } = useReconciliationActions();
  const toast = useToast();
  const [accepting, setAccepting] = useState<IssueCard | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const match = async () => {
    try {
      const r = await run.mutateAsync();
      toast({ title: "Matching is up to date", description: `${r.matched} matched, ${r.flagged} flagged, ${r.waiting} waiting for a payout.`, tone: "success" });
    } catch (e) { toast({ title: "Matching didn’t run", description: isApiError(e) ? e.message : "Try again.", tone: "error" }); }
  };
  const accept = async () => {
    if (!accepting?.target) return;
    setError(undefined);
    try {
      await review.mutateAsync({ kind: accepting.target.kind, id: accepting.target.id, note });
      toast({ title: "Accepted", description: "Your note is saved with this record.", tone: "success" });
      setAccepting(null); setNote("");
    } catch (e) { setError(isApiError(e) ? e.message : "We couldn’t save that. Try again."); }
  };
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Reconciliation</h1>
        <Button3D variant="white" size="md" disabled={run.isPending} onClick={() => void match()}><RefreshCw className="h-4 w-4" aria-hidden="true" />{run.isPending ? "Matching…" : "Match again"}</Button3D>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load the reconciliation" skeleton={<SkeletonRows rows={6} />}>
        {(d) => (
          <>
            <dl aria-label="Online collections" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {([["Collected online", d.totals.onlinePaise], ["Matched to a payout", d.totals.matchedPaise], ["Flagged", d.totals.flaggedPaise], ["Waiting for a payout", d.totals.waitingPaise]] as const).map(([l, v]) => <div key={l} className="clay p-4"><dt className="text-sm text-clay-muted">{l}</dt><dd className="font-display text-2xl font-extrabold tabular lg:text-3xl">{formatRupees(v)}</dd></div>)}
            </dl>
            <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
              <section aria-labelledby="issues-title" className="clay space-y-3 p-4 sm:p-5">
                <h2 id="issues-title" className="flex items-center gap-2 text-lg font-bold">{d.issues.length ? <AlertTriangle className="h-5 w-5 text-ember-700" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5 text-status-active-fg" aria-hidden="true" />}{d.issues.length ? `${d.issues.length} to review` : "Nothing to review"}</h2>
                {d.issues.length === 0 && <p className="text-clay-muted">Every online payment matches a payout, and no event repeated without being accepted.</p>}
                <ul aria-label="Flagged items" className="space-y-3">
                  {d.issues.map((i) => (
                    <li key={i.key} className="rounded-2xl bg-clay-canvas p-4">
                      <p className="font-bold">{i.title}</p>
                      <p className="mt-1 max-w-[70ch] text-[0.95rem]">{i.detail}</p>
                      <p className="mt-1 text-sm text-clay-muted">{i.invoiceNumber ? `Invoice ${i.invoiceNumber}. ` : ""}{i.kind === "amount_differs" && i.amountPaise ? `Difference ${formatRupees(i.amountPaise)}.` : ""}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {i.target && <Button3D size="md" variant="white" onClick={() => { setAccepting(i); setNote(""); setError(undefined); }} aria-label={`Accept with a note: ${i.title}`}>Accept with a note</Button3D>}
                        {i.memberId && <Link to={`/desk/members/${i.memberId}?tab=billing`} className="inline-flex min-h-[2.75rem] items-center px-2 font-semibold underline underline-offset-4">Open the member</Link>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
              <div className="space-y-5">
                <section aria-labelledby="set-title" className="clay p-4 sm:p-5">
                  <h2 id="set-title" className="text-lg font-bold">Gateway payouts</h2>
                  <ul aria-label="Payouts" className="mt-2 divide-y divide-clay-line">
                    {d.settlements.map((s) => (
                      <li key={s.id} className="py-2">
                        <p className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{s.reference}</span><span className="tabular font-semibold">{formatRupees(s.netPaise)}</span></p>
                        <p className="text-sm text-clay-muted">{formatDate(s.settledOn)}, {s.lines} charges, fee {formatRupees(s.feePaise)}{s.issues ? <span className={cn("ml-1 font-semibold text-ember-800")}>, {s.issues} to review</span> : ", all matched"}</p>
                      </li>
                    ))}
                  </ul>
                </section>
                <section aria-labelledby="cash-title" className="clay p-4 sm:p-5">
                  <h2 id="cash-title" className="text-lg font-bold">Cash day closes</h2>
                  {d.cash.length === 0 ? <p className="mt-1 text-clay-muted">No day has been closed yet. <Link to="/desk/finance/day-close" className="font-semibold underline underline-offset-4">Close today’s cash</Link>.</p> : (
                    <ul aria-label="Day closes" className="mt-2 divide-y divide-clay-line">
                      {d.cash.map((x) => (
                        <li key={`${x.branchId}${x.date}`} className="flex flex-wrap justify-between gap-2 py-2"><span>{formatDate(x.date)}, {x.branchName}{x.status === "reopened" && <span className="text-sm text-clay-muted"> (reopened)</span>}</span><span className={cn("tabular font-semibold", x.variancePaise !== 0 && "text-ember-800")}>{x.variancePaise === 0 ? "No variance" : `${x.variancePaise < 0 ? "Short" : "Over"} ${formatRupees(Math.abs(x.variancePaise))}`}</span></li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </QueryBoundary>
      <Sheet open={!!accepting} onClose={() => setAccepting(null)} label="Accept this item" kind="confirm" className="p-5">
        <h2 className="text-xl font-bold">Accept this item</h2>
        <p className="text-clay-muted">{accepting?.title}. Say what you checked. The note and your name are kept, and this is audited.</p>
        <label className="mt-3 block"><span className="font-semibold">Note</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-clay-line bg-white p-3" /></label>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row"><Button3D variant="ember" size="lg" className="sm:flex-1" disabled={review.isPending} onClick={() => void accept()}>{review.isPending ? "Saving…" : "Accept"}</Button3D><Button3D variant="white" size="lg" onClick={() => setAccepting(null)}>Cancel</Button3D></div>
      </Sheet>
    </div>
  );
}
