import { useEffect, useMemo, useReducer, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, FileText, Save } from "lucide-react";
import { useExercises, useProgramActions, useTemplateActions } from "@/api/trainerHooks";
import type { ProgramSource } from "@/api/programs";
import type { TemplateDetail } from "@/api/templates";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { ThreeZone } from "@/design/layout/ThreeZone";
import { Switch } from "@/design/Switch";
import { useToast } from "@/design/Toast";
import { useSplit, useWide } from "@/design/useMediaQuery";
import { Sheet } from "@/design/Sheet";
import { fromPlanDays, nextMonday, summarize, toPlanDays, validateProgram, type EditorDoc } from "@/domain/program";
import { formatDate } from "@/lib/when";
import { blankDoc, initialState, reducer } from "@/features/trainer/program/editor";
import { DayEditor } from "@/features/trainer/program/DayEditor";
import { ExercisePicker } from "@/features/trainer/program/ExercisePicker";
import { Navigator } from "@/features/trainer/program/Navigator";
import { PreviewSheet } from "@/features/trainer/program/PreviewSheet";
import { PublishSheet } from "@/features/trainer/program/PublishSheet";
import { TemplatePicker } from "@/features/trainer/program/TemplatePicker";
import { Field, inputClass } from "@/features/trainer/assessment/fields";

/** Templates sit on a Monday calendar, and a Monday is what names their days. */
const TEMPLATE_START = "2024-01-01";

export type EditorProps = { kind: "member"; source: ProgramSource } | { kind: "template"; template?: TemplateDetail };

function startingPoint(p: EditorProps): { doc: EditorDoc; startsOn: string; savedAt?: string } {
  if (p.kind === "template") return { doc: p.template ? { name: p.template.name, notes: p.template.description, weeks: fromPlanDays(p.template.days) } : blankDoc(), startsOn: TEMPLATE_START };
  const s = p.source;
  if (s.draft) {
    const weeks = fromPlanDays(s.draft.days);
    return { doc: { name: s.draft.name === "Untitled program" ? "" : s.draft.name, notes: s.draft.notes, weeks: weeks.length ? weeks : blankDoc().weeks }, startsOn: s.draft.startsOn < s.earliestStart ? s.earliestStart : s.draft.startsOn, savedAt: s.draft.updatedAt };
  }
  if (s.current) return { doc: { name: `${s.current.name}, revised`, notes: "", weeks: fromPlanDays(s.current.days) }, startsOn: s.earliestStart };
  return { doc: blankDoc(), startsOn: s.earliestStart };
}

/**
 * The program builder (W02, T03, T06). It builds a client’s next version, or a template, week by week and day by day.
 * - Phone: the weeks and days, then the open day below; the library opens as a sheet.
 * - From 768 px: the weeks and days on the left, the open day beside them.
 * - From 1280 px: the library in a third zone, so adding an exercise is one click.
 * Nothing reaches the client until it is published, and a published version never changes.
 */
