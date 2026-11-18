import { Check } from "lucide-react";
import type { WorkoutExercise } from "@/api";
import type { LoggedExercise } from "@/domain/types";
import { entryFor } from "@/domain/workout";
import { cn } from "@/lib/format";

/**
 * The workout’s exercises with how many sets are handled in each. Shown beside the set logging from 768 px;
 * on phones the member moves with Back and Next.
 */
export function ExerciseList({ exercises, entries, step, onPick }: { exercises: WorkoutExercise[]; entries: LoggedExercise[]; step: number; onPick: (i: number) => void }) {
  return (
    <nav aria-label="Exercises in this workout">
      <ol className="space-y-1.5">
        {exercises.map((x, i) => {
          const e = entryFor(entries, x.prescription);
          const handled = e?.sets.filter((s) => s.setNumber <= x.prescription.sets).length ?? 0;
          const complete = handled >= x.prescription.sets;
          const name = e?.substitutionFor ? (x.alternatives.find((a) => a.id === e.exerciseId)?.name ?? x.exercise.name) : x.exercise.name;
          return (
            <li key={x.prescription.order}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn("flex min-h-[2.75rem] w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors", i === step ? "bg-white font-bold shadow-sm ring-2 ring-ember-200" : "hover:bg-white/70")}
              >
                <span aria-hidden="true" className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", complete ? "bg-mint-300 text-[#06301f]" : "bg-clay-line text-clay-muted")}>
                  {complete ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem]">{name}</span>
                  <span className="block text-xs font-normal text-clay-muted">
                    {handled} of {x.prescription.sets} sets
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
