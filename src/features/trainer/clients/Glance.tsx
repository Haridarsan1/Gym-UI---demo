import type { ClientProfile } from "@/api/clients";
import { MembershipStatusPill } from "@/design/StatusPills";
import { formatDate, formatDayMonth } from "@/lib/when";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The client at a glance: membership and credits, when the next review is due, what needs attention, and who trained them
 * before. From 1280 px it is the third zone; below that it is the top of the Overview tab, so it is never the only way to
 * see any of this.
 */
export function Glance({ p }: { p: ClientProfile }) {
  return (
    <aside aria-label="Client at a glance" className="space-y-4">
      <section aria-labelledby="gl-membership" className="clay p-4">
        <h2 id="gl-membership" className="flex items-center justify-between gap-2 text-lg font-bold">
          Membership
          <MembershipStatusPill status={p.membership.status} />
        </h2>
        <p className="mt-2 font-semibold">{p.membership.planName}</p>
        <p className="text-sm text-clay-muted">{p.membership.endsOn ? `${formatDate(p.membership.startsOn)} to ${formatDate(p.membership.endsOn)}` : `From ${formatDate(p.membership.startsOn)}`}</p>
        {p.membership.visitsRemaining !== null && <p className="text-sm text-clay-muted">{plural(p.membership.visitsRemaining, "visit")} left</p>}
        <p className="mt-2 text-sm">
          <span className="font-semibold">{plural(p.credits.available, "training credit")}</span> free
          {p.credits.reserved > 0 ? `, ${p.credits.reserved} held for sessions` : ""}
        </p>
      </section>

      <section aria-labelledby="gl-attention" className="clay p-4">
        <h2 id="gl-attention" className="text-lg font-bold">Needs attention</h2>
        <ul className="mt-2 space-y-2 text-[0.95rem]">
          {p.review && (
            <li className="rounded-2xl bg-clay-canvas px-3 py-2">
              {p.review.overdue ? `Review ${plural(p.review.daysOver, "day")} overdue. ${p.review.reason}.` : `Next review ${formatDayMonth(p.review.dueOn)}, every ${p.review.cadenceDays} days.`}
            </li>
          )}
          {p.missed && <li className="rounded-2xl bg-clay-canvas px-3 py-2">Missed {p.missed.missed} of {p.missed.scheduled} workouts in the last 7 days{p.missed.lastDoneOn ? `. Last trained ${formatDayMonth(p.missed.lastDoneOn)}.` : "."}</li>}
          {p.awaiting && <li className="rounded-2xl bg-clay-canvas px-3 py-2">No plan yet. Waiting {plural(p.awaiting.daysWaiting, "day")} on {p.awaiting.planName}.</li>}
          {p.expiring && <li className="rounded-2xl bg-clay-canvas px-3 py-2">{plural(p.expiring.credits, "training credit")} expire {formatDayMonth(p.expiring.expiresOn)}.</li>}
          {!p.review?.overdue && !p.missed && !p.awaiting && !p.expiring && <li className="rounded-2xl bg-clay-canvas px-3 py-2 text-clay-muted">Nothing is waiting on you for {p.firstName}.</li>}
        </ul>
      </section>

      <section aria-labelledby="gl-history" className="clay p-4">
        <h2 id="gl-history" className="text-lg font-bold">Trainers</h2>
        <p className="mt-2 text-[0.95rem]">You, since {formatDate(p.trainer.assignedOn)}.</p>
        {p.trainer.previous.length > 0 ? (
          <ul className="mt-1 space-y-1 text-[0.95rem] text-clay-muted">
            {p.trainer.previous.map((t) => (
              <li key={`${t.trainerName}${t.from}`}>
                {t.trainerName}, {formatDayMonth(t.from)}{t.to ? ` to ${formatDayMonth(t.to)}` : ""}.
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[0.95rem] text-clay-muted">No earlier trainers.</p>
        )}
        <p className="mt-2 text-xs text-clay-muted">What earlier trainers wrote keeps its author. Their private notes stay with them.</p>
      </section>
    </aside>
  );
}
