import { useState } from "react";
import { Plus } from "lucide-react";
import type { AssessmentView } from "@/api/assessments";
import type { ProfileGoal } from "@/api/clients";
import { useGoalActions } from "@/api/hooks";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { addDays } from "@/domain/dates";
import { GOAL_METRICS, metricInfo } from "@/domain/goals";
import { formatDayMonth } from "@/lib/when";
import { Field, NumberInput, inputClass } from "@/features/trainer/assessment/fields";

type Dialog = { kind: "new" } | { kind: "revise"; goal: ProfileGoal } | { kind: "close"; goal: ProfileGoal } | { kind: "achieve"; goal: ProfileGoal } | null;
const STATUS = { active: "Active", achieved: "Achieved", revised: "Revised", closed: "Closed" } as const;

/** Goals with target dates and review cadences (T02). Only the trainer confirms “Achieved” (P04); the client’s own reading only ever says “Target reached”. */
export function GoalsCard({ v }: { v: AssessmentView }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const active = v.goals.filter((g) => g.status === "active");
  const past = v.goals.filter((g) => g.status !== "active");
  return (
    <section aria-labelledby="gl-title" className="clay p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="gl-title" className="text-lg font-bold">Goals</h2>
        <Button3D size="md" variant="white" onClick={() => setDialog({ kind: "new" })}>
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add a goal
        </Button3D>
      </div>
      {active.length === 0 ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">No active goals. A goal gives {v.firstName} a target and a date, and tells you how often to review.</p>
      ) : (
        <ul aria-label="Active goals" className="mt-3 space-y-2">
          {active.map((g) => (
            <li key={g.id} className="rounded-2xl bg-clay-canvas px-3 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{g.title}</span>
                <span className="text-xs font-semibold text-clay-muted">{STATUS[g.status]}</span>
              </div>
              {g.fraction !== null && (
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-clay-line" role="img" aria-label={`${Math.round(g.fraction * 100)}% of the way`}>
                  <div className="h-full rounded-full bg-ember-600" style={{ width: `${Math.round(g.fraction * 100)}%` }} />
                </div>
              )}
              <p className="mt-1 text-sm text-clay-muted">
                {g.current !== undefined ? `Now ${g.current} ${g.unit}. ` : "No reading yet. "}Target {g.target} {g.unit} by {formatDayMonth(g.targetDate)}. Review every {g.reviewEveryDays} days.
              </p>
              {g.targetReached && <p className="mt-1 text-sm font-semibold text-status-active-fg">Target reached. Confirm it when you have seen it for yourself.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button3D size="md" variant={g.targetReached ? "mint" : "white"} onClick={() => setDialog({ kind: "achieve", goal: g })}>Confirm achieved</Button3D>
                <Button3D size="md" variant="white" onClick={() => setDialog({ kind: "revise", goal: g })}>Revise</Button3D>
                <Button3D size="md" variant="white" onClick={() => setDialog({ kind: "close", goal: g })}>Close</Button3D>
              </div>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-[2.75rem] cursor-pointer py-2 font-semibold">Earlier goals ({past.length})</summary>
          <ul aria-label="Earlier goals" className="space-y-1.5 text-[0.95rem]">
            {past.map((g) => (
              <li key={g.id} className="flex justify-between gap-3 rounded-2xl bg-clay-canvas px-3 py-2">
                <span>{g.title}</span>
                <span className="shrink-0 text-sm text-clay-muted">{STATUS[g.status]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(dialog?.kind === "new" || dialog?.kind === "revise") && <GoalSheet v={v} goal={dialog.kind === "revise" ? dialog.goal : undefined} onClose={close} />}
      {dialog?.kind === "close" && <CloseSheet v={v} goal={dialog.goal} onClose={close} />}
      {dialog?.kind === "achieve" && <AchieveSheet v={v} goal={dialog.goal} onClose={close} />}
    </section>
  );
}

function GoalSheet({ v, goal, onClose }: { v: AssessmentView; goal?: ProfileGoal; onClose: () => void }) {
  const actions = useGoalActions(v.memberId);
  const toast = useToast();
  const existing = goal ? GOAL_METRICS.find((m) => m.unit === goal.unit)?.key : undefined;
  const [title, setTitle] = useState(goal?.title ?? "");
  const [metric, setMetric] = useState<string>(existing ?? "weight");
  const [baseline, setBaseline] = useState<number | undefined>(goal?.current ?? goal?.baseline ?? v.readings.weight);
  const [target, setTarget] = useState<number | undefined>(goal?.target);
  const [date, setDate] = useState(goal?.targetDate ?? addDays(v.today, 84));
  const [cadence, setCadence] = useState<number | undefined>(goal?.reviewEveryDays ?? v.defaultCadenceDays);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const unit = metricInfo(metric)?.unit ?? "";
  const pending = actions.create.isPending || actions.revise.isPending;
  const submit = () => {
    setError(undefined);
    const base = { memberId: v.memberId, title, metric, baseline, target: target as number, targetDate: date, reviewEveryDays: cadence as number };
    const done = (msg: string) => () => { toast({ title: msg, tone: "success" }); onClose(); };
    const fail = (e: unknown) => setError(isApiError(e) ? e.message : "We couldn’t save that. Try again.");
    if (goal) actions.revise.mutate({ ...base, goalId: goal.id, reason }, { onSuccess: done("Goal revised"), onError: fail });
    else actions.create.mutate(base, { onSuccess: done("Goal added"), onError: fail });
  };
  return (
    <Sheet open onClose={onClose} label={goal ? "Revise goal" : "Add a goal"} className="p-5">
      <h2 className="text-xl font-bold">{goal ? "Revise goal" : "Add a goal"}</h2>
      {goal && <p className="text-sm text-clay-muted">The current goal is kept as “Revised”, with your reason, and the new one starts today.</p>}
      <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Goal" htmlFor="g-title"><input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example, Reach 78 kg" className={inputClass} /></Field>
        <Field label="What it measures" htmlFor="g-metric">
          <select id="g-metric" value={metric} onChange={(e) => { setMetric(e.target.value); setBaseline(v.readings[e.target.value]); }} className={inputClass}>
            {GOAL_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label} ({m.unit})</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starting point" htmlFor="g-base" hint={v.readings[metric] !== undefined ? `Now ${v.readings[metric]} ${unit}` : "No reading yet"}><NumberInput id="g-base" value={baseline} onChange={setBaseline} suffix={unit} /></Field>
          <Field label="Target" htmlFor="g-target"><NumberInput id="g-target" value={target} onChange={setTarget} suffix={unit} /></Field>
        </div>
        <Field label="Target date" htmlFor="g-date"><input id="g-date" type="date" value={date} min={addDays(v.today, 1)} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
        <Field label="Review every" htmlFor="g-cad" hint="How many days between reviews while this goal is active. The shortest goal sets the pace."><NumberInput id="g-cad" value={cadence} onChange={setCadence} step={1} min={7} max={180} suffix="days" /></Field>
        {goal && <Field label="Why it is changing" htmlFor="g-reason"><input id="g-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></Field>}
        {error && <p role="alert" className="rounded-2xl bg-status-danger-bg p-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
        <div className="flex gap-3">
          <Button3D type="submit" size="lg" className="flex-1" disabled={pending}>{pending ? "Saving…" : goal ? "Save revised goal" : "Add goal"}</Button3D>
          <Button3D variant="white" size="lg" onClick={onClose}>Cancel</Button3D>
        </div>
      </form>
    </Sheet>
  );
}

function CloseSheet({ v, goal, onClose }: { v: AssessmentView; goal: ProfileGoal; onClose: () => void }) {
  const { close } = useGoalActions(v.memberId);
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  return (
    <Sheet open onClose={onClose} label="Close goal" kind="confirm" className="p-5">
      <h2 className="text-xl font-bold">Close this goal?</h2>
      <p className="mt-1 text-[0.95rem] text-clay-muted">“{goal.title}” stops counting. It stays in the history as Closed.</p>
      <div className="mt-4"><Field label="Why" htmlFor="c-reason"><input id="c-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></Field></div>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button3D variant="ink" size="lg" className="sm:flex-1" disabled={close.isPending} onClick={() => close.mutate({ goalId: goal.id, reason }, { onSuccess: () => { toast({ title: "Goal closed" }); onClose(); }, onError: (e) => setError(isApiError(e) ? e.message : "Try again.") })}>Close goal</Button3D>
        <Button3D variant="white" size="lg" onClick={onClose}>Keep it</Button3D>
      </div>
    </Sheet>
  );
}

function AchieveSheet({ v, goal, onClose }: { v: AssessmentView; goal: ProfileGoal; onClose: () => void }) {
  const { achieve } = useGoalActions(v.memberId);
  const toast = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  return (
    <Sheet open onClose={onClose} label="Confirm goal achieved" kind="confirm" className="p-5">
      <h2 className="text-xl font-bold">Confirm “{goal.title}” as achieved?</h2>
      <p className="mt-1 text-[0.95rem] text-clay-muted">
        {goal.targetReached ? `${v.firstName}’s own numbers have reached the target.` : "The target has not been reached in the numbers yet."} Only you can confirm it. {v.firstName} gets the Goal achieved badge.
      </p>
      <div className="mt-4"><Field label="What you saw (optional)" htmlFor="a-note"><input id="a-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} /></Field></div>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button3D variant="mint" size="lg" className="sm:flex-1" disabled={achieve.isPending} onClick={() => achieve.mutate({ goalId: goal.id, note }, { onSuccess: () => { toast({ title: "Goal achieved", description: `${v.firstName} will see it in their app.`, tone: "success" }); onClose(); }, onError: (e) => setError(isApiError(e) ? e.message : "Try again.") })}>Confirm achieved</Button3D>
        <Button3D variant="white" size="lg" onClick={onClose}>Not yet</Button3D>
      </div>
    </Sheet>
  );
}
