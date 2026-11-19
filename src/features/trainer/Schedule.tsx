import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, CalendarOff, Clock } from "lucide-react";
import { useSchedule } from "@/api/trainerHooks";
import type { ScheduleData } from "@/api/schedule";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { ThreeZone } from "@/design/layout/ThreeZone";
import { useSplit, useWide } from "@/design/useMediaQuery";
import { Availability } from "@/features/trainer/schedule/Availability";
import { Conflicts, Sessions } from "@/features/trainer/schedule/Sessions";
import { Leave, Shifts } from "@/features/trainer/schedule/ShiftsLeave";
import { formatTime } from "@/lib/when";
import { cn } from "@/lib/format";

const TABS = [
  { value: "sessions", label: "Sessions", icon: CalendarDays },
  { value: "availability", label: "Availability", icon: Clock },
  { value: "away", label: "Shifts and leave", icon: CalendarOff },
] as const;
type Tab = (typeof TABS)[number]["value"];

/**
 * Schedule (O01, O02, T04, M06): today’s and upcoming sessions with attended and no-show, your weekly availability, one-off shifts
 * and leave, and the sessions that clash with leave. The tab is in the address.
 *
 * - Phone: tabs in one column.
 * - From 768 px: the sections on the left, the chosen one beside them.
 * - From 1280 px: a third zone with what needs you now (sessions on leave and sessions to mark). Below that the same things sit
 *   at the top of Sessions, so the third zone never holds the only way to do anything.
 */
export default function Schedule() {
  const query = useSchedule();
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t load your schedule" skeleton={<SkeletonCard label="Loading schedule" />}>
      {(s) => <ScheduleScreen s={s} />}
    </QueryBoundary>
  );
}

function Attention({ s }: { s: ScheduleData }) {
  const toMark = s.sessions.filter((r) => r.markable && !r.conflict);
  return (
    <aside aria-label="Needs you now" className="space-y-4">
      <Conflicts s={s} />
      <section aria-labelledby="na-title" className="clay p-4">
        <h2 id="na-title" className="text-lg font-bold">Needs you now</h2>
        {s.conflicts.length === 0 && toMark.length === 0 ? (
          <p className="mt-2 text-[0.95rem] text-clay-muted">Nothing to mark and no sessions on your leave.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-[0.95rem]">
            {toMark.length > 0 && <li>{toMark.length} {toMark.length === 1 ? "session" : "sessions"} to mark: {toMark.map((r) => `${r.name.split(" ")[0]} ${formatTime(r.startsAt)}`).join(", ")}</li>}
            {s.conflicts.length > 0 && <li className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{s.conflicts.length} on your leave to move</li>}
          </ul>
        )}
      </section>
    </aside>
  );
}

function ScheduleScreen({ s }: { s: ScheduleData }) {
  const split = useSplit();
  const wide = useWide();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "sessions";
  const pick = (t: Tab) => setParams(t === "sessions" ? {} : { tab: t }, { replace: true });
  const toMark = s.sessions.filter((r) => r.markable && !r.conflict).length;
  const badge = (t: Tab) => (t === "sessions" ? s.conflicts.length + toMark : t === "away" ? s.conflicts.length : 0);
  const body = tab === "sessions" ? <Sessions s={s} /> : tab === "availability" ? <Availability s={s} /> : <div className="space-y-4"><Leave s={s} /><Shifts s={s} /></div>;
  // Where there is a third zone it carries the attention boxes; elsewhere the Sessions tab shows them itself.
  const sessionsBody = tab === "sessions" && wide ? <Sessions s={{ ...s, conflicts: [] }} /> : body;
  const title = <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight lg:text-4xl">Schedule</h1>;

  if (!split) {
    return (
      <div className="space-y-4">
        {title}
        <div role="tablist" aria-label="Schedule sections" className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button key={t.value} role="tab" id={`tab-${t.value}`} aria-selected={t.value === tab} aria-controls="schedule-panel" type="button" onClick={() => pick(t.value)} className={cn("min-h-[2.75rem] shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold", t.value === tab ? "bg-clay-ink text-white" : "bg-clay-lavender")}>
              {t.label}{badge(t.value) ? ` (${badge(t.value)})` : ""}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="schedule-panel" aria-labelledby={`tab-${tab}`}>{body}</div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {title}
      <ThreeZone
        listWidth="minmax(11.5rem,14rem)"
        list={
          <nav aria-label="Schedule sections" className="clay p-3">
            <ul className="space-y-1">
              {TABS.map((t) => (
                <li key={t.value}>
                  <button type="button" aria-current={t.value === tab ? "page" : undefined} onClick={() => pick(t.value)} className={cn("flex min-h-[2.75rem] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left font-semibold", t.value === tab ? "bg-white shadow-sm ring-2 ring-ember-200" : "hover:bg-white/70")}>
                    <t.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{t.label}</span>
                    {badge(t.value) > 0 && <span className="rounded-full bg-ember-100 px-2 text-sm text-ember-800">{badge(t.value)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        }
        detail={sessionsBody}
        context={<Attention s={s} />}
      />
    </div>
  );
}
