import type { ReactNode } from "react";

/** A labelled form field with an optional hint and an error that is announced. Used by every area’s forms. */
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">{label}</label>
      {hint && <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-sm text-clay-muted">{hint}</p>}
      <div className="mt-1">{children}</div>
      {error && <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{error}</p>}
    </div>
  );
}

export const inputClass = "clay-flat min-h-[2.75rem] w-full px-3 outline-none focus-visible:ring-2 focus-visible:ring-ember-300";
