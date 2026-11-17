import { useEffect, useState } from "react";
import { Award, Check, Trophy } from "lucide-react";
import type { WorkoutSummary } from "@/api";
import { Ring } from "@/design/Ring";
import { StreakFlame } from "@/design/StreakFlame";
import { haptic } from "@/design/haptics";
import { kgText } from "@/domain/celebration";
import { useTween } from "@/features/member/complete/useReveal";
import { cn } from "@/lib/format";

const eyebrow = "text-xs font-semibold uppercase tracking-wide text-clay-muted";

/** A part of the celebration. It pops in when it appears, unless everything is shown at once. */
function Part({ label, tone = "white", pop, buzz, children }: { label: string; tone?: "white" | "mint" | "lilac"; pop: boolean; buzz?: number[]; children: React.ReactNode }) {
  useEffect(() => {
    if (pop && buzz) haptic(buzz);
  }, [pop, buzz]);
  return (
    <section aria-label={label} className={cn("scroll-mb-32 p-5", tone === "mint" ? "clay-mint" : tone === "lilac" ? "clay-lilac" : "clay", pop && "pop-in")}>
      {children}
    </section>
  );
}

/**
 * The result. A finished workout is celebrated; a partly done one is celebrated just as warmly, by the sets that were done;
 * a skipped one gets a calm note. Nothing here is red or says failed.
 */
export function ResultPart({ s, pop }: { s: WorkoutSummary; pop: boolean }) {
  const { done, total } = s.progress;
  const words =
    s.status === "completed"
      ? { title: "Workout done", line: `${s.title} · ${done} of ${total} sets done.` }
      : s.status === "partial"
        ? { title: `${done} of ${total} sets done`, line: "Every session counts. Your trainer will see exactly what you did." }
        : { title: "Skipped today", line: "That is fine. Your next workout is waiting when you are." };
  return (
    <Part label="Result" tone={s.status === "completed" ? "mint" : "white"} pop={pop} buzz={s.status === "skipped" ? undefined : [30, 40, 30]}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-white/70" aria-hidden="true">
        <Check className="h-7 w-7" />
      </span>
      <h2 className="mt-3 text-[1.7rem] font-bold leading-tight tracking-tight">{words.title}</h2>
      <p className="mt-1">{words.line}</p>
    </Part>
  );
}

export function VolumePart({ kg, pop, running, ms }: { kg: number; pop: boolean; running: boolean; ms: number }) {
  const shown = useTween(kg, running, Math.max(300, ms - 200));
  return (
    <Part label="Volume" pop={pop}>
      <p className={eyebrow}>Volume</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span role="img" className="font-display text-6xl font-extrabold leading-none tabular-nums" aria-label={`${kgText(kg)} kilograms moved`}>
          <span aria-hidden="true">{kgText(shown)}</span>
        </span>
        <span aria-hidden="true" className="text-lg font-semibold text-clay-muted">kg moved</span>
      </p>
    </Part>
  );
}

export function RecordPart({ r, pop }: { r: WorkoutSummary["records"][number]; pop: boolean }) {
  return (
    <Part label="Personal record" tone="lilac" pop={pop} buzz={[40, 50, 40, 50, 80]}>
      <div className="flex items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/70" aria-hidden="true">
          <Trophy className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className={eyebrow}>New personal record</p>
          <p className="truncate text-xl font-bold">{r.name}</p>
          <p>
            <span className="font-display text-3xl font-extrabold tabular-nums">{r.loadKg}</span> kg, up from {r.previousKg} kg
          </p>
        </div>
      </div>
    </Part>
  );
}

/** The week ring fills to its new value and the streak shows where it stands. A frozen membership pauses the streak. */
export function WeekPart({ s, pop, running }: { s: WorkoutSummary; pop: boolean; running: boolean }) {
  const { planned, before, after, paused } = s.week;
  const [value, setValue] = useState(running ? before : after);
  useEffect(() => {
    if (!running) return setValue(after);
    const t = window.setTimeout(() => setValue(after), 150);
    return () => window.clearTimeout(t);
  }, [running, after]);
  const grew = s.streak.after > s.streak.before;
  return (
    <Part label="This week" pop={pop}>
      <p className={eyebrow}>This week</p>
      <div className="mt-3 flex items-center gap-5">
        <Ring value={planned ? value / planned : 0} label={planned ? `${after} of ${planned} workouts done this week` : "No workouts planned this week"}>
          <span className="font-display text-3xl font-extrabold tabular-nums">{planned ? `${Math.round(value)}/${planned}` : "–"}</span>
        </Ring>
        <div className="min-w-0 flex-1 space-y-2">
          <StreakFlame weeks={s.streak.after} paused={paused} />
          <p className="text-sm text-clay-muted">
            {paused ? "Your streak is paused while your membership is frozen." : grew ? `Your streak grew from ${s.streak.before} to ${s.streak.after} ${s.streak.after === 1 ? "week" : "weeks"}.` : "Keep going to build your streak."}
          </p>
        </div>
      </div>
    </Part>
  );
}

export function BadgePart({ b, pop }: { b: WorkoutSummary["badges"][number]; pop: boolean }) {
  return (
    <Part label="Badge earned" tone="mint" pop={pop} buzz={[60, 40, 60]}>
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/70" aria-hidden="true">
          <Award className="h-8 w-8" />
        </span>
        <div>
          <p className={eyebrow}>Badge earned</p>
          <p className="text-xl font-bold">{b.label}</p>
          <p className="text-sm">{b.description}</p>
        </div>
      </div>
    </Part>
  );
}
