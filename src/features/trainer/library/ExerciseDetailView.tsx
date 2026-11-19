import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive, Copy, Pencil, RotateCcw } from "lucide-react";
import { useExercise, useExerciseActions } from "@/api/trainerHooks";
import type { ExerciseDetail } from "@/api/library";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { useSplit } from "@/design/useMediaQuery";
import { isApiError } from "@/api/errors";
import { CATEGORY_LABEL, cap } from "@/features/trainer/library/labels";
import { ExerciseForm } from "@/features/trainer/library/ExerciseForm";

/** One exercise: how to do it, what it works, what can replace it, where it is used, and (for the gym’s own) edit and archive. */
export function ExerciseDetailView({ id, canWrite, linkSuffix }: { id: string; canWrite: boolean; linkSuffix: string }) {
  const query = useExercise(id);
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this exercise" skeleton={<SkeletonCard label="Loading exercise" />}>
      {(e) => <Detail e={e} canWrite={canWrite} linkSuffix={linkSuffix} />}
    </QueryBoundary>
  );
}

function Detail({ e, canWrite, linkSuffix }: { e: ExerciseDetail; canWrite: boolean; linkSuffix: string }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"edit" | "copy" | "archive" | null>(null);
  const { archive } = useExerciseActions();
  const toast = useToast();
  const [error, setError] = useState<string>();
  const used = e.usedInPrograms + e.usedInTemplates;
  // The screen’s own title is the h1 beside the list; on a phone the exercise is the whole screen and its name is the h1.
  const Title = useSplit() ? "h2" : "h1";
  const toggle = () =>
    archive.mutate({ id: e.id, archived: !e.archived }, {
      onSuccess: () => { toast({ title: e.archived ? "Exercise restored" : "Exercise archived", description: e.archived ? undefined : "It no longer shows when you build programs. Plans that use it keep working." }); setMode(null); },
      onError: (err) => setError(isApiError(err) ? err.message : "Try again."),
    });
  return (
    <article aria-label={e.name} className="clay p-4">
      <header>
        <p className="flex flex-wrap items-center gap-2 text-sm text-clay-muted">
          <span className="rounded-full bg-clay-lavender px-2.5 py-0.5 font-semibold text-clay-ink">{CATEGORY_LABEL[e.category]}</span>
          {e.own ? <span>Your gym’s exercise{e.createdByName ? `, added by ${e.createdByName}` : ""}</span> : <span>Comes with Ember</span>}
          {e.archived && <span className="rounded-full bg-status-expired-bg px-2.5 py-0.5 font-semibold text-status-expired-fg">Archived</span>}
        </p>
        <Title className="mt-1 text-2xl font-bold tracking-tight">{e.name}</Title>
      </header>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-sm text-clay-muted">Works</dt><dd className="font-semibold">{e.muscleGroups.map(cap).join(", ")}</dd></div>
        <div><dt className="text-sm text-clay-muted">Equipment</dt><dd className="font-semibold">{e.equipment.length ? e.equipment.map(cap).join(", ") : "None"}</dd></div>
      </dl>
      <section aria-labelledby="exd-how" className="mt-4">
        <h2 id="exd-how" className="text-lg font-bold">How to do it</h2>
        <p className="mt-1 max-w-prose text-[0.95rem]">{e.instructions}</p>
      </section>
      <section aria-labelledby="exd-sub" className="mt-4">
        <h2 id="exd-sub" className="text-lg font-bold">Can be swapped for</h2>
        {e.substitutions.length === 0 ? (
          <p className="mt-1 text-[0.95rem] text-clay-muted">No substitutes set.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {e.substitutions.map((s) => (
              <li key={s.id}>
                <Link to={`/t/library?ex=${s.id}${linkSuffix}`} className="inline-flex min-h-[2.75rem] items-center rounded-full bg-clay-lavender px-4 text-sm font-semibold">{s.name}{s.archived ? " (archived)" : ""}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-4 text-sm text-clay-muted">
        {used === 0 ? "Not used in any program yet." : `Used in ${e.usedInPrograms} ${e.usedInPrograms === 1 ? "program" : "programs"} and ${e.usedInTemplates} ${e.usedInTemplates === 1 ? "template" : "templates"}.`}
      </p>
      {canWrite && (
        <div className="mt-4 flex flex-wrap gap-2">
          {e.own ? (
            <>
              <Button3D variant="white" onClick={() => setMode("edit")}><Pencil className="h-5 w-5" aria-hidden="true" />Edit</Button3D>
              {e.archived ? <Button3D variant="white" onClick={toggle}><RotateCcw className="h-5 w-5" aria-hidden="true" />Restore</Button3D> : <Button3D variant="white" onClick={() => setMode("archive")}><Archive className="h-5 w-5" aria-hidden="true" />Archive</Button3D>}
            </>
          ) : (
            <Button3D variant="white" onClick={() => setMode("copy")}><Copy className="h-5 w-5" aria-hidden="true" />Make a copy for your gym</Button3D>
          )}
        </div>
      )}
      {(mode === "edit" || mode === "copy") && <ExerciseForm initial={e} copy={mode === "copy"} onClose={() => setMode(null)} onSaved={(id) => id !== e.id && navigate(`/t/library?ex=${id}${linkSuffix}`)} />}
      {mode === "archive" && (
        <Sheet open onClose={() => setMode(null)} label="Archive exercise" kind="confirm" className="p-5">
          <h2 className="text-xl font-bold">Archive {e.name}?</h2>
          <p className="mt-1 text-[0.95rem] text-clay-muted">It leaves the exercise picker, so no new program uses it. {used > 0 ? `The ${used} that use it now keep it, and their logs stay as they are.` : ""} You can restore it any time.</p>
          {error && <p role="alert" className="mt-2 text-sm font-semibold text-status-danger-fg">{error}</p>}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button3D variant="ink" size="lg" className="sm:flex-1" disabled={archive.isPending} onClick={toggle}>Archive exercise</Button3D>
            <Button3D variant="white" size="lg" onClick={() => setMode(null)}>Keep it</Button3D>
          </div>
        </Sheet>
      )}
    </article>
  );
}
