import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useReview } from "@/api/trainerHooks";
import type { ReviewData } from "@/api/review";
import { Avatar } from "@/design/Avatar";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { ThreeZone } from "@/design/layout/ThreeZone";
import { useSplit, useWide } from "@/design/useMediaQuery";
import { AdherenceCard, CheckinCard, ReviewGoals, TrendsCard } from "@/features/trainer/review/Cards";
import { ReviewHistory, WriteReview } from "@/features/trainer/review/Write";
import { formatDate } from "@/lib/when";

/**
 * Review (T06, P04): how a client is doing and what you do about it, in one screen. Phone: one column. From 768 px: the
 * sections on the left, the review beside them. From 1280 px: the history of what you have written in a third zone (below
 * that it follows the form, so nothing is only in the third zone).
 */
export default function Review() {
  const { memberId } = useParams();
  const query = useReview(memberId);
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this review" skeleton={<SkeletonCard label="Loading review" />}>
      {(v) => <ReviewScreen v={v} />}
    </QueryBoundary>
  );
}

function dueLine(v: ReviewData): string {
  if (!v.due) return "There is no plan yet, so no review is scheduled.";
  if (v.due.overdue) return `Review due since ${formatDate(v.due.dueOn)}, ${v.due.daysOver} ${v.due.daysOver === 1 ? "day" : "days"} ago. ${v.due.reason}.`;
  return `Next review ${formatDate(v.due.dueOn)}${v.lastShared?.followUpOn ? ", the follow-up date you set" : `, every ${v.due.cadenceDays} days`}.`;
}

function ReviewScreen({ v }: { v: ReviewData }) {
  const split = useSplit();
  const wide = useWide();
  const head = (
    <header>
      <Link to={`/t/clients/${v.memberId}`} className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        {v.firstName}
      </Link>
      <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight lg:text-4xl">Review</h1>
      <p className="text-clay-muted">{v.name}{v.programName ? `, ${v.programName}` : ""}</p>
      <p className={v.due?.overdue ? "mt-1 font-semibold" : "mt-1 text-clay-muted"}>{dueLine(v)}</p>
    </header>
  );
  const main = (
    <div className="space-y-4">
      <CheckinCard v={v} />
      <AdherenceCard v={v} />
      <TrendsCard v={v} />
      <ReviewGoals v={v} />
      <WriteReview v={v} />
      {!wide && <ReviewHistory v={v} />}
    </div>
  );
  if (!split) return <div className="space-y-4">{head}{main}</div>;
  return (
    <div className="space-y-4">
      {head}
      <ThreeZone
        listWidth="minmax(11.5rem,14rem)"
        list={
          <nav aria-label="On this page" className="clay p-3">
            <div className="flex items-center gap-2 px-1 pb-2">
              <Avatar name={v.name} />
              <span className="min-w-0 truncate font-semibold">{v.name}</span>
            </div>
            <ul className="space-y-1 text-[0.95rem]">
              {[["#ck-title", "Check-in"], ["#ad-title", "Adherence"], ["#tr-title", "Trends"], ["#gl-title", "Goals"], ["#wr-title", "Write review"], ["#hs-title", "History"]].map(([href, label]) => (
                <li key={href}><a href={href} className="flex min-h-[2.75rem] items-center rounded-xl px-3 hover:bg-clay-canvas">{label}</a></li>
              ))}
            </ul>
          </nav>
        }
        detail={main}
        context={<ReviewHistory v={v} />}
      />
    </div>
  );
}
