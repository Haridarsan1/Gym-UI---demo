import { useToday } from "@/api/hooks";
import type { TodayData } from "@/api/member";
import { todayIST } from "@/domain/dates";
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
      <header>
        <h1 className="text-sm font-semibold uppercase tracking-wide text-clay-muted">Today</h1>
        <p className="text-sm text-clay-subtle">{formatWeekdayDate(todayIST())}</p>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load today" skeleton={<TodaySkeleton />}>
        {(t) => <TodayContent t={t} />}
      </QueryBoundary>
    </div>
  );
}

function TodayContent({ t }: { t: TodayData }) {
  return (
    <>
      <p className="text-[1.7rem] font-bold leading-tight tracking-tight">
        {greeting(t.nowIso)}, {t.firstName}
      </p>
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
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonRows rows={2} />
    </div>
  );
}
