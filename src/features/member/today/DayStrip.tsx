import { Check, Snowflake } from "lucide-react";
import { Link } from "react-router-dom";
import type { WeekDay, WeekDayState } from "@/api";
import { formatDayMonth } from "@/lib/when";

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WORDS: Record<WeekDayState, string> = {
  done: "workout done", partial: "workout partly done", skipped: "workout skipped", planned: "workout planned", missed: "workout not logged", rest: "rest day", frozen: "frozen day",
};

/** The seven days of this week as small clay circles. Tapping one opens that day in the program. */
export function DayStrip({ days }: { days: WeekDay[] }) {
  return (
    <ol aria-label="Days this week" className="mt-4 flex items-end justify-between">
      {days.map((d, i) => (
        <li key={d.date}>
          <Link
            to={`/m/program?date=${d.date}`}
            aria-label={`${WEEKDAY[i]} ${formatDayMonth(d.date)}${d.isToday ? ", today" : ""}, ${WORDS[d.state]}${d.title ? `, ${d.title}` : ""}`}
            aria-current={d.isToday ? "date" : undefined}
            className="flex min-h-[4.25rem] min-w-[2.75rem] flex-col items-center justify-end gap-1.5 rounded-xl"
          >
            <span className="day-bubble" data-state={d.state} data-today={d.isToday}>
              {d.state === "done" && <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />}
              {d.state === "frozen" && <Snowflake className="h-5 w-5" aria-hidden="true" />}
            </span>
            <span aria-hidden="true" className={d.isToday ? "text-xs font-bold" : "text-xs text-clay-muted"}>{WEEKDAY[i]}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
