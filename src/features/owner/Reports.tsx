import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, RotateCcw } from "lucide-react";
import { useReport, useReportActions } from "@/api/ownerHooks";
import { REPORT_IDS, REPORTS, type Cell, type Column, type ReportData, type ReportId } from "@/api/reports";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { ResponsiveTable } from "@/design/layout/ResponsiveTable";
import { useBranch } from "@/design/shells/BranchContext";
import { useToast } from "@/design/Toast";
import { addDays, todayIST } from "@/domain/dates";
import { cn } from "@/lib/format";
import { formatDate, formatRupees } from "@/lib/when";

const PAGE = 25;
const show = (col: Column, v: Cell): string => {
  if (v === null || v === "") return "–";
  if (col.kind === "rupees") return formatRupees(Number(v));
  if (col.kind === "percent") return `${v}%`;
  if (col.kind === "hours") return `${v} h`;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v);
  return String(v);
};

/**
 * Reports (O06, O07): one report at a time for a branch (or every branch the person may see) and a range of dates, each with its definition in words, three headline figures and the
 * rows behind them, and a CSV of exactly that. The branch comes from the switcher; a branch manager only ever has their own.
 */
export default function Reports() {
  const { branchId } = useBranch();
  const [params, setParams] = useSearchParams();
  const today = todayIST();
  const id: ReportId = REPORT_IDS.includes(params.get("report") as ReportId) ? (params.get("report") as ReportId) : "memberships";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.get("to") ?? "") ? params.get("to")! : today;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from") ?? "") ? params.get("from")! : addDays(to, -29);
  const [shown, setShown] = useState(PAGE);
  const q = { report: id, branchId: branchId === "all" ? undefined : branchId, from, to };
  const query = useReport(q);
  const { exportCsv, reopen } = useReportActions();
  const toast = useToast();
  const [reopening, setReopening] = useState<{ branchId: string; date: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); setParams(n, { replace: true }); setShown(PAGE); };
  const download = async () => {
    try {
      const f = await exportCsv.mutateAsync(q);
      const url = URL.createObjectURL(new Blob([f.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = f.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Export ready", description: `${f.rows} ${f.rows === 1 ? "row" : "rows"} in ${f.filename}. This download is recorded in the audit log.`, tone: "success" });
    } catch (e) { toast({ title: "No file made", description: isApiError(e) ? e.message : "Try again.", tone: "error" }); }
  };
  const doReopen = async () => {
    if (!reopening) return;
    setError(undefined);
    try {
      await reopen.mutateAsync({ branchId: reopening.branchId, date: reopening.date, reason });
      toast({ title: "Day reopened", description: `${reopening.label} takes cash again. Close it again with a new count. The reason is in the audit log.`, tone: "success" });
      setReopening(null); setReason("");
    } catch (e) { setError(isApiError(e) ? e.message : "We couldn’t reopen it. Try again."); }
  };
  const field = "h-11 rounded-xl border border-clay-line bg-white px-3";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Reports</h1>
        <Button3D variant="white" size="md" disabled={exportCsv.isPending} onClick={() => void download()}><Download className="h-4 w-4" aria-hidden="true" />{exportCsv.isPending ? "Preparing…" : "Download CSV"}</Button3D>
      </header>
      <div className="grid gap-5 md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Reports" className="md:sticky md:top-4 md:self-start">
          <label className="block md:hidden"><span className="sr-only">Report</span>
            <select value={id} onChange={(e) => set({ report: e.target.value })} className={cn(field, "w-full font-semibold")}>{REPORT_IDS.map((r) => <option key={r} value={r}>{REPORTS[r].title}</option>)}</select>
          </label>
          <ul className="hidden gap-1 md:grid">
            {REPORT_IDS.map((r) => <li key={r}><button type="button" aria-current={r === id ? "page" : undefined} onClick={() => set({ report: r })} className={cn("flex min-h-[2.75rem] w-full cursor-pointer items-center rounded-xl px-3 text-left font-semibold", r === id ? "bg-clay-ink text-white" : "hover:bg-white")}>{REPORTS[r].title}</button></li>)}
          </ul>
        </nav>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold">{id === "memberships" ? "As at" : "From"}<input type="date" value={id === "memberships" ? to : from} max={to} onChange={(e) => e.target.value && set(id === "memberships" ? { to: e.target.value, from } : { from: e.target.value, to })} className={cn(field, "mt-1 block")} /></label>
            {id !== "memberships" && <label className="text-sm font-semibold">To<input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && set({ to: e.target.value, from })} className={cn(field, "mt-1 block")} /></label>}
          </div>
          <QueryBoundary query={query} errorTitle="We couldn’t build this report" skeleton={<SkeletonRows rows={6} />}>
            {(r) => <Report r={r} shown={shown} more={() => setShown((n) => n + PAGE)} reopen={(x) => { setReopening(x); setReason(""); setError(undefined); }} />}
          </QueryBoundary>
        </div>
      </div>
      <Sheet open={!!reopening} onClose={() => setReopening(null)} label="Reopen cash day" kind="confirm" className="p-5">
        <h2 className="text-xl font-bold">Reopen {reopening?.label}</h2>
        <p className="text-clay-muted">Cash can be recorded for this day again, and it has to be closed again with a new count. Your name and the reason are kept in the audit log.</p>
        <label className="mt-3 block"><span className="font-semibold">Reason</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-clay-line bg-white p-3" /></label>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row"><Button3D variant="ember" size="lg" className="sm:flex-1" disabled={reopen.isPending} onClick={() => void doReopen()}>{reopen.isPending ? "Reopening…" : "Reopen the day"}</Button3D><Button3D variant="white" size="lg" onClick={() => setReopening(null)}>Not yet</Button3D></div>
      </Sheet>
    </div>
  );
}

