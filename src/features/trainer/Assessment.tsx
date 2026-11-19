import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAssessment } from "@/api/trainerHooks";
import type { AssessmentView } from "@/api/assessments";
import { Avatar } from "@/design/Avatar";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { ThreeZone } from "@/design/layout/ThreeZone";
import { useSplit, useWide } from "@/design/useMediaQuery";
import { AssessmentCard, HistoryCard } from "@/features/trainer/assessment/AssessmentCard";
import { GoalsCard } from "@/features/trainer/assessment/GoalsCard";

/**
 * Assessment and goals (T02, P01). One screen: the assessment form, the goals, and the history of earlier assessments.
 * Phone: one column. From 768 px: the client and sections on the left, the form and goals beside them. From 1280 px: the
 * history and consent in a third zone (below that they follow the goals, so nothing is only in the third zone).
 */
export default function Assessment() {
  const { memberId } = useParams();
  const query = useAssessment(memberId);
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this assessment" skeleton={<SkeletonCard label="Loading assessment" />}>
      {(v) => <AssessmentScreen v={v} />}
    </QueryBoundary>
  );
}

function AssessmentScreen({ v }: { v: AssessmentView }) {
  const split = useSplit();
  const wide = useWide();
  const back = (
    <Link to={`/t/clients/${v.memberId}`} className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink">
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      {v.firstName}
    </Link>
  );
  const head = (
    <header>
      {back}
      <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight lg:text-4xl">Assessment and goals</h1>
      <p className="text-clay-muted">{v.memberName}</p>
    </header>
  );
  const main = (
    <div className="space-y-4">
      <AssessmentCard v={v} />
      <GoalsCard v={v} />
      {!wide && <HistoryCard v={v} />}
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
              <Avatar name={v.memberName} />
              <span className="min-w-0 truncate font-semibold">{v.memberName}</span>
            </div>
            <ul className="space-y-1 text-[0.95rem]">
              <li><a href="#as-title" className="flex min-h-[2.75rem] items-center rounded-xl px-3 hover:bg-clay-canvas">Assessment</a></li>
              <li><a href="#gl-title" className="flex min-h-[2.75rem] items-center rounded-xl px-3 hover:bg-clay-canvas">Goals</a></li>
              <li><a href="#hs-title" className="flex min-h-[2.75rem] items-center rounded-xl px-3 hover:bg-clay-canvas">History</a></li>
            </ul>
          </nav>
        }
        detail={main}
        context={<HistoryCard v={v} />}
      />
    </div>
  );
}
