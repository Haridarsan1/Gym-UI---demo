import { useState } from "react";
import { X } from "lucide-react";
import { useExercises, useExerciseActions } from "@/api/hooks";
import type { ExerciseDetail } from "@/api/library";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { Field, inputClass } from "@/features/trainer/assessment/fields";
import { CATEGORIES, CATEGORY_LABEL } from "@/features/trainer/library/labels";

/** Add an exercise to the gym’s library, edit one of the gym’s own, or start from a copy of one that comes with Ember. */
export function ExerciseForm({ initial, copy, onClose, onSaved }: { initial?: ExerciseDetail; copy?: boolean; onClose: () => void; onSaved?: (id: string) => void }) {
  const { save } = useExerciseActions();
  const all = useExercises({ archived: false });
  const toast = useToast();
  const editing = !!initial && !copy;
  const [name, setName] = useState(initial ? (copy ? `${initial.name} (our version)` : initial.name) : "");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(initial?.category ?? "strength");
  const [muscles, setMuscles] = useState<string[]>(initial?.muscleGroups ?? []);
  const [equipment, setEquipment] = useState<string[]>(initial?.equipment ?? []);
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [subs, setSubs] = useState<string[]>(initial?.substitutions.map((s) => s.id) ?? []);
  const [error, setError] = useState<string>();
  const library = all.data?.rows ?? [];
  const nameOf = (id: string) => library.find((x) => x.id === id)?.name ?? initial?.substitutions.find((s) => s.id === id)?.name ?? id;
  const submit = () => {
    setError(undefined);
    save.mutate({ id: editing ? initial!.id : undefined, name, category, muscleGroups: muscles, equipment, instructions, substitutionIds: subs }, {
      onSuccess: (id) => { toast({ title: editing ? "Exercise saved" : "Exercise added", tone: "success" }); onSaved?.(id); onClose(); },
      onError: (e) => setError(isApiError(e) ? e.message : "We couldn’t save that. Try again."),
    });
  };
  return (
    <Sheet open onClose={onClose} label={editing ? "Edit exercise" : "Add an exercise"} className="p-5">
      <h2 className="text-xl font-bold">{editing ? "Edit exercise" : copy ? "Make a copy for your gym" : "Add an exercise"}</h2>
      <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Name" htmlFor="ex-name"><input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <Field label="Category" htmlFor="ex-cat">
          <select id="ex-cat" value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={inputClass}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <TagField label="Muscle groups" hint="Type one and press Add." values={muscles} onChange={setMuscles} id="ex-muscle" />
        <TagField label="Equipment" hint="Leave empty for bodyweight." values={equipment} onChange={setEquipment} id="ex-equip" />
        <Field label="How to do it" htmlFor="ex-how"><textarea id="ex-how" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={inputClass + " py-2"} /></Field>
        <Field label="Can be swapped for" htmlFor="ex-sub" hint="Up to six. A member can swap to one during a workout.">
          <select id="ex-sub" value="" onChange={(e) => e.target.value && setSubs((s) => (s.includes(e.target.value) ? s : [...s, e.target.value]))} className={inputClass}>
            <option value="">Add a substitute…</option>
            {library.filter((x) => x.id !== initial?.id && !subs.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {subs.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Substitutes">
              {subs.map((s) => (
                <li key={s} className="inline-flex items-center gap-1 rounded-full bg-clay-lavender py-1 pl-3 pr-1 text-sm font-semibold">
                  {nameOf(s)}
                  <button type="button" aria-label={`Remove ${nameOf(s)}`} onClick={() => setSubs((x) => x.filter((y) => y !== s))} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full hover:bg-white"><X className="h-4 w-4" aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
        </Field>
        {error && <p role="alert" className="rounded-2xl bg-status-danger-bg p-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
        <div className="flex gap-3">
          <Button3D type="submit" size="lg" className="flex-1" disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Save exercise" : "Add exercise"}</Button3D>
          <Button3D variant="white" size="lg" onClick={onClose}>Cancel</Button3D>
        </div>
      </form>
    </Sheet>
  );
}

function TagField({ label, hint, values, onChange, id }: { label: string; hint: string; values: string[]; onChange: (v: string[]) => void; id: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex gap-2">
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className={inputClass} />
        <Button3D variant="white" onClick={add} aria-label={`Add to ${label.toLowerCase()}`}>Add</Button3D>
      </div>
      {values.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={label}>
          {values.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-full bg-clay-lavender py-1 pl-3 pr-1 text-sm font-semibold">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full hover:bg-white"><X className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
