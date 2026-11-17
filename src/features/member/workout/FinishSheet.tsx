import { useState } from "react";
import { Button3D } from "@/design/Button3D";
import { Dialog } from "@/design/Dialog";
import { isApiError } from "@/api";
import { statusFor, type Progress } from "@/domain/workout";

const WORDS = {
  completed: { title: "Finish workout", lead: "Every set is logged.", cta: "Finish workout" },
  partial: { title: "Finish workout", lead: "You did part of it. That still counts, and your trainer will see exactly what you did.", cta: "Save partly done workout" },
  skipped: { title: "Skip this workout?", lead: "Nothing is logged, so today will be recorded as skipped. That is fine. Your next workout is waiting.", cta: "Skip workout" },
} as const;

const EFFORT_LABEL: Record<number, string> = { 1: "Very easy", 3: "Easy", 5: "Moderate", 7: "Hard", 9: "Very hard", 10: "All out" };

export interface FinishDetails {
  effort?: number;
  notes?: string;
}

/** The last step: how the workout went in numbers, how hard it felt, and a note for the trainer. Submitting can be retried safely. */
export function FinishSheet({ open, progress, pending, error, onSubmit, onClose }: { open: boolean; progress: Progress; pending: boolean; error: unknown; onSubmit: (d: FinishDetails) => void; onClose: () => void }) {
  const [effort, setEffort] = useState<number>();
  const [notes, setNotes] = useState("");
  const status = statusFor(progress);
  const words = WORDS[status];
  const parts = [`${progress.done} of ${progress.total} sets done`, progress.skipped ? `${progress.skipped} skipped` : "", progress.open ? `${progress.open} not logged` : ""].filter(Boolean);
  return (
    <Dialog open={open} onClose={pending ? () => undefined : onClose} label="Finish workout" placement="bottom" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <h2 className="text-xl font-bold">{words.title}</h2>
      <p className="mt-1 font-semibold">{parts.join(" · ")}</p>
      <p className="mt-1 text-clay-muted">{words.lead}</p>
      {status !== "skipped" && (
        <>
          <fieldset className="mt-5">
            <legend className="font-semibold">How hard was it?</legend>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={effort === n}
                  aria-label={`Effort ${n} of 10${EFFORT_LABEL[n] ? `, ${EFFORT_LABEL[n]!.toLowerCase()}` : ""}`}
                  onClick={() => setEffort(effort === n ? undefined : n)}
                  className={`font-display h-11 rounded-xl text-xl font-extrabold ${effort === n ? "bg-clay-ink text-white" : "bg-clay-lavender"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1 text-sm text-clay-muted">1 is very easy, 10 is all you had.</p>
          </fieldset>
          <label className="mt-4 block">
            <span className="font-semibold">Anything your trainer should know?</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border border-clay-line p-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
          </label>
        </>
      )}
      {error !== null && error !== undefined && (
        <p role="alert" className="mt-4 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">
          {isApiError(error) ? error.message : "We couldn’t save your workout."} Your sets are safe. Press the button to try again.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button3D variant={status === "skipped" ? "ink" : "ember"} size="lg" haptic disabled={pending} onClick={() => onSubmit({ effort, notes: notes.trim() || undefined })} className="flex-1">
          {pending ? "Saving…" : error ? "Try again" : words.cta}
        </Button3D>
        <Button3D variant="white" size="lg" disabled={pending} onClick={onClose}>
          Keep logging
        </Button3D>
      </div>
    </Dialog>
  );
}
