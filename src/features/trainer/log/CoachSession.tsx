import { useCallback, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useCoachFinish, useSaveCoachDraft } from "@/api/trainerHooks";
import type { CoachWorkoutView } from "@/api/coachLog";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { isApiError } from "@/api/errors";
import type { LoggedExercise, LoggedSet } from "@/domain/types";
import { clearSet, entryFor, logSet, progress, skipSet, statusFor, substituteExercise } from "@/domain/workout";
import { ExerciseList } from "@/features/member/workout/ExerciseList";
import { ExerciseStep } from "@/features/member/workout/ExerciseStep";
import { useDraftSaver } from "@/features/member/workout/useAutosave";
import { formatWeekdayDate } from "@/lib/when";

/** Where a log stands, in words. Skipped is calm, never red. */
export const STATUS_WORDS = { none: "Not logged", draft: "In progress", completed: "Completed", partial: "Partly done", skipped: "Skipped" } as const;

const newKey = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

/**
 * A coached session, logged by the trainer for the client (T05). It is the member’s own logging (the same set rows, the same
 * pre-fill from last time, the same autosaved draft and safe final save), one exercise at a time. “Correct this log” opens it
 * again on a finished log; saving then asks for a reason and keeps what the log said before.
 */
export function CoachSession({ view, mode, onClose }: { view: CoachWorkoutView; mode: "log" | "correct"; onClose: () => void }) {
  const draft = useSaveCoachDraft();
  const { submit, correct } = useCoachFinish(view.client.memberId);
  const [entries, setEntries] = useState<LoggedExercise[]>(view.entries);
  const [step, setStep] = useState(() => {
    if (mode === "correct") return 0;
    const i = view.exercises.findIndex((x) => x.prescription.section === "main" && (entryFor(view.entries, x.prescription)?.sets.length ?? 0) < x.prescription.sets);
    return view.status === "draft" && i >= 0 ? i : 0;
  });
  const [finishing, setFinishing] = useState(false);
  // One key for the whole save, kept until the person leaves, so a retry never makes a second log or a second correction.
  const [key] = useState(() => (mode === "correct" ? newKey("corr") : view.idempotencyKey));
  const { memberId } = view.client;
  const save = useCallback((next: LoggedExercise[]) => draft.mutateAsync({ memberId, date: view.date, entries: next, idempotencyKey: view.idempotencyKey }), [draft, memberId, view.date, view.idempotencyKey]);
  const autosave = useDraftSaver(save);
  const day = useMemo(() => ({ prescriptions: view.exercises.map((x) => x.prescription) }), [view.exercises]);
  const x = view.exercises[step]!;
  const total = view.exercises.length;
  const p = progress(day, entries);
  const handled = p.done + p.skipped;
  const last = step === total - 1;

  const change = (next: LoggedExercise[]) => {
    setEntries(next);
    if (mode === "log") autosave.schedule(next);
  };
  const actions = {
    onLog: (set: LoggedSet) => change(logSet(entries, x.prescription, set)),
    onSkip: (n: number) => change(skipSet(entries, x.prescription, n)),
    onClear: (n: number) => change(clearSet(entries, x.prescription, n)),
    onSwap: (id: string) => change(substituteExercise(entries, x.prescription, id)),
  };
  const coach = view.coachName.split(" ")[0];

  return (
    <div className="space-y-4">
      <header className="clay p-4">
        <p className="text-sm text-clay-muted">{formatWeekdayDate(view.date)} · Week {view.weekNumber}, {view.versionName}</p>
        <h2 className="text-xl font-bold">{view.title} for {view.client.firstName}</h2>
        <p className="mt-1 text-sm text-clay-muted" aria-live="polite">
          {mode === "correct" ? "Correcting a finished log. The original is kept." : `This session will say “Entered by Coach ${coach}”.`}{" "}
          {mode === "log" && (autosave.state === "saving" ? "Saving…" : autosave.state === "error" ? "Not saved yet." : autosave.state === "saved" ? "Saved." : "Sets save as you go.")}
        </p>
        <div role="progressbar" aria-label="Sets handled" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={handled} aria-valuetext={`${handled} of ${p.total} sets`} className="mt-3 h-2 overflow-hidden rounded-full bg-clay-line">
          <div className="h-full rounded-full bg-mint-500 transition-[width] duration-300" style={{ width: `${p.total ? (handled / p.total) * 100 : 0}%` }} />
        </div>
        {autosave.state === "error" && (
          <p role="alert" className="mt-2 text-sm">
            We couldn’t save the sets just now. <button type="button" className="font-bold underline underline-offset-4" onClick={() => autosave.schedule(entries)}>Try again</button>
          </p>
        )}
      </header>

      <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6">
        <aside className="hidden md:block">
          <ExerciseList exercises={view.exercises} entries={entries} step={step} onPick={setStep} />
        </aside>
        <div className="min-w-0 space-y-4">
          <ExerciseStep key={x.prescription.order} x={x} entry={entryFor(entries, x.prescription)!} actions={actions} headingId="coach-exercise-name" />
          <div className="clay flex items-center gap-3 !rounded-3xl p-2">
            <Button3D variant="white" disabled={step === 0} aria-label="Previous exercise" onClick={() => setStep(step - 1)} className="!px-4">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              Back
            </Button3D>
            {last ? (
              <Button3D variant="mint" size="lg" onClick={() => setFinishing(true)} className="flex-1">
                {mode === "correct" ? "Save correction" : "Finish session"}
              </Button3D>
            ) : (
              <Button3D size="lg" onClick={() => setStep(step + 1)} className="flex-1">
                Next exercise
              </Button3D>
            )}
          </div>
          {!last && (
            <button type="button" onClick={() => setFinishing(true)} className="min-h-[2.75rem] cursor-pointer font-semibold text-ember-700 underline underline-offset-4">
              {mode === "correct" ? "Save correction now" : "Finish session now"}
            </button>
          )}
        </div>
      </div>

      <FinishSheet
        open={finishing}
        mode={mode}
        coach={coach ?? "the coach"}
        client={view.client.firstName}
        status={statusFor(p)}
        parts={[`${p.done} of ${p.total} sets done`, p.skipped ? `${p.skipped} skipped` : "", p.open ? `${p.open} not logged` : ""].filter(Boolean)}
        initial={{ effort: view.effort, notes: view.notes }}
        pending={submit.isPending || correct.isPending}
        error={submit.error ?? correct.error}
        onClose={() => { submit.reset(); correct.reset(); setFinishing(false); }}
        onSave={async (d) => {
          try {
            await autosave.flush();
            if (mode === "correct") await correct.mutateAsync({ memberId, date: view.date, entries, effort: d.effort, notes: d.notes, reason: d.reason ?? "", key });
            else await submit.mutateAsync({ memberId, date: view.date, entries, idempotencyKey: key, effort: d.effort, notes: d.notes });
            onClose();
          } catch {
            /* The sheet shows the error and offers a retry with the same key. */
          }
        }}
      />
    </div>
  );
}

