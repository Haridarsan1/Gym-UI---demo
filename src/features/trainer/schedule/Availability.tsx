import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useScheduleActions } from "@/api/trainerHooks";
import type { ScheduleData } from "@/api/schedule";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Tooltip } from "@/design/Tooltip";
import { useToast } from "@/design/Toast";

const DAYS = [{ n: 1, name: "Monday" }, { n: 2, name: "Tuesday" }, { n: 3, name: "Wednesday" }, { n: 4, name: "Thursday" }, { n: 5, name: "Friday" }, { n: 6, name: "Saturday" }, { n: 0, name: "Sunday" }];
interface Row {
  branchId: string;
  weekday: number;
  start: string;
  end: string;
}
const same = (a: Row[], b: Row[]) => JSON.stringify(a) === JSON.stringify(b);
const field = "h-11 rounded-xl border border-clay-line bg-white px-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300";

/** The weekly pattern (O01): which days, which hours and which branch a member can book you. Existing bookings are left as they are. */
export function Availability({ s }: { s: ScheduleData }) {
  const { saveAvailability } = useScheduleActions();
  const toast = useToast();
  const initial: Row[] = s.availability.map((a) => ({ branchId: a.branchId, weekday: a.weekday, start: a.start, end: a.end }));
  const [rows, setRows] = useState<Row[]>(initial);
  const [error, setError] = useState<string>();
  const dirty = !same(rows, initial);
  const change = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const branchName = (id: string) => s.branches.find((b) => b.id === id)?.name ?? id;
  const sorted = (day: number) => rows.map((r, i) => ({ r, i })).filter((x) => x.r.weekday === day).sort((a, b) => a.r.start.localeCompare(b.r.start));

  const save = () => {
    setError(undefined);
    saveAvailability.mutate({ windows: rows }, {
      onSuccess: () => toast({ title: "Availability saved", description: "Members can book these hours. Sessions already booked stay as they are.", tone: "success" }),
      onError: (e) => setError(isApiError(e) ? e.message : "We couldn’t save this. Try again."),
    });
  };

  return (
    <section aria-labelledby="av-title" className="clay p-4">
      <h2 id="av-title" className="text-lg font-bold">Weekly availability</h2>
      <p className="text-sm text-clay-muted">When members can book a session with you, and where. Sessions are {s.sessionMinutes} minutes; a window fits as many as it can.</p>
      <div className="mt-3 divide-y divide-clay-line">
        {DAYS.map((d) => (
          <fieldset key={d.n} className="py-3">
            <legend className="font-semibold">{d.name}</legend>
            {sorted(d.n).length === 0 && <p className="text-sm text-clay-muted">Not available.</p>}
            <ul className="mt-1 space-y-2">
              {sorted(d.n).map(({ r, i }, k) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`bs-${i}`}>{d.name} window {k + 1} branch</label>
                  <select id={`bs-${i}`} value={r.branchId} onChange={(e) => change(i, { branchId: e.target.value })} className={field}>
                    {s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    {!s.branches.some((b) => b.id === r.branchId) && <option value={r.branchId}>{branchName(r.branchId)}</option>}
                  </select>
                  <label className="sr-only" htmlFor={`st-${i}`}>{d.name} window {k + 1} start</label>
                  <input id={`st-${i}`} type="time" step={900} value={r.start} onChange={(e) => change(i, { start: e.target.value })} className={field} />
                  <span aria-hidden="true">to</span>
                  <label className="sr-only" htmlFor={`en-${i}`}>{d.name} window {k + 1} end</label>
                  <input id={`en-${i}`} type="time" step={900} value={r.end} onChange={(e) => change(i, { end: e.target.value })} className={field} />
                  <Tooltip label={`Remove ${d.name} window ${k + 1}`}>
                    <button type="button" aria-label={`Remove ${d.name} window ${k + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl hover:bg-clay-canvas">
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </Tooltip>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setRows([...rows, { branchId: s.branches[0]?.id ?? "", weekday: d.n, start: "06:00", end: "09:00" }])} className="mt-2 inline-flex min-h-[2.75rem] cursor-pointer items-center gap-1.5 font-semibold text-ember-700 underline underline-offset-4">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a {d.name} window
            </button>
          </fieldset>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button3D variant="ember" size="lg" disabled={!dirty || saveAvailability.isPending} onClick={save}>{saveAvailability.isPending ? "Saving…" : "Save availability"}</Button3D>
        {dirty && <button type="button" onClick={() => { setRows(initial); setError(undefined); }} className="min-h-[2.75rem] cursor-pointer font-semibold underline underline-offset-4">Discard changes</button>}
      </div>
    </section>
  );
}
