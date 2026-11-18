import { ChevronLeft, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useReceipt } from "@/api";
import type { ReceiptData } from "@/api";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { InvoiceStatusPill } from "@/design/StatusPills";
import { istDateOf } from "@/domain/dates";
import { formatDate, formatRupees } from "@/lib/when";

/**
 * The Indian tax receipt for one invoice (M03): the gym’s registered name, address and GSTIN, the invoice number and date, SAC,
 * place of supply, CGST and SGST (or IGST), the total in words, and the payments. “Save as PDF” opens the browser’s print
 * window, where PDF is a destination, so no PDF library is needed.
 */
export default function Receipt() {
  const { invoiceId } = useParams();
  const query = useReceipt(invoiceId);
  return (
    <div className="space-y-4">
      <Link to="/m/membership" className="print-hide -ml-1 inline-flex min-h-[2.75rem] items-center gap-1 font-semibold text-ember-700">
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        Membership
      </Link>
      <QueryBoundary query={query} errorTitle="We couldn’t open this receipt" skeleton={<SkeletonCard label="Loading your receipt" />}>
        {(r) => <ReceiptSheet r={r} />}
      </QueryBoundary>
    </div>
  );
}

const rate = (bp: number) => `${bp / 100}%`;

function ReceiptSheet({ r }: { r: ReceiptData }) {
  const t = r.totals;
  const igst = t.igstPaise > 0;
  return (
    <>
      <article aria-labelledby="receipt-title" className="receipt-sheet clay space-y-5 p-5">
        <header>
          <p className="text-lg font-bold leading-tight">{r.supplier.legalName}</p>
          {r.supplier.address && <p className="text-[0.95rem] text-clay-muted">{r.supplier.address}</p>}
          {r.supplier.gstin && <p className="text-[0.95rem]">GSTIN {r.supplier.gstin}, {r.supplier.stateName} ({r.supplier.stateCode})</p>}
        </header>

        <div className="flex items-start justify-between gap-3">
          <h1 id="receipt-title" className="text-[1.6rem] font-bold leading-tight tracking-tight">{r.title}</h1>
          <InvoiceStatusPill status={r.invoice.overdue ? "overdue" : r.invoice.status} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.95rem]">
          <Meta label="Invoice number" value={r.invoice.number} />
          <Meta label="Invoice date" value={formatDate(r.invoice.issuedOn)} />
          <Meta label="Due date" value={formatDate(r.invoice.dueOn)} />
          <Meta label="Place of supply" value={`${r.placeOfSupply.name} (${r.placeOfSupply.code})`} />
          <Meta label="Service code (SAC)" value={r.invoice.sac} />
          <Meta label="Branch" value={r.billTo.branchName} />
        </dl>

        <section aria-label="Billed to">
          <h2 className="font-bold">Billed to</h2>
          <p>{r.billTo.name}</p>
          <p className="text-[0.95rem] text-clay-muted">{r.billTo.phone}{r.billTo.email ? `, ${r.billTo.email}` : ""}</p>
        </section>

        <section aria-label="Items">
          <h2 className="font-bold">Items</h2>
          <ul className="mt-1 divide-y divide-clay-line">
            {r.lines.map((l) => (
              <li key={l.description} className="py-2">
                <p className="font-semibold">{l.description}</p>
                <p className="text-sm text-clay-muted">SAC {l.sac}, {l.quantity} × {formatRupees(l.unitPaise)}</p>
                <p className="text-sm text-clay-muted">Taxable value {formatRupees(l.taxablePaise)}, GST {rate(l.taxRateBp)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Totals">
          <dl className="space-y-1 text-[0.95rem]">
            <Row label="Taxable value" value={formatRupees(t.taxablePaise)} />
            {t.discountPaise > 0 && <Row label="Discount already taken off" value={formatRupees(t.discountPaise)} />}
            {igst ? (
              <Row label={`IGST${r.rateBp ? ` ${rate(r.rateBp)}` : ""}`} value={formatRupees(t.igstPaise)} />
            ) : (
              <>
                <Row label={`CGST${r.rateBp ? ` ${rate(r.rateBp)}` : ""}`} value={formatRupees(t.cgstPaise)} />
                <Row label={`SGST${r.rateBp ? ` ${rate(r.rateBp)}` : ""}`} value={formatRupees(t.sgstPaise)} />
              </>
            )}
            <div className="flex justify-between border-t border-clay-line pt-2 text-lg font-bold"><dt>Total</dt><dd>{formatRupees(t.totalPaise)}</dd></div>
          </dl>
          <p className="mt-1 text-sm text-clay-muted">{r.amountInWords}</p>
        </section>

        <section aria-label="Payments">
          <h2 className="font-bold">Payments</h2>
          {r.payments.length === 0 ? (
            <p className="text-[0.95rem] text-clay-muted">No payment received yet.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-[0.95rem]">
              {r.payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3">
                  <span>
                    {formatDate(istDateOf(p.at))}, {p.methodLabel}
                    <span className="block text-sm text-clay-muted">{p.receiptNumber ? `Receipt ${p.receiptNumber}` : ""}{p.reference ? `, reference ${p.reference}` : ""}</span>
                  </span>
                  <span className="font-semibold">{formatRupees(p.amountPaise)}</span>
                </li>
              ))}
            </ul>
          )}
          {r.duePaise > 0 ? <p className="mt-2 font-bold">Balance to pay: {formatRupees(r.duePaise)}</p> : <p className="mt-2 font-bold text-status-active-fg">Paid in full</p>}
        </section>

        <p className="text-xs text-clay-muted">This is a computer-generated tax invoice and needs no signature. GST rules are confirmed by the gym’s accountant.</p>
      </article>

      <div className="print-hide space-y-3">
        {r.duePaise > 0 && (
          <Button3DLink to={`/m/membership?pay=${r.invoice.id}`} size="lg" className="w-full">
            Pay {formatRupees(r.duePaise)}
          </Button3DLink>
        )}
        <Button3D variant="white" size="lg" className="w-full" onClick={() => window.print()}>
          <Printer className="h-5 w-5" aria-hidden="true" />
          Save as PDF
        </Button3D>
        <p className="px-1 text-sm text-clay-muted">In the window that opens, choose “Save as PDF” as the printer.</p>
      </div>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-clay-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
