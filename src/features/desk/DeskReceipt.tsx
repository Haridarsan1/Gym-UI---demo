import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useDeskReceipt } from "@/api/deskHooks";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { ReceiptSheet } from "@/features/shared/ReceiptSheet";

/** One invoice as the tax receipt (M03), to show or print: the same document the member gets. */
export default function DeskReceipt() {
  const { memberId, invoiceId } = useParams();
  const query = useDeskReceipt(invoiceId);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Link to={`/desk/members/${memberId}?tab=billing`} className="print-hide -ml-1 inline-flex min-h-[2.75rem] items-center gap-1 font-semibold text-ember-700"><ChevronLeft className="h-5 w-5" aria-hidden="true" />Invoices and payments</Link>
      <QueryBoundary query={query} errorTitle="We couldn’t open this receipt" skeleton={<SkeletonCard label="Loading receipt" />}>
        {(r) => <ReceiptSheet r={r} />}
      </QueryBoundary>
    </div>
  );
}
