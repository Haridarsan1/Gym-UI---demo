import { useToday } from "@/api/hooks";
import type { TodayData } from "@/api/member";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { MEDIA, useMediaQuery } from "@/design/useMediaQuery";
import { greeting, formatWeekdayDate } from "@/lib/when";
import { MembershipCard } from "@/features/member/today/MembershipCard";
import { Notices } from "@/features/member/today/Notices";
import { ReviewCard } from "@/features/member/today/ReviewCard";
import { SessionsCard } from "@/features/member/today/SessionsCard";
import { WeekCard } from "@/features/member/today/WeekCard";
import { WorkoutCard } from "@/features/member/today/WorkoutCard";

/** Today (T07): what to do now, how the week is going, what is coming up, and anything that needs attention. */
export default function Today() {
  const query = useToday();
  return (
    <div>
      <QueryBoundary query={query} errorTitle="We couldn’t load today" skeleton={<TodaySkeleton />}>
        {(t) => <TodayContent t={t} />}
      </QueryBoundary>
    </div>
  );
}

/**
 * Phone and tablet: one column, with the two small cards side by side from 640 px.
 * Desktop (1024 px and up): two columns. The workout, any review and the week strip on the left; the streak, training
 * sessions, next booking and membership on the right.
 */
function TodayContent({ t }: { t: TodayData }) {
  const desktop = useMediaQuery(MEDIA.desktop);
  const head = (
    <header>
      <p className="text-sm text-clay-muted">{formatWeekdayDate(t.today)}</p>
      <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight lg:text-4xl">
        {greeting(t.nowIso)}, {t.firstName}
      </h1>
    </header>
  );
  if (desktop) {
    return (
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-8">
        <div className="space-y-6">
          {head}
          <Notices t={t} />
          <WorkoutCard t={t} />
          <ReviewCard t={t} />
          <WeekCard t={t} part="strip" />
        </div>
        <div className="space-y-6 pt-[4.25rem]">
          <WeekCard t={t} part="streak" />
          <SessionsCard t={t} />
          <MembershipCard t={t} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {head}
      <Notices t={t} />
      <WorkoutCard t={t} />
      <ReviewCard t={t} />
      <WeekCard t={t} />
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <SessionsCard t={t} />
        <MembershipCard t={t} />
      </div>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading today" role="status">
      <h1 className="sr-only">Today</h1>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonRows rows={2} />
    </div>
  );
}
