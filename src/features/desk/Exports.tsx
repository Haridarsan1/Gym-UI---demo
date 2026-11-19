import { useState } from "react";
import { Download } from "lucide-react";
import { EXPORT_KINDS, type ExportKind } from "@/api/finance";
import { useCreateExport } from "@/api/financeHooks";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { useBranch } from "@/design/shells/BranchContext";
import { useToast } from "@/design/Toast";
import { cn } from "@/lib/format";

/**
 * Exports (O06, S03): CSV for the branches the person can see. Names and money only, never contact details or health records. Each download is audited.
 */
export default function Exports() {
  const { branchId } = useBranch();
  const create = useCreateExport();
  const toast = useToast();
  const [kind, setKind] = useState<ExportKind>("invoices");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string>();
  const go = async () => {
    setError(undefined);
    try {
      const f = await create.mutateAsync({ kind, branchId: branchId === "all" ? undefined : branchId, from: from || undefined, to: to || undefined });
      const url = URL.createObjectURL(new Blob([f.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = f.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Export ready", description: `${f.rows} ${f.rows === 1 ? "row" : "rows"} in ${f.filename}. This download is recorded in the audit log.`, tone: "success" });
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t make the file. Try again.");
    }
  };
  const field = "mt-1 block h-11 rounded-xl border border-clay-line bg-white px-3";
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Exports</h1>
      <p className="max-w-[70ch] text-clay-muted">Download a CSV for {branchId === "all" ? "all the branches you can see" : "the branch you have selected"}. It has names, ids and money. It has no phone numbers, emails or health records.</p>
      <div role="radiogroup" aria-label="What to export" className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(EXPORT_KINDS) as ExportKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("clay min-h-[2.75rem] cursor-pointer p-4 text-left", kind === k && "ring-2 ring-ember-600")}>
            <span className="block font-bold">{EXPORT_KINDS[k].label}</span>
            <span className="block text-sm text-clay-muted">{EXPORT_KINDS[k].detail}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
        <label className="text-sm font-semibold">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
        <Button3D variant="ember" size="lg" disabled={create.isPending} onClick={() => void go()}><Download className="h-5 w-5" aria-hidden="true" />{create.isPending ? "Preparing…" : "Download CSV"}</Button3D>
      </div>
      {error && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 font-semibold text-status-danger-fg">{error}</p>}
    </div>
  );
}
