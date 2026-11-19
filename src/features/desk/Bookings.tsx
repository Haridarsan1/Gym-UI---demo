import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useMe } from "@/api/hooks";
import { useCalendar } from "@/api/deskMoreHooks";
import type { CalendarBooking, CalendarData, CalendarLane } from "@/api/deskBookings";
import { useCan } from "@/app/SessionContext";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { BookingStatusPill } from "@/design/StatusPills";
import { useBranch } from "@/design/shells/BranchContext";
import { useSplit } from "@/design/useMediaQuery";
import { addDays, istDateOf, todayIST } from "@/domain/dates";
import type { Slot } from "@/domain/slots";
import { BookSheet } from "@/features/desk/bookings/BookSheet";
import { MoveConflict } from "@/features/desk/bookings/MoveConflict";
import { formatTime, formatWeekdayDate } from "@/lib/when";
import { cn } from "@/lib/format";

const hhmm = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3_600_000).toISOString().slice(11, 16);
const dayWord = (d: string, today: string) => (d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : formatWeekdayDate(d));

/**
 * Bookings (T04, O01, A03): a day or a week at one branch, by trainer or by room. Free times are buttons that open the booking sheet; a booked session shows the
 * member, status and room; a trainer on leave is marked, and the sessions that clash with their leave are listed on top with a way to move each. The branch
 * switcher decides the branch (or the list when a person has several).
 *
 * Phone: one trainer or room at a time as a list. From 768 px: the day as a grid of times by trainer (or room).
 */
export default function Bookings() {
  const me = useMe();
  const { branchId: chosen } = useBranch();
  const branches = me.data?.branches ?? [];
  const [local, setLocal] = useState<string>();
  const branchId = chosen !== "all" ? chosen : (local ?? branches[0]?.id);
  const [params, setParams] = useSearchParams();
  const today = todayIST();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : today;
  const view: "day" | "week" = params.get("view") === "week" ? "week" : "day";
  const by: "trainer" | "room" = params.get("by") === "room" ? "room" : "trainer";
  const lane = params.get("lane") ?? undefined;
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); setParams(n, { replace: true }); };
  const query = useCalendar(branchId, date, view === "week" ? 7 : 1);
  const step = view === "week" ? 7 : 1;
  const [booking, setBooking] = useState<{ lane: CalendarLane; date: string; slot?: Slot } | null>(null);
  const canBook = useCan()("booking.manage");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Bookings</h1>
        {chosen === "all" && branches.length > 1 && (
          <label className="flex items-center gap-2 text-sm font-semibold">Branch
            <select value={branchId} onChange={(e) => setLocal(e.target.value)} className="h-11 rounded-xl border border-clay-line bg-white px-3">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
        )}
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Date">
          <button type="button" aria-label={view === "week" ? "Previous week" : "Previous day"} onClick={() => set({ date: addDays(date, -step) })} className="grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-white shadow-sm hover:bg-clay-canvas"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
          <input type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && set({ date: e.target.value })} className="h-11 rounded-xl border border-clay-line bg-white px-3" />
          <button type="button" aria-label={view === "week" ? "Next week" : "Next day"} onClick={() => set({ date: addDays(date, step) })} className="grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-white shadow-sm hover:bg-clay-canvas"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
          {date !== today && <button type="button" onClick={() => set({ date: "" })} className="min-h-[2.75rem] cursor-pointer px-2 font-semibold underline underline-offset-4">Today</button>}
        </div>
        {([["view", view, [["day", "Day"], ["week", "Week"]]], ["by", by, [["trainer", "By trainer"], ["room", "By room"]]]] as const).map(([k, v, opts]) => (
          <div key={k} role="radiogroup" aria-label={k === "view" ? "View" : "Group by"} className="flex gap-1">
            {opts.map(([val, label]) => <button key={val} type="button" role="radio" aria-checked={v === val} onClick={() => set({ [k]: val === "day" || val === "trainer" ? "" : val, lane: "" })} className={cn("min-h-[2.75rem] cursor-pointer rounded-full px-4 text-sm font-semibold", v === val ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{label}</button>)}
          </div>
        ))}
      </div>
      <QueryBoundary query={query} errorTitle="We couldn’t load the calendar" skeleton={<SkeletonRows rows={8} />}>
        {(cal) => <Calendar cal={cal} view={view} by={by} lane={lane} setLane={(l) => set({ lane: l })} canBook={canBook} open={(l, d, s) => setBooking({ lane: l, date: d, slot: s })} />}
      </QueryBoundary>
      {booking && query.data && <BookSheet cal={query.data} lane={booking.lane} date={booking.date} slot={booking.slot} onClose={() => setBooking(null)} />}
    </div>
  );
}

