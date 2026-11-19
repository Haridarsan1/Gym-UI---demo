import { useState } from "react";
import { Link } from "react-router-dom";
import { useDecideRefund, useRefunds } from "@/api/deskHooks";
import type { RefundCard } from "@/api/refunds";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { useToast } from "@/design/Toast";
import { istDateOf } from "@/domain/dates";
import { formatDate, formatRupees } from "@/lib/when";

const newKey = () => `dec-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

/**
 * Refunds (M04, M06): the queue of requests the front desk made, each with what approving would do (which payment it goes back against, and the unused
 * training credits taken back), and the history of what was decided. Finance, a branch manager or the owner approves or rejects; both steps are audited.
 * You can’t approve above your own refund limit.
 */
export default function Refunds() {
  const query = useRefunds();
  const [acting, setActing] = useState<{ r: RefundCard; decision: "approve" | "reject" } | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Refunds</h1>
      <QueryBoundary query={query} errorTitle="We couldn’t load the refunds" skeleton={<SkeletonRows rows={5} />}>
        {(d) => (
          <>
            <p className="text-clay-muted">{d.limitPaise === null ? "You can approve refunds of any size." : `You can approve refunds up to ${formatRupees(d.limitPaise)}. Larger ones go to the owner.`}</p>
            <section aria-labelledby="q-title" className="space-y-3">
              <h2 id="q-title" className="text-lg font-bold">Waiting for a decision ({d.pending.length})</h2>
              {d.pending.length === 0 ? <EmptyState title="No refund is waiting">Requests from the front desk appear here.</EmptyState> : (
                <ul aria-label="Refund requests" className="grid gap-3 lg:grid-cols-2">
                  {d.pending.map((r) => (
                    <li key={r.id} className="clay p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2"><Link to={`/desk/members/${r.memberId}?tab=billing`} className="inline-flex min-h-[2.75rem] items-center text-lg font-bold underline-offset-4 hover:underline">{r.name}</Link><span className="font-display text-3xl font-extrabold tabular">{formatRupees(r.amountPaise)}</span></div>
                      <p className="text-sm text-clay-muted">{r.branchName}, invoice {r.invoiceNumber}. Asked by {r.requestedBy} on {formatDate(istDateOf(r.requestedAt))}{r.source === "cancellation" ? ", after a cancellation" : ""}.</p>
                      <p className="mt-1 max-w-[70ch]">“{r.reason}”</p>
                      {r.preview && (
                        <p className="mt-2 rounded-2xl bg-clay-canvas p-3 text-[0.95rem]">
                          {r.preview.paymentId ? <>Goes back against the {r.preview.method} payment{r.preview.receiptNumber ? `, receipt ${r.preview.receiptNumber}` : ""} (up to {formatRupees(r.preview.refundablePaise)} left). </> : null}
                          {r.preview.creditsReversed > 0 ? <span className="font-semibold">{r.preview.creditsReversed} unused training {r.preview.creditsReversed === 1 ? "credit is" : "credits are"} taken back.</span> : "No training credits are taken back."}
                          {r.preview.blocked && <span className="mt-1 block font-semibold text-status-danger-fg">{r.preview.blocked}</span>}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button3D size="md" variant="ember" disabled={!!r.preview?.blocked} onClick={() => setActing({ r, decision: "approve" })} aria-label={`Approve the refund for ${r.name}`}>Approve</Button3D>
                        <Button3D size="md" variant="white" onClick={() => setActing({ r, decision: "reject" })} aria-label={`Reject the refund for ${r.name}`}>Reject</Button3D>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="h-title" className="clay p-4 sm:p-5">
              <h2 id="h-title" className="text-lg font-bold">Decided</h2>
              {d.decided.length === 0 ? <p className="mt-2 text-clay-muted">Nothing decided yet.</p> : (
                <ul aria-label="Decided refunds" className="mt-2 divide-y divide-clay-line">
                  {d.decided.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                      <span className="min-w-0"><span className="font-semibold">{r.name}</span> <span className="text-sm text-clay-muted">{r.branchName}, invoice {r.invoiceNumber}</span><span className="block text-sm text-clay-muted">{r.status === "approved" ? "Approved" : "Rejected"} by {r.decidedBy} on {r.decidedAt ? formatDate(istDateOf(r.decidedAt)) : ""}. Asked by {r.requestedBy}: “{r.reason}”{r.decisionNote ? ` Note: ${r.decisionNote}` : ""}</span></span>
                      <span className="text-right"><span className="block font-semibold tabular">{formatRupees(r.amountPaise)}</span><span className="block text-sm font-semibold">{r.status === "approved" ? "Refunded" : "Rejected"}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </QueryBoundary>
      {acting && <Decide r={acting.r} decision={acting.decision} onClose={() => setActing(null)} />}
    </div>
  );
}

function Decide({ r, decision, onClose }: { r: RefundCard; decision: "approve" | "reject"; onClose: () => void }) {
  const decide = useDecideRefund();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [key] = useState(newKey);
  const approve = decision === "approve";
  const save = async () => {
    setError(undefined);
    try {
      const x = await decide.mutateAsync({ requestId: r.id, decision, note, key });
      toast({ title: approve ? `Refunded ${formatRupees(x.amountPaise)} to ${r.name.split(" ")[0]}` : "Refund rejected", description: approve ? (x.creditsReversed ? `${x.creditsReversed} unused training credits were taken back. They have been emailed.` : "They have been emailed.") : `${r.requestedBy} will see the reason.`, tone: "success" });
      onClose();
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t save the decision. Try again.");
    }
  };
  return (
    <Sheet open onClose={onClose} label={approve ? "Approve refund" : "Reject refund"} kind="confirm" className="p-5">
      <h2 className="text-xl font-bold">{approve ? `Refund ${formatRupees(r.amountPaise)} to ${r.name}?` : `Reject the refund for ${r.name}?`}</h2>
      {approve ? (
        <p className="mt-2 text-clay-muted">{r.preview?.paymentId ? `It goes back against the ${r.preview.method} payment.` : ""} {r.preview && r.preview.creditsReversed > 0 ? `${r.preview.creditsReversed} unused training credits are taken back with it.` : ""} The member is emailed. This is audited and can’t be undone.</p>
      ) : (
        <label className="mt-3 block"><span className="font-semibold">Why? The desk sees this.</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} autoFocus className="mt-2 w-full rounded-xl border border-clay-line p-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" /></label>
      )}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button3D variant={approve ? "ember" : "ink"} size="lg" className="sm:flex-1" disabled={decide.isPending} onClick={() => void save()}>{decide.isPending ? "Saving…" : approve ? "Approve refund" : "Reject refund"}</Button3D><Button3D variant="white" size="lg" onClick={onClose}>Not yet</Button3D></div>
    </Sheet>
  );
}
