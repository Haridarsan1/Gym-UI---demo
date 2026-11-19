import { useState } from "react";
import { Search } from "lucide-react";
import { useBookingFacts, useCalendarActions } from "@/api/deskMoreHooks";
import { useMembers } from "@/api/hooks";
import type { CalendarData, CalendarLane } from "@/api/deskBookings";
import { isApiError } from "@/api/errors";
import { Avatar } from "@/design/Avatar";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { useToast } from "@/design/Toast";
import { istDateOf } from "@/domain/dates";
import type { Slot } from "@/domain/slots";
import { formatTime, formatWeekdayDate } from "@/lib/when";
import { cn } from "@/lib/format";

const newKey = () => `bk-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

/**
 * Book a session for a member (T04, O01, A03): who, which time (a trainer’s free times), and optionally which room. It says before booking whether the
 * member has a credit and a membership that allows it. If the time was just taken, it says so and offers the next free ones.
 */
export function BookSheet({ cal, lane, date, slot, onClose }: { cal: CalendarData; lane: CalendarLane; date: string; slot?: Slot; onClose: () => void }) {
  const { book } = useCalendarActions();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [memberId, setMemberId] = useState<string>();
  const [chosen, setChosen] = useState<string | undefined>(slot?.startsAt);
  const [room, setRoom] = useState("");
  const [error, setError] = useState<string>();
  const [next, setNext] = useState<Slot[]>([]);
  const [key] = useState(newKey);
  const search = useMembers({ search: q, branchId: cal.branch.id, pageSize: 6 });
  const facts = useBookingFacts(memberId);
  const save = async () => {
    if (!memberId || !chosen) return;
    setError(undefined);
    setNext([]);
    try {
      const r = await book.mutateAsync({ memberId, trainerId: lane.trainerId, startsAt: chosen, roomId: room || undefined, key });
      toast({ title: "Session booked", description: `${facts.data?.firstName ?? "The member"} has ${r.credits.available} ${r.credits.available === 1 ? "session" : "sessions"} left. They have been emailed.`, tone: "success" });
      onClose();
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t book it. Nothing was saved. Try again.");
      if (isApiError(e)) setNext(((e.details as { nextFree?: Slot[] } | undefined)?.nextFree) ?? []);
    }
  };
  return (
    <Sheet open onClose={onClose} label="Book a session" className="p-5">
      <h2 className="text-xl font-bold">Book a session with {lane.name.split(" ")[0]}</h2>
      <p className="text-clay-muted">{formatWeekdayDate(date)}, {cal.branch.name}. {cal.sessionMinutes} minutes, one training credit.</p>
      <div className="mt-4">
        <p className="font-semibold">Time</p>
        <div role="radiogroup" aria-label="Time" className="mt-1 flex flex-wrap gap-2">
          {lane.free.map((s) => <button key={s.startsAt} type="button" role="radio" aria-checked={chosen === s.startsAt} onClick={() => setChosen(s.startsAt)} className={cn("min-h-[2.75rem] min-w-[4.5rem] cursor-pointer rounded-xl border-2 px-3 font-semibold", chosen === s.startsAt ? "border-ember-600 bg-ember-50" : "border-clay-line bg-white hover:bg-clay-canvas")}>{formatTime(s.startsAt)}</button>)}
        </div>
      </div>
      {cal.rooms.length > 0 && (
        <label className="mt-4 block"><span className="font-semibold">Room (optional)</span>
          <select value={room} onChange={(e) => setRoom(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-clay-line bg-white px-3"><option value="">No room</option>{cal.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </label>
      )}
      <div className="mt-4">
        <p className="font-semibold">Member</p>
        {memberId ? (
          <QueryBoundary query={facts} errorTitle="We couldn’t check this member" skeleton={<SkeletonRows rows={1} />}>
            {(f) => (
              <div className="mt-1 flex items-center gap-3 rounded-2xl bg-clay-canvas p-3"><Avatar name={f.name} /><div className="min-w-0 flex-1"><p className="font-semibold">{f.name}</p><p className={cn("text-sm", f.blocked ? "font-semibold text-status-danger-fg" : "text-clay-muted")}>{f.blocked ?? `${f.credits.available} ${f.credits.available === 1 ? "session" : "sessions"} left`}</p></div><button type="button" onClick={() => setMemberId(undefined)} className="min-h-[2.75rem] cursor-pointer font-semibold underline underline-offset-4">Change</button></div>
            )}
          </QueryBoundary>
        ) : (
          <>
            <label className="relative mt-1 block"><span className="sr-only">Search members</span><Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-clay-muted" aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone number" className="h-12 w-full rounded-2xl border border-clay-line bg-white pl-11 pr-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" /></label>
            {q.trim().length >= 2 && (
              <ul aria-label="Matching members" className="mt-2 divide-y divide-clay-line rounded-2xl border border-clay-line bg-white">
                {(search.data?.rows ?? []).map((m) => <li key={m.id}><button type="button" onClick={() => setMemberId(m.id)} className="flex min-h-[3rem] w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-clay-canvas"><Avatar name={m.name} /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{m.name}</span><span className="block truncate text-sm text-clay-muted">{m.phone}</span></span></button></li>)}
                {search.data?.rows.length === 0 && <li className="px-3 py-3 text-clay-muted">No member matches.</li>}
              </ul>
            )}
          </>
        )}
      </div>
      {error && (
        <div role="alert" className="mt-4 rounded-2xl bg-status-danger-bg px-4 py-3 text-status-danger-fg">
          <p className="font-semibold">{error}</p>
          {next.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{next.map((s) => <button key={s.startsAt} type="button" onClick={() => { setChosen(s.startsAt); setError(undefined); setNext([]); }} className="min-h-[2.75rem] cursor-pointer rounded-xl bg-white px-3 font-semibold text-clay-ink">{formatWeekdayDate(istDateOf(s.startsAt))} {formatTime(s.startsAt)}</button>)}</div>}
        </div>
      )}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button3D variant="ember" size="lg" className="sm:flex-1" disabled={!memberId || !chosen || !!facts.data?.blocked || book.isPending} onClick={() => void save()}>{book.isPending ? "Booking…" : "Book session"}</Button3D>
        <Button3D variant="white" size="lg" onClick={onClose}>Cancel</Button3D>
      </div>
    </Sheet>
  );
}
