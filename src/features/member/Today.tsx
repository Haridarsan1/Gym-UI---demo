import { useToday } from "@/api/hooks";
import type { TodayData } from "@/api/member";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
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
    <div className="space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load today" skeleton={<TodaySkeleton />}>
        {(t) => <TodayContent t={t} />}
      </QueryBoundary>
    </div>
  );
}

function TodayContent({ t }: { t: TodayData }) {
  return (
    <>
      <header>
        <p className="text-sm text-clay-muted">{formatWeekdayDate(t.today)}</p>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">
          {greeting(t.nowIso)}, {t.firstName}
        </h1>
      </header>
      <Notices t={t} />
      <WorkoutCard t={t} />
      <ReviewCard t={t} />
      <WeekCard t={t} />
      <SessionsCard t={t} />
      <MembershipCard t={t} />
    </>
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
