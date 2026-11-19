import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useMe } from "@/api/hooks";
import { useFinanceList } from "@/api/financeHooks";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { InvoiceStatusPill } from "@/design/StatusPills";
import { ResponsiveTable } from "@/design/layout/ResponsiveTable";
import { useBranch } from "@/design/shells/BranchContext";
import { istDateOf } from "@/domain/dates";
import { cn } from "@/lib/format";
import { formatDate, formatRupees } from "@/lib/when";

const INVOICE_STATUS = [["all", "All statuses"], ["open", "Open"], ["partially_paid", "Part paid"], ["overdue", "Overdue"], ["paid", "Paid"], ["void", "Void"]] as const;
const PAYMENT_STATUS = [["all", "All statuses"], ["succeeded", "Succeeded"], ["failed", "Failed"], ["pending", "Pending"]] as const;
const METHOD: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", netbanking: "Net banking", transfer: "Bank transfer", online: "Online", credit_note: "Credit note" };

/**
 * Invoices and payments (M03, O07): search and filter by status, branch and date. Billed (what was invoiced) and collected (money received) are shown
 * apart, with what is still due and what was refunded; the totals follow the filters, not only the page on screen.
 */
export default function FinanceInvoices() {
  useMe();
  const { branchId } = useBranch();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "payments" ? "payments" : "invoices";
  const status = params.get("status") ?? "all";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const [text, setText] = useState(params.get("q") ?? "");
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) (v && v !== "all" ? n.set(k, v) : n.delete(k)); if (!("page" in patch)) n.delete("page"); setParams(n, { replace: true }); };
  const query = useFinanceList({ view, branchId: branchId === "all" ? undefined : branchId, status, q: params.get("q") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, page });
  const options = view === "invoices" ? INVOICE_STATUS : PAYMENT_STATUS;
  const field = "h-11 rounded-xl border border-clay-line bg-white px-3";
  return (
    <div className="space-y-4">
      <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Invoices and payments</h1>
      <div role="radiogroup" aria-label="Show" className="flex gap-2">
        {([["invoices", "Invoices"], ["payments", "Payments"]] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => set({ view: v === "invoices" ? "" : v, status: "" })} className={cn("min-h-[2.75rem] cursor-pointer rounded-full px-5 font-semibold", view === v ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{l}</button>)}
      </div>
      <form role="search" aria-label="Filters" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }); }} className="flex flex-wrap items-end gap-3">
        <label className="relative block min-w-[12rem] flex-1"><span className="sr-only">Search</span><Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-clay-muted" aria-hidden="true" /><input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={view === "invoices" ? "Invoice number, name or phone" : "Receipt, reference or name"} className={cn(field, "w-full pl-11")} /></label>
        <label className="text-sm font-semibold">Status<select value={status} onChange={(e) => set({ status: e.target.value })} className={cn(field, "mt-1 block")}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="text-sm font-semibold">From<input type="date" value={params.get("from") ?? ""} onChange={(e) => set({ from: e.target.value })} className={cn(field, "mt-1 block")} /></label>
        <label className="text-sm font-semibold">To<input type="date" value={params.get("to") ?? ""} onChange={(e) => set({ to: e.target.value })} className={cn(field, "mt-1 block")} /></label>
        <Button3D type="submit" variant="white" size="md">Search</Button3D>
      </form>
      <QueryBoundary query={query} errorTitle="We couldn’t load the list" skeleton={<SkeletonRows rows={8} />}>
        {(d) => (
          <>
            <dl aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {([["Billed", d.totals.billedPaise, "Invoiced, before any payment"], ["Collected", d.totals.collectedPaise, "Money received"], ["Still due", d.totals.duePaise, "Billed less paid and credit notes"], ["Refunded", d.totals.refundedPaise, "Paid back to members"]] as const).map(([l, v, hint]) => <div key={l} className="clay p-4"><dt className="text-sm text-clay-muted">{l}</dt><dd className="font-display text-2xl font-extrabold tabular lg:text-3xl">{formatRupees(v)}</dd><p className="text-xs text-clay-muted">{hint}</p></div>)}
            </dl>
            {d.total === 0 ? <EmptyState title={view === "invoices" ? "No invoices match" : "No payments match"}>Clear a filter or widen the dates.</EmptyState> : view === "invoices" ? (
              <ResponsiveTable caption="Invoices" rows={d.invoices} rowKey={(r) => r.id} columns={[
                { key: "n", header: "Invoice", primary: true, cell: (r) => <Link to={`/desk/members/${r.memberId}/invoices/${r.id}`} className="inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">{r.number}</Link> },
                { key: "m", header: "Member", cell: (r) => r.memberName },
                { key: "d", header: "Date", cell: (r) => formatDate(r.issuedOn) },
                { key: "b", header: "Branch", hideOnPhone: true, cell: (r) => r.branchName },
                { key: "t", header: "Billed", align: "right", cell: (r) => formatRupees(r.totalPaise) },
                { key: "p", header: "Paid", align: "right", hideOnPhone: true, cell: (r) => formatRupees(r.paidPaise) },
                { key: "u", header: "Due", align: "right", cell: (r) => <span className="font-semibold">{formatRupees(r.duePaise)}</span> },
                { key: "s", header: "Status", cell: (r) => <InvoiceStatusPill status={r.status} /> },
              ]} />
            ) : (
              <ResponsiveTable caption="Payments" rows={d.payments} rowKey={(r) => r.id} columns={[
                { key: "r", header: "Receipt", primary: true, cell: (r) => <span className="font-semibold">{r.receiptNumber ?? "No receipt"}</span> },
                { key: "m", header: "Member", cell: (r) => r.memberName },
                { key: "d", header: "Date", cell: (r) => formatDate(istDateOf(r.at)) },
                { key: "i", header: "Invoice", hideOnPhone: true, cell: (r) => r.invoiceNumber },
                { key: "b", header: "Branch", hideOnPhone: true, cell: (r) => r.branchName },
                { key: "me", header: "Method", cell: (r) => METHOD[r.method] ?? r.method },
                { key: "a", header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{formatRupees(r.amountPaise)}</span> },
                { key: "s", header: "Status", cell: (r) => (r.status === "succeeded" ? "Succeeded" : r.status === "failed" ? "Failed" : "Pending") },
                { key: "rc", header: "Matching", hideOnPhone: true, cell: (r) => (r.reconciliation === "matched" ? "Matched" : r.reconciliation === "flagged" ? "Flagged" : r.method === "cash" || r.method === "transfer" ? "Not applicable" : "Waiting") },
              ]} />
            )}
            {d.total > d.pageSize && (
              <nav aria-label="Pages" className="flex items-center justify-between gap-3">
                <Button3D variant="white" size="md" disabled={d.page <= 1} onClick={() => set({ page: String(d.page - 1) })}>Previous</Button3D>
                <p className="text-sm text-clay-muted">Page {d.page} of {Math.ceil(d.total / d.pageSize)}, {d.total} in all</p>
                <Button3D variant="white" size="md" disabled={d.page * d.pageSize >= d.total} onClick={() => set({ page: String(d.page + 1) })}>Next</Button3D>
              </nav>
            )}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
