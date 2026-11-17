import type { ReactNode } from "react";
import { cn } from "@/lib/format";

/**
 * A progress ring. `value` is 0 to 1. It draws without animation when motion is reduced (the global rule shortens the
 * transition), and always says its value in words for screen readers.
 */
export function Ring({ value, size = 96, stroke = 10, label, className, children }: { value: number; size?: number; stroke?: number; label: string; className?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div role="img" aria-label={label} className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EFE9F3" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#D14000" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center text-center">
        {children}
      </div>
    </div>
  );
}
