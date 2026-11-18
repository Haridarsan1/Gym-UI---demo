import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useClients } from "@/api/hooks";
import type { ClientFlag, ClientRowData } from "@/api/clients";
import { Avatar } from "@/design/Avatar";
import { QueryBoundary } from "@/design/QueryBoundary";
import { EmptyState } from "@/design/States";
import { SkeletonRows } from "@/design/Skeleton";
import { cn } from "@/lib/format";
import { formatDayMonth } from "@/lib/when";
import { Chips } from "@/features/member/progress/MetricCard";

export const FLAG_TEXT: Record<ClientFlag, string> = { review: "Review overdue", missed: "Behind", plan: "Needs a plan", credits: "Credits expiring", frozen: "Frozen" };
const FLAG_TONE: Record<ClientFlag, string> = {
  review: "bg-status-pending-bg text-status-pending-fg",
  missed: "bg-status-danger-bg text-status-danger-fg",
  plan: "bg-lilac-100 text-lilac-700",
  credits: "bg-status-pending-bg text-status-pending-fg",
  frozen: "bg-status-frozen-bg text-status-frozen-fg",
};

type Filter = "all" | ClientFlag;
const FILTERS: Array<{ value: Filter; label: string }> = [{ value: "all", label: "Everyone" }, { value: "review", label: "Review overdue" }, { value: "missed", label: "Behind" }, { value: "plan", label: "Needs a plan" }, { value: "credits", label: "Credits expiring" }, { value: "frozen", label: "Frozen" }];

/** The trainer’s clients: a search box, a filter, and one row each with how well they are sticking to their plan. */
export function ClientList({ selectedId, search, filter, onSearch, onFilter, linkSuffix }: { selectedId?: string; search: string; filter: Filter; onSearch: (q: string) => void; onFilter: (f: Filter) => void; linkSuffix: string }) {
  const query = useClients({ search, flag: filter === "all" ? undefined : filter });
  return (
    <section aria-label="Clients" className="space-y-3">
      <label className="clay-flat flex min-h-[2.75rem] items-center gap-2 px-4">
        <Search className="h-5 w-5 shrink-0 text-clay-muted" aria-hidden="true" />
        <span className="sr-only">Search clients by name or phone</span>
        <input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search by name or phone" className="min-h-[2.75rem] w-full bg-transparent outline-none placeholder:text-clay-subtle" />
      </label>
      <Chips label="Show clients" value={filter} options={FILTERS} onChange={onFilter} />
      <QueryBoundary query={query} errorTitle="We couldn’t load your clients" skeleton={<SkeletonRows rows={6} label="Loading clients" />}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title={search || filter !== "all" ? "No clients match" : "No clients yet"}>{search || filter !== "all" ? "Try a different name, or show everyone." : "Clients assigned to you appear here."}</EmptyState>
          ) : (
            <>
              <p aria-live="polite" className="px-1 text-sm text-clay-muted">{rows.length === 1 ? "1 client" : `${rows.length} clients`}</p>
              <ul className="space-y-1" aria-label="Your clients">
                {rows.map((r) => (
                  <li key={r.memberId}>
                    <ClientListRow row={r} selected={r.memberId === selectedId} to={`/t/clients/${r.memberId}${linkSuffix}`} />
                  </li>
                ))}
              </ul>
            </>
          )
        }
      </QueryBoundary>
    </section>
  );
}

function ClientListRow({ row: r, selected, to }: { row: ClientRowData; selected: boolean; to: string }) {
  return (
    <Link to={to} aria-current={selected ? "page" : undefined} className={cn("flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl px-3 py-2 transition-colors", selected ? "bg-ember-50 ring-2 ring-ember-200" : "hover:bg-clay-canvas")}>
      <Avatar name={r.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{r.name}</span>
        <span className="block truncate text-sm text-clay-muted">{r.programName ?? "No plan yet"}</span>
        {r.flags.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {r.flags.map((f) => (
              <span key={f} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", FLAG_TONE[f])}>{FLAG_TEXT[f]}</span>
            ))}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right text-sm">
        {r.completionRate === null ? (
          <span className="text-clay-subtle">No data</span>
        ) : (
          <>
            <span className="block font-display text-xl font-extrabold tabular">{Math.round(r.completionRate * 100)}%</span>
            <span className="block text-xs text-clay-muted">{r.lastWorkoutOn ? `Last ${formatDayMonth(r.lastWorkoutOn)}` : "4 weeks"}</span>
          </>
        )}
      </span>
    </Link>
  );
}
