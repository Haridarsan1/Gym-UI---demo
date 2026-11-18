import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button3D } from "@/design/Button3D";
import { dayName, SECTIONS, type EditorDay, type EditorRx, type ProgramIssue } from "@/domain/program";
import { cn } from "@/lib/format";
import type { Action } from "@/features/trainer/program/editor";
import { Field, NumberInput, inputClass } from "@/features/trainer/assessment/fields";

type Names = Map<string, { name: string; archived: boolean }>;

/** One workout day: its name and weekday, and its exercises in order. Drag a row by its handle, or use the move buttons. */
export function DayEditor({ day, week, startsOn, names, issues, dispatch, onAdd }: { day: EditorDay; week: number; startsOn: string; names: Names; issues: ProgramIssue[]; dispatch: (a: Action) => void; onAdd: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = day.items.findIndex((i) => i.key === e.active.id);
    const to = day.items.findIndex((i) => i.key === e.over!.id);
    if (from >= 0 && to >= 0) dispatch({ type: "moveRx", week, dayKey: day.key, from, to });
  };
  const mine = issues.filter((i) => i.dayKey === day.key && !i.rxKey);
  return (
    <section aria-label={`Week ${week + 1}, ${dayName(startsOn, day.weekday)}`} className="clay p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <Field label="Workout name" htmlFor={`dn-${day.key}`}>
          <input id={`dn-${day.key}`} value={day.title} onChange={(e) => dispatch({ type: "day", week, dayKey: day.key, patch: { title: e.target.value } })} placeholder="For example, Push" className={inputClass} />
        </Field>
        <Field label="Day" htmlFor={`dw-${day.key}`}>
          <select id={`dw-${day.key}`} value={day.weekday} onChange={(e) => dispatch({ type: "day", week, dayKey: day.key, patch: { weekday: Number(e.target.value) } })} className={inputClass}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{dayName(startsOn, n, true)}</option>)}
          </select>
        </Field>
      </div>
      {mine.map((i) => <p key={i.message} role="alert" className="mt-2 text-sm font-semibold text-status-danger-fg">{i.message}</p>)}

      {day.items.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-clay-canvas px-4 py-6 text-center text-[0.95rem] text-clay-muted">No exercises yet. Add a warm-up, the main work and a cool-down.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={day.items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
            <ol aria-label="Exercises in this workout" className="mt-4 space-y-2">
              {day.items.map((it, index) => (
                <Row key={it.key} item={it} index={index} count={day.items.length} week={week} dayKey={day.key} names={names} issues={issues.filter((i) => i.rxKey === it.key)} dispatch={dispatch} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button3D size="md" onClick={onAdd}><Plus className="h-5 w-5" aria-hidden="true" />Add exercise</Button3D>
        <Button3D size="md" variant="white" onClick={() => dispatch({ type: "copyDay", week, dayKey: day.key })}><Copy className="h-5 w-5" aria-hidden="true" />Copy day</Button3D>
        <Button3D size="md" variant="white" onClick={() => dispatch({ type: "removeDay", week, dayKey: day.key })}><Trash2 className="h-5 w-5" aria-hidden="true" />Remove day</Button3D>
      </div>
    </section>
  );
}

function Row({ item: it, index, count, week, dayKey, names, issues, dispatch }: { item: EditorRx; index: number; count: number; week: number; dayKey: string; names: Names; issues: ProgramIssue[]; dispatch: (a: Action) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: it.key });
  const ex = names.get(it.exerciseId);
  const name = ex?.name ?? "Unknown exercise";
  const set = (patch: Partial<EditorRx>) => dispatch({ type: "rx", week, dayKey, rxKey: it.key, patch });
  const timed = !it.reps.trim() && !!it.durationSec;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined, transition, zIndex: isDragging ? 20 : undefined, position: "relative" }}
      className={cn("rounded-2xl bg-clay-canvas p-3", isDragging && "shadow-xl ring-2 ring-ember-300", issues.length > 0 && "ring-2 ring-status-danger-fg/40")}
      data-dragging={isDragging ? "true" : undefined}
    >
      <div className="flex items-center gap-1">
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Drag to reorder ${name}`} className="grid h-11 w-11 shrink-0 cursor-grab touch-none place-items-center rounded-xl text-clay-muted hover:bg-white active:cursor-grabbing">
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold leading-tight">{name}{ex?.archived ? " (archived)" : ""}</p>
        </div>
        <button type="button" className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-clay-muted hover:bg-white disabled:opacity-40" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => dispatch({ type: "moveRx", week, dayKey, from: index, to: index - 1 })}><ArrowUp className="h-5 w-5" aria-hidden="true" /></button>
        <button type="button" className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-clay-muted hover:bg-white disabled:opacity-40" aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => dispatch({ type: "moveRx", week, dayKey, from: index, to: index + 1 })}><ArrowDown className="h-5 w-5" aria-hidden="true" /></button>
        <button type="button" className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-clay-muted hover:bg-white hover:text-status-danger-fg" aria-label={`Remove ${name}`} onClick={() => dispatch({ type: "removeRx", week, dayKey, rxKey: it.key })}><Trash2 className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Section" htmlFor={`s-${it.key}`}>
          <select id={`s-${it.key}`} value={it.section} onChange={(e) => set({ section: e.target.value as EditorRx["section"] })} className={inputClass}>
            {SECTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Sets" htmlFor={`n-${it.key}`}><NumberInput id={`n-${it.key}`} value={it.sets} step={1} min={1} max={20} onChange={(v) => set({ sets: v ?? 0 })} /></Field>
        <Field label={timed ? "Reps (timed)" : "Reps"} htmlFor={`p-${it.key}`}>
          <input id={`p-${it.key}`} value={it.reps} inputMode="numeric" placeholder="10 or 8-12" onChange={(e) => set({ reps: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Load (kg)" htmlFor={`l-${it.key}`}><NumberInput id={`l-${it.key}`} value={it.loadKg} min={0} max={500} step={0.5} onChange={(v) => set({ loadKg: v })} /></Field>
        <Field label="Rest (s)" htmlFor={`r-${it.key}`}><NumberInput id={`r-${it.key}`} value={it.restSec} min={0} max={900} step={5} onChange={(v) => set({ restSec: v })} /></Field>
        <Field label="Time (s)" htmlFor={`t-${it.key}`}><NumberInput id={`t-${it.key}`} value={it.durationSec} min={0} step={5} onChange={(v) => set({ durationSec: v })} /></Field>
      </div>
      <label className="mt-2 block text-sm font-semibold">
        Coaching cue
        <input value={it.cues ?? ""} onChange={(e) => set({ cues: e.target.value })} placeholder="Optional. The member sees it with the exercise." className={cn(inputClass, "mt-1 font-normal")} />
      </label>
      {issues.map((i) => <p key={i.message} role="alert" className="mt-2 text-sm font-semibold text-status-danger-fg">{i.message}</p>)}
    </li>
  );
}
