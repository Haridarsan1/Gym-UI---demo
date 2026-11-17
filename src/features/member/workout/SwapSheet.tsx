import { X } from "lucide-react";
import type { ExerciseInfo } from "@/api";
import { Dialog } from "@/design/Dialog";

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Choose a different exercise for the one prescribed (W03). The choice is saved against the original, so the trainer sees both. */
export function SwapSheet({ open, original, current, alternatives, hasLoggedSets, onPick, onClose }: { open: boolean; original: ExerciseInfo; current: string; alternatives: ExerciseInfo[]; hasLoggedSets: boolean; onPick: (id: string) => void; onClose: () => void }) {
  const choices = [original, ...alternatives];
  return (
    <Dialog open={open} onClose={onClose} label="Swap exercise" placement="bottom" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Swap exercise</h2>
          <p className="mt-1 text-sm text-clay-muted">Your trainer prescribed {original.name}. Pick another if you can’t do it today.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {hasLoggedSets && <p className="mt-3 rounded-2xl bg-clay-lavender px-4 py-3 text-sm">The sets you logged for this exercise will be cleared, because they were a different movement.</p>}
      <ul className="mt-4 space-y-2">
        {choices.map((c) => {
          const selected = c.id === current;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => (selected ? onClose() : onPick(c.id))}
                className={`clay-flat flex min-h-[3.5rem] w-full flex-col items-start justify-center p-3 text-left ${selected ? "ring-2 ring-ember-300" : ""}`}
              >
                <span className="font-bold">
                  {c.name}
                  {c.id === original.id ? " (prescribed)" : ""}
                  {selected ? " (selected)" : ""}
                </span>
                <span className="text-sm text-clay-muted">{sentence(`works ${c.muscleGroups.join(", ")}. ${c.equipment.length ? `Needs ${c.equipment.join(", ")}` : "No equipment"}.`)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
