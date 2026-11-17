import { CalendarClock } from "lucide-react";
import type { BookingPolicy, BookingView } from "@/api";
import { Button3D } from "@/design/Button3D";
import { istDateOf } from "@/domain/dates";
import { formatTime, formatWeekdayDate, freeCancellationText, lateTermsText } from "@/lib/when";

/** Status in words. Attended is filled mint; everything else is neutral. A no-show is never shown in red. */
const PILL: Record<string, { label: string; className: string }> = {
  booked: { label: "Booked", className: "bg-lilac-100 text-lilac-700" },
  attended: { label: "Attended", className: "bg-status-active-bg text-status-active-fg" },
  canceled: { label: "Cancelled", className: "bg-status-expired-bg text-status-expired-fg" },
  no_show: { label: "No-show", className: "bg-status-expired-bg text-status-expired-fg" },
  awaiting: { label: "Time passed", className: "bg-status-expired-bg text-status-expired-fg" },
};

function Pill({ kind }: { kind: keyof typeof PILL }) {
  const p = PILL[kind]!;
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${p.className}`}>{p.label}</span>;
}

const when = (b: BookingView) => `${formatWeekdayDate(istDateOf(b.startsAt))}, ${formatTime(b.startsAt)} to ${formatTime(b.endsAt)}`;
const coach = (name: string) => `Coach ${name.split(" ")[0]}`;

/** An upcoming session: when, who, the exact free-cancellation time and the late terms, and what can be done with it. */
export function UpcomingCard({ b, policy, nowIso, onReschedule, onCancel }: { b: BookingView; policy: BookingPolicy; nowIso: string; onReschedule: () => void; onCancel: () => void }) {
  return (
    <article aria-label={`${formatWeekdayDate(istDateOf(b.startsAt))}, ${formatTime(b.startsAt)} with ${coach(b.trainerName)}`} className="clay p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold leading-tight">{formatWeekdayDate(istDateOf(b.startsAt))}, {formatTime(b.startsAt)}</h3>
          <p className="text-clay-muted">{when(b)}</p>
        </div>
        <Pill kind="booked" />
      </div>
      <p className="mt-2 flex items-center gap-2 font-semibold">
        <CalendarClock className="h-4 w-4 text-clay-muted" aria-hidden="true" />
        {coach(b.trainerName)}
      </p>
      <p className="text-sm text-clay-muted">{b.branchName}</p>
      <p className="mt-3 text-[0.95rem] font-semibold">{freeCancellationText(b.freeUntil, nowIso, policy.lateCancelConsumesCredit)}</p>
      <p className="text-sm text-clay-muted">{lateTermsText(b.freeUntil, nowIso, policy.lateCancelConsumesCredit, policy.noShowConsumesCredit)}</p>
      {b.canCancel ? (
        <div className="mt-4 flex gap-3">
          {b.canReschedule ? (
            <Button3D variant="white" className="flex-1" onClick={onReschedule}>
              Reschedule
            </Button3D>
          ) : null}
          <Button3D variant="white" className="flex-1" onClick={onCancel}>
            Cancel session
          </Button3D>
        </div>
      ) : (
        <p className="mt-3 text-sm text-clay-muted">This session has started, so it can’t be changed.</p>
      )}
      {b.canCancel && !b.canReschedule && <p className="mt-2 text-sm text-clay-muted">Moving a session was free until {formatTime(b.freeUntil)} {formatWeekdayDate(istDateOf(b.freeUntil))}. You can still cancel it under the late terms.</p>}
    </article>
  );
}

/** A finished booking and how it ended, in plain neutral words. */
export function PastCard({ b }: { b: BookingView }) {
  const kind = b.awaitingMark ? "awaiting" : b.status;
  const note =
    b.status === "attended" ? "You trained. The session credit was used."
    : b.status === "no_show" ? "You did not turn up this time. The session credit was used."
    : b.status === "canceled" ? (b.credit === "used" ? "Cancelled after the free-cancellation time. The session credit was used." : "Cancelled in time. The session credit went back to your balance.")
    : b.awaitingMark ? "The session time has passed. Your trainer will mark it attended." : "";
  return (
    <article aria-label={`${formatWeekdayDate(istDateOf(b.startsAt))}, ${formatTime(b.startsAt)} with ${coach(b.trainerName)}, ${PILL[kind]!.label}`} className="clay-flat p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{formatWeekdayDate(istDateOf(b.startsAt))}, {formatTime(b.startsAt)}</h3>
          <p className="text-sm text-clay-muted">{coach(b.trainerName)}, {b.branchName}</p>
        </div>
        <Pill kind={kind} />
      </div>
      {note && <p className="mt-2 text-sm text-clay-muted">{note}</p>}
    </article>
  );
}
