import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { useScheduleActions } from "@/api/trainerHooks";
import type { ScheduleData, SessionRow } from "@/api/schedule";
import { isApiError } from "@/api/errors";
import { Avatar } from "@/design/Avatar";
import { BookingStatusPill } from "@/design/StatusPills";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { formatDate, formatTime, formatWeekdayDate } from "@/lib/when";
import { istDateOf } from "@/domain/dates";
import { MoveSheet } from "@/features/trainer/schedule/MoveSheet";

const when = (r: SessionRow) => `${formatTime(r.startsAt)} to ${formatTime(r.endsAt)}`;

/** One session: when, who, where, how it stands. Skipped and no-show are said calmly, never in red. */
function Item({ r, children }: { r: SessionRow; children?: React.ReactNode }) {
  return (
    <li className="rounded-2xl bg-clay-canvas p-3">
      <div className="flex items-start gap-3">
        <Avatar name={r.name} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link to={`/t/clients/${r.memberId}`} className="font-semibold underline-offset-4 hover:underline">{r.name}</Link>
            <BookingStatusPill status={r.status} />
          </p>
          <p className="text-sm text-clay-muted">{when(r)}, {r.branchName}</p>
          {r.credit && <p className="text-sm text-clay-muted">{r.credit === "used" ? "Session credit used" : "Session credit given back"}</p>}
          {r.conflict && <p className="text-sm font-semibold">On your leave, {formatDate(r.conflict.from)}{r.conflict.to !== r.conflict.from ? ` to ${formatDate(r.conflict.to)}` : ""}</p>}
        </div>
      </div>
      {children}
    </li>
  );
}

/** Sessions that clash with leave, with a way to move each. */
export function Conflicts({ s }: { s: ScheduleData }) {
  const [moving, setMoving] = useState<SessionRow | null>(null);
  if (!s.conflicts.length) return null;
  return (
    <section aria-labelledby="cf-title" className="clay border-2 border-ember-200 p-4">
      <h2 id="cf-title" className="flex items-center gap-2 text-lg font-bold">
        <AlertTriangle className="h-5 w-5 text-ember-700" aria-hidden="true" />
        {s.conflicts.length === 1 ? "1 booked session is on your leave" : `${s.conflicts.length} booked sessions are on your leave`}
      </h2>
      <p className="text-sm text-clay-muted">New bookings are blocked on those days. Move each session to another time or another trainer. The member gets an email, and their session credit is not affected.</p>
      <ul aria-label="Sessions on leave" className="mt-3 space-y-2">
        {s.conflicts.map((r) => (
          <Item key={r.id} r={r}>
            <p className="mt-1 text-sm text-clay-muted">{formatWeekdayDate(istDateOf(r.startsAt))}</p>
            <div className="mt-2">
              <Button3D size="md" variant="white" onClick={() => setMoving(r)}>
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Move {r.name.split(" ")[0]}’s session
              </Button3D>
            </div>
          </Item>
        ))}
      </ul>
      {moving && <MoveSheet row={moving} onClose={() => setMoving(null)} />}
    </section>
  );
}

/** Sessions that have started and are not marked yet: attended or no-show, with what each does to the credit said first. */
function ToMark({ s, rows }: { s: ScheduleData; rows: SessionRow[] }) {
  const [asking, setAsking] = useState<{ row: SessionRow; outcome: "attended" | "no_show" } | null>(null);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="mk-title" className="clay p-4">
      <h2 id="mk-title" className="text-lg font-bold">To mark</h2>
      <p className="text-sm text-clay-muted">Attended: {s.creditRules.attended.toLowerCase()}. No-show: {s.creditRules.no_show.toLowerCase()}.</p>
      <ul aria-label="Sessions to mark" className="mt-3 space-y-2">
        {rows.map((r) => (
          <Item key={r.id} r={r}>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button3D size="md" variant="mint" onClick={() => setAsking({ row: r, outcome: "attended" })} aria-label={`Mark ${r.name} attended`}>Attended</Button3D>
              <Button3D size="md" variant="white" onClick={() => setAsking({ row: r, outcome: "no_show" })} aria-label={`Mark ${r.name} a no-show`}>No-show</Button3D>
            </div>
          </Item>
        ))}
      </ul>
      {asking && <ConfirmMark s={s} {...asking} onClose={() => setAsking(null)} />}
    </section>
  );
}

