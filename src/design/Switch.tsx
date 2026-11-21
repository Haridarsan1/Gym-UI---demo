import { cn } from "@/lib/format";

/**
 * An on/off setting. The whole row is the 44 px target. `label` names it for screen readers and sits beside it; `description`
 * says what it does in plain words.
 */
export function Switch({ checked, onChange, label, description, disabled, id }: { checked: boolean; onChange: (next: boolean) => void; label: string; description?: string; disabled?: boolean; id?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id={id ? `${id}-label` : undefined} className="font-semibold">{label}</p>
        {description && <p id={id ? `${id}-desc` : undefined} className="text-[0.95rem] text-clay-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={id ? `${id}-label` : undefined}
        aria-describedby={id && description ? `${id}-desc` : undefined}
        aria-label={id ? undefined : label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="grid min-h-[2.75rem] min-w-[3.5rem] shrink-0 place-items-center disabled:opacity-50"
      >
        <span className={cn("relative h-8 w-14 rounded-full transition-colors motion-reduce:transition-none", checked ? "bg-ember-650" : "bg-clay-subtle")} aria-hidden="true">
          <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none", checked ? "left-[1.75rem]" : "left-1")} />
        </span>
      </button>
    </div>
  );
}
