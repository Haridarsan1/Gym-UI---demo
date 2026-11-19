import { Link, useSearchParams } from "react-router-dom";
import { Bell } from "lucide-react";
import { useDues, useSendReminder } from "@/api/deskMoreHooks";
import type { DueRow } from "@/api/dues";
import { isApiError } from "@/api/errors";
import { useCan } from "@/app/SessionContext";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { ResponsiveTable } from "@/design/layout/ResponsiveTable";
import { useBranch } from "@/design/shells/BranchContext";
import { useToast } from "@/design/Toast";
import { formatDate, formatRupees, formatTime } from "@/lib/when";
import { istDateOf } from "@/domain/dates";
import { cn } from "@/lib/format";

const FILTERS = [{ v: "all", l: "All dues" }, { v: "overdue", l: "Overdue" }, { v: "part", l: "Part paid" }] as const;

/**
 * Dues (M03, O04): unpaid and part-paid invoices at the person’s branches, longest overdue first, with a reminder that is emailed and logged, and
 * recent declined online payments. “Collect” opens the member’s payment sheet. A reminder can’t go twice in three days.
 */
export default function Dues() {
  const { branchId } = useBranch();
  const [params, setParams] = useSearchParams();
  const f = FILTERS.some((x) => x.v === params.get("show")) ? (params.get("show") as (typeof FILTERS)[number]["v"]) : "all";
  const query = useDues(branchId === "all" ? undefined : branchId);
  const remind = useSendReminder();
  const toast = useToast();
  const canPay = useCan()("payment.record");
  const canRemind = useCan()("message.send");
  const send = async (r: DueRow) => {
    try {
      const x = await remind.mutateAsync(r.invoiceId);
      toast({ title: x.skipped ? "No email on file" : `Reminder sent to ${r.name.split(" ")[0]}`, description: x.skipped ? "It is in the log as not sent." : `Emailed to ${x.sentTo}.`, tone: x.skipped ? "info" : "success" });
    } catch (e) {
      toast({ title: "No reminder sent", description: isApiError(e) ? e.message : "Try again.", tone: "error" });
    }
  };
  return (
    <div className="space-y-4">
      <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Dues</h1>
      <QueryBoundary query={query} errorTitle="We couldn’t load the dues" skeleton={<SkeletonRows rows={6} />}>
        {(d) => {
          const rows = d.rows.filter((r) => (f === "overdue" ? r.daysOverdue > 0 : f === "part" ? r.partPaid : true));
          return (
            <>
              <dl className="grid max-w-xl grid-cols-2 gap-3">
                <div className="clay p-4"><dt className="text-sm text-clay-muted">Owed</dt><dd className="font-display text-3xl font-extrabold tabular">{formatRupees(d.totalPaise)}</dd></div>
                <div className="clay p-4"><dt className="text-sm text-clay-muted">Overdue</dt><dd className="font-display text-3xl font-extrabold tabular">{formatRupees(d.overduePaise)}</dd></div>
              </dl>
              <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
                {FILTERS.map((x) => <button key={x.v} type="button" role="radio" aria-checked={f === x.v} onClick={() => setParams(x.v === "all" ? {} : { show: x.v }, { replace: true })} className={cn("min-h-[2.75rem] cursor-pointer rounded-full px-4 text-sm font-semibold", f === x.v ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{x.l}</button>)}
              </div>
              {rows.length === 0 ? <EmptyState title="Nothing to chase">{f === "all" ? "Every invoice at this branch is paid." : "No invoice matches this filter."}</EmptyState> : (
                <ResponsiveTable
                  caption="Dues"
                  rows={rows}
                  rowKey={(r) => r.invoiceId}
                  columns={[
                    { key: "name", header: "Member", primary: true, cell: (r) => <span className="font-semibold">{r.name}</span> },
                    { key: "inv", header: "Invoice", cell: (r) => r.number },
                    { key: "due", header: "Due", align: "right", cell: (r) => <span className="font-semibold tabular">{formatRupees(r.duePaise)}</span> },
                    { key: "late", header: "Overdue", cell: (r) => (r.daysOverdue > 0 ? `${r.daysOverdue} ${r.daysOverdue === 1 ? "day" : "days"}` : r.partPaid ? "Part paid" : "Not yet") },
                    { key: "branch", header: "Branch", hideOnPhone: true, cell: (r) => r.branchName },
                    { key: "rem", header: "Reminder", hideOnPhone: true, cell: (r) => (r.lastReminderAt ? `${formatDate(istDateOf(r.lastReminderAt))}, ${formatTime(r.lastReminderAt)}` : "None sent") },
                    {
                      key: "act", header: "", action: true, cell: (r) => (
                        <span className="flex flex-wrap items-center justify-end gap-2">
                          {canRemind && <Button3D size="md" variant="white" disabled={!!r.coolingUntil || remind.isPending} onClick={() => void send(r)} aria-label={`Send ${r.name} a reminder`}><Bell className="h-4 w-4" aria-hidden="true" />{r.coolingUntil ? `Sent, again ${formatDate(r.coolingUntil)}` : "Remind"}</Button3D>}
                          {canPay && <Link to={`/desk/members/${r.memberId}?collect=${r.invoiceId}`} aria-label={`Collect from ${r.name}`} className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center rounded-2xl bg-ember-600 px-4 font-bold text-white hover:bg-ember-700">Collect</Link>}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
              {d.failed.length > 0 && (
                <section aria-labelledby="fail-title" className="clay p-4 sm:p-5">
                  <h2 id="fail-title" className="text-lg font-bold">Declined online payments</h2>
                  <p className="text-sm text-clay-muted">The last 14 days. No money was taken. The member can try again, or pay at the desk.</p>
                  <ul aria-label="Declined payments" className="mt-2 divide-y divide-clay-line">
                    {d.failed.map((x) => <li key={x.paymentId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><Link to={`/desk/members/${x.memberId}`} className="inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">{x.name}</Link> <span className="text-sm text-clay-muted">{formatDate(istDateOf(x.at))}, invoice {x.invoiceNumber}</span></span><span className="tabular font-semibold">{formatRupees(x.amountPaise)}</span></li>)}
                  </ul>
                </section>
              )}
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
