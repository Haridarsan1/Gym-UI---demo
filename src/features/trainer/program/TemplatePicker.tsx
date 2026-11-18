import { useState } from "react";
import { FileText, Users } from "lucide-react";
import { useTemplateLoader, useTemplates } from "@/api/hooks";
import type { TemplateDetail, TemplateRow } from "@/api/templates";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";

/** Start from one of your templates or one shared with the gym. Choosing one replaces what is on screen, so it asks first when there is something there. */
export function TemplatePicker({ hasWork, onChoose, onBlank, onClose }: { hasWork: boolean; onChoose: (t: TemplateDetail) => void; onBlank: () => void; onClose: () => void }) {
  const query = useTemplates();
  const load = useTemplateLoader();
  const [pending, setPending] = useState<TemplateRow | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const apply = async (t: TemplateRow) => {
    setBusy(true);
    try {
      onChoose(await load(t.id));
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t open that template. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} label="Choose a template" className="p-5">
      <h2 className="text-xl font-bold">Start from a template</h2>
      <p className="text-sm text-clay-muted">Your own and the ones shared with the gym. The template is copied, so changing your program never changes it.</p>
      {hasWork && !pending && <p role="note" className="mt-3 rounded-2xl bg-status-pending-bg p-3 text-sm text-status-pending-fg">You have already started a program. Choosing a template replaces it.</p>}
      {pending ? (
        <div className="mt-4 rounded-2xl bg-clay-canvas p-4">
          <p className="font-semibold">Replace your program with “{pending.name}”?</p>
          <p className="mt-1 text-sm text-clay-muted">What you have built so far is replaced. Nothing is published until you publish.</p>
          <div className="mt-3 flex gap-2">
            <Button3D variant="ink" disabled={busy} onClick={() => void apply(pending)}>Replace my program</Button3D>
            <Button3D variant="white" onClick={() => setPending(null)}>Keep mine</Button3D>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <QueryBoundary query={query} errorTitle="We couldn’t load templates" skeleton={<SkeletonRows rows={4} label="Loading templates" />}>
            {(rows) => (
              <ul aria-label="Templates" className="space-y-2">
                {rows.map((t) => (
                  <li key={t.id} className="rounded-2xl bg-clay-canvas p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 shrink-0 text-clay-muted" aria-hidden="true" />{t.name}</p>
                        <p className="text-sm text-clay-muted">{t.summary.weeks} {t.summary.weeks === 1 ? "week" : "weeks"}, {t.summary.workoutsPerWeek} workouts a week, {t.summary.exercises} exercises</p>
                        <p className="flex items-center gap-1 text-sm text-clay-muted">{t.shared && <Users className="h-3.5 w-3.5" aria-hidden="true" />}{t.mine ? "Yours" : `By ${t.ownerName}`}{t.shared ? ", shared with the gym" : ""}</p>
                        {t.description && <p className="mt-1 text-sm">{t.description}</p>}
                      </div>
                      <Button3D size="md" variant="white" disabled={busy} onClick={() => (hasWork ? setPending(t) : void apply(t))} aria-label={`Use ${t.name}`}>Use</Button3D>
                    </div>
                  </li>
                ))}
                {rows.length === 0 && <li className="text-sm text-clay-muted">No templates yet. Save a program as a template to find it here.</li>}
              </ul>
            )}
          </QueryBoundary>
          <Button3D variant="white" className="w-full" onClick={onBlank}>Start from blank</Button3D>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
    </Sheet>
  );
}
