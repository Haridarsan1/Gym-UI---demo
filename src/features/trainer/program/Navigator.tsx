import { CalendarPlus, Copy, Plus, Trash2 } from "lucide-react";
import { dayName, type EditorDoc, type ProgramIssue } from "@/domain/program";
import { cn } from "@/lib/format";
import type { Action, EditorState } from "@/features/trainer/program/editor";

const iconButton = "grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-clay-muted hover:bg-clay-canvas hover:text-clay-ink";

/** The weeks and days of the program: pick a day to edit it, add or copy a week, add a day. */
export function Navigator({ doc, startsOn, selected, issues, dispatch }: { doc: EditorDoc; startsOn: string; selected: EditorState["selected"]; issues: ProgramIssue[]; dispatch: (a: Action) => void }) {
  return (
    <nav aria-label="Weeks and days" className="clay p-3">
      <ol className="space-y-3">
        {doc.weeks.map((week, w) => (
          <li key={week.key}>
            <div className="flex items-center justify-between gap-1 px-1">
              <h3 className="font-bold">Week {w + 1}{week.days.length === 0 ? " (rest)" : ""}</h3>
              <span className="flex">
                <button type="button" className={iconButton} aria-label={`Copy week ${w + 1}`} onClick={() => dispatch({ type: "copyWeek", week: w })}><Copy className="h-5 w-5" aria-hidden="true" /></button>
                <button type="button" className={cn(iconButton, doc.weeks.length <= 1 && "pointer-events-none opacity-40")} aria-label={`Remove week ${w + 1}`} disabled={doc.weeks.length <= 1} onClick={() => dispatch({ type: "removeWeek", week: w })}><Trash2 className="h-5 w-5" aria-hidden="true" /></button>
              </span>
            </div>
            <ul className="space-y-1">
              {week.days.slice().sort((a, b) => a.weekday - b.weekday).map((day) => {
                const on = selected.week === w && selected.dayKey === day.key;
                const bad = issues.some((i) => i.dayKey === day.key);
                return (
                  <li key={day.key}>
                    <button type="button" aria-current={on ? "true" : undefined} onClick={() => dispatch({ type: "select", week: w, dayKey: day.key })} className={cn("flex min-h-[2.75rem] w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left", on ? "bg-ember-50 font-semibold text-ember-700" : "hover:bg-clay-canvas")}>
                      <span className="w-9 shrink-0 text-sm font-semibold text-clay-muted">{dayName(startsOn, day.weekday)}</span>
                      <span className="min-w-0 flex-1 truncate">{day.title || "Untitled day"}</span>
                      <span className="shrink-0 text-xs text-clay-muted">{day.items.length} {day.items.length === 1 ? "exercise" : "exercises"}</span>
                      {bad && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-status-danger-fg" role="img" aria-label="Needs attention" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {week.days.length < 7 && (
              <button type="button" onClick={() => dispatch({ type: "addDay", week: w })} className="mt-1 flex min-h-[2.75rem] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-clay-muted hover:bg-clay-canvas hover:text-clay-ink">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add a day to week {w + 1}
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-clay-line pt-3">
        <button type="button" onClick={() => dispatch({ type: "addWeek" })} className="flex min-h-[2.75rem] cursor-pointer items-center gap-2 rounded-full bg-clay-lavender px-4 text-sm font-semibold"><CalendarPlus className="h-4 w-4" aria-hidden="true" />Add a week</button>
        <button type="button" onClick={() => dispatch({ type: "addWeek", rest: true })} className="flex min-h-[2.75rem] cursor-pointer items-center rounded-full bg-clay-lavender px-4 text-sm font-semibold">Add a rest week</button>
      </div>
    </nav>
  );
}
