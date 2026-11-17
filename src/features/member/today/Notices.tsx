import { Link } from "react-router-dom";
import { Receipt, Snowflake } from "lucide-react";
import type { TodayData } from "@/api/member";
import { formatDate, formatRupees } from "@/lib/when";

const link = "font-semibold underline underline-offset-4";

/** Things that need attention before anything else. Plain and calm: money and access are never shown in red. */
export function Notices({ t }: { t: TodayData }) {
  const m = t.membership;
  return (
    <div className="space-y-3 empty:hidden">
      {t.dues && (
        <aside aria-label="Payment due" className="flex items-start gap-3 rounded-2xl bg-status-pending-bg px-4 py-3 text-status-pending-fg">
          <Receipt className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="text-[0.95rem]">
            {t.dues.overdue
              ? `Invoice ${t.dues.invoiceNumber} of ${formatRupees(t.dues.totalPaise)} was due ${t.dues.overdueDays} ${t.dues.overdueDays === 1 ? "day" : "days"} ago.`
              : `You have ${formatRupees(t.dues.totalPaise)} to pay on invoice ${t.dues.invoiceNumber}.`}{" "}
            <Link to="/m/membership" className={link}>
              See invoice
            </Link>
          </p>
        </aside>
      )}
      {m?.status === "frozen" && (
        <aside aria-label="Membership frozen" className="flex items-start gap-3 rounded-2xl bg-status-frozen-bg px-4 py-3 text-status-frozen-fg">
          <Snowflake className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="text-[0.95rem]">
            Your membership is frozen{m.frozenUntil ? ` until ${formatDate(m.frozenUntil)}` : ""}. Your streak is paused and nothing counts as missed.
          </p>
        </aside>
      )}
    </div>
  );
}
