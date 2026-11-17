import { Flame, Snowflake } from "lucide-react";
import { cn } from "@/lib/format";

/**
 * The streak counts weeks in a row at 75% of the plan, not days, so there is no daily guilt. With no streak yet it says how
 * to start one, with no zero and no grey flame. A frozen membership pauses it: “5-week streak, paused”, with a snowflake.
 */
export function StreakFlame({ weeks, paused = false, className }: { weeks: number; paused?: boolean; className?: string }) {
  if (weeks === 0) {
    return <p className={cn("text-[0.95rem] font-semibold", className)}>{paused ? "Your streak starts after your freeze ends" : "Finish your first week to start a streak"}</p>;
  }
  const text = `${weeks}-week streak${paused ? ", paused" : ""}`;
  const Icon = paused ? Snowflake : Flame;
  return (
    <div className={cn("inline-flex items-center gap-3", className)} role="img" aria-label={text}>
      <span aria-hidden="true" className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", paused ? "bg-status-frozen-bg text-status-frozen-fg" : "bg-ember-100 text-ember-700")}>
        <Icon className="h-6 w-6" fill={paused ? "none" : "currentColor"} />
      </span>
      <span aria-hidden="true" className="text-lg font-bold leading-tight">
        <span className="font-display text-3xl font-extrabold tabular">{weeks}</span>-week streak{paused ? ", paused" : ""}
      </span>
    </div>
  );
}
