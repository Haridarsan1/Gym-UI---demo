import type { ReactNode } from "react";
import { cn } from "@/lib/format";

/** Plain section heading: says what the section is, no slogans, no entrance animation. */
export function SectionHeader({ id, title, intro, className, center }: { id: string; title: string; intro?: ReactNode; className?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center", className)}>
      <h2 id={id} className="text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.025em]">
        {title}
      </h2>
      {intro && <p className="mt-4 text-lg leading-relaxed text-clay-muted">{intro}</p>}
    </div>
  );
}
