import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useProgramActions } from "@/api/hooks";
import type { ProgramSource, PublishResult } from "@/api/programs";
import { isApiError } from "@/api/errors";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { compareDays, newKey, summarize, toPlanDays, type EditorDoc, type ProgramIssue } from "@/domain/program";
import { formatDate, formatWeekdayDate } from "@/lib/when";

/** Publish confirmation: what will go live and from when, what stays as it was, then the new version once it is published. */
export function PublishSheet({ source, doc, startsOn, issues, onClose, onPublished }: { source: ProgramSource; doc: EditorDoc; startsOn: string; issues: ProgramIssue[]; onClose: () => void; onPublished: () => void }) {
  const { publish } = useProgramActions();
  const navigate = useNavigate();
  const key = useRef(newKey("pub"));
  const [done, setDone] = useState<PublishResult>();
  const [error, setError] = useState<string>();
  const days = toPlanDays(doc);
  const s = summarize(days);
  const cmp = source.current ? compareDays(source.current.days, days) : undefined;
  const run = () => {
    setError(undefined);
    publish.mutate({ memberId: source.memberId, name: doc.name, notes: doc.notes, startsOn, days, key: key.current }, {
      onSuccess: (r) => { setDone(r); onPublished(); },
      onError: (e) => setError(isApiError(e) ? e.message : "We couldn’t publish that. Check your connection and try again."),
    });
  };
  if (done) {
    return (
      <Sheet open onClose={() => navigate(`/t/clients/${source.memberId}`)} label="Version published" kind="confirm" className="p-5">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-status-active-fg" aria-hidden="true" />
          <h2 className="mt-2 text-xl font-bold">Version {done.versionNumber} is published</h2>
          <p className="mt-1 text-[0.95rem]">“{done.name}” starts on {formatWeekdayDate(done.startsOn)}. {source.firstName} will see it in the app from then.</p>
        </div>
        <ul aria-label="What happened" className="mt-4 space-y-2 text-[0.95rem]">
          <li className="rounded-2xl bg-clay-canvas px-3 py-2">{done.summary.workouts} workouts over {done.summary.weeks} {done.summary.weeks === 1 ? "week" : "weeks"}, {done.summary.exercises} exercises.</li>
          {done.previous ? (
            <li className="rounded-2xl bg-clay-canvas px-3 py-2">Version {done.previous.versionNumber}, “{done.previous.name}”, stays as it was and covers {source.firstName} until {formatDate(done.previous.endsOn)}. Every workout already logged keeps its original targets.</li>
          ) : (
            <li className="rounded-2xl bg-clay-canvas px-3 py-2">This is {source.firstName}’s first program.</li>
          )}
        </ul>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button3DLink to={`/t/clients/${source.memberId}`} size="lg" className="sm:flex-1">Back to {source.firstName}</Button3DLink>
          <Link to="/t" className="inline-flex min-h-[2.75rem] items-center justify-center font-semibold underline underline-offset-4">Today</Link>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={onClose} label="Publish program" kind="confirm" className="p-5">
      <h2 className="text-xl font-bold">Publish version {source.nextVersion}?</h2>
      <p className="mt-1 text-[0.95rem] text-clay-muted">“{doc.name || "Untitled program"}” for {source.memberName}, from {formatWeekdayDate(startsOn)}.</p>
      <ul className="mt-3 space-y-2 text-[0.95rem]">
        <li className="rounded-2xl bg-clay-canvas px-3 py-2">{s.workouts} workouts over {s.weeks} {s.weeks === 1 ? "week" : "weeks"}, {s.exercises} exercises.</li>
        {cmp && <li className="rounded-2xl bg-clay-canvas px-3 py-2">Compared with version {source.current!.versionNumber}: {cmp.changed} changed, {cmp.added} new, {cmp.removed} removed, {cmp.same} the same.</li>}
        <li className="rounded-2xl bg-clay-canvas px-3 py-2">
          {source.current ? `Version ${source.current.versionNumber} stays as it was, and so does every workout ${source.firstName} has logged. The new version takes over on the start date.` : `${source.firstName} has no program yet, so this one starts their training.`}
        </li>
      </ul>
      {issues.length > 0 && (
        <div role="alert" className="mt-3 rounded-2xl bg-status-danger-bg p-3 text-status-danger-fg">
          <p className="font-bold">{issues.length === 1 ? "One thing to fix first" : `${issues.length} things to fix first`}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{issues.slice(0, 5).map((i) => <li key={i.message}>{i.message}</li>)}</ul>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button3D size="lg" className="sm:flex-1" disabled={publish.isPending || issues.length > 0} onClick={run}>{publish.isPending ? "Publishing…" : `Publish version ${source.nextVersion}`}</Button3D>
        <Button3D variant="white" size="lg" onClick={onClose}>Not yet</Button3D>
      </div>
    </Sheet>
  );
}