function ConfirmMark({ s, row, outcome, onClose }: { s: ScheduleData; row: SessionRow; outcome: "attended" | "no_show"; onClose: () => void }) {
  const { mark } = useScheduleActions();
  const toast = useToast();
  const [error, setError] = useState<string>();
  const first = row.name.split(" ")[0];
  const rule = s.creditRules[outcome];
  const word = outcome === "attended" ? "attended" : "a no-show";
  // `mutateAsync`: marking the last session in a list removes this sheet with the list, which would drop a callback given to `mutate`.
  const save = async () => {
    try {
      const r = await mark.mutateAsync({ bookingId: row.id, outcome });
      toast({ title: `${first} marked ${outcome === "attended" ? "attended" : "a no-show"}`, description: r.credit === "used" ? "1 session credit used." : r.credit === "returned" ? "The session credit went back." : undefined, tone: "success" });
      onClose();
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t save this. Try again.");
    }
  };
  return (
    <Sheet open onClose={onClose} label={outcome === "attended" ? "Mark attended" : "Mark no-show"} kind="confirm" className="p-5">
      <h2 className="text-xl font-bold">Mark {first} as {word}?</h2>
      <p className="mt-1 text-clay-muted">{when(row)}, {row.branchName}.</p>
      <p className="mt-2 font-semibold">{rule}.</p>
      <p className="text-sm text-clay-muted">It can’t be changed afterwards. Tell the front desk if you marked the wrong one.</p>
      {error && <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button3D variant={outcome === "attended" ? "mint" : "ink"} size="lg" className="sm:flex-1" disabled={mark.isPending} onClick={() => void save()}>
          {mark.isPending ? "Saving…" : outcome === "attended" ? "Mark attended" : "Mark no-show"}
        </Button3D>
        <Button3D variant="white" size="lg" onClick={onClose}>Not yet</Button3D>
      </div>
    </Sheet>
  );
}

function Day({ date, today, rows, title }: { date: string; today: string; rows: SessionRow[]; title?: string }) {
  return (
    <section aria-labelledby={`day-${date}`} className="clay p-4">
      <h2 id={`day-${date}`} className="text-lg font-bold">{title ?? (date === today ? "Today" : formatWeekdayDate(date))}</h2>
      <ul aria-label={title ?? (date === today ? "Today’s sessions" : `Sessions on ${formatWeekdayDate(date)}`)} className="mt-2 space-y-2">
        {rows.map((r) => <Item key={r.id} r={r} />)}
      </ul>
    </section>
  );
}

/** Sessions to mark, then today, then the days ahead, then last week’s marked ones. Sessions on leave are in their own box. */
export function Sessions({ s }: { s: ScheduleData }) {
  const clash = new Set(s.conflicts.map((r) => r.id));
  const toMark = s.sessions.filter((r) => r.markable && !clash.has(r.id));
  const marked = new Set(toMark.map((r) => r.id));
  const rest = s.sessions.filter((r) => !clash.has(r.id) && !marked.has(r.id));
  const dateOf = (r: SessionRow) => istDateOf(r.startsAt);
  const today = rest.filter((r) => dateOf(r) === s.today);
  const ahead = [...new Set(rest.filter((r) => dateOf(r) > s.today).map(dateOf))];
  const before = rest.filter((r) => dateOf(r) < s.today).reverse();
  const nothing = !toMark.length && !today.length && !ahead.length && !before.length && !s.conflicts.length;
  return (
    <div className="space-y-4">
      <Conflicts s={s} />
      <ToMark s={s} rows={toMark} />
      {today.length > 0 && <Day date={s.today} today={s.today} rows={today} />}
      {ahead.map((d) => <Day key={d} date={d} today={s.today} rows={rest.filter((r) => dateOf(r) === d)} />)}
      {before.length > 0 && <Day date="earlier" today={s.today} rows={before} title="Earlier this week" />}
      {nothing && (
        <section className="clay p-6 text-center text-clay-muted">
          <p className="font-semibold text-clay-ink">No sessions booked</p>
          <p className="mt-1">Members book against your availability. Check it is set in the Availability tab.</p>
        </section>
      )}
    </div>
  );
}
