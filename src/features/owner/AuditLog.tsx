import { useState } from "react";
import { Download, History } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuditExport, useAuditLog } from "@/api/ownerHooks";
import type { AuditRow, AuditView } from "@/api/audit";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { ResponsiveTable, type Column } from "@/design/layout/ResponsiveTable";
import { useBranch } from "@/design/shells/BranchContext";
import { useToast } from "@/design/Toast";
import { istDateOf } from "@/domain/dates";
import { cn } from "@/lib/format";
import { formatDate, formatTime } from "@/lib/when";

const PAGE = 50;
const field = "h-11 w-full rounded-xl border border-clay-line bg-white px-3";

/**
 * The audit log (S05): who did what, when, why and to which record, newest first, filtered by who, by kind and by date, and downloadable. The owner reads everything; a branch manager reads what concerns
 * their own branches. The filters are in the address, so a filtered view can be shared as a link.
 */
export default function AuditLog() {
  const { branchId } = useBranch();
  const [params] = useSearchParams();
  const [limit, setLimit] = useState(PAGE);
  const q = { branchId: branchId === "all" ? undefined : branchId, actorId: params.get("actor") ?? undefined, group: params.get("kind") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, limit };
  const query = useAuditLog(q);
  return (
    <div className="max-w-6xl space-y-4">
      <QueryBoundary query={query} errorTitle="We couldn’t load the audit log" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Audit log</h1><SkeletonRows rows={8} /></>}>
        {(v) => <Loaded v={v} q={q} more={() => setLimit((n) => n + PAGE)} />}
      </QueryBoundary>
    </div>
  );
}

function Loaded({ v, q, more }: { v: AuditView; q: { branchId?: string; actorId?: string; group?: string; from?: string; to?: string }; more: () => void }) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<AuditRow | null>(null);
  const exportCsv = useAuditExport();
  const toast = useToast();
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, val] of Object.entries(patch)) (val ? n.set(k, val) : n.delete(k)); setParams(n, { replace: true }); };
  const filtered = !!(q.actorId || q.group || q.from || q.to);
  const download = async () => {
    try {
      const f = await exportCsv.mutateAsync(q);
      const url = URL.createObjectURL(new Blob([f.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = f.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Download ready", description: `${f.rows} ${f.rows === 1 ? "line" : "lines"} in ${f.filename}. The download is itself in this log.`, tone: "success" });
    } catch (e) { toast({ title: "No file made", description: isApiError(e) ? e.message : "Try again.", tone: "error" }); }
  };
  const columns: Array<Column<AuditRow>> = [
    { key: "at", header: "When", cell: (r) => <span className="whitespace-nowrap">{formatDate(istDateOf(r.at))}<span className="block text-sm text-clay-muted">{formatTime(r.at)}</span></span> },
    { key: "what", header: "What", primary: true, cell: (r) => <span><span className="font-semibold">{r.label}</span><span className="block text-sm font-normal text-clay-muted capitalize-first">{r.record}</span></span> },
    { key: "who", header: "Who", cell: (r) => <span>{r.actor}<span className="block text-sm text-clay-muted">{r.role}</span></span> },
    { key: "why", header: "Reason", hideOnPhone: true, cell: (r) => <span className="text-[0.95rem]">{r.reason ?? <span className="text-clay-muted">–</span>}</span> },
    { key: "open", header: "", action: true, cell: (r) => <Button3D variant="white" size="md" onClick={() => setOpen(r)} aria-label={`Details of ${r.label} by ${r.actor}`}>Details</Button3D> },
  ];
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Audit log</h1><p className="max-w-[70ch] text-clay-muted">Who did what, when, why and to which record. It can’t be edited. {v.scopeNote}</p></div>
        <Button3D variant="white" size="md" disabled={exportCsv.isPending || v.matching === 0} onClick={() => void download()}><Download className="h-4 w-4" aria-hidden="true" />{exportCsv.isPending ? "Preparing…" : "Download CSV"}</Button3D>
      </header>
      <form aria-label="Filters" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
        <label className="block"><span className="text-sm font-semibold">Who</span><select value={q.actorId ?? ""} onChange={(e) => set({ actor: e.target.value })} className={field}><option value="">Everyone</option>{v.actors.map((a) => <option key={a.id} value={a.id}>{a.name}{a.role ? `, ${a.role}` : ""}</option>)}</select></label>
        <label className="block"><span className="text-sm font-semibold">Kind</span><select value={q.group ?? ""} onChange={(e) => set({ kind: e.target.value })} className={field}><option value="">Everything</option>{v.groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
        <label className="block"><span className="text-sm font-semibold">From</span><input type="date" value={q.from ?? ""} max={q.to ?? v.today} onChange={(e) => set({ from: e.target.value })} className={field} /></label>
        <label className="block"><span className="text-sm font-semibold">To</span><input type="date" value={q.to ?? ""} min={q.from} max={v.today} onChange={(e) => set({ to: e.target.value })} className={field} /></label>
      </form>
      <p role="status" className={cn("text-[0.95rem]", filtered ? "font-semibold" : "text-clay-muted")}>{v.matching === v.total ? `${v.total} ${v.total === 1 ? "entry" : "entries"}.` : `${v.matching} of ${v.total} entries match.`}{filtered && <> <button type="button" onClick={() => set({ actor: "", kind: "", from: "", to: "" })} className="min-h-[2.75rem] cursor-pointer px-1 font-semibold underline underline-offset-2">Clear the filters</button></>}</p>
      {v.rows.length === 0 ? <EmptyState icon={History} title={v.total === 0 ? "Nothing logged yet" : "Nothing matches"}>{v.total === 0 ? "Changes to memberships, refunds, credits, access and policies are recorded here as they happen." : "No entry has this person, kind and date. Clear the filters to see everything."}</EmptyState> : (
        <>
          <ResponsiveTable rows={v.rows} columns={columns} rowKey={(r) => r.id} caption="Audit log" onRowClick={(r) => setOpen(r)} />
          {v.matching > v.rows.length && <div><Button3D variant="white" size="md" onClick={more}>Show more ({v.matching - v.rows.length} left)</Button3D></div>}
        </>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} label="Audit entry">
        {open && (
          <div className="space-y-3 p-5">
            <h2 className="text-xl font-bold">{open.label}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.95rem]">
              <dt className="text-clay-muted">When</dt><dd>{formatDate(istDateOf(open.at))}, {formatTime(open.at)}</dd>
              <dt className="text-clay-muted">Who</dt><dd>{open.actor}, {open.role}</dd>
              <dt className="text-clay-muted">Record</dt><dd>{open.record}</dd>
              {open.reason && <><dt className="text-clay-muted">Reason</dt><dd>{open.reason}</dd></>}
            </dl>
            {open.details.length > 0 && <div><h3 className="font-bold">Details</h3><dl aria-label="Details" className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl bg-clay-canvas p-3 text-sm">{open.details.map((d, i) => <div key={`${d.key}${i}`} className="contents"><dt className="text-clay-muted">{d.key}</dt><dd className="break-words">{d.value}</dd></div>)}</dl></div>}
            <Button3D variant="white" size="md" onClick={() => setOpen(null)}>Close</Button3D>
          </div>
        )}
      </Sheet>
    </>
  );
}
