import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useExercises } from "@/api/trainerHooks";
import { SECTIONS, type Section } from "@/domain/program";
import { cn } from "@/lib/format";
import { CATEGORY_LABEL, cap } from "@/features/trainer/library/labels";
import { inputClass } from "@/features/trainer/assessment/fields";

/** Search the library and add an exercise to the open day. Archived exercises are not offered. */
export function ExercisePicker({ onPick, heading = true }: { onPick: (exerciseId: string, section: Section) => void; heading?: boolean }) {
  const [q, setQ] = useState("");
  const [section, setSection] = useState<Section>("main");
  const query = useExercises({ search: q });
  const rows = query.data?.rows ?? [];
  return (
    <section aria-label="Add an exercise" className="space-y-3">
      {heading && <h2 className="text-lg font-bold">Add an exercise</h2>}
      <div className="flex gap-2" role="radiogroup" aria-label="Add to section">
        {SECTIONS.map((s) => (
          <button key={s.value} type="button" role="radio" aria-checked={section === s.value} onClick={() => setSection(s.value)} className={cn("min-h-[2.75rem] flex-1 cursor-pointer rounded-full px-3 text-sm font-semibold", section === s.value ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{s.label}</button>
        ))}
      </div>
      <label className="clay-flat flex min-h-[2.75rem] items-center gap-2 px-4">
        <Search className="h-5 w-5 shrink-0 text-clay-muted" aria-hidden="true" />
        <span className="sr-only">Search the library</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" className={cn(inputClass, "!min-h-[2.75rem] border-0 bg-transparent p-0 shadow-none")} />
      </label>
      <ul aria-label="Library" className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
        {rows.slice(0, 60).map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e.id, section)} className="flex min-h-[3rem] w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 text-left hover:bg-clay-canvas">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold"><span className="sr-only">Add </span>{e.name}</span>
                <span className="block truncate text-sm text-clay-muted">{CATEGORY_LABEL[e.category]}, {e.muscleGroups.map(cap).join(", ")}</span>
              </span>
              <Plus className="h-5 w-5 shrink-0 text-clay-muted" aria-hidden="true" />
            </button>
          </li>
        ))}
        {rows.length === 0 && !query.isPending && <li className="px-3 py-4 text-sm text-clay-muted">No exercises match.</li>}
      </ul>
    </section>
  );
}
