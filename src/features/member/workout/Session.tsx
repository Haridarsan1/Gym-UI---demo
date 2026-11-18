import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useSubmitWorkout } from "@/api";
import type { WorkoutView } from "@/api";
import { Button3D } from "@/design/Button3D";
import type { LoggedExercise, LoggedSet } from "@/domain/types";
import { clearSet, entryFor, logSet, progress, restAfter, skipSet, substituteExercise } from "@/domain/workout";
import { ExerciseStep } from "@/features/member/workout/ExerciseStep";
import { FinishSheet, type FinishDetails } from "@/features/member/workout/FinishSheet";
import { ExerciseList } from "@/features/member/workout/ExerciseList";
import { MEDIA, useMediaQuery } from "@/design/useMediaQuery";
import { useShortcut } from "@/design/useShortcut";
import { RestTimer } from "@/features/member/workout/RestTimer";
import { useAutosave } from "@/features/member/workout/useAutosave";

interface Rest {
  id: number;
  endsAt: number;
  total: number;
}

/** A new workout opens on the first exercise. A started one opens on the first main exercise with sets left, so “Continue workout” lands where the member stopped. */
function startingStep(view: WorkoutView): number {
  if (view.status === "none" || !view.entries.some((e) => e.sets.length)) return 0;
  const i = view.exercises.findIndex((x) => {
    const e = entryFor(view.entries, x.prescription);
    return x.prescription.section === "main" && (e?.sets.length ?? 0) < x.prescription.sets;
  });
  return i < 0 ? view.exercises.length - 1 : i;
}

