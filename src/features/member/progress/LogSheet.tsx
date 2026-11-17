import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { isApiError, useLogMeasurement } from "@/api";
import type { ProgressData } from "@/api";
import { Button3D } from "@/design/Button3D";
import { celebrate } from "@/design/celebrate";
import { Dialog } from "@/design/Dialog";
import { useToast } from "@/design/Toast";
import { MEMBER_MEASUREMENTS, measurementError, measurementInfo, pointsFor, type MemberMeasurementKind } from "@/domain/progress";
import { Chips } from "@/features/member/progress/MetricCard";
import { NumberField } from "@/features/member/workout/NumberField";
import { formatDate } from "@/lib/when";
import { addDays } from "@/domain/dates";

const STEP: Record<MemberMeasurementKind, number> = { weight: 0.1, waist: 0.5, chest: 0.5, hips: 0.5, arm: 0.5, thigh: 0.5, body_fat: 0.1 };

/**
 * A quick form to log a weight or a measurement (P01). It opens with the last value filled in, so a small change is a tap or
 * two. The reading is recorded as entered by the member, and the trainer sees that. A reading that reaches a goal’s target
 * celebrates; the goal stays Active until the trainer confirms it.
 */
export function LogSheet({ open, initialKind, data, onClose }: { open: boolean; initialKind: MemberMeasurementKind; data: ProgressData; onClose: () => void }) {
  const save = useLogMeasurement();
  const toast = useToast();
  const [kind, setKind] = useState<MemberMeasurementKind>(initialKind);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(data.today);
  const [method, setMethod] = useState("");
  const [error, setError] = useState<string>();
  const info = measurementInfo(kind)!;
  const readings = pointsFor(data.measurements, kind, "0000-01-01", "9999-12-31");

  // Each time it opens, or the kind changes, start from the latest reading of that kind.
  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
  }, [open, initialKind]);
  useEffect(() => {
    if (!open) return;
    const last = pointsFor(data.measurements, kind, "0000-01-01", "9999-12-31").at(-1);
    setValue(last ? String(last.value) : "");
    setError(undefined);
    setDate(data.today);
    setMethod("");
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const submit = async () => {
    const n = value.trim() === "" ? undefined : Number(value);
    const problem = measurementError(kind, n);
    if (problem) return setError(problem);
    setError(undefined);
    try {
      const r = await save.mutateAsync({ kind, value: n!, measuredOn: date, method: kind === "body_fat" ? method : undefined });
      if (r.repeated) toast({ title: "Already saved", description: `${info.label} ${n} ${info.unit} is already on ${formatDate(date)}.`, tone: "info" });
      else toast({ title: `${info.label} saved`, description: `${n} ${info.unit}, ${formatDate(date)}. Recorded as entered by you.`, tone: "success" });
      if (r.reachedGoals.length) {
        celebrate("goal");
        for (const g of r.reachedGoals) toast({ title: "Target reached", description: `${g.title}. Your trainer will confirm it at your next review.`, tone: "success" });
      }
      onClose();
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t save that. Check your connection and try again.");
    }
  };

  return (
    <Dialog open={open} onClose={save.isPending ? () => undefined : onClose} label="Log a measurement" placement="bottom" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{kind === "weight" ? "Log your weight" : "Log a measurement"}</h2>
          <p className="text-sm text-clay-muted">Saved as entered by you, so your trainer can see where it came from.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3">
        <Chips label="What you measured" value={kind} options={MEMBER_MEASUREMENTS.map((m) => ({ value: m.kind, label: m.label }))} onChange={setKind} />
      </div>
      <form
        className="mt-3 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <NumberField label={info.label} unit={info.unit} value={value} onChange={setValue} step={STEP[kind]} decimal />
        <label className="block">
          <span className="text-sm font-semibold text-clay-muted">Date</span>
          <input type="date" value={date} max={data.today} min={addDays(data.today, -365)} onChange={(e) => setDate(e.target.value || data.today)} className="mt-1 h-11 w-full rounded-xl border border-clay-line bg-white px-3" />
        </label>
        {kind === "body_fat" && (
          <label className="block">
            <span className="text-sm font-semibold text-clay-muted">How it was measured (optional)</span>
            <input value={method} onChange={(e) => setMethod(e.target.value)} maxLength={80} placeholder="Smart scale, skinfold calipers" className="mt-1 h-11 w-full rounded-xl border border-clay-line bg-white px-3" />
          </label>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-status-danger-fg">{error}</p>}
        <Button3D type="submit" size="lg" haptic disabled={save.isPending} className="w-full">
          {save.isPending ? "Saving…" : kind === "weight" ? "Save weight" : `Save ${info.label.toLowerCase()}`}
        </Button3D>
      </form>
      {readings.length > 0 && (
        <section className="mt-5" aria-label={`Recent ${info.label.toLowerCase()} entries`}>
          <h3 className="text-sm font-semibold text-clay-muted">Recent entries</h3>
          <ul className="mt-1 divide-y divide-clay-line text-[0.95rem]">
            {[...data.measurements].filter((m) => m.kind === kind).sort((a, b) => b.measuredOn.localeCompare(a.measuredOn)).slice(0, 4).map((m) => (
              <li key={m.id} className="flex justify-between gap-3 py-2">
                <span>{m.value} {info.unit}, {formatDate(m.measuredOn)}</span>
                <span className="text-clay-muted">Entered by {m.by === "You" ? "you" : m.by}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}
