import { ChevronLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useReceipt } from "@/api";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { ReceiptSheet } from "@/features/shared/ReceiptSheet";

/**
 * The Indian tax receipt for one invoice (M03): the gym’s registered name, address and GSTIN, the invoice number and date, SAC,
 * place of supply, CGST and SGST (or IGST), the total in words, and the payments. “Save as PDF” opens the browser’s print
 * window, where PDF is a destination, so no PDF library is needed.
 */
export default function Receipt() {
  const { invoiceId } = useParams();
  const query = useReceipt(invoiceId);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Link to="/m/membership" className="print-hide -ml-1 inline-flex min-h-[2.75rem] items-center gap-1 font-semibold text-ember-700">
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        Membership
      </Link>
      <QueryBoundary query={query} errorTitle="We couldn’t open this receipt" skeleton={<SkeletonCard label="Loading your receipt" />}>
        {(r) => <ReceiptSheet r={r} payTo={`/m/membership?pay=${r.invoice.id}`} />}
      </QueryBoundary>
    </div>
  );
}
