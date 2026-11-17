import { Link, useParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { useWorkout } from "@/api";
import type { WorkoutView } from "@/api";
import { Button3DLink } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { isApiError } from "@/api";
import { Session } from "@/features/member/workout/Session";
import { formatWeekdayDate } from "@/lib/when";

/** Workout session (W03, T05, W01). Opens today’s workout for logging, or says why it can’t be logged. */
export default function Workout() {
  const { date = "" } = useParams<{ date: string }>();
  const query = useWorkout(date);
  if (query.isError && isApiError(query.error) && query.error.code === "not_found") {
    return (
      <>
        <h1 className="sr-only">Workout</h1>
        <EmptyState title="No workout on this day" action={<Button3DLink to="/m" variant="white">Back to Today</Button3DLink>}>
          {query.error.message}
        </EmptyState>
      </>
    );
  }
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open your workout" skeleton={<WorkoutSkeleton />}>
      {(w) => (w.blockedReason ? <Blocked w={w} /> : <><h1 className="sr-only">{w.title}</h1><Session view={w} /></>)}
    </QueryBoundary>
  );
}

function Blocked({ w }: { w: WorkoutView }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-sm font-semibold uppercase tracking-wide text-clay-muted">Workout</h1>
        <p className="text-sm text-clay-subtle">{formatWeekdayDate(w.date)}</p>
      </header>
      <section className="clay p-6" aria-labelledby="blocked-title">
        <Lock className="h-7 w-7 text-clay-muted" aria-hidden="true" />
        <h2 id="blocked-title" className="mt-3 text-xl font-bold">{w.title}</h2>
        <p className="mt-1 text-clay-muted">{w.blockedReason}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button3DLink to="/m" variant="white">Back to Today</Button3DLink>
          <Link to="/m/program" className="inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">See your program</Link>
        </div>
      </section>
    </div>
  );
}

function WorkoutSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading your workout">
      <SkeletonCard />
      <SkeletonRows rows={3} />
    </div>
  );
}
