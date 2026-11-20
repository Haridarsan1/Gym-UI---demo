import { inputClass } from "@/design/Field";
import { Switch } from "@/design/Switch";
import { describeValue, type PolicyDef, type PolicyValues } from "@/domain/policies";
import { cn } from "@/lib/format";

/** One setting: its name and what it does, the control, and under it an example worked from the numbers as they stand on the screen. */
export function PolicyRow({ def, text, value, stored, example, error, readOnly, onText, onToggle }: {
  def: PolicyDef;
  /** What is typed in the box, for a number or an amount. */
  text: string;
  value: number | boolean;
  stored: PolicyValues[keyof PolicyValues];
  example: string;
  error?: string;
  readOnly: boolean;
  onText: (v: string) => void;
  onToggle: (v: boolean) => void;
}) {
  const id = `pol-${def.key}`;
  const changed = value !== stored;
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      {def.input.kind === "toggle" ? (
        <Switch id={id} checked={value as boolean} onChange={onToggle} label={def.label} description={def.explain} disabled={readOnly} />
      ) : (
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="min-w-0"><label htmlFor={id} className="block font-semibold">{def.label}</label><p id={`${id}-about`} className="text-[0.95rem] text-clay-muted">{def.explain}</p></div>
          <div>
            <div className="relative">
              <input id={id} value={text} onChange={(e) => onText(e.target.value)} disabled={readOnly} inputMode={def.input.kind === "rupees" ? "decimal" : "numeric"} aria-invalid={error ? true : undefined} aria-describedby={`${id}-about ${id}-example${error ? ` ${id}-error` : ""}`}
                className={cn(inputClass, "tabular", def.input.kind === "rupees" ? "pl-7" : "pr-[4.75rem]", readOnly && "opacity-70")} />
              {def.input.kind === "rupees" ? <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clay-muted">₹</span> : <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-clay-muted">{def.input.unit[1]}</span>}
            </div>
            {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{error}</p>}
          </div>
        </div>
      )}
      {changed && <p className="mt-2 text-sm font-semibold text-ember-800">Changed from {describeValue(def, stored as number | boolean)}. Not saved yet.</p>}
      <p id={`${id}-example`} className="mt-2 rounded-xl bg-clay-canvas px-3 py-2 text-[0.95rem]"><span className="font-semibold">For example: </span>{example}</p>
    </li>
  );
}
