import { useId } from "react";
import { Minus, Plus } from "lucide-react";

const clean = (raw: string, decimal: boolean) => {
  const s = raw.replace(decimal ? /[^\d.]/g : /\D/g, "");
  return decimal ? s.replace(/^(\d*\.?\d*).*$/, "$1") : s;
};

/** A number with − and + buttons that are easy to hit with a thumb. The text can also be typed. */
export function NumberField({ label, unit, value, onChange, step = 1, decimal = false }: { label: string; unit?: string; value: string; onChange: (v: string) => void; step?: number; decimal?: boolean }) {
  const id = useId();
  const bump = (by: number) => {
    const n = Number(value || 0);
    onChange(String(Math.max(0, Math.round((n + by) * 100) / 100)));
  };
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-clay-muted">
        {label}
        {unit && <span> ({unit})</span>}
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <button type="button" onClick={() => bump(-step)} aria-label={`Less ${label.toLowerCase()}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-clay-lavender text-clay-ink active:scale-95">
          <Minus className="h-5 w-5" aria-hidden="true" />
        </button>
        <input
          id={id}
          value={value}
          inputMode={decimal ? "decimal" : "numeric"}
          autoComplete="off"
          onChange={(e) => onChange(clean(e.target.value, decimal))}
          onFocus={(e) => e.currentTarget.select()}
          className="font-display h-11 w-full min-w-0 rounded-xl border border-clay-line bg-white text-center text-2xl font-extrabold tabular-nums focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300"
        />
        <button type="button" onClick={() => bump(step)} aria-label={`More ${label.toLowerCase()}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-clay-lavender text-clay-ink active:scale-95">
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
