import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useScheduleActions } from "@/api/trainerHooks";
import type { ScheduleData } from "@/api/schedule";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { useToast } from "@/design/Toast";
import { addDays } from "@/domain/dates";
import { formatDate, formatWeekdayDate } from "@/lib/when";

const newKey = (p: string) => `${p}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;
const field = "h-11 w-full rounded-xl border border-clay-line bg-white px-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300";
const Problem = ({ children }: { children?: string }) => (children ? <p role="alert" className="mt-2 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{children}</p> : null);

/** One-off shifts: hours on a single date, such as covering a Sunday or another branch. They add to your weekly hours. */
export function Shifts({ s }: { s: ScheduleData }) {
  const { addShift, removeShift } = useScheduleActions();
  const toast = useToast();
  const [date, setDate] = useState("");
  const [branchId, setBranchId] = useState(s.branches[0]?.id ?? "");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("12:00");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [key, setKey] = useState(() => newKey("shift"));
  const add = () => {
    setError(undefined);
    addShift.mutate({ branchId, date, start, end, note, key }, {
      onSuccess: () => { toast({ title: "Shift added", description: "Members can book you in those hours.", tone: "success" }); setDate(""); setNote(""); setKey(newKey("shift")); },
      onError: (e) => setError(isApiError(e) ? e.message : "We couldn’t add this. Try again."),
    });
  };
  return (
    <section aria-labelledby="sh-title" className="clay p-4">
      <h2 id="sh-title" className="text-lg font-bold">Shifts</h2>
      <p className="text-sm text-clay-muted">Extra hours on one date, on top of your weekly hours.</p>
      {s.shifts.length === 0 ? <p className="mt-2 text-[0.95rem] text-clay-muted">No upcoming shifts.</p> : (
        <ul aria-label="Upcoming shifts" className="mt-2 space-y-2">
          {s.shifts.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 rounded-2xl bg-clay-canvas p-3">
              <span className="min-w-0">
                <span className="block font-semibold">{formatWeekdayDate(x.date)}, {x.start} to {x.end}</span>
                <span className="block text-sm text-clay-muted">{x.branchName}{x.note ? `, ${x.note}` : ""}</span>
              </span>
              <button type="button" aria-label={`Remove the shift on ${formatWeekdayDate(x.date)}`} onClick={() => removeShift.mutate(x.id)} className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl hover:bg-white"><Trash2 className="h-5 w-5" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); add(); }} aria-label="Add a shift" className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-semibold">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></label>
        <label className="block"><span className="text-sm font-semibold">Branch</span><select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={field}>{s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="block"><span className="text-sm font-semibold">From</span><input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} className={field} /></label>
        <label className="block"><span className="text-sm font-semibold">To</span><input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} className={field} /></label>
        <label className="block sm:col-span-2"><span className="text-sm font-semibold">Note (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={field} /></label>
        <div className="sm:col-span-2"><Button3D type="submit" variant="ember" size="lg" disabled={addShift.isPending}>{addShift.isPending ? "Saving…" : "Add shift"}</Button3D><Problem>{error}</Problem></div>
      </form>
    </section>
  );
}

/** Leave: days you are away. It blocks new bookings at once; sessions already booked then are shown in Sessions to move. */
export function Leave({ s }: { s: ScheduleData }) {
  const { addLeave, cancelLeave } = useScheduleActions();
  const toast = useToast();
  const tomorrow = addDays(s.today, 1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [key, setKey] = useState(() => newKey("leave"));
  const add = () => {
    setError(undefined);
    addLeave.mutate({ from, to: to || from, reason, key }, {
      onSuccess: (r) => {
        toast({ title: "Leave added", description: r.conflicts ? `${r.conflicts} booked ${r.conflicts === 1 ? "session is" : "sessions are"} on those days. Move ${r.conflicts === 1 ? "it" : "them"} from Sessions.` : "New bookings are blocked on those days.", tone: "success" });
        setFrom(""); setTo(""); setReason(""); setKey(newKey("leave"));
      },
      onError: (e) => setError(isApiError(e) ? e.message : "We couldn’t add this. Try again."),
    });
  };
  return (
    <section aria-labelledby="lv-title" className="clay p-4">
      <h2 id="lv-title" className="text-lg font-bold">Leave</h2>
      <p className="text-sm text-clay-muted">Days you are away. New bookings are blocked. Sessions already booked on those days are shown as conflicts for you to move.</p>
      {s.leave.length === 0 ? <p className="mt-2 text-[0.95rem] text-clay-muted">No upcoming leave.</p> : (
        <ul aria-label="Upcoming leave" className="mt-2 space-y-2">
          {s.leave.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 rounded-2xl bg-clay-canvas p-3">
              <span className="min-w-0">
                <span className="block font-semibold">{formatDate(l.from)}{l.to !== l.from ? ` to ${formatDate(l.to)}` : ""}</span>
                <span className="block text-sm text-clay-muted">{l.reason ?? "No reason given"}{l.conflicts ? `, ${l.conflicts} booked ${l.conflicts === 1 ? "session clashes" : "sessions clash"}` : ""}</span>
              </span>
              <Button3D size="md" variant="white" onClick={() => cancelLeave.mutate(l.id, { onSuccess: () => toast({ title: "Leave canceled", description: "Those days are open for booking again.", tone: "success" }) })} aria-label={`Cancel leave from ${formatDate(l.from)}`}>Cancel leave</Button3D>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); add(); }} aria-label="Add leave" className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-semibold">First day</span><input type="date" value={from} min={s.today} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }} className={field} /></label>
        <label className="block"><span className="text-sm font-semibold">Last day</span><input type="date" value={to} min={from || tomorrow} onChange={(e) => setTo(e.target.value)} className={field} /></label>
        <label className="block sm:col-span-2"><span className="text-sm font-semibold">Reason (optional)</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={field} /></label>
        <div className="sm:col-span-2"><Button3D type="submit" variant="ember" size="lg" disabled={addLeave.isPending}>{addLeave.isPending ? "Saving…" : "Add leave"}</Button3D><Problem>{error}</Problem></div>
      </form>
    </section>
  );
}
