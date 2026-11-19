import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useExercises } from "@/api/trainerHooks";
import type { LibraryData, LibraryParams } from "@/api/library";
import { QueryBoundary } from "@/design/QueryBoundary";
import { EmptyState } from "@/design/States";
import { SkeletonRows } from "@/design/Skeleton";
import { cn } from "@/lib/format";
import { CATEGORY_LABEL, cap } from "@/features/trainer/library/labels";

/** Search box and the list. Filters sit beside it from 1280 px, above it below that (see FilterPanel). */
export function ExerciseList({ params, selectedId, onSearch, linkSuffix, filters, children }: { params: LibraryParams; selectedId?: string; onSearch: (q: string) => void; linkSuffix: string; filters?: (data: LibraryData) => React.ReactNode; children?: React.ReactNode }) {
  const query = useExercises(params);
  return (
    <section aria-label="Exercises" className="space-y-3">
      <label className="clay-flat flex min-h-[2.75rem] items-center gap-2 px-4">
        <Search className="h-5 w-5 shrink-0 text-clay-muted" aria-hidden="true" />
        <span className="sr-only">Search exercises</span>
        <input type="search" value={params.search ?? ""} onChange={(e) => onSearch(e.target.value)} placeholder="Search by name, muscle or equipment" className="min-h-[2.75rem] w-full bg-transparent outline-none placeholder:text-clay-subtle" />
      </label>
      {children}
      <QueryBoundary query={query} errorTitle="We couldn’t load the library" skeleton={<SkeletonRows rows={8} label="Loading exercises" />}>
        {(data) => (
          <>
            {filters?.(data)}
            {data.rows.length === 0 ? (
              <EmptyState title="No exercises match">Try a different word, or clear the filters.</EmptyState>
            ) : (
              <>
                <p aria-live="polite" className="px-1 text-sm text-clay-muted">{data.rows.length === 1 ? "1 exercise" : `${data.rows.length} exercises`}</p>
                <ul aria-label="Exercise list" className="space-y-1">
                  {data.rows.map((e) => (
                    <li key={e.id}>
                      <Link to={`/t/library?ex=${e.id}${linkSuffix}`} aria-current={e.id === selectedId ? "page" : undefined} className={cn("block min-h-[3.25rem] rounded-2xl px-3 py-2 transition-colors", e.id === selectedId ? "bg-ember-50 ring-2 ring-ember-200" : "hover:bg-clay-canvas")}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">{e.name}</span>
                          <span className="flex shrink-0 gap-1">
                            {e.own && <span className="rounded-full bg-lilac-100 px-2 py-0.5 text-xs font-semibold text-lilac-700">Ours</span>}
                            {e.archived && <span className="rounded-full bg-status-expired-bg px-2 py-0.5 text-xs font-semibold text-status-expired-fg">Archived</span>}
                          </span>
                        </span>
                        <span className="block truncate text-sm text-clay-muted">{CATEGORY_LABEL[e.category]}, {e.muscleGroups.map(cap).join(", ")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
