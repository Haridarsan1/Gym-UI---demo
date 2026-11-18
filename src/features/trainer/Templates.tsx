import { Link, useSearchParams } from "react-router-dom";
import { Archive, ArrowLeft, FileText, Pencil, Plus, RotateCcw, Users } from "lucide-react";
import { useTemplate, useTemplateActions, useTemplates } from "@/api/hooks";
import type { TemplateDetail, TemplateRow } from "@/api/templates";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { ThreeZone } from "@/design/layout/ThreeZone";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { Switch } from "@/design/Switch";
import { useToast } from "@/design/Toast";
import { useSplit, useWide } from "@/design/useMediaQuery";
import { dayName, fromPlanDays } from "@/domain/program";
import { cn } from "@/lib/format";
import { useExercises } from "@/api/hooks";
import { LibraryTabs } from "@/features/trainer/LibraryTabs";
import { ProgramEditor } from "@/features/trainer/program/ProgramEditor";

/**
 * Program templates (W02): yours and the gym’s shared ones. `?t=` is the open template; `?edit=` and `?new=1` open the builder.
 * Phone: the list, and a template as its own screen. From 768 px: list and template side by side. From 1280 px: the actions
 * (edit, share, archive) in a third zone; below that they sit under the template.
 */
export default function Templates() {
  const [params] = useSearchParams();
  const edit = params.get("edit") ?? undefined;
  if (edit) return <EditTemplate id={edit} />;
  if (params.get("new")) return <ProgramEditor kind="template" />;
  return <TemplateList />;
}

function EditTemplate({ id }: { id: string }) {
  const query = useTemplate(id);
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this template" skeleton={<SkeletonCard label="Loading template" />}>
      {(t) => <ProgramEditor key={t.id} kind="template" template={t} />}
    </QueryBoundary>
  );
}

function TemplateList() {
  const [params, setParams] = useSearchParams();
  const split = useSplit();
  const wide = useWide();
  const selected = params.get("t") ?? undefined;
  const showArchived = params.get("archived") === "1";
  const query = useTemplates(showArchived);
  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight lg:text-4xl">Templates</h1>
        <p className="text-clay-muted">Programs to start from. Yours, and the ones shared with the gym.</p>
      </div>
      <Button3DLink to="/t/library/templates?new=1" size="md"><Plus className="h-5 w-5" aria-hidden="true" />New template</Button3DLink>
    </div>
  );
  const list = (
    <section aria-label="Templates" className="space-y-3">
      <Switch checked={showArchived} onChange={(v) => setParams((p) => (v ? p.set("archived", "1") : p.delete("archived"), p), { replace: true })} label="Show archived" />
      <QueryBoundary query={query} errorTitle="We couldn’t load templates" skeleton={<SkeletonRows rows={4} label="Loading templates" />}>
        {(rows) => (
          <ul aria-label="Template list" className="space-y-1">
            {rows.map((t) => <Row key={t.id} t={t} on={t.id === selected} />)}
            {rows.length === 0 && <li className="clay-well rounded-2xl p-5 text-center text-clay-muted">No templates yet.</li>}
          </ul>
        )}
      </QueryBoundary>
    </section>
  );
  if (!split) {
    if (!selected) return <div className="space-y-4"><LibraryTabs />{header}{list}</div>;
    return (
      <div>
        <Link to="/t/library/templates" className="mb-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink"><ArrowLeft className="h-5 w-5" aria-hidden="true" />Templates</Link>
        <Open id={selected} withActions />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <LibraryTabs />
      {header}
      <ThreeZone
        listWidth="minmax(16rem,20rem)"
        list={list}
        detail={selected ? <Open id={selected} withActions={!wide} /> : <p className="clay grid place-items-center px-6 py-14 text-center text-clay-muted">Pick a template to see its weeks.</p>}
        context={selected ? <Actions id={selected} /> : <p className="clay px-5 py-6 text-[0.95rem] text-clay-muted">Edit, share and archive show here.</p>}
      />
    </div>
  );
}

function Row({ t, on }: { t: TemplateRow; on: boolean }) {
  return (
    <li>
      <Link to={`/t/library/templates?t=${t.id}`} aria-current={on ? "page" : undefined} className={cn("block min-h-[3.5rem] rounded-2xl px-3 py-2", on ? "bg-ember-50 ring-2 ring-ember-200" : "hover:bg-clay-canvas")}>
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 font-semibold"><FileText className="h-4 w-4 shrink-0 text-clay-muted" aria-hidden="true" /><span className="truncate">{t.name}</span></span>
          <span className="flex shrink-0 gap-1">
            {t.shared && <span className="inline-flex items-center gap-1 rounded-full bg-lilac-100 px-2 py-0.5 text-xs font-semibold text-lilac-700"><Users className="h-3 w-3" aria-hidden="true" />Shared</span>}
            {t.archived && <span className="rounded-full bg-status-expired-bg px-2 py-0.5 text-xs font-semibold text-status-expired-fg">Archived</span>}
          </span>
        </span>
        <span className="block truncate text-sm text-clay-muted">{t.summary.weeks} {t.summary.weeks === 1 ? "week" : "weeks"}, {t.summary.workoutsPerWeek} a week, {t.mine ? "yours" : `by ${t.ownerName}`}</span>
      </Link>
    </li>
  );
}

