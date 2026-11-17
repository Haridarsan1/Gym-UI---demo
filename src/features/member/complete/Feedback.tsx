import { useState } from "react";
import { useSaveWorkoutFeedback } from "@/api";
import { cn } from "@/lib/format";

const RECOVERY = ["Drained", "Tired", "Okay", "Good", "Fresh"];

/**
 * How hard it felt and how recovered the member feels (P04). Two taps, both optional. Each tap saves on its own and can be
 * changed, so there is no form to submit.
 */
export function Feedback({ date, effort: effort0, recovery: recovery0 }: { date: string; effort?: number; recovery?: number }) {
  const save = useSaveWorkoutFeedback();
  const [effort, setEffort] = useState(effort0);
  const [recovery, setRecovery] = useState(recovery0);
  const pick = <T extends "effort" | "recovery">(key: T, value: number, current?: number) => {
    const next = current === value ? undefined : value;
    if (next === undefined) return key === "effort" ? setEffort(undefined) : setRecovery(undefined);
    if (key === "effort") setEffort(next);
    else setRecovery(next);
    save.mutate({ date, [key]: next });
  };
  return (
    <section aria-labelledby="feedback-title" className="clay p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="feedback-title" className="text-lg font-bold">How did it feel?</h2>
        <span className="text-sm text-clay-muted" role="status">
          {save.isPending ? "Saving…" : save.isError ? "Not saved. Tap again." : save.isSuccess ? "Saved" : "Optional"}
        </span>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">How hard was it?</legend>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={effort === n}
              aria-label={`Effort ${n} of 10`}
              onClick={() => pick("effort", n, effort)}
              className={cn("font-display h-11 rounded-xl text-xl font-extrabold", effort === n ? "bg-clay-ink text-white" : "bg-clay-lavender")}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-clay-muted">1 is very easy, 10 is all you had.</p>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">How recovered do you feel?</legend>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {RECOVERY.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={recovery === i + 1}
              onClick={() => pick("recovery", i + 1, recovery)}
              className={cn("min-h-[2.75rem] rounded-xl px-1 text-[0.8rem] font-bold leading-tight", recovery === i + 1 ? "bg-clay-ink text-white" : "bg-clay-lavender")}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
