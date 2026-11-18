import { useState } from "react";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { isApiError } from "@/api";
import { statusFor, type Progress } from "@/domain/workout";

const WORDS = {
  completed: { title: "Finish workout", lead: "Every set is logged.", cta: "Finish workout" },
  partial: { title: "Finish workout", lead: "You did part of it. That still counts, and your trainer will see exactly what you did.", cta: "Save partly done workout" },
  skipped: { title: "Skip this workout?", lead: "Nothing is logged, so today will be recorded as skipped. That is fine. Your next workout is waiting.", cta: "Skip workout" },
} as const;

export interface FinishDetails {
  notes?: string;
}

/** The last step: how the workout went in numbers, how hard it felt, and a note for the trainer. Submitting can be retried safely. */
export function FinishSheet({ open, progress, pending, error, onSubmit, onClose }: { open: boolean; progress: Progress; pending: boolean; error: unknown; onSubmit: (d: FinishDetails) => void; onClose: () => void }) {
  const [notes, setNotes] = useState("");
  const status = statusFor(progress);
  const words = WORDS[status];
  const parts = [`${progress.done} of ${progress.total} sets done`, progress.skipped ? `${progress.skipped} skipped` : "", progress.open ? `${progress.open} not logged` : ""].filter(Boolean);
  return (
    <Sheet open={open} onClose={pending ? () => undefined : onClose} label="Finish workout" kind="confirm" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <h2 className="text-xl font-bold">{words.title}</h2>
      <p className="mt-1 font-semibold">{parts.join(", ")}</p>
      <p className="mt-1 text-clay-muted">{words.lead}</p>
      {status !== "skipped" && (
        <>
          <label className="mt-5 block">
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
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button3D variant={status === "skipped" ? "ink" : "ember"} size="lg" haptic disabled={pending} onClick={() => onSubmit({ notes: notes.trim() || undefined })} className="sm:flex-1">
          {pending ? "Saving…" : error ? "Try again" : words.cta}
        </Button3D>
        <Button3D variant="white" size="lg" disabled={pending} onClick={onClose}>
          Keep logging
        </Button3D>
      </div>
    </Sheet>
  );
}
