import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useWorkout } from "@/api";
import type { WorkoutView } from "@/api";
import { Button3DLink } from "@/design/Button3D";
import { Dialog } from "@/design/Dialog";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { describeLogged, describeTarget, entryFor } from "@/domain/workout";
import { HowTo } from "@/features/member/workout/ExerciseInfo";
import { formatWeekdayDate } from "@/lib/when";

const SECTION = { warmup: "Warm-up", main: "Main", cooldown: "Cool-down" } as const;

/** A day of the plan as the trainer wrote it, with what the member did next to it once there is a log (W03, T06). */
export function PreviewSheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  return (
    <Dialog open={date !== null} onClose={onClose} label="Workout preview" placement="bottom" className="p-5">
      {date && <PreviewBody date={date} onClose={onClose} />}
    </Dialog>
  );
}

function PreviewBody({ date, onClose }: { date: string; onClose: () => void }) {
  const query = useWorkout(date);
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this workout" skeleton={<SkeletonRows rows={4} label="Loading workout" />}>
      {(w) => <Preview w={w} onClose={onClose} />}
    </QueryBoundary>
  );
}

function Preview({ w, onClose }: { w: WorkoutView; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  // The content arrives after the sheet opens, so move focus to Close once it is there.
  useEffect(() => close.current?.focus(), []);
  const canStart = !w.blockedReason && w.date === w.today;
  const sections = (["warmup", "main", "cooldown"] as const).map((s) => ({ s, items: w.exercises.filter((x) => x.prescription.section === s) })).filter((g) => g.items.length);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-clay-muted">{formatWeekdayDate(w.date)} · Week {w.weekNumber}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">{w.title}</h2>
          <p className="mt-1 text-sm text-clay-muted">
            {w.exercises.filter((x) => x.prescription.section === "main").length} exercises · about {w.minutes} min · {w.versionName}, version {w.versionNumber}
          </p>
        </div>
        <button ref={close} type="button" onClick={onClose} aria-label="Close preview" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {sections.map(({ s, items }) => (
        <section key={s} aria-label={SECTION[s]} className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">{SECTION[s]}</h3>
          <ul className="mt-2 space-y-3">
            {items.map((x) => {
              const did = entryFor(w.entries, x.prescription);
              const swapped = did?.substitutionFor ? w.exercises.flatMap((e) => e.alternatives).find((a) => a.id === did.exerciseId) : undefined;
              return (
                <li key={x.prescription.order} className="clay-flat p-4">
                  <p className="font-bold">{x.exercise.name}</p>
                  <p className="text-sm text-clay-muted">Target: {describeTarget(x.prescription)}</p>
                  {did && did.sets.length > 0 && (
                    <p className="mt-1 text-sm font-semibold text-mint-700">
                      {swapped ? `Did ${swapped.name}: ` : "Did: "}
                      {describeLogged(did)}
                    </p>
                  )}
                  <div className="mt-2">
                    <HowTo exercise={x.exercise} cue={x.prescription.cues} />
                  </div>
                  {x.alternatives.length > 0 && <p className="mt-2 text-sm text-clay-muted">Instead: {x.alternatives.map((a) => a.name).join(", ")}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="mt-6">
        {canStart ? (
          <Button3DLink to={`/m/workout/${w.date}`} size="lg" haptic className="w-full">
            {w.status === "draft" ? "Continue workout" : "Start workout"}
          </Button3DLink>
        ) : (
          w.blockedReason && <p className="rounded-2xl bg-clay-lavender px-4 py-3 text-[0.95rem]">{w.blockedReason}</p>
        )}
      </div>
    </div>
  );
}
