import { brand } from "@/config/brand";
import { cn } from "@/lib/format";

/** Ember mark: a clay ember tile with three lane arcs. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8 shrink-0 drop-shadow-[0_4px_8px_rgba(252,82,0,0.35)]", className)} aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFA778" />
          <stop offset="1" stopColor="#FC5200" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-g)" />
      <path d="M8 23a12 12 0 0 1 16-11.3M11 23a9 9 0 0 1 12-8.5M14 23a6 6 0 0 1 8-5.7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[1.35rem] font-bold tracking-tight">{brand.name}</span>
    </span>
  );
}