const WORDS = {
  completed: "Every prescribed set is done.",
  partial: "Part of the session was done. That still counts.",
  skipped: "Nothing is logged, so this day is recorded as skipped. That is fine.",
} as const;

interface Details {
  effort?: number;
  notes?: string;
  reason?: string;
}

function FinishSheet({ open, mode, coach, client, status, parts, initial, pending, error, onClose, onSave }: { open: boolean; mode: "log" | "correct"; coach: string; client: string; status: keyof typeof WORDS; parts: string[]; initial: { effort?: number; notes?: string }; pending: boolean; error: unknown; onClose: () => void; onSave: (d: Details) => void }) {
  const [effort, setEffort] = useState(initial.effort ? String(initial.effort) : "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();
  const save = () => {
    const e = effort.trim() === "" ? undefined : Number(effort);
    if (e !== undefined && (!Number.isInteger(e) || e < 1 || e > 10)) return setProblem("Effort is a whole number from 1 to 10, or leave it empty.");
    if (mode === "correct" && reason.trim().length < 3) return setProblem("Say why you are correcting this log. The reason is kept with it.");
    setProblem(undefined);
    onSave({ effort: e, notes: notes.trim() || undefined, reason: reason.trim() });
  };
  const title = mode === "correct" ? "Save correction" : "Finish session";
  return (
    <Sheet open={open} onClose={pending ? () => undefined : onClose} label={title} kind="confirm" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-1 font-semibold">{parts.join(", ")}</p>
      <p className="mt-1 text-clay-muted">{WORDS[status]} {mode === "log" ? `It will say “Entered by Coach ${coach}”.` : `The log keeps ${client}’s original and your reason, and the change is written to the audit log.`}</p>
      {mode === "correct" && (
        <label className="mt-4 block">
          <span className="font-semibold">Why are you correcting it?</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} className="mt-2 w-full rounded-xl border border-clay-line p-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
        </label>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <label className="block">
          <span className="font-semibold">Effort (1 to 10)</span>
          <input value={effort} onChange={(e) => setEffort(e.target.value)} inputMode="numeric" className="mt-2 h-11 w-full rounded-xl border border-clay-line px-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
        </label>
        <label className="block">
          <span className="font-semibold">Note about the session</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} className="mt-2 w-full rounded-xl border border-clay-line p-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
        </label>
      </div>
      {(!!problem || !!error) && (
        <p role="alert" className="mt-4 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">
          {problem ?? (isApiError(error) ? error.message : "We couldn’t save this.")} {problem ? "" : "The sets are safe. Press the button to try again."}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button3D variant="ember" size="lg" disabled={pending} onClick={save} className="sm:flex-1">
          {pending ? "Saving…" : error ? "Try again" : title}
        </Button3D>
        <Button3D variant="white" size="lg" disabled={pending} onClick={onClose}>
          Keep logging
        </Button3D>
      </div>
    </Sheet>
  );
}
