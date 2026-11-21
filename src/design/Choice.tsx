import { Check } from "lucide-react";
import { cn } from "@/lib/format";

/**
 * A radio or a checkbox as a whole 44 px row: the real input covers the row, so the whole row is the touch target and the keyboard and screen readers get a native control. The visible box
 * and its tick are drawn beside the label.
 */
export function Choice({ type, name, checked, onChange, label, note, disabled }: { type: "radio" | "checkbox"; name?: string; checked: boolean; onChange: (checked: boolean) => void; label: string; note?: string; disabled?: boolean }) {
  return (
    <label className={cn("clay-flat relative flex min-h-[2.75rem] items-center gap-3 px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ember-300", checked && "ring-2 ring-ember-400", disabled ? "opacity-60" : "cursor-pointer")}>
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="absolute inset-0 h-full w-full cursor-[inherit] opacity-0" />
      <span aria-hidden="true" className={cn("grid h-5 w-5 shrink-0 place-items-center border-2 transition-colors motion-reduce:transition-none", type === "radio" ? "rounded-full" : "rounded-md", checked ? "border-ember-600 bg-ember-650 text-white" : "border-clay-subtle bg-white")}>
        {checked && (type === "radio" ? <span className="h-2 w-2 rounded-full bg-white" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />)}
      </span>
      <span><span className="font-semibold">{label}</span>{note && <span className="block text-sm text-clay-muted">{note}</span>}</span>
    </label>
  );
}
