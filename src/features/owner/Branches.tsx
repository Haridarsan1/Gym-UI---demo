import { useRef, useState } from "react";
import { Building2, Plus, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useBranchActions, useBranches } from "@/api/ownerHooks";
import type { BranchRow, BranchesView } from "@/api/branches";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Field, inputClass } from "@/design/Field";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { Switch } from "@/design/Switch";
import { Tooltip } from "@/design/Tooltip";
import { useToast } from "@/design/Toast";
import { useBranch } from "@/design/shells/BranchContext";
import { hasBranchErrors, validateBranch, weekSummary, WEEKDAYS, WEEK_ORDER, type BranchDraft } from "@/domain/branchRules";

/**
 * Branches (O01): each branch’s address, opening hours and rooms, and the people and members that belong to it. The owner edits any branch; a branch manager their own. The GST state and invoice
 * prefix are shown but not edited here. The open branch is in the address (?branch=).
 */
export default function Branches() {
  const query = useBranches();
  return (
    <div className="max-w-6xl space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load the branches" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Branches</h1><SkeletonRows rows={4} /></>}>
        {(v) => <Loaded v={v} />}
      </QueryBoundary>
    </div>
  );
}

function Loaded({ v }: { v: BranchesView }) {
  const { branchId } = useBranch();
  const [params, setParams] = useSearchParams();
  const open = params.get("branch");
  const selected = v.branches.find((b) => b.id === open);
  const shown = v.branches.filter((b) => branchId === "all" || b.id === branchId);
  return (
    <>
      <header>
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Branches</h1>
        <p className="max-w-[70ch] text-clay-muted">Opening hours decide when sessions can be booked, and rooms are where a session can be held. Changing hours never cancels a booked session.</p>
      </header>
      {shown.length === 0 ? <EmptyState icon={Building2} title="No branch to show">Pick another branch, or all branches, in the switcher.</EmptyState> : (
        <ul aria-label="Branches" className="grid gap-4 lg:grid-cols-2">
          {shown.map((b) => (
            <li key={b.id} className="clay flex flex-col p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="text-xl font-bold">{b.name}</h2><p className="text-[0.95rem] text-clay-muted">{b.address ? `${b.address}, ` : ""}{b.city}</p></div>
                <Button3D variant="white" size="md" onClick={() => setParams({ branch: b.id }, { replace: true })} aria-label={`Edit hours and rooms for ${b.name}`}>Edit</Button3D>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div><dt className="text-sm text-clay-muted">Open</dt><dd><ul className="font-semibold">{b.week.map((w) => <li key={w}>{w}</li>)}</ul></dd></div>
                <div><dt className="text-sm text-clay-muted">Rooms</dt><dd><ul className="font-semibold">{b.rooms.length === 0 ? <li className="font-normal text-clay-muted">No rooms yet</li> : b.rooms.map((r) => <li key={r.id}>{r.name}<span className="font-normal text-clay-muted">, holds {r.capacity}{r.upcoming > 0 ? `, ${r.upcoming} booked` : ""}</span></li>)}</ul></dd></div>
                <div><dt className="text-sm text-clay-muted">People</dt><dd className="font-semibold">{b.staff} staff, {b.members} members</dd></div>
                <div><dt className="text-sm text-clay-muted">GST and invoices</dt><dd className="font-semibold">{b.stateName}<span className="font-normal text-clay-muted">, invoices start {b.invoicePrefix}</span></dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={!!selected} onClose={() => setParams({}, { replace: true })} label={selected ? `Branch: ${selected.name}` : "Branch"}>
        {selected && <BranchEditor key={selected.id} b={selected} onClose={() => setParams({}, { replace: true })} />}
      </Sheet>
    </>
  );
}

interface DayForm { open: boolean; from: string; to: string }
interface RoomForm { id?: string; name: string; capacity: string; upcoming: number }

function BranchEditor({ b, onClose }: { b: BranchRow; onClose: () => void }) {
  const { save } = useBranchActions();
  const toast = useToast();
  const [address, setAddress] = useState(b.address ?? "");
  const [days, setDays] = useState<Record<number, DayForm>>(() => Object.fromEntries(WEEKDAYS.map((_, w) => { const h = b.hours.find((x) => x.weekday === w); return [w, { open: !!h, from: h?.open ?? "06:00", to: h?.close ?? "20:00" }]; })));
  const [rooms, setRooms] = useState<RoomForm[]>(() => b.rooms.map((r) => ({ id: r.id, name: r.name, capacity: String(r.capacity), upcoming: r.upcoming })));
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string>();
  const key = useRef(`branch-${crypto.randomUUID()}`);
  const draft: BranchDraft = { address: address.trim(), hours: WEEK_ORDER.filter((w) => days[w]!.open).map((w) => ({ weekday: w, open: days[w]!.from, close: days[w]!.to })), rooms: rooms.map((r) => ({ id: r.id, name: r.name, capacity: /^\d+$/.test(r.capacity.trim()) ? Number(r.capacity.trim()) : null })) };
  const errors = validateBranch(draft);
  const setDay = (w: number, patch: Partial<DayForm>) => setDays((d) => ({ ...d, [w]: { ...d[w]!, ...patch } }));
  const setRoom = (i: number, patch: Partial<RoomForm>) => setRooms((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const submit = async () => {
    setTried(true);
    setFailure(undefined);
    if (hasBranchErrors(errors)) return;
    try {
      const r = await save.mutateAsync({ key: key.current, branchId: b.id, address: draft.address, hours: draft.hours, rooms: draft.rooms });
      toast({ title: r.changes.length ? "Branch saved" : "Nothing changed", description: r.outsideHours > 0 ? `${r.outsideHours} booked ${r.outsideHours === 1 ? "session falls" : "sessions fall"} outside the new hours. They are not canceled; move ${r.outsideHours === 1 ? "it" : "them"} from Bookings.` : r.changes.length ? "The change is in the audit log." : undefined, tone: r.outsideHours > 0 ? "info" : "success" });
      onClose();
    } catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t save the branch. Try again."); }
  };
  const copyMonday = () => setDays((d) => Object.fromEntries(Object.entries(d).map(([w, x]) => [w, Number(w) >= 1 && Number(w) <= 5 ? { ...d[1]! } : x])));

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label={`Branch: ${b.name}`} className="flex min-h-full flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div><h2 className="text-xl font-bold">{b.name}</h2><p className="text-sm text-clay-muted">Hours, rooms and address. {b.stateName} GST and the invoice prefix {b.invoicePrefix} are not changed here.</p></div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-clay-canvas"><X className="h-5 w-5" aria-hidden="true" /></button>
      </header>
      <div className="min-w-0 flex-1 space-y-5 px-5 pb-4 pt-2">
        <Field label="Address" htmlFor="br-address" error={tried ? errors.address : undefined}><input id="br-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} data-autofocus /></Field>
        <fieldset>
          <legend className="text-sm font-semibold">Opening hours</legend>
          <ul aria-label="Opening hours" className="mt-1 space-y-2">
            {WEEK_ORDER.map((w) => {
              const d = days[w]!;
              const bad = tried ? errors.days[w] : undefined;
              return (
                <li key={w} className="clay-flat p-3">
                  <Switch id={`br-day-${w}`} checked={d.open} onChange={(on) => setDay(w, { open: on })} label={WEEKDAYS[w]!} description={d.open ? undefined : "Closed"} />
                  {d.open && (
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <Field label="Opens" htmlFor={`br-from-${w}`}><input id={`br-from-${w}`} type="time" value={d.from} onChange={(e) => setDay(w, { from: e.target.value })} className={inputClass} aria-label={`${WEEKDAYS[w]} opens`} /></Field>
                      <Field label="Closes" htmlFor={`br-to-${w}`}><input id={`br-to-${w}`} type="time" value={d.to} onChange={(e) => setDay(w, { to: e.target.value })} className={inputClass} aria-label={`${WEEKDAYS[w]} closes`} /></Field>
                    </div>
                  )}
                  {bad && <p role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{bad}</p>}
                </li>
              );
            })}
          </ul>
          {tried && errors.hours && <p role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{errors.hours}</p>}
          <button type="button" onClick={copyMonday} className="mt-2 min-h-[2.75rem] cursor-pointer px-1 text-sm font-semibold underline underline-offset-2">Use Monday’s hours for Monday to Friday</button>
          <p aria-live="polite" className="mt-1 text-[0.95rem] text-clay-muted">{draft.hours.length ? weekSummary(draft.hours).join(". ") + "." : "Closed every day."}</p>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">Rooms</legend>
          <ul aria-label="Rooms" className="mt-1 space-y-2">
            {rooms.map((r, i) => (
              <li key={r.id ?? `new-${i}`} className="clay-flat p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-start gap-2">
                  <Field label="Name" htmlFor={`br-room-${i}`} error={tried ? errors.roomRows[i]?.name : undefined}><input id={`br-room-${i}`} value={r.name} onChange={(e) => setRoom(i, { name: e.target.value })} className={inputClass} /></Field>
                  <Field label="Holds" htmlFor={`br-cap-${i}`} error={tried ? errors.roomRows[i]?.capacity : undefined}><input id={`br-cap-${i}`} inputMode="numeric" value={r.capacity} onChange={(e) => setRoom(i, { capacity: e.target.value })} className={inputClass} /></Field>
                  <div className="pt-[1.55rem]"><Tooltip label={r.upcoming > 0 ? `${r.upcoming} sessions booked` : "Remove room"}><button type="button" aria-label={`Remove ${r.name || "room"}`} disabled={r.upcoming > 0} onClick={() => setRooms((x) => x.filter((_, k) => k !== i))} className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl hover:bg-clay-canvas disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-5 w-5" aria-hidden="true" /></button></Tooltip></div>
                </div>
                {r.upcoming > 0 && <p className="mt-1 text-sm text-clay-muted">{r.upcoming} {r.upcoming === 1 ? "session is" : "sessions are"} booked here, so it can’t be removed until {r.upcoming === 1 ? "it is" : "they are"} moved.</p>}
              </li>
            ))}
          </ul>
          {tried && errors.rooms && <p role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{errors.rooms}</p>}
          <div className="mt-2"><Button3D type="button" variant="white" size="md" onClick={() => setRooms((x) => [...x, { name: "", capacity: "10", upcoming: 0 }])}><Plus className="h-4 w-4" aria-hidden="true" />Add a room</Button3D></div>
        </fieldset>
      </div>
      {failure && <p role="alert" className="mx-5 mb-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
      <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-clay-line bg-white/95 px-5 py-3 backdrop-blur">
        <Button3D type="submit" variant="ember" size="md" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save branch"}</Button3D>
        <Button3D type="button" variant="white" size="md" onClick={onClose}>Cancel</Button3D>
      </footer>
    </form>
  );
}
