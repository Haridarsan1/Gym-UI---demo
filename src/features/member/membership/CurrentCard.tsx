import { Snowflake } from "lucide-react";
import type { MembershipData } from "@/api";
import { MembershipStatusPill } from "@/design/StatusPills";
import { formatDate, formatRupees } from "@/lib/when";

function daysText(days: number): string {
  if (days === 0) return "ends today";
  if (days === 1) return "1 day left";
  if (days > 1) return `${days} days left`;
  return `ended ${-days} ${days === -1 ? "day" : "days"} ago`;
}

/** The plan, its status and validity, visits left on a visit pass, freeze details, and what was agreed when it was sold (M01, M02). */
export function CurrentCard({ d }: { d: MembershipData }) {
  const m = d.current!;
  const ended = m.status === "expired" || m.status === "canceled";
  const visits = m.visitsRemaining !== null ? m.visitsRemaining : null;
  return (
    <section aria-labelledby="plan-title" className="clay p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-clay-muted">Your plan</p>
          <h2 id="plan-title" className="text-xl font-bold leading-tight">{m.planName}</h2>
        </div>
        <MembershipStatusPill status={m.status} />
      </div>

      {m.endsOn && (
        <p className="mt-3">
          <span className="font-semibold">{ended ? "Ended" : visits !== null ? "Use your visits by" : "Valid until"} {formatDate(m.endsOn)}</span>
          {m.daysLeft !== undefined && m.status !== "canceled" ? <span className="text-clay-muted"> ({daysText(m.daysLeft)})</span> : null}
        </p>
      )}
      <p className="text-sm text-clay-muted">Started {formatDate(m.startsOn)}</p>

      {visits !== null && (
        <div className="mt-4">
          <p>
            <span className="font-display text-5xl font-extrabold leading-none">{visits}</span>{" "}
            <span className="text-clay-muted">{visits === 1 ? "visit left" : "visits left"}{m.visitsTotal ? ` of ${m.visitsTotal}` : ""}</span>
          </p>
          {m.visitsTotal ? (
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-clay-lavender" role="img" aria-label={`${m.visitsTotal - visits} of ${m.visitsTotal} visits used`}>
              <div className="h-full rounded-full bg-ember-500" style={{ width: `${Math.round(((m.visitsTotal - visits) / m.visitsTotal) * 100)}%` }} />
            </div>
          ) : null}
        </div>
      )}

      {m.freeze && (m.freeze.current || m.status === "frozen") && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-status-frozen-bg px-4 py-3 text-status-frozen-fg">
          <Snowflake className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="text-[0.95rem]">
            <p className="font-semibold">Frozen from {formatDate(m.freeze.from)}{m.freeze.to ? ` until ${formatDate(m.freeze.to)}` : ""}</p>
            <p>Reason: {m.freeze.reason}. Your streak is paused and nothing counts as missed.</p>
          </div>
        </div>
      )}
      {m.canceledEffectiveOn && <p className="mt-3 text-[0.95rem] text-clay-muted">Canceled, effective {formatDate(m.canceledEffectiveOn)}.</p>}
      {m.graceUntil && m.graceUntil >= d.today && <p className="mt-3 text-[0.95rem] text-clay-muted">You can still train until {formatDate(m.graceUntil)} while you renew.</p>}

      {d.next && (
        <p className="mt-4 rounded-2xl bg-status-active-bg px-4 py-3 text-[0.95rem] text-status-active-fg">
          Renewed: {d.next.planName} starts {formatDate(d.next.startsOn)}{d.next.endsOn ? ` and runs until ${formatDate(d.next.endsOn)}` : ""}.
        </p>
      )}

      <h3 className="mt-5 font-bold">What your plan includes</h3>
      <ul className="mt-1 space-y-1 text-[0.95rem]" aria-label="What your plan includes">
        {m.includes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-clay-muted">Agreed when you joined: {formatRupees(m.agreedPricePaise)} plus 18% GST. Later price changes don’t affect this membership.</p>
    </section>
  );
}