function Report({ r, shown, more, reopen }: { r: ReportData; shown: number; more: () => void; reopen: (x: { branchId: string; date: string; label: string }) => void }) {
  const rows = r.rows.slice(0, shown);
  const reopenFor = (row: Record<string, Cell>) => r.reopenable?.find((x) => x.label.startsWith(String(row.branch)) && x.date === row.date && row.status === "Closed");
  return (
    <>
      <p className="max-w-[70ch] text-[0.95rem] text-clay-muted">{r.definition} For {r.branches.join(", ")}.</p>
      <dl aria-label="Summary" className="grid grid-cols-3 gap-3">
        {r.summary.map((s) => <div key={s.label} className="clay p-3 sm:p-4"><dt className="text-xs text-clay-muted sm:text-sm">{s.label}</dt><dd className="font-display text-xl font-extrabold tabular sm:text-2xl">{show({ key: s.label, header: s.label, kind: s.kind }, s.value)}</dd></div>)}
      </dl>
      {r.rows.length === 0 ? <EmptyState title="Nothing in this range">Change the dates{r.branches.length > 1 ? " or choose one branch" : ""} to see more.</EmptyState> : (
        <>
          <ResponsiveTable
            caption={r.title}
            rows={rows}
            rowKey={(_, i) => String(i)}
            columns={[
              ...r.columns.map((c, i) => ({ key: c.key, header: c.header, primary: i === 0, align: c.align, cell: (row: Record<string, Cell>) => (i === 0 ? <span className="font-semibold">{show(c, row[c.key] ?? null)}</span> : show(c, row[c.key] ?? null)) })),
              ...(r.reopenable ? [{ key: "act", header: "", action: true, cell: (row: Record<string, Cell>) => { const x = reopenFor(row); return x ? <Button3D size="md" variant="white" onClick={() => reopen(x)} aria-label={`Reopen ${x.label}`}><RotateCcw className="h-4 w-4" aria-hidden="true" />Reopen</Button3D> : null; } }] : []),
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-clay-muted">Showing {Math.min(shown, r.rows.length)} of {r.rows.length}. The CSV has every row.</p>
            {shown < r.rows.length && <Button3D variant="white" size="md" onClick={more}>Show more</Button3D>}
          </div>
        </>
      )}
    </>
  );
}