function Open({ id, withActions }: { id: string; withActions: boolean }) {
  const query = useTemplate(id);
  const lib = useExercises({ archived: true });
  const names = new Map((lib.data?.rows ?? []).map((e) => [e.id, e.name]));
  // On a phone the template is the whole screen and its name is the h1; beside the list the screen’s title is.
  const Title = useSplit() ? "h2" : "h1";
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this template" skeleton={<SkeletonCard label="Loading template" />}>
      {(t) => (
        <article aria-label={t.name} className="clay p-4">
          <Title className="text-2xl font-bold tracking-tight">{t.name}</Title>
          <p className="text-sm text-clay-muted">{t.summary.weeks} {t.summary.weeks === 1 ? "week" : "weeks"}, {t.summary.workoutsPerWeek} workouts a week, {t.summary.exercises} exercises. {t.mine ? "Yours" : `By ${t.ownerName}`}{t.shared ? ", shared with the gym" : ""}.</p>
          {t.description && <p className="mt-2 text-[0.95rem]">{t.description}</p>}
          <Weeks t={t} names={names} />
          {withActions && <div className="mt-4"><Actions id={id} inline /></div>}
        </article>
      )}
    </QueryBoundary>
  );
}

function Weeks({ t, names }: { t: TemplateDetail; names: Map<string, string> }) {
  const weeks = fromPlanDays(t.days).slice(0, 2);
  return (
    <section aria-label="First weeks" className="mt-3">
      <h3 className="text-lg font-bold">The first {weeks.length === 1 ? "week" : "weeks"}</h3>
      <ol className="mt-1 space-y-2">
        {weeks.map((w, i) => (
          <li key={w.key} className="rounded-2xl bg-clay-canvas p-3">
            <p className="font-semibold">Week {i + 1}{w.days.length === 0 ? " (rest)" : ""}</p>
            <ul className="mt-1 space-y-1 text-[0.95rem]">
              {w.days.map((d) => (
                <li key={d.key}><span className="inline-block w-10 text-sm font-semibold text-clay-muted">{dayName(undefined, d.weekday)}</span>{d.title}<span className="text-sm text-clay-muted">, {d.items.slice(0, 3).map((x) => names.get(x.exerciseId) ?? "Exercise").join(", ")}{d.items.length > 3 ? ` and ${d.items.length - 3} more` : ""}</span></li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Actions({ id, inline }: { id: string; inline?: boolean }) {
  const query = useTemplate(id);
  const { share, archive } = useTemplateActions();
  const toast = useToast();
  return (
    <QueryBoundary query={query} skeleton={<SkeletonCard label="Loading" />} errorTitle="">
      {(t) => (
        <aside aria-label="Template actions" className={inline ? "" : "clay p-4"}>
          {!inline && <h2 className="text-lg font-bold">Actions</h2>}
          {t.canEdit ? (
            <div className="mt-2 space-y-3">
              <Button3DLink to={`/t/library/templates?edit=${t.id}`} variant="ember" className="w-full"><Pencil className="h-5 w-5" aria-hidden="true" />Edit template</Button3DLink>
              <Switch checked={t.shared} onChange={(v) => share.mutate({ id: t.id, shared: v }, { onSuccess: () => toast({ title: v ? "Shared with the gym" : "Now private" }) })} label="Share with the gym" description="Every trainer can start from it." />
              {t.archived ? (
                <Button3D variant="white" className="w-full" onClick={() => archive.mutate({ id: t.id, archived: false }, { onSuccess: () => toast({ title: "Template restored" }) })}><RotateCcw className="h-5 w-5" aria-hidden="true" />Restore</Button3D>
              ) : (
                <Button3D variant="white" className="w-full" onClick={() => archive.mutate({ id: t.id, archived: true }, { onSuccess: () => toast({ title: "Template archived", description: "It no longer shows in the picker." }) })}><Archive className="h-5 w-5" aria-hidden="true" />Archive</Button3D>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[0.95rem] text-clay-muted">This is {t.ownerName}’s template, shared with the gym. You can start a program from it in the builder, and it is copied, so yours is never changed by theirs.</p>
          )}
        </aside>
      )}
    </QueryBoundary>
  );
}
