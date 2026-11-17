import type { ExerciseInfo } from "@/api";

/** How to do an exercise, in a section the member opens when they need it. Muscles and equipment are named in words. */
export function HowTo({ exercise, cue, defaultOpen = false }: { exercise: ExerciseInfo; cue?: string; defaultOpen?: boolean }) {
  const raw = [exercise.muscleGroups.join(", "), exercise.equipment.length ? exercise.equipment.join(", ") : "no equipment"].filter(Boolean).join(" · ");
  const meta = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (
    <details className="group rounded-2xl bg-clay-lavender px-4 py-3" open={defaultOpen}>
      <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center justify-between gap-3 font-semibold marker:hidden">
        How to do it
        <span aria-hidden="true" className="text-clay-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <p className="pb-1 text-[0.95rem] leading-relaxed">{exercise.instructions}</p>
      {cue && <p className="mt-2 text-[0.95rem] font-semibold text-lilac-700">Coach’s cue: {cue}</p>}
      <p className="mt-2 text-sm text-clay-muted">{meta}</p>
    </details>
  );
}
