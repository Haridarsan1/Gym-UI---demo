import { Link } from "react-router-dom";
import type { TodayData } from "@/api/member";
import { MembershipStatusPill } from "@/design/StatusPills";
import { formatDate } from "@/lib/when";

function daysText(days: number): string {
  if (days === 0) return "ends today";
  if (days === 1) return "1 day left";
  if (days > 1) return `${days} days left`;
  return `ended ${-days} ${days === -1 ? "day" : "days"} ago`;
}

/** Plan, status, when it ends, and visits left on a visit pass. */
export function MembershipCard({ t }: { t: TodayData }) {
  const m = t.membership;
  if (!m) return null;
  return (
    <section aria-labelledby="membership-title" className="clay-flat p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="membership-title" className="font-bold">{m.planName}</h2>
        <MembershipStatusPill status={m.status} />
      </div>
      {m.endsOn && (
        <p className="mt-2 text-[0.95rem] text-clay-muted">
          {m.status === "expired" || m.status === "canceled" ? "Ended" : m.visitsRemaining !== null ? "Valid until" : "Ends"} {formatDate(m.endsOn)}
          {m.daysLeft !== undefined && (m.status === "active" || m.status === "frozen" || m.status === "expired") ? ` (${daysText(m.daysLeft)})` : ""}
        </p>
      )}
      {m.visitsRemaining !== null && <p className="mt-1 text-[0.95rem] text-clay-muted">{m.visitsRemaining} {m.visitsRemaining === 1 ? "visit" : "visits"} left</p>}
      {m.renewedFrom && <p className="mt-1 text-[0.95rem] text-status-active-fg">Renewed: your next period starts {formatDate(m.renewedFrom)}.</p>}
      <Link to="/m/membership" className="mt-2 inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">
        Membership and receipts
      </Link>
    </section>
  );
}
