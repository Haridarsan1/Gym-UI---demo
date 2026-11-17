import { useState } from "react";
import { CalendarPlus, Ticket } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useBookings } from "@/api";
import type { BookingsData, BookingView } from "@/api";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { BookSheet } from "@/features/member/bookings/BookSheet";
import { PastCard, UpcomingCard } from "@/features/member/bookings/BookingCard";
import { CancelSheet } from "@/features/member/bookings/CancelSheet";
import { Chips } from "@/features/member/progress/MetricCard";
import { formatWeekdayDate } from "@/lib/when";

const PAST_SHOWN = 6;

/** Bookings (T04, O01, M06): book a personal-training session, and see upcoming and past ones. Booking reserves one credit. */
export default function Bookings() {
  const query = useBookings();
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-clay-muted">{query.data ? formatWeekdayDate(query.data.today) : "Your training sessions"}</p>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">Bookings</h1>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load your bookings" skeleton={<BookingsSkeleton />}>
        {(d) => <BookingsContent d={d} />}
      </QueryBoundary>
    </div>
  );
}

function BookingsContent({ d }: { d: BookingsData }) {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [booking, setBooking] = useState<{ reschedule?: BookingView } | null>(params.get("book") ? {} : null);
  const [cancel, setCancel] = useState<BookingView | null>(null);
  const [allPast, setAllPast] = useState(false);
  const noCredits = d.credits.available === 0;
  const close = () => {
    setBooking(null);
    if (params.has("book")) {
      params.delete("book");
      setParams(params, { replace: true });
    }
  };
  const past = allPast ? d.past : d.past.slice(0, PAST_SHOWN);
  // The cancel sheet reads the live booking, so its words follow the clock if the free time ends while it is open.
  const cancelling = cancel ? (d.upcoming.find((b) => b.id === cancel.id) ?? null) : null;

  return (
    <>
      <section aria-labelledby="credits-title" className="clay p-5">
        <h2 id="credits-title" className="text-lg font-bold">Training sessions</h2>
        {noCredits ? (
          <div className="mt-2">
            <p className="text-xl font-bold">No training sessions left</p>
            <p className="mt-1 text-[0.95rem] text-clay-muted">
              Each personal-training session you book holds one session credit.{" "}
              {d.credits.reserved > 0 ? `${d.credits.reserved} ${d.credits.reserved === 1 ? "is" : "are"} held for your upcoming ${d.credits.reserved === 1 ? "booking" : "bookings"}. ` : ""}
              Buy more sessions and you can book again.
            </p>
            <Button3DLink to="/m/membership?buy=sessions" size="lg" className="mt-4 w-full">
              <Ticket className="h-5 w-5" aria-hidden="true" />
              Buy more sessions
            </Button3DLink>
          </div>
        ) : (
          <div className="mt-2">
            <p>
              <span className="font-display text-5xl font-extrabold leading-none">{d.credits.available}</span>{" "}
              <span className="text-clay-muted">{d.credits.available === 1 ? "session left" : "sessions left"}</span>
            </p>
            <p className="mt-1 text-sm text-clay-muted">
              {d.credits.reserved} held for upcoming bookings, {d.credits.consumed} used.
            </p>
            <Button3D size="lg" haptic className="mt-4 w-full" disabled={!!d.blockedReason} onClick={() => setBooking({})}>
              <CalendarPlus className="h-5 w-5" aria-hidden="true" />
              Book a session
            </Button3D>
            {d.blockedReason && <p className="mt-2 text-sm text-clay-muted">{d.blockedReason}</p>}
          </div>
        )}
        {noCredits && d.blockedReason && <p className="mt-2 text-sm text-clay-muted">{d.blockedReason}</p>}
      </section>

      <Chips
        label="Which sessions"
        value={tab}
        options={[{ value: "upcoming", label: `Upcoming (${d.upcoming.length})` }, { value: "past", label: `Past (${d.past.length})` }]}
        onChange={setTab}
      />

      {tab === "upcoming" ? (
        d.upcoming.length === 0 ? (
          <EmptyState icon={CalendarPlus} title="No sessions booked" action={noCredits ? undefined : <Button3D variant="white" disabled={!!d.blockedReason} onClick={() => setBooking({})}>Book a session</Button3D>}>
            {noCredits ? "Buy more sessions to book your next one." : "Book a session with your trainer. You will see its free-cancellation time before you confirm."}
          </EmptyState>
        ) : (
          <ol className="space-y-4" aria-label="Upcoming sessions">
            {d.upcoming.map((b) => (
              <li key={b.id}>
                <UpcomingCard b={b} policy={d.policy} nowIso={d.nowIso} onReschedule={() => setBooking({ reschedule: b })} onCancel={() => setCancel(b)} />
              </li>
            ))}
          </ol>
        )
      ) : d.past.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No past sessions yet">Sessions you attend, cancel or miss are listed here, newest first.</EmptyState>
      ) : (
        <>
          <ol className="space-y-3" aria-label="Past sessions">
            {past.map((b) => (
              <li key={b.id}>
                <PastCard b={b} />
              </li>
            ))}
          </ol>
          {d.past.length > PAST_SHOWN && (
            <button type="button" onClick={() => setAllPast(!allPast)} className="min-h-[2.75rem] font-semibold underline underline-offset-4">
              {allPast ? "Show fewer" : `Show all ${d.past.length} past sessions`}
            </button>
          )}
        </>
      )}

      <BookSheet open={booking !== null} reschedule={booking?.reschedule} credits={d.credits.available} policy={d.policy} onClose={close} />
      <CancelSheet booking={cancelling} policy={d.policy} nowIso={d.nowIso} onClose={() => setCancel(null)} />
    </>
  );
}

function BookingsSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading your bookings">
      <SkeletonCard />
      <SkeletonRows rows={3} />
    </div>
  );
}
