import { Check, ChevronRight, Circle, Dumbbell, Minus, Moon, type LucideIcon } from "lucide-react";
import type { ProgramDay, ProgramDayState } from "@/api";
import { cn } from "@/lib/format";
import { formatWeekdayDate } from "@/lib/when";

/** Words and look for each day. Skipped and missed are neutral grey, never red (CLAUDE.md). */
const LOOK: Record<Exclude<ProgramDayState, "rest">, { icon: LucideIcon; label: string; node: string; card: string }> = {
  done: { icon: Check, label: "Done", node: "bg-mint-300 text-[#06301f]", card: "" },
  partial: { icon: Check, label: "Partly done", node: "bg-lilac-100 text-lilac-700 ring-2 ring-lilac-300", card: "" },
  skipped: { icon: Minus, label: "Skipped", node: "bg-clay-line text-clay-muted", card: "" },
  missed: { icon: Circle, label: "Not logged", node: "bg-white text-clay-subtle ring-2 ring-clay-line", card: "" },
  today: { icon: Dumbbell, label: "Today", node: "bg-ember-700 text-white ring-4 ring-ember-200", card: "ring-2 ring-ember-300" },
  upcoming: { icon: Dumbbell, label: "Coming up", node: "bg-white text-lilac-700 ring-2 ring-lilac-300", card: "" },
};

/**
 * One week as a path: a line down the left with a round marker for each day. Workout days open a preview; rest days
 * are quiet markers, so the path still reads as a week.
 */
export function WeekPath({ days, onOpen }: { days: ProgramDay[]; onOpen: (date: string) => void }) {
  return (
    <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[1.65rem] before:top-6 before:w-1 before:rounded-full before:bg-lilac-100 before:content-['']" aria-label="Days of the week">
      {days.map((d) => (d.state === "rest" ? <RestRow key={d.date} date={d.date} /> : <WorkoutRow key={d.date} day={d} state={d.state} onOpen={onOpen} />))}
    </ol>
  );
}

function RestRow({ date }: { date: string }) {
  return (
    <li className="relative flex min-h-[2.75rem] items-center gap-4 pl-[0.7rem] text-sm text-clay-muted">
      <span aria-hidden="true" className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-clay-canvas ring-2 ring-lilac-100">
        <Moon className="h-4 w-4" />
      </span>
      <span>
        <span className="font-semibold">{formatWeekdayDate(date)}</span>, rest day
      </span>
    </li>
  );
}

function WorkoutRow({ day, state, onOpen }: { day: ProgramDay; state: Exclude<ProgramDayState, "rest">; onOpen: (date: string) => void }) {
  const look = LOOK[state];
  const Icon = look.icon;
  return (
    <li className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen(day.date)}
        className={cn("clay-flat flex min-h-[4.5rem] w-full items-center gap-4 p-3 pr-4 text-left transition-transform active:scale-[0.99]", look.card)}
      >
        <span aria-hidden="true" className={cn("relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full", look.node)}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-clay-muted">{formatWeekdayDate(day.date)}</span>
          <span className="block truncate text-lg font-bold">{day.title}</span>
          <span className="block text-sm text-clay-muted">
            {look.label}, {day.exerciseCount} exercises, about {day.minutes} min
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-clay-subtle" aria-hidden="true" />
        <span className="sr-only">Preview {day.title}</span>
      </button>
    </li>
  );
}
