import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarCheck } from "lucide-react";
import { useTrainerToday } from "@/api/hooks";
import type { TrainerTodayData } from "@/api/trainer";
import { Avatar } from "@/design/Avatar";
import { Button3DLink } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { ThreeZone } from "@/design/layout/ThreeZone";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { useSplit, useWide } from "@/design/useMediaQuery";
import { cn } from "@/lib/format";
import { formatWeekdayDate, greeting } from "@/lib/when";
import { ClientRow } from "@/features/trainer/today/ClientRow";
import { categoriesFor, flagsFor, type Category, type CategoryKey } from "@/features/trainer/today/categories";

/**
 * Trainer Today (T07). Five lists of clients: today’s sessions, overdue reviews, missed workouts, expiring credits and clients
 * waiting for a plan.
 *
 * - Phone: one column, the lists one after another (the long ones show three clients and a “Show all”).
 * - From 768 px: the five lists as a menu on the left and the chosen one beside it (`?show=`).
 * - From 1280 px: a third zone with the selected client at a glance (`?client=`).
 */
export default function TrainerToday() {
  const query = useTrainerToday();
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t load today" skeleton={<TodaySkeleton />}>
      {(t) => <TodayContent t={t} />}
    </QueryBoundary>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <SkeletonCard label="Loading today" />
      <SkeletonRows />
    </div>
  );
}

function summary(t: TrainerTodayData): string {
  const parts: string[] = [];
  const left = t.sessions.filter((s) => s.phase !== "done").length;
  if (t.sessions.length) parts.push(`${t.sessions.length} ${t.sessions.length === 1 ? "session" : "sessions"} today${left < t.sessions.length ? `, ${left} still to come` : ""}`);
  else parts.push("No sessions today");
  const need = new Set([...t.overdueReviews, ...t.missed, ...t.awaitingPlan].map((x) => x.memberId)).size;
  parts.push(need ? `${need} ${need === 1 ? "client needs" : "clients need"} you` : "nobody is waiting on you");
  return `${parts.join(". ")}.`;
}

function TodayContent({ t }: { t: TrainerTodayData }) {
  const split = useSplit();
  const wide = useWide();
  const [params, setParams] = useSearchParams();
  const categories = categoriesFor(t);
  const defaultKey: CategoryKey = categories.find((c) => c.rows.length > 0)?.key ?? "sessions";
  const asked = params.get("show");
  const current = categories.find((c) => c.key === asked) ?? categories.find((c) => c.key === defaultKey)!;

  const head = (
    <header>
      <p className="text-sm text-clay-muted">{formatWeekdayDate(t.today)}</p>
      <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight lg:text-4xl">
        {greeting(t.nowIso)}, {t.firstName}
      </h1>
      <p className="mt-1 text-clay-muted">{summary(t)}</p>
    </header>
  );

  if (!split) {
    return (
      <div className="space-y-5">
        {head}
        {categories.map((c) => (
          <StackedSection key={c.key} category={c} />
        ))}
      </div>
    );
  }

  const select = (key: CategoryKey) => setParams((p) => (p.delete("client"), p.set("show", key), p), { replace: true });
  const pick = (memberId: string) => setParams((p) => (p.set("client", memberId), p), { replace: true });
  // The context panel follows the chosen client, or else the next session, or else the first client in the list.
  const nextSession = t.sessions.find((s) => s.phase === "next" || s.phase === "now") ?? t.sessions.find((s) => s.phase === "unmarked");
  const glanceId = params.get("client") ?? nextSession?.memberId ?? current.rows[0]?.memberId ?? categories.flatMap((c) => c.rows)[0]?.memberId;

  return (
    <div className="space-y-6">
      {head}
      <ThreeZone
        listWidth={wide ? "minmax(15rem,17rem)" : "minmax(11.5rem,13rem)"}
        list={<CategoryMenu categories={categories} current={current.key} onSelect={select} />}
        detail={<DetailList category={current} selectable={wide} side={wide} selectedId={glanceId} onPick={pick} />}
        context={<ClientGlance t={t} memberId={glanceId} />}
      />
    </div>
  );
}