/** Logging a workout: one exercise at a time, a rest timer between sets, drafts saved as you go, and a safe final submit (W03, T05). */
export function Session({ view }: { view: WorkoutView }) {
  const navigate = useNavigate();
  const submit = useSubmitWorkout();
  const [entries, setEntries] = useState<LoggedExercise[]>(view.entries);
  const [step, setStep] = useState(() => startingStep(view));
  const [rest, setRest] = useState<Rest | null>(null);
  const [finishing, setFinishing] = useState(false);
  const autosave = useAutosave(view.date, view.idempotencyKey);
  const desktop = useMediaQuery(MEDIA.desktop);
  const heading = useRef<HTMLDivElement>(null);
  const restId = useRef(0);

  const day = useMemo(() => ({ prescriptions: view.exercises.map((x) => x.prescription) }), [view.exercises]);
  const x = view.exercises[step]!;
  const entry = entryFor(entries, x.prescription)!;
  const total = view.exercises.length;
  const p = progress(day, entries);
  const handled = p.done + p.skipped;

  // Move to the top of the new exercise and let screen readers hear its name.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    heading.current?.querySelector<HTMLElement>("#exercise-name")?.focus({ preventScroll: true });
  }, [step]);

  const change = useCallback(
    (next: LoggedExercise[]) => {
      setEntries(next);
      autosave.schedule(next);
    },
    [autosave],
  );

  const startRest = (seconds: number) => {
    if (seconds > 0) setRest({ id: ++restId.current, endsAt: Date.now() + seconds * 1000, total: seconds });
  };

  const actions = {
    onLog: (set: LoggedSet) => {
      const next = logSet(entries, x.prescription, set);
      change(next);
      startRest(restAfter(x.prescription, progress(day, next).open === 0));
    },
    onSkip: (n: number) => change(skipSet(entries, x.prescription, n)),
    onClear: (n: number) => change(clearSet(entries, x.prescription, n)),
    onSwap: (id: string) => change(substituteExercise(entries, x.prescription, id)),
  };

  const finish = async (d: FinishDetails) => {
    await autosave.flush();
    try {
      const r = await submit.mutateAsync({ date: view.date, entries, idempotencyKey: view.idempotencyKey, notes: d.notes });
      // The summary is the reward; it asks how the workout felt.
      navigate(`/m/workout/${r.date}/complete`, { replace: true, state: { celebrate: true } });
    } catch {
      /* The sheet shows the error from the mutation and offers a retry with the same key. */
    }
  };

  const last = step === total - 1;
  // “n” and “b” move between exercises on a keyboard; the buttons stay.
  useShortcut("n", () => !last && setStep(step + 1));
  useShortcut("b", () => step > 0 && setStep(step - 1));
  const timer = rest ? <RestTimer key={rest.id} endsAt={rest.endsAt} total={rest.total} onAdd={(s) => setRest({ ...rest, endsAt: rest.endsAt + s * 1000, total: rest.total + s })} onClose={() => setRest(null)} /> : null;
  const buttons = (
    <div className="clay flex items-center gap-3 !rounded-3xl p-2">
      <Button3D variant="white" disabled={step === 0} aria-label="Previous exercise" onClick={() => setStep(step - 1)} className="!px-4">
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        Back
      </Button3D>
      {last ? (
        <Button3D variant="mint" size="lg" haptic onClick={() => setFinishing(true)} className="flex-1">
          Finish workout
        </Button3D>
      ) : (
        <Button3D size="lg" onClick={() => setStep(step + 1)} className="flex-1">
          Next exercise
        </Button3D>
      )}
    </div>
  );
  return (
    <div className={desktop ? "pb-8" : rest ? "pb-52" : "pb-24"}>
      <div className="sticky top-16 z-20 sm:top-0 -mx-4 border-b border-clay-line bg-clay-canvas/95 px-4 pb-3 pt-2 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex items-center justify-between gap-2">
          <Link to="/m" aria-label="Leave workout. Your sets are saved." className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-clay-muted hover:bg-clay-lavender">
            <X className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold">{view.title}</p>
            <p className="text-xs text-clay-muted" aria-live="polite">
              Exercise {step + 1} of {total},{" "}
              {autosave.state === "saving" ? "Saving…" : autosave.state === "error" ? "Not saved yet" : autosave.state === "saved" ? "Saved" : "Sets save as you go"}
            </p>
          </div>
          <button type="button" onClick={() => setFinishing(true)} className="min-h-[2.75rem] cursor-pointer px-2 font-bold text-ember-700 underline underline-offset-4">
            Finish
          </button>
        </div>
        <div role="progressbar" aria-label="Sets handled" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={handled} aria-valuetext={`${handled} of ${p.total} sets`} className="mt-2 h-2 overflow-hidden rounded-full bg-clay-line">
          <div className="h-full rounded-full bg-mint-500 transition-[width] duration-300" style={{ width: `${p.total ? (handled / p.total) * 100 : 0}%` }} />
        </div>
        {autosave.state === "error" && (
          <p role="alert" className="mt-2 text-sm">
            We couldn’t save your sets just now. <button type="button" className="font-bold underline underline-offset-4" onClick={() => autosave.schedule(entries)}>Try again</button>
          </p>
        )}
      </div>

      <div className="pt-5 md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8 lg:grid-cols-[15rem_minmax(0,1fr)_17rem]">
        <aside className="hidden md:block">
          <div className="sticky top-32">
            <ExerciseList exercises={view.exercises} entries={entries} step={step} onPick={setStep} />
          </div>
        </aside>
        <div ref={heading} className="min-w-0 md:max-w-2xl">
          <ExerciseStep key={x.prescription.order} x={x} entry={entry} actions={actions} />
          {desktop && <div className="mt-6">{buttons}</div>}
        </div>
        {desktop && (
          <aside aria-label="Rest" className="sticky top-32 self-start">
            {timer ?? (
              <div className="clay-flat p-4 text-sm text-clay-muted">
                <p className="font-semibold text-clay-ink">Rest timer</p>
                <p className="mt-1">It starts when you log a set.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {!desktop && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="mx-auto max-w-md space-y-2">
            {timer}
            {buttons}
          </div>
        </div>
      )}

      <FinishSheet open={finishing} progress={p} pending={submit.isPending} error={submit.error} onSubmit={(d) => void finish(d)} onClose={() => { submit.reset(); setFinishing(false); }} />
    </div>
  );
}
