import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, UserRound } from "lucide-react";
import { useClients, useCoachDays, useCoachWorkout } from "@/api/trainerHooks";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { useWide } from "@/design/useMediaQuery";
import { CoachSession, STATUS_WORDS } from "@/features/trainer/log/CoachSession";
import { FinishedLog } from "@/features/trainer/log/FinishedLog";
import { formatWeekdayDate } from "@/lib/when";
import { cn } from "@/lib/format";

/**
 * Log for a client (T05). The trainer picks a client, then one of their scheduled days from the last two weeks, then logs the
 * session with the member’s own set rows. The client and day are in the address (`?client=` and `?date=`), so a refresh or a
 * link from the client’s page lands on the same session.
 *
 * - Phone: client, then days, then the session, each with a Back link.
 * - From 768 px: the clients (or the chosen client’s days) on the left, the session beside it.
 */
export default function Log() {
  const [params] = useSearchParams();
  const client = params.get("client") ?? undefined;
  const date = params.get("date") ?? undefined;
  const wide = useWide();
  const list = client ? <DayList memberId={client} date={date} /> : <ClientPicker />;
  const session = client && date ? <Session memberId={client} date={date} /> : null;
  return (
    <div className="space-y-4">
      <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Log a session</h1>
      {wide ? (
        // From 1280 px the days stay on the left and the session sits beside them.
        <div className="grid items-start gap-6" style={{ gridTemplateColumns: "minmax(16rem,20rem) minmax(0,1fr)" }}>
          <div className="min-w-0">{list}</div>
          <div className="min-w-0">{session ?? <Placeholder>{client ? "Pick the day you coached. Today’s workout is at the top." : "Pick a client, then the day you coached them."}</Placeholder>}</div>
        </div>
      ) : session ? (
        // Below that the session needs the whole width, so it opens on its own with a Back link to the days.
        <div>
          <Link to={`/t/log?client=${client}`} className="mb-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            Days
          </Link>
          {session}
        </div>
      ) : (
        <div className="max-w-xl">{list}</div>
      )}
    </div>
  );
}

function Placeholder({ children }: { children: string }) {
  return (
    <div className="clay grid place-items-center px-6 py-14 text-center text-clay-muted">
      <div>
        <UserRound className="mx-auto h-8 w-8" aria-hidden="true" />
        <p className="mt-2 max-w-[18rem]">{children}</p>
      </div>
    </div>
  );
}

function ClientPicker() {
  const [search, setSearch] = useState("");
  const query = useClients({ search });
  return (
    <section aria-labelledby="pick-client" className="space-y-3">
      <h2 id="pick-client" className="text-lg font-bold">Which client?</h2>
      <label className="relative block">
        <span className="sr-only">Search clients</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-clay-muted" aria-hidden="true" />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone" className="h-11 w-full rounded-xl border border-clay-line bg-white pl-10 pr-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
      </label>
      <QueryBoundary query={query} errorTitle="We couldn’t load your clients" skeleton={<SkeletonRows rows={5} />}>
        {(rows) => rows.length === 0 ? <EmptyState title="No clients match">Clear the search to see everyone you train.</EmptyState> : (
          <ul className="divide-y divide-clay-line rounded-2xl bg-white shadow-sm">
            {rows.map((c) => (
              <li key={c.memberId}>
                <Link to={`/t/log?client=${c.memberId}`} className="flex min-h-[3.25rem] items-center justify-between gap-3 px-4 py-2 hover:bg-clay-lavender/60">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-sm text-clay-muted">{c.programName ?? "No plan yet"}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-ember-700">Log session</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
    </section>
  );
}

function DayList({ memberId, date }: { memberId: string; date?: string }) {
  const query = useCoachDays(memberId);
  return (
    <section aria-labelledby="pick-day" className="space-y-3">
      <Link to="/t/log" className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        Change client
      </Link>
      <QueryBoundary query={query} errorTitle="We couldn’t load this client’s days" skeleton={<SkeletonRows rows={5} />}>
        {(d) => (
          <>
            <h2 id="pick-day" className="text-lg font-bold">{d.client.name}: which day?</h2>
            {d.days.length === 0 ? (
              <EmptyState title="No workouts in the last two weeks">There is nothing scheduled to log. Build or publish a plan from the client’s page.</EmptyState>
            ) : (
              <ul className="divide-y divide-clay-line rounded-2xl bg-white shadow-sm">
                {d.days.map((day) => (
                  <li key={day.date}>
                    <Link to={`/t/log?client=${memberId}&date=${day.date}`} aria-current={day.date === date ? "page" : undefined} className={cn("block min-h-[3.25rem] px-4 py-2 hover:bg-clay-lavender/60", day.date === date && "bg-clay-lavender")}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{day.isToday ? "Today" : formatWeekdayDate(day.date)}</span>
                        <span className="text-sm font-semibold">{STATUS_WORDS[day.status]}</span>
                      </span>
                      <span className="block truncate text-sm text-clay-muted">{day.title}{day.enteredByLabel ? `, ${day.enteredByLabel}` : ""}{day.corrected ? ", corrected" : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}

function Session({ memberId, date }: { memberId: string; date: string }) {
  const query = useCoachWorkout(memberId, date);
  const [mode, setMode] = useState<"view" | "correct">("view");
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this session" skeleton={<><SkeletonCard /><SkeletonRows rows={3} /></>}>
      {(v) => {
        if (v.finished && mode === "view") return <FinishedLog view={v} onCorrect={() => setMode("correct")} />;
        if (v.blockedReason && !v.finished) {
          return (
            <section className="clay p-6" aria-labelledby="blocked">
              <h2 id="blocked" className="text-xl font-bold">{v.title}</h2>
              <p className="mt-1 text-clay-muted">{v.blockedReason}</p>
            </section>
          );
        }
        return <CoachSession key={`${v.date}-${mode}-${v.status}`} view={v} mode={v.finished ? "correct" : "log"} onClose={() => setMode("view")} />;
      }}
    </QueryBoundary>
  );
}
