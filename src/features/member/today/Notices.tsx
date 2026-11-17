import { CalendarClock, Receipt, Snowflake } from "lucide-react";
import type { TodayData } from "@/api/member";
import { Button3DLink } from "@/design/Button3D";
import { formatDate, formatDayMonth, formatRupees } from "@/lib/when";

/** Things that need attention before anything else, each with the action to take. Calm: money and access are never shown in red. */
export function Notices({ t }: { t: TodayData }) {
  const m = t.membership;
  const endsSoon = m?.status === "active" && m.daysLeft !== undefined && m.daysLeft >= 0 && m.daysLeft <= 7;
  // With money owed, Pay is the only button; the renewal comes after it is paid.
  const ending = endsSoon && !t.dues;
  return (
    <div className="space-y-3 empty:hidden">
      {t.dues && (
        <aside aria-label="Payment due" className="rounded-2xl bg-status-pending-bg px-4 py-4 text-status-pending-fg">
          <div className="flex items-start gap-3">
            <Receipt className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-[0.95rem]">
              {t.dues.overdue
                ? `Invoice ${t.dues.invoiceNumber} of ${formatRupees(t.dues.invoiceDuePaise)} was due ${t.dues.overdueDays} ${t.dues.overdueDays === 1 ? "day" : "days"} ago.`
                : `You have ${formatRupees(t.dues.invoiceDuePaise)} to pay on invoice ${t.dues.invoiceNumber}.`}
            </p>
          </div>
          <Button3DLink to={`/m/membership?pay=${t.dues.invoiceId}`} className="mt-3 w-full">
            Pay {formatRupees(t.dues.invoiceDuePaise)}
          </Button3DLink>
        </aside>
      )}
      {endsSoon && t.dues && m && (
        <p className="px-1 text-[0.95rem] text-clay-muted">Your membership ends on {formatDayMonth(m.endsOn!)}. You can renew once this is paid.</p>
      )}
      {ending && m && (
        <aside aria-label="Membership ending soon" className="rounded-2xl bg-status-pending-bg px-4 py-4 text-status-pending-fg">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-[0.95rem]">
              Your membership {m.daysLeft === 0 ? "ends today" : `ends ${m.daysLeft === 1 ? "tomorrow" : `in ${m.daysLeft} days`}`}, on {formatDate(m.endsOn!)}.
            </p>
          </div>
          <Button3DLink to="/m/membership?renew=1" className="mt-3 w-full">
            Renew
          </Button3DLink>
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
