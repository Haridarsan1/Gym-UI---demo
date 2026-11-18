import type { ReactNode } from "react";
import { cn } from "@/lib/format";

/** A labelled form field with an optional hint and an error that is announced. */
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">{label}</label>
      {hint && <p className="text-sm text-clay-muted">{hint}</p>}
      <div className="mt-1">{children}</div>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{error}</p>}
    </div>
  );
}

export const inputClass = "clay-flat min-h-[2.75rem] w-full px-3 outline-none focus-visible:ring-2 focus-visible:ring-ember-300";

/** A number box that keeps what was typed and reports a number, or undefined when empty. */
export function NumberInput({ id, value, onChange, step, min, max, placeholder, suffix }: { id: string; value: number | undefined; onChange: (v: number | undefined) => void; step?: number; min?: number; max?: number; placeholder?: string; suffix?: string }) {
  return (
    <div className="relative">
      <input
        id={id} type="number" inputMode="decimal" step={step ?? "any"} min={min} max={max} placeholder={placeholder} value={value ?? ""} className={cn(inputClass, suffix && "pr-12")}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-clay-muted">{suffix}</span>}
    </div>
  );
}

/** Toggle buttons for a choice of several (days of the week) or one (time of day). */
export function ToggleChips<T extends string | number>({ label, options, value, onChange, multiple }: { label: string; options: Array<{ value: T; label: string }>; value: T[]; onChange: (v: T[]) => void; multiple?: boolean }) {
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={String(o.value)} type="button" role={multiple ? undefined : "radio"} aria-checked={multiple ? undefined : on} aria-pressed={multiple ? on : undefined}
            onClick={() => onChange(multiple ? (on ? value.filter((x) => x !== o.value) : [...value, o.value]) : [o.value])}
            className={cn("min-h-[2.75rem] min-w-[2.75rem] cursor-pointer rounded-full px-4 text-sm font-semibold", on ? "bg-clay-ink text-white" : "bg-clay-lavender")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
