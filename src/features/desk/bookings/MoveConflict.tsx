import { useState } from "react";
import { useCalendarActions, useDeskConflictOptions } from "@/api/deskMoreHooks";
import type { CalendarBooking } from "@/api/deskBookings";
import { isApiError } from "@/api/errors";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { useToast } from "@/design/Toast";
import type { Slot } from "@/domain/slots";
import { formatTime, formatWeekdayDate } from "@/lib/when";

const newKey = () => `move-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

/** The desk’s side of trainer leave: move a session on leave to another time with the trainer, or to another trainer at the branch. The credit stays; the member is emailed. */
export function MoveConflict({ b, onClose }: { b: CalendarBooking; onClose: () => void }) {
  const query = useDeskConflictOptions(b.id);
  const { move } = useCalendarActions();
  const toast = useToast();
  const [error, setError] = useState<string>();
  const [key] = useState(newKey);
  const first = b.name.split(" ")[0];
  // `mutateAsync`: once it is moved the conflict list refreshes and this sheet goes away with it, which would drop a callback given to `mutate`.
  const go = async (slot: Slot, trainerId?: string, trainerName?: string) => {
    setError(undefined);
    try {
      await move.mutateAsync({ bookingId: b.id, startsAt: slot.startsAt, trainerId, key });
      toast({ title: `${first}’s session is moved`, description: `${formatWeekdayDate(slot.date)}, ${formatTime(slot.startsAt)}${trainerName ? ` with ${trainerName}` : ""}. ${first} has been emailed and the session credit is not affected.`, tone: "success" });
      onClose();
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t move it. Try again.");
    }
  };
  const days = (slots: Slot[]) => [...new Set(slots.map((s) => s.date))].map((d) => ({ date: d, slots: slots.filter((s) => s.date === d) }));
  const Slots = ({ slots, trainerId, name }: { slots: Slot[]; trainerId?: string; name?: string }) => (
    <div className="space-y-2">
      {days(slots).map((d) => (
        <div key={d.date}><p className="text-sm font-semibold text-clay-muted">{formatWeekdayDate(d.date)}</p>
          <ul className="mt-1 flex flex-wrap gap-2" aria-label={`${name ?? b.trainerName.split(" ")[0]}’s times on ${formatWeekdayDate(d.date)}`}>
            {d.slots.map((s) => <li key={s.startsAt}><button type="button" disabled={move.isPending} onClick={() => void go(s, trainerId, name)} aria-label={`Move to ${formatWeekdayDate(s.date)} ${formatTime(s.startsAt)}${name ? ` with ${name}` : ""}`} className="min-h-[2.75rem] min-w-[4.5rem] cursor-pointer rounded-xl border-2 border-clay-line bg-white px-3 font-semibold hover:border-ember-400 hover:bg-ember-50 disabled:opacity-60">{formatTime(s.startsAt)}</button></li>)}
          </ul>
        </div>
      ))}
    </div>
  );
  return (
    <Sheet open onClose={onClose} label={`Move ${first}’s session`} className="p-5">
      <h2 className="text-xl font-bold">Move {first}’s session</h2>
      <p className="text-clay-muted">{b.trainerName} is on leave on {formatWeekdayDate(b.startsAt.slice(0, 10))}. Pick a new time. {first} gets an email and keeps the session credit.</p>
      {error && <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <QueryBoundary query={query} errorTitle="We couldn’t load the free times" skeleton={<SkeletonRows rows={3} />}>
        {(o) => (
          <div className="mt-4 space-y-5">
            <section aria-labelledby="mc-same"><h3 id="mc-same" className="font-bold">With {b.trainerName.split(" ")[0]}</h3>{o.sameTrainer.length ? <div className="mt-2"><Slots slots={o.sameTrainer} /></div> : <p className="mt-1 text-sm text-clay-muted">No free times outside the leave in the booking window. Choose another trainer.</p>}</section>
            <section aria-labelledby="mc-others"><h3 id="mc-others" className="font-bold">With another trainer at {o.booking.branchName}</h3>
              {o.others.length === 0 ? <p className="mt-1 text-sm text-clay-muted">No other trainer has free times at this branch.</p> : <ul className="mt-2 space-y-3">{o.others.map((t) => <li key={t.trainerId}><p className="font-semibold">{t.name}</p><Slots slots={t.slots} trainerId={t.trainerId} name={t.name} /></li>)}</ul>}
            </section>
          </div>
        )}
      </QueryBoundary>
    </Sheet>
  );
}
