import { Pencil } from "lucide-react";
import type { CoachWorkoutView } from "@/api/coachLog";
import { Button3D } from "@/design/Button3D";
import { describeLogged, describeTarget } from "@/domain/workout";
import { formatWeekdayDate } from "@/lib/when";
import { STATUS_WORDS } from "@/features/trainer/log/CoachSession";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(/\bam\b|\bpm\b/i, (m) => m.toLowerCase());

/** A finished log as it stands, who entered it, every correction with its reason, and what it said before. */
export function FinishedLog({ view, onCorrect }: { view: CoachWorkoutView; onCorrect: () => void }) {
  const status = view.status === "none" ? "none" : view.status;
  return (
    <article aria-label="Finished log" className="space-y-4">
      <header className="clay p-4">
        <p className="text-sm text-clay-muted">{formatWeekdayDate(view.date)} · Week {view.weekNumber}, {view.versionName}</p>
        <h2 className="text-xl font-bold">{view.title} for {view.client.firstName}</h2>
        <p className="mt-1 font-semibold">{STATUS_WORDS[status]}{view.corrections.length ? `, corrected ${view.corrections.length === 1 ? "once" : `${view.corrections.length} times`}` : ""}</p>
        {view.enteredBy && <p className="text-sm text-clay-muted">{view.enteredBy.label}</p>}
        {view.effort && <p className="text-sm text-clay-muted">Effort {view.effort} of 10</p>}
        {view.notes && <p className="mt-2 max-w-[70ch] text-[0.95rem]">{view.notes}</p>}
        <div className="mt-3">
          <Button3D variant="white" onClick={onCorrect}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Correct this log
          </Button3D>
        </div>
      </header>
      <section aria-labelledby="done-title" className="clay p-4">
        <h3 id="done-title" className="text-lg font-bold">What was done</h3>
        <ul className="mt-2 divide-y divide-clay-line">
          {view.exercises.map((x, i) => {
            const e = view.entries.find((en) => (en.substitutionFor ?? en.exerciseId) === x.prescription.exerciseId);
            return (
              <li key={i} className="py-2">
                <p className="font-semibold">{x.exercise.name}</p>
                <p className="text-sm text-clay-muted">Target {describeTarget(x.prescription)}</p>
                <p className="text-[0.95rem]">{e && e.sets.length ? describeLogged(e) : "Nothing logged"}</p>
              </li>
            );
          })}
        </ul>
      </section>
      {view.corrections.length > 0 && (
        <section aria-labelledby="corr-title" className="clay p-4">
          <h3 id="corr-title" className="text-lg font-bold">Corrections</h3>
          <p className="text-sm text-clay-muted">Each one keeps what the log said before it.</p>
          <ol className="mt-3 space-y-3">
            {view.corrections.map((c, i) => (
              <li key={i} className="rounded-2xl bg-clay-lavender p-3">
                <p className="font-semibold">{c.byName} corrected it on {when(c.at)}</p>
                <p className="max-w-[70ch] text-[0.95rem]">“{c.reason}”</p>
                <details className="mt-1">
                  <summary className="min-h-[2.75rem] cursor-pointer py-2 font-semibold text-ember-700">{i === 0 ? "What the original said" : "What it said before"}</summary>
                  <p className="text-sm text-clay-muted">{STATUS_WORDS[c.before.status]}, {c.before.enteredByRole === "trainer" ? `entered by Coach ${c.before.enteredByName.split(" ")[0]}` : "entered by the member"}</p>
                  <ul className="mt-1 text-[0.95rem]">
                    {c.before.lines.map((l, j) => (
                      <li key={j}><span className="font-semibold">{l.name}:</span> {l.sets}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
