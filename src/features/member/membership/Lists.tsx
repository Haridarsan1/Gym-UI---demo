import { ChevronRight, Receipt, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import type { InvoiceRow, PaymentRow } from "@/api";
import { istDateOf } from "@/domain/dates";
import { EmptyState } from "@/design/States";
import { InvoiceStatusPill } from "@/design/StatusPills";
import { formatDate, formatRupees } from "@/lib/when";

/** Invoices, newest first. Invoice status is an outlined pill (M02). Each opens its tax receipt. */
export function InvoiceList({ invoices }: { invoices: InvoiceRow[] }) {
  const shown = invoices.filter((i) => i.status !== "void");
  if (shown.length === 0) return <EmptyState icon={Receipt} title="No invoices yet">When you join, renew or buy sessions, the invoice appears here with its tax receipt.</EmptyState>;
  return (
    <ul className="space-y-3" aria-label="Invoices">
      {shown.map((i) => (
        <li key={i.id}>
          <Link to={`/m/membership/invoices/${i.id}`} className="clay-flat flex min-h-[4.5rem] items-center justify-between gap-3 p-4">
            <span className="min-w-0">
              <span className="block truncate font-bold">{i.description}</span>
              <span className="block text-sm text-clay-muted">{i.number}, {formatDate(i.issuedOn)}</span>
              {i.duePaise > 0 && <span className="block text-sm text-clay-muted">{formatRupees(i.duePaise)} to pay, due {formatDate(i.dueOn)}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-right">
                <span className="block font-bold">{formatRupees(i.totalPaise)}</span>
                <InvoiceStatusPill status={i.overdue ? "overdue" : i.status} />
              </span>
              <ChevronRight className="h-5 w-5 text-clay-subtle" aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const PAY_PILL = {
  succeeded: { label: "Paid", cls: "border-[#2E9E5B] text-status-active-fg" },
  pending: { label: "Pending", cls: "border-[#D29A3A] text-status-pending-fg" },
  // A declined payment is not shown in red: nothing was taken, and nothing is wrong with the member.
  failed: { label: "Didn’t go through", cls: "border-[#D29A3A] text-status-pending-fg" },
} as const;

/** Every payment attempt, newest first, with a failed one saying what happened. */
export function PaymentHistory({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) return <EmptyState icon={Wallet} title="No payments yet">Payments you make online or at the front desk are listed here.</EmptyState>;
  return (
    <ul className="space-y-3" aria-label="Payments">
      {payments.map((p) => (
        <li key={p.id} className="clay-flat p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold">{formatRupees(p.amountPaise)} by {p.methodLabel}</p>
              <p className="text-sm text-clay-muted">{formatDate(istDateOf(p.at))}, invoice {p.invoiceNumber}</p>
              {p.status === "succeeded" && p.receiptNumber && <p className="text-sm text-clay-muted">Receipt {p.receiptNumber}{p.reference ? `, reference ${p.reference}` : ""}</p>}
              {p.status === "failed" && p.failureReason && <p className="mt-1 text-sm text-clay-muted">{p.failureReason}</p>}
            </div>
            <span className={`inline-flex shrink-0 items-center rounded-full border-[1.5px] px-2 py-[1px] text-xs font-semibold ${PAY_PILL[p.status].cls}`}>{PAY_PILL[p.status].label}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
