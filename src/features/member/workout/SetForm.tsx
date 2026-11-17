import { useEffect, useRef, useState } from "react";
import type { LoggedSet, Prescription } from "@/domain/types";
import { Button3D } from "@/design/Button3D";
import { asPrescribed, fieldsFor, lastTimeText, prefillFor, type LastTime } from "@/domain/workout";
import { NumberField } from "@/features/member/workout/NumberField";

const text = (n: number | undefined) => (n === undefined ? "" : String(n));
const num = (s: string): number | undefined => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));
const loadStep = (kg: string) => (Number(kg || 0) >= 20 ? 2.5 : 1);

/**
 * Logging one set. Everything is pre-filled with the target, so a set done as prescribed is one tap (W03). Change a number
 * if it went differently. “Skip set” records that it was not done, calmly.
 */
export function SetForm({ p, setNumber, initial, scrollIntoView, last, substituted = false, onLog, onSkip, onCancel }: { p: Prescription; setNumber: number; initial?: LoggedSet; /** Last time’s set for this exercise: pre-fills the form and is shown under the title. */ last?: LastTime; /** A swapped exercise gets no pre-filled load. */ substituted?: boolean; /** Bring the form into view, clear of the bottom bar, when it opens after a set was logged. */ scrollIntoView?: boolean; onLog: (s: LoggedSet) => void; onSkip: () => void; onCancel?: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (scrollIntoView) form.current?.scrollIntoView({ block: "nearest" });
  }, [scrollIntoView]);
  const fields = fieldsFor(p);
  const from = initial && !initial.skipped ? initial : undefined;
  const fill = prefillFor(p, last, substituted);
  const [reps, setReps] = useState(text(from ? from.reps : fill.reps));
  const [load, setLoad] = useState(text(from ? from.loadKg : fill.loadKg));
  const [seconds, setSeconds] = useState(text(from ? from.durationSec : p.durationSec));
  const [metres, setMetres] = useState(text(from ? from.distanceM : p.distanceM));
  const [error, setError] = useState<string>();

  const submit = () => {
    const set: LoggedSet = { setNumber, skipped: false };
    if (fields.includes("reps")) {
      const r = num(reps);
      if (r === undefined || !Number.isInteger(r)) return setError("Enter how many reps you did, as a whole number.");
      set.reps = r;
    }
    if (fields.includes("load")) set.loadKg = num(load) || undefined;
    if (fields.includes("duration")) {
      const d = num(seconds);
      if (d === undefined) return setError("Enter how many seconds you did.");
      set.durationSec = Math.round(d);
    }
    if (fields.includes("distance")) {
      const m = num(metres);
      if (m === undefined) return setError("Enter how many metres you did.");
      set.distanceM = m;
    }
    const target = asPrescribed(p, setNumber);
    const same = set.reps === target.reps && (set.loadKg ?? undefined) === (target.loadKg || undefined) && set.durationSec === target.durationSec && set.distanceM === target.distanceM;
    onLog(same ? { ...set, asPrescribed: true } : set);
  };

  return (
    <form
      ref={form}
      aria-label={`Set ${setNumber}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="scroll-mb-56 rounded-2xl bg-clay-lavender p-4"
    >
      <p className="font-bold">Set {setNumber} of {p.sets}</p>
      {last && !substituted && <p className="text-sm text-clay-muted">{lastTimeText(last)}</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        {fields.includes("reps") && <NumberField label="Reps" value={reps} onChange={setReps} />}
        {fields.includes("load") && <NumberField label="Load" unit="kg" value={load} onChange={setLoad} step={loadStep(load)} decimal />}
        {fields.includes("duration") && <NumberField label="Time" unit="seconds" value={seconds} onChange={setSeconds} step={5} />}
        {fields.includes("distance") && <NumberField label="Distance" unit="metres" value={metres} onChange={setMetres} step={50} />}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button3D type="submit" variant="mint" haptic className="flex-1">
          {initial ? "Save set" : "Log set"}
        </Button3D>
        {initial ? (
          <Button3D variant="white" onClick={onCancel}>Cancel</Button3D>
        ) : (
          <Button3D variant="white" onClick={onSkip}>Skip set</Button3D>
        )}
      </div>
    </form>
  );
}
