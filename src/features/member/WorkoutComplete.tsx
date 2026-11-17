import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { isApiError, useWorkoutSummary } from "@/api";
import type { WorkoutSummary } from "@/api";
import { Button3DLink } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { planStages, shareText } from "@/domain/celebration";
import { BadgePart, GoalPart, RecordPart, ResultPart, VolumePart, WeekPart } from "@/features/member/complete/Parts";
import { Feedback } from "@/features/member/complete/Feedback";
import { ShareButton } from "@/features/member/complete/ShareButton";
import { useReveal } from "@/features/member/complete/useReveal";
import { usePrefersReducedMotion } from "@/hooks/motion";
import { formatWeekdayDate } from "@/lib/when";

/** Workout complete (W03, P02, P04): the reward after a workout. See `Celebration` for the order and timing. */
export default function WorkoutComplete() {
  const { date = "" } = useParams<{ date: string }>();
  const celebrate = (useLocation().state as { celebrate?: boolean } | null)?.celebrate === true;
  const query = useWorkoutSummary(date);
  if (query.isError && isApiError(query.error) && query.error.code === "not_found") {
    return (
      <>
        <h1 className="sr-only">Workout complete</h1>
        <EmptyState title="No finished workout here yet" action={<Button3DLink to="/m" variant="white">Back to Today</Button3DLink>}>
          Finish a workout and its summary appears here.
        </EmptyState>
      </>
    );
  }
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-clay-muted">{formatWeekdayDate(date)}</p>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">Workout complete</h1>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load your summary" skeleton={<SkeletonCard label="Loading your summary" />}>
        {(s) => <Celebration s={s} celebrate={celebrate} />}
      </QueryBoundary>
    </div>
  );
}

/**
 * The reward, in order: the result, the volume counting up, each personal record, the week ring and streak, then each badge.
 * Under four seconds in all. A tap moves to the next part, “Skip” goes to the end. With reduced motion, or when the summary
 * is opened later from Today, everything is there at once.
 */
function Celebration({ s, celebrate }: { s: WorkoutSummary; celebrate: boolean }) {
  const reduced = usePrefersReducedMotion();
  const skipped = s.status === "skipped";
  // A skipped day has nothing to celebrate, so there is no sequence to wait for.
  const instant = reduced || !celebrate || skipped;
  const stages = useMemo(() => planStages({ hasVolume: s.volumeKg > 0, records: s.records.length, goals: s.targetsReached.length, showWeek: !skipped, badges: s.badges.length }), [s, skipped]);
  const { step, done, active, advance, skipAll } = useReveal(stages, instant);

  const shown = (kind: string) => stages.slice(0, step).filter((x) => x.kind === kind).length;
  const records = done ? s.records.length : shown("record");
  const badges = done ? s.badges.length : shown("badge");
  const pop = !instant;
  const tail = useRef<HTMLDivElement>(null);
  // Keep the newest part in view without animating the scroll.
  useEffect(() => {
    if (!done) tail.current?.scrollIntoView({ block: "nearest" });
  }, [step, done]);

  const running = (kind: string) => active?.kind === kind;
  const volumeStage = stages.find((x) => x.kind === "volume");
  const text = shareText({ title: s.title, status: s.status, setsDone: s.progress.done, setsTotal: s.progress.total, volumeKg: s.volumeKg, records: s.records });

  return (
    <div
      data-stage={active ? `${active.kind}${active.kind === "record" || active.kind === "badge" ? `-${active.index}` : ""}` : "done"}
      className="space-y-4"
      onClick={(e) => {
        if (!done && !(e.target as HTMLElement).closest("button, a, input, textarea, label")) advance();
      }}
    >
      <div aria-live="polite" className="space-y-4">
        <ResultPart s={s} pop={pop} />
        {s.volumeKg > 0 && (!volumeStage || step > stages.indexOf(volumeStage)) && <VolumePart kg={s.volumeKg} pop={pop} running={running("volume")} ms={volumeStage?.ms ?? 0} />}
        {s.records.slice(0, records).map((r) => (
          <RecordPart key={r.exerciseId} r={r} pop={pop} />
        ))}
        {s.targetsReached.slice(0, done ? s.targetsReached.length : shown("goal")).map((g) => (
          <GoalPart key={g.id} g={g} pop={pop} />
        ))}
        {!skipped && shown("week") + (done ? 1 : 0) > 0 && <WeekPart s={s} pop={pop} running={running("week")} />}
        {s.badges.slice(0, badges).map((b) => (
          <BadgePart key={b.key} b={b} pop={pop} />
        ))}
      </div>
      <div ref={tail} className="scroll-mb-32" />

      {!done && (
        <div className="flex items-center justify-between text-sm text-clay-muted">
          <span>Tap for the next part</span>
          <button type="button" onClick={skipAll} aria-label="Skip the celebration" className="min-h-[2.75rem] px-3 font-bold text-ember-700 underline underline-offset-4">
            Skip
          </button>
        </div>
      )}

      {done && (
        <>
          {!skipped && <Feedback date={s.date} effort={s.effort} recovery={s.recovery} />}
          <div className="flex flex-wrap gap-3">
            <Button3DLink to="/m" size="lg" className="flex-1">
              Done
            </Button3DLink>
            {!skipped && <ShareButton text={text} />}
          </div>
          <p className="text-center">
            <Link to="/m/program" className="inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">
              See your program
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
