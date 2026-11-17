import { useState } from "react";
import { Check, Repeat } from "lucide-react";
import type { WorkoutExercise } from "@/api";
import type { LoggedExercise, LoggedSet } from "@/domain/types";
import { describeSet, describeTarget } from "@/domain/workout";
import { HowTo } from "@/features/member/workout/ExerciseInfo";
import { SetForm } from "@/features/member/workout/SetForm";
import { SwapSheet } from "@/features/member/workout/SwapSheet";

const SECTION = { warmup: "Warm-up", main: "Main set", cooldown: "Cool-down" } as const;

export interface StepActions {
  onLog: (set: LoggedSet) => void;
  onSkip: (setNumber: number) => void;
  onClear: (setNumber: number) => void;
  onSwap: (exerciseId: string) => void;
}

/**
 * One exercise: what to do, the target, and a row per set. The first set still to do is open with its target filled in.
 * Logged sets stay visible and can be changed; a skipped set can be logged after all.
 */
export function ExerciseStep({ x, entry, actions }: { x: WorkoutExercise; entry: LoggedExercise; actions: StepActions }) {
  const p = x.prescription;
  const [chosen, setChosen] = useState<number | null>(null);
  const [swapping, setSwapping] = useState(false);
  const logged = (n: number) => entry.sets.find((s) => s.setNumber === n);
  const sets = Array.from({ length: p.sets }, (_, i) => i + 1);
  const firstOpen = sets.find((n) => !logged(n));
  const active = chosen ?? firstOpen ?? null;

  const swapped = entry.substitutionFor ? x.alternatives.find((a) => a.id === entry.exerciseId) : undefined;
  const shown = swapped ?? x.exercise;
  const done = sets.filter((n) => logged(n)).length;

  return (
    <section aria-labelledby="exercise-name" className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-clay-muted">{SECTION[p.section]}</p>
        <h2 id="exercise-name" tabIndex={-1} className="mt-1 text-[1.7rem] font-bold leading-tight tracking-tight focus:outline-none">
          {shown.name}
        </h2>
        {swapped && <p className="text-sm font-semibold text-lilac-700">Instead of {x.exercise.name}</p>}
        <p className="mt-1 text-clay-muted">Target: {describeTarget(p)}</p>
        {swapped && <p className="text-sm text-clay-muted">Your sets are saved against {x.exercise.name}.</p>}
      </div>
      <HowTo exercise={shown} cue={p.cues} defaultOpen={false} />
      {x.alternatives.length > 0 && (
        <button type="button" onClick={() => setSwapping(true)} className="inline-flex min-h-[2.75rem] items-center gap-2 font-semibold text-ember-700 underline underline-offset-4">
          <Repeat className="h-4 w-4" aria-hidden="true" />
          Swap exercise
        </button>
      )}

      <ol className="space-y-2" aria-label={`Sets, ${done} of ${p.sets} logged`}>
        {sets.map((n) => {
          const s = logged(n);
          if (n === active) {
            return (
              <li key={n}>
                <SetForm
                  key={`${n}-${s ? "edit" : "new"}`}
                  p={p}
                  setNumber={n}
                  initial={s}
                  onLog={(set) => {
                    setChosen(null);
                    actions.onLog(set);
                  }}
                  onSkip={() => {
                    setChosen(null);
                    actions.onSkip(n);
                  }}
                  onCancel={() => setChosen(null)}
                />
              </li>
            );
          }
          return (
            <li key={n} className="clay-flat flex min-h-[3.5rem] items-center justify-between gap-3 px-4 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${s && !s.skipped ? "bg-mint-300 text-[#06301f]" : "bg-clay-line text-clay-muted"}`}>
                  {s && !s.skipped ? <Check className="h-4 w-4" /> : n}
                </span>
                <div className="min-w-0">
                  <p className="font-bold">Set {n}</p>
                  <p className="truncate text-sm text-clay-muted">
                    {s ? (s.skipped ? "Skipped" : `${describeSet(s)}${s.asPrescribed ? " · as prescribed" : ""}`) : `Target ${describeTarget({ ...p, sets: 1, restSec: undefined })}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {s && !s.skipped && (
                  <button type="button" onClick={() => setChosen(n)} aria-label={`Change set ${n}`} className="min-h-[2.75rem] px-2 font-semibold text-ember-700 underline underline-offset-4">
                    Change
                  </button>
                )}
                {s?.skipped && (
                  <>
                    <button type="button" onClick={() => setChosen(n)} aria-label={`Log set ${n} after all`} className="min-h-[2.75rem] px-2 font-semibold text-ember-700 underline underline-offset-4">
                      Log it
                    </button>
                    <button type="button" onClick={() => actions.onClear(n)} aria-label={`Undo skip of set ${n}`} className="min-h-[2.75rem] px-2 font-semibold text-clay-muted underline underline-offset-4">
                      Undo
                    </button>
                  </>
                )}
                {!s && (
                  <button type="button" onClick={() => setChosen(n)} aria-label={`Open set ${n}`} className="min-h-[2.75rem] px-2 font-semibold text-ember-700 underline underline-offset-4">
                    Open
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <SwapSheet
        open={swapping}
        original={x.exercise}
        current={shown.id}
        alternatives={x.alternatives}
        hasLoggedSets={entry.sets.length > 0}
        onPick={(id) => {
          setSwapping(false);
          setChosen(null);
          actions.onSwap(id);
        }}
        onClose={() => setSwapping(false)}
      />
    </section>
  );
}
