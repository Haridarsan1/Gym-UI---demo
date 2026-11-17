import { Flame, Snowflake } from "lucide-react";
import { cn } from "@/lib/format";

/**
 * The streak counts weeks in a row at 75% of the plan, not days, so there is no daily guilt. A frozen membership pauses
 * it, which is shown with a snowflake instead of a flame.
 */
export function StreakFlame({ weeks, paused = false, className }: { weeks: number; paused?: boolean; className?: string }) {
  const Icon = paused ? Snowflake : Flame;
  const text = paused ? `Streak paused at ${weeks} ${weeks === 1 ? "week" : "weeks"}` : weeks === 0 ? "No streak yet" : `${weeks}-week streak`;
  return (
    <div className={cn("inline-flex items-center gap-2", className)} role="img" aria-label={text}>
      <span aria-hidden="true" className={cn("grid h-11 w-11 place-items-center rounded-full", paused ? "bg-status-frozen-bg text-status-frozen-fg" : weeks === 0 ? "bg-clay-canvas text-clay-subtle" : "bg-ember-100 text-ember-700")}>
        <Icon className="h-6 w-6" fill={!paused && weeks > 0 ? "currentColor" : "none"} />
      </span>
      <span aria-hidden="true" className="leading-tight">
        <span className="block font-display text-3xl font-extrabold tabular">{weeks}</span>
        <span className="block text-xs font-semibold text-clay-muted">{paused ? "paused" : weeks === 1 ? "week" : "weeks"}</span>
      </span>
    </div>
  );
}
