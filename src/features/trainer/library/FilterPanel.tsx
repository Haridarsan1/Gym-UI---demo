import type { Exercise } from "@/domain/types";
import type { LibraryData, LibraryParams } from "@/api/library";
import { Switch } from "@/design/Switch";
import { cn } from "@/lib/format";
import { CATEGORY_LABEL, cap } from "@/features/trainer/library/labels";

export interface Filters {
  category?: Exercise["category"];
  muscle?: string;
  equipment?: string;
  archived: boolean;
}
export const hasFilters = (p: LibraryParams) => !!(p.category || p.muscle || p.equipment || p.archived);

const selectClass = "clay-flat min-h-[2.75rem] w-full px-3 outline-none";

/** The filters: category, muscle group, equipment, and whether to show archived exercises. Counts don’t move as filters change. */
export function FilterPanel({ data, value, onChange }: { data: LibraryData; value: LibraryParams; onChange: (next: Partial<Filters>) => void }) {
  return (
    <div className="space-y-4" role="group" aria-label="Filters">
      <fieldset>
        <legend className="text-sm font-semibold">Category</legend>
        <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
          <Chip on={!value.category} onClick={() => onChange({ category: undefined })}>All</Chip>
          {data.facets.categories.map((c) => (
            <Chip key={c.value} on={value.category === c.value} onClick={() => onChange({ category: c.value as Exercise["category"] })}>
              {CATEGORY_LABEL[c.value as Exercise["category"]]} <span className="opacity-70">{c.count}</span>
            </Chip>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold">
        Muscle group
        <select value={value.muscle ?? ""} onChange={(e) => onChange({ muscle: e.target.value || undefined })} className={cn(selectClass, "mt-1 font-normal")}>
          <option value="">Any muscle</option>
          {data.facets.muscles.map((m) => <option key={m.value} value={m.value}>{cap(m.value)} ({m.count})</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Equipment
        <select value={value.equipment ?? ""} onChange={(e) => onChange({ equipment: e.target.value || undefined })} className={cn(selectClass, "mt-1 font-normal")}>
          <option value="">Any equipment</option>
          {data.facets.equipment.map((m) => <option key={m.value} value={m.value}>{cap(m.value)} ({m.count})</option>)}
        </select>
      </label>
      <Switch checked={!!value.archived} onChange={(archived) => onChange({ archived })} label="Show archived exercises" />
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className={cn("min-h-[2.75rem] cursor-pointer rounded-full px-4 text-sm font-semibold", on ? "bg-clay-ink text-white" : "bg-clay-lavender")}>
      {children}
    </button>
  );
}
