import { useId, type ReactElement, cloneElement } from "react";

/**
 * A label for a button that shows only an icon. It appears on hover and on keyboard focus (never needed on touch,
 * where the button also carries an aria-label). The label is also the accessible description.
 */
export function Tooltip({ label, children, side = "bottom" }: { label: string; children: ReactElement<{ "aria-describedby"?: string }>; side?: "bottom" | "right" | "top" }) {
  const id = useId();
  const pos = side === "right" ? "left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2" : side === "top" ? "bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2" : "top-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2";
  return (
    <span className="group/tip relative inline-flex">
      {cloneElement(children, { "aria-describedby": id })}
      <span id={id} role="tooltip" className={`pointer-events-none absolute z-[60] hidden whitespace-nowrap rounded-lg bg-clay-ink px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg group-hover/tip:block group-focus-within/tip:block motion-safe:animate-none ${pos}`}>
        {label}
      </span>
    </span>
  );
}