export function ProgramEditor(props: EditorProps) {
  const isMember = props.kind === "member";
  const start = useMemo(() => startingPoint(props), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, dispatch] = useReducer(reducer, initialState(start.doc, start.startsOn, start.savedAt));
  const split = useSplit();
  const wide = useWide();
  const navigate = useNavigate();
  const toast = useToast();
  const { saveDraft } = useProgramActions();
  const templates = useTemplateActions();
  const library = useExercises({ archived: true });
  const names = useMemo(() => new Map((library.data?.rows ?? []).map((e) => [e.id, { name: e.name, archived: e.archived }])), [library.data]);
  const [dialog, setDialog] = useState<"templates" | "preview" | "publish" | "picker" | "saveAs" | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [shared, setShared] = useState(props.kind === "template" ? (props.template?.shared ?? false) : false);
  const [saveError, setSaveError] = useState<string>();
  const [announce, setAnnounce] = useState("");
  const [templateId, setTemplateId] = useState(props.kind === "template" ? props.template?.id : undefined);

  const { doc, startsOn, selected } = state;
  const issues = useMemo(() => (library.data ? validateProgram(doc, names, startsOn) : []), [doc, names, startsOn, library.data]);
  const week = doc.weeks[selected.week];
  const day = week?.days.find((d) => d.key === selected.dayKey) ?? week?.days[0];
  const sum = summarize(toPlanDays(doc));
  const source = isMember ? props.source : undefined;

  // Unsaved work is worth a warning before the tab goes.
  useEffect(() => {
    if (!state.dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.dirty]);

  const addExercise = (exerciseId: string, section: "warmup" | "main" | "cooldown") => {
    if (!day) return;
    dispatch({ type: "addRx", week: selected.week, dayKey: day.key, exerciseId, section });
    // The list grows on screen, so a toast would only sit on top of the work. Screen readers hear it instead.
    setAnnounce(`Added ${names.get(exerciseId)?.name ?? "exercise"} to ${day.title || "the workout"}.`);
  };

  const saveMemberDraft = () => {
    if (!source) return;
    setSaveError(undefined);
    saveDraft.mutate({ memberId: source.memberId, name: doc.name, notes: doc.notes, startsOn, days: toPlanDays(doc) }, {
      onSuccess: (r) => { dispatch({ type: "saved", at: r.savedAt }); toast({ title: "Draft saved", description: `${source.firstName} can’t see it until you publish.`, tone: "success" }); },
      onError: (e) => setSaveError(isApiError(e) ? e.message : "We couldn’t save the draft. Try again."),
    });
  };
  const saveTemplate = (asNew = false) => {
    setSaveError(undefined);
    templates.save.mutate({ id: asNew ? undefined : templateId, name: doc.name, description: doc.notes, shared, days: toPlanDays(doc) }, {
      onSuccess: (id) => { setTemplateId(id); dispatch({ type: "saved", at: new Date().toISOString() }); toast({ title: "Template saved", tone: "success" }); setDialog(null); if (props.kind === "template" && !props.template) navigate(`/t/library/templates?edit=${id}`, { replace: true }); },
      onError: (e) => setSaveError(isApiError(e) ? e.message : "We couldn’t save the template. Try again."),
    });
  };
  const publish = () => {
    setShowIssues(true);
    setDialog("publish");
  };

  const toolbar = (
    <div className="clay p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_12rem]">
        <Field label={isMember ? "Program name" : "Template name"} htmlFor="pg-name"><input id="pg-name" value={doc.name} onChange={(e) => dispatch({ type: "name", name: e.target.value })} placeholder="For example, Strength block" className={inputClass} /></Field>
        <Field label={isMember ? "Notes for the client" : "Description"} htmlFor="pg-notes"><input id="pg-notes" value={doc.notes} onChange={(e) => dispatch({ type: "notes", notes: e.target.value })} placeholder="Optional" className={inputClass} /></Field>
        {isMember ? (
          <Field label="Starts on" htmlFor="pg-start" hint={source!.current ? "Tomorrow at the earliest" : "Today or later"}>
            <input id="pg-start" type="date" value={startsOn} min={source!.earliestStart} onChange={(e) => dispatch({ type: "start", startsOn: e.target.value })} className={inputClass} />
          </Field>
        ) : (
          <div className="pt-6"><Switch checked={shared} onChange={(v) => { setShared(v); dispatch({ type: "name", name: doc.name }); }} label="Share with the gym" /></div>
        )}
      </div>
      <p className="mt-3 text-sm text-clay-muted" aria-live="polite">
        {sum.workouts} workouts over {sum.weeks} {sum.weeks === 1 ? "week" : "weeks"}, {sum.exercises} exercises.{" "}
        {state.dirty ? "Unsaved changes." : state.savedAt ? `Saved ${formatDate(state.savedAt.slice(0, 10))}.` : ""}
        {issues.length > 0 && <button type="button" onClick={() => setShowIssues((v) => !v)} className="ml-2 min-h-[2.75rem] cursor-pointer font-semibold text-status-danger-fg underline underline-offset-4">{issues.length === 1 ? "1 thing to fix" : `${issues.length} things to fix`}</button>}
      </p>
      {showIssues && issues.length > 0 && (
        <ul aria-label="Things to fix" className="mt-2 space-y-1 rounded-2xl bg-status-danger-bg p-3 text-sm text-status-danger-fg">
          {issues.slice(0, 8).map((i) => (
            <li key={i.message}>
              {i.dayKey ? <button type="button" className="cursor-pointer text-left underline underline-offset-2" onClick={() => dispatch({ type: "select", week: i.weekIndex ?? 0, dayKey: i.dayKey })}>{i.message}</button> : i.message}
            </li>
          ))}
        </ul>
      )}
      {saveError && <p role="alert" className="mt-2 text-sm font-semibold text-status-danger-fg">{saveError}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {isMember && <Button3D variant="white" onClick={() => setDialog("templates")}><FileText className="h-5 w-5" aria-hidden="true" />Use a template</Button3D>}
        <Button3D variant="white" onClick={() => setDialog("preview")}><Eye className="h-5 w-5" aria-hidden="true" />{isMember ? "Preview as member" : "Preview"}</Button3D>
        {isMember ? (
          <>
            <Button3D variant="white" disabled={saveDraft.isPending} onClick={saveMemberDraft}><Save className="h-5 w-5" aria-hidden="true" />{saveDraft.isPending ? "Saving…" : "Save draft"}</Button3D>
            <Button3D onClick={publish}>Publish version {source!.nextVersion}</Button3D>
          </>
        ) : (
          <>
            <Button3D disabled={templates.save.isPending} onClick={() => saveTemplate()}>{templates.save.isPending ? "Saving…" : "Save template"}</Button3D>
            {templateId && <Button3D variant="white" onClick={() => saveTemplate(true)}>Save as a new template</Button3D>}
          </>
        )}
      </div>
    </div>
  );

  const back = isMember ? `/t/clients/${source!.memberId}` : "/t/library/templates";
  const header = (
    <header>
      <Link to={back} className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink"><ArrowLeft className="h-5 w-5" aria-hidden="true" />{isMember ? source!.firstName : "Templates"}</Link>
      <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight lg:text-4xl">{isMember ? `Program for ${source!.memberName}` : templateId ? "Edit template" : "New template"}</h1>
      <p className="text-clay-muted">
        {isMember
          ? source!.current ? `Version ${source!.current.versionNumber} is current. You are building version ${source!.nextVersion}${source!.draft ? " (a saved draft)" : ""}.` : "No program yet. You are building the first."
          : "A template is copied when someone starts from it."}
      </p>
    </header>
  );

  const detail = day ? (
    <DayEditor key={day.key} day={day} week={selected.week} startsOn={startsOn} names={names} issues={showIssues ? issues : []} dispatch={dispatch} onAdd={() => (wide ? document.getElementById("pg-library")?.scrollIntoView({ block: "nearest" }) : setDialog("picker"))} />
  ) : (
    <div className="clay p-6 text-center text-clay-muted">{week && week.days.length === 0 ? "This is a rest week. Add a day if you want a workout in it." : "Pick a day to edit."}</div>
  );
  const nav = <Navigator doc={doc} startsOn={startsOn} selected={selected} issues={showIssues ? issues : []} dispatch={dispatch} />;

  return (
    <div className="space-y-4">
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      {header}
      {toolbar}
      {split ? (
        <ThreeZone listWidth={wide ? "minmax(15rem,18rem)" : "minmax(12.5rem,14.5rem)"} list={nav} detail={detail} context={<div id="pg-library" className="clay p-4"><ExercisePicker onPick={addExercise} /></div>} />
      ) : (
        <div className="space-y-4">{nav}{detail}</div>
      )}

      {dialog === "picker" && (
        <Sheet open onClose={() => setDialog(null)} label="Add an exercise" className="p-5">
          <ExercisePicker onPick={(id, s) => { addExercise(id, s); setDialog(null); }} />
        </Sheet>
      )}
      {dialog === "templates" && (
        <TemplatePicker
          hasWork={doc.weeks.some((w) => w.days.some((d) => d.items.length > 0))}
          onClose={() => setDialog(null)}
          onBlank={() => { dispatch({ type: "replace", doc: blankDoc(doc.name) }); setDialog(null); }}
          onChoose={(t) => {
            // Template weeks begin on a Monday, so the program does too.
            dispatch({ type: "replace", doc: { name: doc.name.trim() ? doc.name : t.name, notes: doc.notes, weeks: fromPlanDays(t.days) }, startsOn: nextMonday(source!.earliestStart) });
            toast({ title: `Started from ${t.name}`, description: "Starts on a Monday, like the template.", tone: "success" });
            setDialog(null);
          }}
        />
      )}
      {dialog === "preview" && <PreviewSheet doc={doc} startsOn={startsOn} firstName={source?.firstName ?? "your client"} names={names} initial={selected} onClose={() => setDialog(null)} />}
      {dialog === "publish" && source && <PublishSheet source={source} doc={doc} startsOn={startsOn} issues={issues} onClose={() => setDialog(null)} onPublished={() => dispatch({ type: "saved", at: new Date().toISOString() })} />}
    </div>
  );
}
