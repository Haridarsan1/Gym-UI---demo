import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useProgram } from "@/api";
import type { ProgramData } from "@/api";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/design/States";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { addDays } from "@/domain/dates";
import { MEDIA, useMediaQuery } from "@/design/useMediaQuery";
import { PreviewBody, PreviewSheet } from "@/features/member/program/PreviewSheet";
import { WeekPath } from "@/features/member/program/WeekPath";
import { formatDate, formatDayMonth } from "@/lib/when";

/** Program path (T03, T06): the plan as weeks of workouts. Tap a workout to preview it; go back to see how past weeks went. */
export default function Program() {
  const query = useProgram();
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-clay-muted">Your plan, week by week</p>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">Program</h1>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load your program" skeleton={<ProgramSkeleton />}>
        {(p) => (p.weeks.length ? <ProgramContent p={p} /> : <NoPlan />)}
      </QueryBoundary>
    </div>
  );
}

function NoPlan() {
  return (
    <EmptyState title="Your plan is on its way" action={<Link to="/m" className="btn3d" data-variant="white">Back to Today</Link>}>
      Your trainer will publish your plan here. When it is ready you will see each week as a path of workouts.
    </EmptyState>
  );
}

function ProgramContent({ p }: { p: ProgramData }) {
  const currentIndex = Math.max(0, p.weeks.findIndex((w) => w.isCurrent));
  // Tapping a day on Today opens it here: its week, and its workout if it has one.
  const [params, setParams] = useSearchParams();
  const wanted = params.get("date");
  const split = useMediaQuery(MEDIA.desktop);
  const wantedIndex = wanted ? p.weeks.findIndex((w) => w.days.some((d) => d.date === wanted)) : -1;
  const [index, setIndex] = useState(wantedIndex >= 0 ? wantedIndex : currentIndex);
  const [preview, setPreview] = useState<string | null>(() => (wanted && wantedIndex >= 0 && p.weeks[wantedIndex]!.days.some((d) => d.date === wanted && d.state !== "rest") ? wanted : null));
  // When the plan reloads (after finishing a workout, for example) stay on the same week.
  useEffect(() => setIndex((i) => Math.min(i, p.weeks.length - 1)), [p.weeks.length]);
  const week = p.weeks[index]!;
  const end = addDays(week.weekStart, 6);
  // From 1024 px the selected day’s preview sits beside the path (tablets open it in a side panel), and the selection is in the address (?date=).
  // Nothing chosen yet: today’s workout, else the next one, else the first of the week.
  const workoutDays = week.days.filter((d) => d.state !== "rest");
  const fallback = (workoutDays.find((d) => d.state === "today") ?? workoutDays.find((d) => d.state === "upcoming") ?? workoutDays[0])?.date ?? null;
  const shown = split ? (preview && workoutDays.some((d) => d.date === preview) ? preview : fallback) : null;
  const open = (date: string) => {
    setPreview(date);
    if (split) setParams({ date }, { replace: true });
  };
  return (
    <div className="space-y-5">
      <section aria-labelledby="plan-title" className="clay p-5">
        <p className="text-sm font-semibold text-clay-muted">Current plan</p>
        <h2 id="plan-title" className="mt-1 text-xl font-bold">{p.current!.name}</h2>
        <p className="text-sm text-clay-muted">
          Version {p.current!.versionNumber} from Coach {p.current!.authorName.split(" ")[0]}, started {formatDate(p.current!.startedOn)}
        </p>
        {p.current!.notes && <p className="mt-3 text-[0.95rem]">{p.current!.notes}</p>}
        {p.earlier.length > 0 && (
          <details className="mt-3 rounded-2xl bg-clay-lavender px-4 py-2">
            <summary className="flex min-h-[2.75rem] cursor-pointer items-center font-semibold">Earlier plans ({p.earlier.length})</summary>
            <ul className="space-y-1 pb-2 text-sm text-clay-muted">
              {p.earlier.map((e) => (
                <li key={e.versionNumber}>
                  <span className="font-semibold text-clay-ink">{e.name}</span>, version {e.versionNumber}, {formatDayMonth(e.startedOn)} to {formatDate(e.endedOn)}
                </li>
              ))}
              <li>Workouts and results from earlier plans are kept exactly as they were.</li>
            </ul>
          </details>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
      <section aria-labelledby="week-label" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ink" aria-label="Previous week" disabled={index === 0} onClick={() => setIndex(index - 1)} className="!h-11 !w-11 !p-0">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <div className="text-center">
            <h2 id="week-label" className="font-bold">{week.isCurrent ? "This week" : `Week ${week.weekNumber}`}</h2>
            <p className="text-sm text-clay-muted">
              {formatDayMonth(week.weekStart)} to {formatDayMonth(end)}, {week.done} of {week.workouts} done
            </p>
          </div>
          <Button variant="ink" aria-label="Next week" disabled={index === p.weeks.length - 1} onClick={() => setIndex(index + 1)} className="!h-11 !w-11 !p-0">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        {!week.isCurrent && (
          <button type="button" onClick={() => setIndex(currentIndex)} className="min-h-[2.75rem] font-semibold text-ember-700 underline underline-offset-4">
            Back to this week
          </button>
        )}
        <WeekPath days={week.days} onOpen={open} selected={shown} inline={split} />
      </section>
      {split && (
        <section aria-label="Selected workout" className="clay min-w-0 p-6 lg:sticky lg:top-6">
          {shown ? <PreviewBody date={shown} /> : <p className="text-clay-muted">Pick a workout on the path to see its exercises.</p>}
        </section>
      )}
      </div>
      {!split && <PreviewSheet date={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function ProgramSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading your program">
      <SkeletonCard />
      <SkeletonRows rows={5} />
    </div>
  );
}
