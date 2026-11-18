import { useState } from "react";
import { Trophy, X } from "lucide-react";
import type { ProgressData } from "@/api";
import { Button3D } from "@/design/Button3D";
import { LineChart } from "@/design/charts/Charts";
import { formatValue } from "@/design/charts/scale";
import { Sheet } from "@/design/Sheet";
import { formatDate, formatDayMonth } from "@/lib/when";

type Rec = ProgressData["records"][number];

const SHELF = 6;

/** The trophy shelf: personal records, newest first. Each opens that exercise’s history of records (P02). */
export function RecordsShelf({ data }: { data: ProgressData }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // One tile for each exercise: its current record, newest first. Opening it shows every record that exercise has had.
  const tiles = data.records.filter((r, i) => data.records.findIndex((x) => x.exerciseId === r.exerciseId) === i);
  const counts = new Map<string, number>();
  for (const r of data.records) counts.set(r.exerciseId, (counts.get(r.exerciseId) ?? 0) + 1);
  const shown = all ? tiles : tiles.slice(0, SHELF);
  return (
    <section aria-labelledby="records-title" className="clay p-5">
      <h2 id="records-title" className="text-lg font-bold">Personal records</h2>
      <p className="text-sm text-clay-muted">Your heaviest lift in each exercise, newest first. Tap one for its history.</p>
      {data.records.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-clay-lavender px-4 py-4 text-[0.95rem]">Your first record appears when you lift more than before in an exercise you have already logged. Keep logging your sets.</p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {shown.map((r, i) => (
              <li key={`${r.exerciseId}-${r.date}-${i}`}>
                <button type="button" aria-haspopup="dialog" onClick={() => setOpen(r.exerciseId)} className="flex h-full min-h-[8rem] w-full flex-col items-start rounded-2xl bg-gradient-to-br from-ember-50 to-ember-100 p-3 text-left shadow-[0_3px_0_#e9c9b9] active:translate-y-px">
                  <Trophy className="h-5 w-5 text-ember-700" aria-hidden="true" />
                  <span className="mt-2 text-sm font-semibold leading-tight">{r.name}</span>
                  <span className="mt-auto font-display text-3xl font-extrabold leading-none">
                    {formatValue(r.loadKg, 1)} <span className="text-sm font-semibold">kg</span>
                  </span>
                  <span className="text-xs text-clay-muted">{formatDayMonth(r.date)}, up from {formatValue(r.previousKg, 1)} kg</span>
                  <span className="text-xs font-semibold text-ember-800">{counts.get(r.exerciseId)} {counts.get(r.exerciseId) === 1 ? "record" : "records"}</span>
                </button>
              </li>
            ))}
          </ul>
          {tiles.length > SHELF && (
            <button type="button" onClick={() => setAll(!all)} className="mt-2 min-h-[2.75rem] font-semibold underline underline-offset-4">
              {all ? "Show fewer" : `Show all ${tiles.length} exercises`}
            </button>
          )}
        </>
      )}
      <RecordHistory data={data} exerciseId={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function RecordHistory({ data, exerciseId, onClose }: { data: ProgressData; exerciseId: string | null; onClose: () => void }) {
  const records: Rec[] = exerciseId ? data.records.filter((r) => r.exerciseId === exerciseId) : [];
  const series = exerciseId ? data.strength.find((s) => s.exerciseId === exerciseId) : undefined;
  const name = records[0]?.name ?? "Records";
  return (
    <Sheet open={exerciseId !== null} onClose={onClose} label="Record history" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-clay-muted">Record history</p>
          <h2 className="text-2xl font-bold tracking-tight">{name}</h2>
          <p className="text-sm text-clay-muted">{records.length} {records.length === 1 ? "record" : "records"}, newest first</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender" data-autofocus>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {series && series.points.length > 1 && (
        <div className="mt-2">
          <p className="text-sm text-clay-muted">The heaviest set in each workout.</p>
          <LineChart label={`${name}, best set`} unit="kg" points={series.points} from={series.points[0]!.date} to={series.points.at(-1)!.date} maxGapDays={28} />
        </div>
      )}
      <ol className="mt-3 space-y-2" aria-label="Records for this exercise">
        {records.map((r) => (
          <li key={r.date} className="clay-flat flex items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="font-display text-2xl font-extrabold">{formatValue(r.loadKg, 1)} kg</span>
              <span className="block text-sm text-clay-muted">Up from {formatValue(r.previousKg, 1)} kg</span>
            </span>
            <span className="text-sm text-clay-muted">{formatDate(r.date)}</span>
          </li>
        ))}
      </ol>
      <Button3D variant="white" className="mt-4 w-full" onClick={onClose}>Close</Button3D>
    </Sheet>
  );
}