function Calendar({ cal, view, by, lane, setLane, canBook, open }: { cal: CalendarData; view: "day" | "week"; by: "trainer" | "room"; lane?: string; setLane: (l: string) => void; canBook: boolean; open: (l: CalendarLane, d: string, s?: Slot) => void }) {
  const [moving, setMoving] = useState<CalendarBooking | null>(null);
  const split = useSplit();
  const lanes = by === "trainer" ? cal.days[0]!.lanes.map((l) => ({ id: l.trainerId, name: l.name })) : cal.rooms.map((r) => ({ id: r.id, name: r.name }));
  const selected = lanes.find((l) => l.id === lane) ?? lanes[0];
  const mine = (b: CalendarBooking, id: string) => (by === "trainer" ? b.trainerId === id : b.roomId === id);

  return (
    <div className="space-y-4">
      {cal.conflicts.length > 0 && (
        <section aria-labelledby="cf-title" className="clay border-2 border-ember-200 p-4">
          <h2 id="cf-title" className="flex items-center gap-2 text-lg font-bold"><AlertTriangle className="h-5 w-5 text-ember-700" aria-hidden="true" />{cal.conflicts.length === 1 ? "1 session is on its trainer’s leave" : `${cal.conflicts.length} sessions are on their trainer’s leave`}</h2>
          <p className="text-sm text-clay-muted">New bookings are blocked on those days. Move each session to another time or another trainer. The member gets an email and their session credit is not affected.</p>
          <ul aria-label="Sessions on leave" className="mt-3 space-y-2">
            {cal.conflicts.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-clay-canvas p-3">
                <span><span className="font-semibold">{b.name}</span> with {b.trainerName}<span className="block text-sm text-clay-muted">{formatWeekdayDate(istDateOf(b.startsAt))}, {formatTime(b.startsAt)}{b.roomName ? `, ${b.roomName}` : ""}</span></span>
                {canBook && <Button3D size="md" variant="white" onClick={() => setMoving(b)} aria-label={`Move ${b.name.split(" ")[0]}’s session`}><CalendarClock className="h-4 w-4" aria-hidden="true" />Move</Button3D>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === "day" && split && <DayGrid cal={cal} by={by} canBook={canBook} open={open} mine={mine} />}
      {(view === "week" || !split) && (
        <>
          <div role="radiogroup" aria-label={by === "trainer" ? "Trainer" : "Room"} className="flex flex-wrap gap-2">
            {lanes.map((l) => <button key={l.id} type="button" role="radio" aria-checked={selected?.id === l.id} onClick={() => setLane(l.id)} className={cn("min-h-[2.75rem] cursor-pointer rounded-full px-4 text-sm font-semibold", selected?.id === l.id ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{l.name}</button>)}
          </div>
          {selected ? <AgendaDays cal={cal} by={by} laneId={selected.id} canBook={canBook} open={open} mine={mine} /> : <p className="clay p-4 text-clay-muted">This branch has no {by === "trainer" ? "trainers" : "rooms"} set up.</p>}
        </>
      )}
      {moving && <MoveConflict b={moving} onClose={() => setMoving(null)} />}
    </div>
  );
}

/** From 768 px: the day as a grid of times (rows) by trainer or room (columns). It scrolls inside its own box if there are many columns. */
function DayGrid({ cal, by, canBook, open, mine }: { cal: CalendarData; by: "trainer" | "room"; canBook: boolean; open: (l: CalendarLane, d: string, s?: Slot) => void; mine: (b: CalendarBooking, id: string) => boolean }) {
  const day = cal.days[0]!;
  const cols = by === "trainer" ? day.lanes.map((l) => ({ id: l.trainerId, name: l.name, lane: l as CalendarLane | undefined })) : cal.rooms.map((r) => ({ id: r.id, name: r.name, lane: undefined as CalendarLane | undefined }));
  const times = useMemo(() => [...new Set([...day.lanes.flatMap((l) => l.free.map((s) => s.time)), ...cal.bookings.map((b) => hhmm(b.startsAt))])].sort(), [day, cal.bookings]);
  if (times.length === 0 && !day.lanes.some((l) => l.leave)) return <p className="clay p-6 text-center text-clay-muted">No sessions and no free times on this day. Check the trainers’ availability in their schedule.</p>;
  return (
    <div className="clay-flat overflow-x-auto" tabIndex={0} role="region" aria-label="Day calendar">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">{formatWeekdayDate(day.date)} by {by}</caption>
        <thead><tr className="border-b border-clay-line text-clay-muted"><th scope="col" className="w-20 px-3 py-3 font-semibold">Time</th>{cols.map((c) => <th key={c.id} scope="col" className="px-3 py-3 font-semibold">{c.name}{c.lane?.leave && <span className="block text-xs font-normal text-ember-800">{c.lane.leave}</span>}</th>)}</tr></thead>
        <tbody>
          {times.map((t) => (
            <tr key={t} className="border-b border-clay-line last:border-0">
              <th scope="row" className="px-3 py-2 font-semibold tabular">{formatTime(`${day.date}T${t}:00+05:30`)}</th>
              {cols.map((c) => {
                const b = cal.bookings.find((x) => mine(x, c.id) && hhmm(x.startsAt) === t);
                const free = c.lane?.free.find((s) => s.time === t);
                return (
                  <td key={c.id} className="min-w-[9rem] px-2 py-1.5 align-top">
                    {b ? <Booked b={b} showTrainer={by === "room"} /> : free && c.lane && canBook ? <button type="button" onClick={() => open(c.lane!, day.date, free)} aria-label={`Book ${c.name} at ${formatTime(free.startsAt)}`} className="min-h-[2.75rem] w-full cursor-pointer rounded-xl border-2 border-dashed border-clay-line px-3 text-left font-semibold text-ember-700 hover:border-ember-400 hover:bg-ember-50">Book</button> : by === "room" ? <span className="text-clay-subtle">Free</span> : c.lane?.leave ? <span className="text-ember-800">Leave</span> : <span className="text-clay-subtle">–</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Booked({ b, showTrainer }: { b: CalendarBooking; showTrainer: boolean }) {
  return (
    <div className={cn("rounded-xl p-2", b.onLeave ? "bg-status-pending-bg" : "bg-lilac-100")}>
      <p className="flex flex-wrap items-center gap-x-2"><span className="font-semibold">{b.name}</span><BookingStatusPill status={b.status} /></p>
      <p className="text-xs text-clay-muted">{showTrainer ? b.trainerName : b.roomName ?? "No room"}{b.onLeave ? ", on leave" : ""}</p>
    </div>
  );
}

/** Phone, and the week: one trainer’s or room’s days as lists, each with its bookings and free times. */
function AgendaDays({ cal, by, laneId, canBook, open, mine }: { cal: CalendarData; by: "trainer" | "room"; laneId: string; canBook: boolean; open: (l: CalendarLane, d: string, s?: Slot) => void; mine: (b: CalendarBooking, id: string) => boolean }) {
  return (
    <div className="space-y-3">
      {cal.days.map((d) => {
        const lane = d.lanes.find((l) => l.trainerId === laneId);
        const bookings = cal.bookings.filter((b) => istDateOf(b.startsAt) === d.date && mine(b, laneId));
        type Item = { at: string; b: CalendarBooking; s?: undefined } | { at: string; s: Slot; b?: undefined };
        const items: Item[] = [...bookings.map((b): Item => ({ at: b.startsAt, b })), ...(by === "trainer" && lane ? lane.free.map((s): Item => ({ at: s.startsAt, s })) : [])].sort((a, b) => a.at.localeCompare(b.at));
        return (
          <section key={d.date} aria-labelledby={`d-${d.date}`} className="clay p-4">
            <h2 id={`d-${d.date}`} className="font-bold">{dayWord(d.date, cal.today)}{lane?.leave && <span className="ml-2 text-sm font-semibold text-ember-800">{lane.leave}</span>}</h2>
            {items.length === 0 ? <p className="mt-1 text-sm text-clay-muted">{lane?.leave ? "Not available." : by === "room" ? "Nothing booked in this room." : "No sessions and no free times."}</p> : (
              <ul aria-label={`${dayWord(d.date, cal.today)}`} className="mt-2 divide-y divide-clay-line">
                {items.map((it) => it.b ? (
                  <li key={it.b.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="tabular font-semibold">{formatTime(it.b.startsAt)}</span><Booked b={it.b} showTrainer={by === "room"} /></li>
                ) : (
                  <li key={it.s!.startsAt} className="flex items-center justify-between gap-2 py-1.5"><span className="tabular font-semibold">{formatTime(it.s!.startsAt)}</span>{canBook && lane ? <button type="button" onClick={() => open(lane, d.date, it.s)} aria-label={`Book ${lane.name} at ${formatTime(it.s!.startsAt)}`} className="min-h-[2.75rem] min-w-[6rem] cursor-pointer rounded-xl border-2 border-dashed border-clay-line px-4 font-semibold text-ember-700 hover:border-ember-400 hover:bg-ember-50">Book</button> : <span className="text-clay-subtle">Free</span>}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