/** Phone: a list’s title with its count, and the first three clients. */
function StackedSection({ category: c }: { category: Category }) {
  const [all, setAll] = useState(false);
  const shown = all ? c.rows : c.rows.slice(0, c.key === "sessions" ? 6 : 3);
  return (
    <section aria-labelledby={`sec-${c.key}`} className="clay p-4">
      <h2 id={`sec-${c.key}`} className="flex items-center gap-2 text-lg font-bold">
        <c.icon className="h-5 w-5 text-clay-muted" aria-hidden="true" />
        {c.title}
        <span className="ml-auto rounded-full bg-clay-lavender px-2.5 py-0.5 text-sm font-semibold tabular">{c.rows.length}</span>
      </h2>
      {c.rows.length === 0 ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">{c.empty.title}.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {shown.map((r) => (
            <li key={r.id}>
              <ClientRow row={r} selectable={false} selected={false} onSelect={() => undefined} />
            </li>
          ))}
        </ul>
      )}
      {c.rows.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="mt-1 min-h-[2.75rem] cursor-pointer px-3 font-semibold underline underline-offset-4">
          Show all {c.rows.length}
        </button>
      )}
    </section>
  );
}

/** Zone 1: the five lists and how many clients each holds. */
function CategoryMenu({ categories, current, onSelect }: { categories: Category[]; current: CategoryKey; onSelect: (k: CategoryKey) => void }) {
  return (
    <nav aria-label="Your day" className="clay p-2">
      <ul className="space-y-1">
        {categories.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => onSelect(c.key)}
              aria-current={c.key === current ? "true" : undefined}
              className={cn("flex min-h-[3.5rem] w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors", c.key === current ? "bg-ember-50 text-ember-700" : "hover:bg-clay-canvas")}
            >
              <c.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-tight">{c.title}</span>
                <span className="hidden text-xs text-clay-muted xl:block">{c.hint}</span>
              </span>
              <span className="font-display text-2xl font-extrabold tabular" aria-label={`${c.rows.length} clients`}>
                {c.rows.length}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Zone 2: the clients in the chosen list. */
function DetailList({ category: c, selectable, side, selectedId, onPick }: { category: Category; selectable: boolean; side: boolean; selectedId?: string; onPick: (id: string) => void }) {
  return (
    <section aria-labelledby="detail-title" className="clay p-4">
      <h2 id="detail-title" className="flex items-center gap-2 text-lg font-bold">
        <c.icon className="h-5 w-5 text-clay-muted" aria-hidden="true" />
        {c.title}
      </h2>
      {c.rows.length === 0 ? (
        <div className="mt-3 rounded-2xl bg-clay-canvas p-5 text-center">
          <CalendarCheck className="mx-auto h-8 w-8 text-clay-muted" aria-hidden="true" />
          <p className="mt-2 font-semibold">{c.empty.title}</p>
          <p className="mx-auto mt-1 max-w-sm text-[0.95rem] text-clay-muted">{c.empty.body}</p>
        </div>
      ) : (
        <ul className="mt-2 space-y-1" aria-label={c.title}>
          {c.rows.map((r) => (
            <li key={r.id}>
              <ClientRow row={r} selectable={selectable} selected={selectable && r.memberId === selectedId} onSelect={onPick} side={side} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Zone 3 (1280 px and up): one client at a glance, and why they are on today’s lists. */
function ClientGlance({ t, memberId }: { t: TrainerTodayData; memberId?: string }) {
  const name = memberId ? [...t.sessions, ...t.overdueReviews, ...t.missed, ...t.expiring, ...t.awaitingPlan].find((x) => x.memberId === memberId)?.name : undefined;
  if (!memberId || !name) {
    return (
      <aside aria-label="Client at a glance" className="clay p-5 text-[0.95rem] text-clay-muted">
        Pick a client to see why they are on your list.
      </aside>
    );
  }
  const flags = flagsFor(t, memberId);
  return (
    <aside aria-label="Client at a glance" className="clay p-5">
      <div className="flex items-center gap-3">
        <Avatar name={name} className="h-12 w-12 text-base" />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{name}</h2>
          <p className="text-sm text-clay-muted">{flags.length === 1 ? "On one list today" : `On ${flags.length} lists today`}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-[0.95rem]">
        {flags.map((f) => (
          <li key={f} className="rounded-2xl bg-clay-canvas px-3 py-2">
            {f}
          </li>
        ))}
      </ul>
      <Button3DLink to={`/t/clients/${memberId}`} size="lg" className="mt-5 w-full">
        Open {name.split(" ")[0]}
      </Button3DLink>
      <Link to="/t/clients" className="mt-2 inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">
        All clients
      </Link>
    </aside>
  );
}
