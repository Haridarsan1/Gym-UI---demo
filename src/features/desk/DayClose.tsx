import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMe } from "@/api/hooks";
import { useDayClose, useDayCloseActions } from "@/api/financeHooks";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { useBranch } from "@/design/shells/BranchContext";
import { useToast } from "@/design/Toast";
import { cashVariance } from "@/domain/dayClose";
import { cn } from "@/lib/format";
import { formatDate, formatRupees, formatTime } from "@/lib/when";

/**
 * Cash day close (M3): the cash Ember expects in the drawer for a branch and day, the count, the variance and a note. Closing locks that day’s cash records.
 * A day is reopened by the owner only, with a reason, from the owner console.
 */
export default function DayClose() {
  const me = useMe();
  const { branchId: chosen } = useBranch();
  const branches = me.data?.branches ?? [];
  const [local, setLocal] = useState<string>();
  const branchId = chosen !== "all" ? chosen : (local ?? branches[0]?.id);
  const [params, setParams] = useSearchParams();
  const query = useDayClose(branchId, params.get("date") ?? "");
  const { close } = useDayCloseActions();
  const toast = useToast();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const submit = async (d: { date: string; expectedPaise: number }) => {
    setError(undefined);
    const paise = Math.round(Number(counted.replace(/,/g, "")) * 100);
    if (!counted.trim() || !Number.isFinite(paise) || paise < 0) { setError("Enter the cash you counted, in rupees."); return; }
    try {
      const r = await close.mutateAsync({ branchId: branchId!, date: d.date, countedPaise: paise, note });
      toast({ title: "Day closed", description: r.variancePaise === 0 ? "The count matches. This day’s cash is locked." : `${r.variancePaise < 0 ? "Short" : "Over"} by ${formatRupees(Math.abs(r.variancePaise))}. This day’s cash is locked.`, tone: "success" });
      setCounted(""); setNote("");
    } catch (e) { setError(isApiError(e) ? e.message : "We couldn’t close the day. Try again."); }
  };
  return (
    <div className="max-w-5xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Day close</h1>
        <div className="flex flex-wrap items-center gap-3">
          {chosen === "all" && branches.length > 1 && <label className="flex items-center gap-2 text-sm font-semibold">Branch<select value={branchId} onChange={(e) => setLocal(e.target.value)} className="h-11 rounded-xl border border-clay-line bg-white px-3">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
          <label className="flex items-center gap-2 text-sm font-semibold">Day<input type="date" value={params.get("date") ?? ""} onChange={(e) => setParams(e.target.value ? { date: e.target.value } : {}, { replace: true })} className="h-11 rounded-xl border border-clay-line bg-white px-3" /></label>
        </div>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load the cash for this day" skeleton={<SkeletonRows rows={5} />}>
        {(d) => {
          const closed = d.close?.status === "closed";
          const entered = Math.round(Number(counted.replace(/,/g, "")) * 100);
          const live = counted.trim() && Number.isFinite(entered) ? cashVariance(d.expectedPaise, entered) : null;
          return (
            <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
              <section aria-labelledby="count-title" className="clay space-y-3 p-4 sm:p-5">
                <h2 id="count-title" className="text-lg font-bold">{d.branch.name}, {formatDate(d.date)}</h2>
                <dl className="space-y-1">
                  <div className="flex justify-between"><dt>Cash received</dt><dd className="tabular">{formatRupees(d.receivedPaise)}</dd></div>
                  <div className="flex justify-between"><dt>Cash refunded</dt><dd className="tabular">{formatRupees(d.refundedPaise)}</dd></div>
                  <div className="flex justify-between border-t border-clay-line pt-2 text-lg font-bold"><dt>Expected in the drawer</dt><dd className="tabular">{formatRupees(d.expectedPaise)}</dd></div>
                </dl>
                {closed ? (
                  <div role="status" className="rounded-2xl bg-clay-canvas p-4">
                    <p className="font-bold">Closed</p>
                    <p>Counted {formatRupees(d.close!.countedPaise)}. {d.close!.variancePaise === 0 ? "No variance." : `${d.close!.variancePaise < 0 ? "Short" : "Over"} by ${formatRupees(Math.abs(d.close!.variancePaise))}.`}</p>
                    {d.close!.note && <p className="text-sm text-clay-muted">Note: {d.close!.note}</p>}
                    <p className="mt-1 text-sm text-clay-muted">Cash for this day is locked. If something was missed, record it on a day that is open, or ask the owner to reopen this day.</p>
                  </div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); void submit(d); }} className="space-y-3">
                    {d.close?.status === "reopened" && <p className="rounded-2xl bg-clay-canvas p-3 text-sm">The owner reopened this day: {d.close.reopenReason}. Count again to close it.</p>}
                    <label className="block"><span className="font-semibold">Cash counted (₹)</span><input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-clay-line bg-white px-3" /></label>
                    {live !== null && <p role="status" className={cn("font-semibold", live !== 0 && "text-ember-800")}>{live === 0 ? "Matches what we expected." : `${live < 0 ? "Short" : "Over"} by ${formatRupees(Math.abs(live))}. Add a note that says why.`}</p>}
                    <label className="block"><span className="font-semibold">Note{live ? "" : " (needed if the count differs)"}</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-clay-line bg-white p-3" /></label>
                    {error && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
                    <Button3D type="submit" variant="ember" size="lg" className="w-full" disabled={close.isPending}>{close.isPending ? "Closing…" : "Close the day"}</Button3D>
                  </form>
                )}
              </section>
              <section aria-labelledby="lines-title" className="clay p-4 sm:p-5">
                <h2 id="lines-title" className="text-lg font-bold">Cash that day</h2>
                {d.payments.length + d.refunds.length === 0 ? <p className="mt-1 text-clay-muted">No cash was taken or handed back. Card, UPI and transfers are not counted here.</p> : (
                  <ul aria-label="Cash entries" className="mt-2 divide-y divide-clay-line">
                    {[...d.payments, ...d.refunds].sort((a, b) => a.at.localeCompare(b.at)).map((l) => (
                      <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-semibold">{l.memberName}</span><span className="block text-sm text-clay-muted">{l.label}, {formatTime(l.at)}{l.receipt ? `, ${l.receipt}` : ""}</span></span><span className="tabular font-semibold">{l.label === "Cash refunded" ? "−" : ""}{formatRupees(l.amountPaise)}</span></li>
                    ))}
                  </ul>
                )}
                {d.history.length > 0 && (
                  <>
                    <h3 className="mt-4 font-bold">Recent closes</h3>
                    <ul aria-label="Recent closes" className="mt-1 divide-y divide-clay-line text-sm">
                      {d.history.map((h) => <li key={h.id} className="flex justify-between gap-2 py-1.5"><span>{formatDate(h.date)}{h.status === "reopened" ? " (reopened)" : ""}</span><span className="tabular">{h.variancePaise === 0 ? "No variance" : `${h.variancePaise < 0 ? "Short" : "Over"} ${formatRupees(Math.abs(h.variancePaise))}`}</span></li>)}
                    </ul>
                  </>
                )}
              </section>
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
