import { Link } from "react-router-dom";
import { Dumbbell } from "lucide-react";
import type { TodayData } from "@/api/member";
import { Button3DLink } from "@/design/Button3D";
import { freeCancellationText, whenText } from "@/lib/when";

/** Personal-training credits and the next booking, with the exact time free cancellation ends. */
export function SessionsCard({ t }: { t: TodayData }) {
  const { credits, nextBooking: b } = t;
  if (!b && credits.available + credits.reserved + credits.consumed === 0) return null;
  return (
    <section aria-labelledby="sessions-title" className="clay p-5">
      <h2 id="sessions-title" className="text-lg font-bold">Training sessions</h2>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p>
          <span className="font-display text-5xl font-extrabold leading-none tabular">{credits.available}</span>
          <span className="ml-2 text-clay-muted">{credits.available === 1 ? "session left" : "sessions left"}</span>
        </p>
        {credits.reserved > 0 && <p className="text-sm text-clay-muted">{credits.reserved} held for a booking</p>}
      </div>
      {b ? (
        <div className="mt-4 rounded-2xl bg-clay-canvas p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Dumbbell className="h-4 w-4 text-clay-muted" aria-hidden="true" />
            {whenText(b.startsAt, t.nowIso)} with {b.trainerName}
          </p>
          <p className="text-sm text-clay-muted">{b.branchName}</p>
          <p className="mt-1 text-sm text-clay-muted">{freeCancellationText(b.freeUntil, t.nowIso, b.lateConsumesCredit)}</p>
          <Link to="/m/bookings" className="mt-2 inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">
            Manage bookings
          </Link>
        </div>
      ) : (
        credits.available > 0 && (
          <Button3DLink to="/m/bookings" variant="lilac" className="mt-4 w-full">
            Book a session
          </Button3DLink>
        )
      )}
    </section>
  );
}
