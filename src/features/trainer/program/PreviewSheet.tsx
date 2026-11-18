import { useState } from "react";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { dayName, SECTIONS, toPlanDays, type EditorDoc } from "@/domain/program";
import { estimateMinutes } from "@/domain/metrics";
import { describeTarget, inOrder } from "@/domain/workout";
import { cn } from "@/lib/format";

/** The program as the client will see it in the app: a day at a time, in the order they will do it, with the targets they will log against. */
export function PreviewSheet({ doc, startsOn, firstName, names, initial, onClose }: { doc: EditorDoc; startsOn: string; firstName: string; names: Map<string, { name: string }>; initial: { week: number; dayKey?: string }; onClose: () => void }) {
  const days = toPlanDays(doc);
  const [week, setWeek] = useState(Math.min(initial.week, Math.max(0, doc.weeks.length - 1)));
  const sorted = (doc.weeks[week]?.days ?? []).slice().sort((a, b) => a.weekday - b.weekday);
  const [dayKey, setDayKey] = useState(initial.week === week && sorted.some((d) => d.key === initial.dayKey) ? initial.dayKey! : sorted[0]?.key);
  const editorDay = sorted.find((d) => d.key === dayKey) ?? sorted[0];
  const planDay = editorDay && days.find((d) => d.weekIndex === week && d.dayOffset === week * 7 + editorDay.weekday);
  const items = planDay ? inOrder(planDay) : [];
  return (
    <Sheet open onClose={onClose} label="Preview as member" className="p-5">
      <h2 className="text-xl font-bold">Preview as {firstName}</h2>
      <p className="text-sm text-clay-muted">This is what {firstName} sees on the day. Nothing here is published.</p>
      <div role="radiogroup" aria-label="Week" className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {doc.weeks.map((w, i) => (
          <button key={w.key} type="button" role="radio" aria-checked={i === week} onClick={() => { setWeek(i); setDayKey(w.days.slice().sort((a, b) => a.weekday - b.weekday)[0]?.key); }} className={cn("min-h-[2.75rem] shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold", i === week ? "bg-clay-ink text-white" : "bg-clay-lavender")}>Week {i + 1}</button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-clay-canvas p-4 text-[0.95rem]">A rest week. {firstName} sees nothing scheduled.</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Day" className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
            {sorted.map((d) => (
              <button key={d.key} type="button" role="radio" aria-checked={d.key === editorDay?.key} onClick={() => setDayKey(d.key)} className={cn("min-h-[2.75rem] shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold", d.key === editorDay?.key ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{dayName(startsOn, d.weekday)}</button>
            ))}
          </div>
          <article aria-label="Workout preview" className="mt-3 rounded-3xl bg-clay-canvas p-4">
            <p className="text-sm text-clay-muted">Week {week + 1}, {editorDay ? dayName(startsOn, editorDay.weekday, true) : ""}</p>
            <h3 className="text-2xl font-bold tracking-tight">{editorDay?.title || "Workout"}</h3>
            <p className="text-sm text-clay-muted">{items.length} {items.length === 1 ? "exercise" : "exercises"}{planDay ? `, about ${estimateMinutes(planDay)} min` : ""}</p>
            {items.length === 0 && <p className="mt-3 text-[0.95rem] text-clay-muted">No exercises yet.</p>}
            {SECTIONS.map((s) => {
              const inSection = items.filter((p) => p.section === s.value);
              if (inSection.length === 0) return null;
              return (
                <section key={s.value} aria-label={s.label} className="mt-4">
                  <h4 className="text-sm font-semibold text-clay-muted">{s.label}</h4>
                  <ul className="mt-1 space-y-2">
                    {inSection.map((p) => (
                      <li key={`${p.order}`} className="rounded-2xl bg-white px-3 py-2.5 shadow-sm">
                        <p className="font-semibold">{names.get(p.exerciseId)?.name ?? "Exercise"}</p>
                        <p className="text-sm text-clay-muted">Target: {describeTarget(p)}</p>
                        {p.cues && <p className="mt-0.5 text-sm">{p.cues}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </article>
        </>
      )}
      <Button3D variant="white" className="mt-4 w-full" onClick={onClose}>Back to the builder</Button3D>
    </Sheet>
  );
}
