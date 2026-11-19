import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Plus, SlidersHorizontal } from "lucide-react";
import { useExercises } from "@/api/trainerHooks";
import type { LibraryParams } from "@/api/library";
import { Button3D } from "@/design/Button3D";
import { LibraryTabs } from "@/features/trainer/LibraryTabs";
import { ThreeZone } from "@/design/layout/ThreeZone";
import { useSplit, useWide } from "@/design/useMediaQuery";
import { CATEGORIES } from "@/features/trainer/library/labels";
import { useState } from "react";
import { ExerciseDetailView } from "@/features/trainer/library/ExerciseDetailView";
import { ExerciseForm } from "@/features/trainer/library/ExerciseForm";
import { ExerciseList } from "@/features/trainer/library/ExerciseList";
import { FilterPanel, hasFilters, type Filters } from "@/features/trainer/library/FilterPanel";

/**
 * The exercise library (W01). Search, category, muscle, equipment and archived are in the address, and so is the open
 * exercise (`?ex=`), so a refresh or a shared link shows the same thing.
 * - Phone: the list (filters in a fold above it), and an exercise opens as its own screen with a Back link.
 * - From 768 px: the list and the exercise side by side.
 * - From 1280 px: filters in their own zone on the left, then the list, then the exercise.
 */
export default function Library() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const split = useSplit();
  const wide = useWide();
  const [adding, setAdding] = useState(false);
  const ex = sp.get("ex") ?? undefined;
  const cat = sp.get("cat");
  const params: LibraryParams = {
    search: sp.get("q") ?? "", category: CATEGORIES.includes(cat as never) ? (cat as LibraryParams["category"]) : undefined, muscle: sp.get("muscle") ?? undefined, equipment: sp.get("eq") ?? undefined, archived: sp.get("archived") === "1",
  };
  // What the list carries to an exercise and back: everything but the open exercise.
  const keep = new URLSearchParams(sp);
  keep.delete("ex");
  const suffix = keep.toString() ? `&${keep}` : "";
  const back = `/t/library${keep.toString() ? `?${keep}` : ""}`;
  const set = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(next)) (v ? q.set(k, v) : q.delete(k));
    setSp(q, { replace: true });
  };
  const onFilters = (f: Partial<Filters>) => set({ ...("category" in f ? { cat: f.category } : {}), ...("muscle" in f ? { muscle: f.muscle } : {}), ...("equipment" in f ? { eq: f.equipment } : {}), ...("archived" in f ? { archived: f.archived ? "1" : undefined } : {}) });
  const canWrite = useExercises({ archived: false }).data?.canWrite ?? false;

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight lg:text-4xl">Exercises</h1>
        <p className="text-clay-muted">Search the library, and add your gym’s own.</p>
      </div>
      {canWrite && (
        <Button3D size="md" onClick={() => setAdding(true)}>
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add exercise
        </Button3D>
      )}
    </div>
  );
  const list = (
    <ExerciseList
      params={params} selectedId={ex} linkSuffix={suffix} onSearch={(q) => set({ q: q || undefined })}
      filters={(data) =>
        wide ? null : (
          <details className="clay-flat px-4" open={hasFilters(params) ? true : undefined}>
            <summary className="flex min-h-[2.75rem] cursor-pointer items-center gap-2 font-semibold"><SlidersHorizontal className="h-5 w-5" aria-hidden="true" />Filters{hasFilters(params) ? " (on)" : ""}</summary>
            <div className="pb-4 pt-2"><FilterPanel data={data} value={params} onChange={onFilters} /></div>
          </details>
        )
      }
    />
  );
  const form = adding && <ExerciseForm onClose={() => setAdding(false)} onSaved={(id) => navigate(`/t/library?ex=${id}${suffix}`)} />;
  const detail = ex ? <ExerciseDetailView id={ex} canWrite={canWrite} linkSuffix={suffix} /> : <Placeholder />;

  if (!split) {
    if (!ex) return <div className="space-y-4"><LibraryTabs />{header}{list}{form}</div>;
    return (
      <div>
        <Link to={back} className="mb-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink"><ArrowLeft className="h-5 w-5" aria-hidden="true" />Exercises</Link>
        {detail}
        {form}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <LibraryTabs />
      {header}
      <ThreeZone
        listWidth={wide ? "minmax(13rem,15rem)" : "minmax(16rem,20rem)"}
        list={wide ? <FilterZone params={params} onChange={onFilters} /> : list}
        detail={wide ? list : detail}
        context={wide ? detail : undefined}
      />
      {form}
    </div>
  );
}

function FilterZone({ params, onChange }: { params: LibraryParams; onChange: (f: Partial<Filters>) => void }) {
  // The counts beside each filter come from the whole library, so they stay put as filters change.
  const { data } = useExercises({ archived: !!params.archived });
  return (
    <aside aria-label="Filters" className="clay p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><SlidersHorizontal className="h-5 w-5 text-clay-muted" aria-hidden="true" />Filters</h2>
      {data ? <FilterPanel data={data} value={params} onChange={onChange} /> : <p className="text-sm text-clay-muted">Loading…</p>}
    </aside>
  );
}

function Placeholder() {
  return (
    <div className="clay grid place-items-center px-6 py-14 text-center text-clay-muted">
      <div>
        <BookOpen className="mx-auto h-8 w-8" aria-hidden="true" />
        <p className="mt-2 max-w-[16rem]">Pick an exercise to see how it is done.</p>
      </div>
    </div>
  );
}
