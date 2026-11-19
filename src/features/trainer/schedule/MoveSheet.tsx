import { useState } from "react";
import { useConflictOptions, useScheduleActions } from "@/api/trainerHooks";
import type { SessionRow } from "@/api/schedule";
import { isApiError } from "@/api/errors";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { formatTime, formatWeekdayDate } from "@/lib/when";
import type { Slot } from "@/domain/slots";

const newKey = () => `move-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

/** Moves a session that clashes with leave to another time with you, or to another trainer at the same branch. */
export function MoveSheet({ row, onClose }: { row: SessionRow; onClose: () => void }) {
  const query = useConflictOptions(row.id);
  const { move } = useScheduleActions();
  const toast = useToast();
  const [error, setError] = useState<string>();
  // One key per attempt on screen, so a double tap moves it once.
  const [key] = useState(newKey);
  const first = row.name.split(" ")[0];
  // `mutateAsync`, not `mutate` with callbacks: once the move succeeds the list refreshes and this sheet goes away with it, and a
  // callback passed to `mutate` would be dropped with it, so the toast would never show.
  const go = async (slot: Slot, trainerId?: string, trainerName?: string) => {
    setError(undefined);
    try {
      await move.mutateAsync({ bookingId: row.id, startsAt: slot.startsAt, trainerId, key });
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
        <div key={d.date}>
          <p className="text-sm font-semibold text-clay-muted">{formatWeekdayDate(d.date)}</p>
          <ul className="mt-1 flex flex-wrap gap-2" aria-label={`${name ?? "Your"} times on ${formatWeekdayDate(d.date)}`}>
            {d.slots.map((s) => (
              <li key={s.startsAt}>
                <button type="button" disabled={move.isPending} onClick={() => void go(s, trainerId, name)} aria-label={`Move to ${formatWeekdayDate(s.date)} ${formatTime(s.startsAt)}${name ? ` with ${name}` : ""}`} className="min-h-[2.75rem] min-w-[4.5rem] cursor-pointer rounded-xl border-2 border-clay-line bg-white px-3 font-semibold hover:border-ember-400 hover:bg-ember-50 disabled:opacity-60">
                  {formatTime(s.startsAt)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
  return (
    <Sheet open onClose={onClose} label={`Move ${first}’s session`} className="p-5">
      <h2 className="text-xl font-bold">Move {first}’s session</h2>
      <p className="text-clay-muted">Now {formatWeekdayDate(row.startsAt.slice(0, 10))}, {formatTime(row.startsAt)}, {row.branchName}. Pick a new time. {first} gets an email and keeps the session credit.</p>
      {error && <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <QueryBoundary query={query} errorTitle="We couldn’t load the free times" skeleton={<SkeletonRows rows={3} />}>
        {(o) => (
          <div className="mt-4 space-y-5">
            <section aria-labelledby="mv-me">
              <h3 id="mv-me" className="font-bold">With you</h3>
              {o.sameTrainer.length ? <div className="mt-2"><Slots slots={o.sameTrainer} /></div> : <p className="mt-1 text-sm text-clay-muted">You have no free times outside your leave in the booking window. Choose another trainer.</p>}
            </section>
            <section aria-labelledby="mv-others">
              <h3 id="mv-others" className="font-bold">With another trainer at {o.booking.branchName}</h3>
              {o.others.length === 0 ? <p className="mt-1 text-sm text-clay-muted">No other trainer has free times at this branch.</p> : (
                <ul className="mt-2 space-y-3">
                  {o.others.map((t) => (
                    <li key={t.trainerId}>
                      <p className="font-semibold">{t.name}</p>
                      <Slots slots={t.slots} trainerId={t.trainerId} name={t.name} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </QueryBoundary>
    </Sheet>
  );
}
