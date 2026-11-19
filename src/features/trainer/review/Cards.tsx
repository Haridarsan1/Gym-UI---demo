import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { useGoalActions } from "@/api/trainerHooks";
import type { ReviewData, ReviewGoal, ReviewTrend } from "@/api/review";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { BarChart, LineChart } from "@/design/charts/Charts";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { formatDate } from "@/lib/when";
import { cn } from "@/lib/format";

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

/** What the client told you themselves: effort, recovery and what got in the way. The newest one, and whether it is newer than your last review. */
export function CheckinCard({ v }: { v: ReviewData }) {
  const c = v.checkin;
  return (
    <section aria-labelledby="ck-title" className="clay p-4">
      <h2 id="ck-title" className="text-lg font-bold">{v.firstName}’s latest check-in</h2>
      {!c ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">{v.firstName} hasn’t sent a check-in yet. They can add one from Progress in their app.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-clay-muted">Sent {formatDate(c.at.slice(0, 10))}{c.sinceLastReview ? ", after your last review" : ", before your last review"}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
            <div className="rounded-2xl bg-clay-canvas p-3"><dt className="text-sm text-clay-muted">Effort</dt><dd className="font-display text-3xl font-extrabold tabular">{c.effort ?? "–"}<span className="text-base font-semibold text-clay-muted"> of 10</span></dd></div>
            <div className="rounded-2xl bg-clay-canvas p-3"><dt className="text-sm text-clay-muted">Recovery</dt><dd className="font-display text-3xl font-extrabold tabular">{c.recovery ?? "–"}<span className="text-base font-semibold text-clay-muted"> of 5</span></dd></div>
          </dl>
          {c.obstacles && <p className="mt-3 max-w-[70ch] text-[0.95rem]"><span className="font-semibold">In the way: </span>“{c.obstacles}”</p>}
        </>
      )}
    </section>
  );
}

export function AdherenceCard({ v }: { v: ReviewData }) {
  const a = v.adherence;
  return (
    <section aria-labelledby="ad-title" className="clay p-4">
      <h2 id="ad-title" className="text-lg font-bold">Sticking to the plan</h2>
      {a.scheduled === 0 ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">No workouts were scheduled in the last four weeks.</p>
      ) : (
        <>
          <p className="mt-2">
            <span className="font-display text-4xl font-extrabold tabular">{pct(a.completionRate)}</span>
            <span className="ml-2 text-clay-muted">of scheduled workouts completed in 4 weeks</span>
          </p>
          <p className="text-sm text-clay-muted">{a.completed} completed, {a.partial} partly done, {a.skipped} skipped, {a.missed} not logged, out of {a.scheduled}.</p>
          <div className="mt-3">
            <BarChart label="Workouts done each week" unit="workouts" weeks={v.weeks.map((w) => w.weekStart)} values={v.weeks.map((w) => (w.planned === 0 ? null : w.done))} noun="workouts" />
          </div>
        </>
      )}
    </section>
  );
}

export function TrendsCard({ v }: { v: ReviewData }) {
  return (
    <section aria-labelledby="tr-title" className="clay p-4">
      <h2 id="tr-title" className="text-lg font-bold">Trends, last 12 weeks</h2>
      {v.trends.length === 0 ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">There aren’t two readings of anything yet. Weigh-ins, measurements and logged lifts show here as they come in.</p>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-1 min-[1500px]:grid-cols-2">
          {v.trends.map((t) => <Trend key={t.key} t={t} />)}
        </div>
      )}
    </section>
  );
}

function Trend({ t }: { t: ReviewTrend }) {
  const s = t.summary;
  return (
    <div>
      <p className="font-semibold">{t.label}{s ? <span className="font-normal text-clay-muted">: {s.latest.value} {t.unit}, {s.change === 0 ? "no change" : `${s.change > 0 ? "up" : "down"} ${Math.abs(s.change)} ${t.unit}`} since {formatDate(s.baseline.date)}</span> : null}</p>
      <LineChart label={t.label} unit={t.unit} points={t.points} from={t.from} to={t.to} maxGapDays={21} decimals={t.decimals} />
    </div>
  );
}

const GOAL_WORDS: Record<string, string> = { active: "Active", achieved: "Achieved", revised: "Revised", closed: "Closed" };

/** Each goal with how far it has come. A goal that shows “Target reached” offers “Confirm achieved”: only you can, and the client gets the badge. */
export function ReviewGoals({ v }: { v: ReviewData }) {
  const [confirming, setConfirming] = useState<ReviewGoal | null>(null);
  const active = v.goals.filter((g) => g.status === "active" || g.status === "achieved");
  return (
    <section aria-labelledby="gl-title" className="clay p-4">
      <h2 id="gl-title" className="text-lg font-bold">Goals</h2>
      {active.length === 0 ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">No goals yet. Set one from Assessment and goals.</p>
      ) : (
        <ul aria-label="Goals" className="mt-2 space-y-2">
          {active.map((g) => (
            <li key={g.id} className="rounded-2xl bg-clay-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{g.title}</span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-semibold", g.status === "achieved" ? "bg-mint-300 text-[#06301f]" : "bg-clay-lavender")}>{GOAL_WORDS[g.status]}</span>
              </div>
              <p className="text-sm text-clay-muted">
                {g.current !== undefined ? `Now ${g.current} ${g.unit}` : "No reading yet"}, target {g.target} {g.unit} by {formatDate(g.targetDate)}
              </p>
              {g.fraction !== null && (
                <div role="progressbar" aria-label={`${g.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.fraction * 100)} className="mt-2 h-2 overflow-hidden rounded-full bg-clay-line">
                  <div className="h-full rounded-full bg-mint-500" style={{ width: `${g.fraction * 100}%` }} />
                </div>
              )}
              {g.canConfirm && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold text-status-active-fg">Target reached{g.reachedOn ? ` on ${formatDate(g.reachedOn.slice(0, 10))}` : ""}.</p>
                  <Button3D size="md" variant="mint" onClick={() => setConfirming(g)}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Confirm achieved
                  </Button3D>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirming && <ConfirmSheet v={v} goal={confirming} onClose={() => setConfirming(null)} />}
    </section>
  );
}

function ConfirmSheet({ v, goal, onClose }: { v: ReviewData; goal: ReviewGoal; onClose: () => void }) {
  const { achieve } = useGoalActions(v.memberId);
  const toast = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  return (
    <Sheet open onClose={onClose} label="Confirm goal achieved" kind="confirm" className="p-5">
      <h2 className="text-xl font-bold">Confirm “{goal.title}” as achieved?</h2>
      <p className="mt-1 text-clay-muted">{v.firstName}’s own numbers have reached the target. Only you can confirm it. {v.firstName} gets the Goal achieved badge, once.</p>
      <label className="mt-4 block">
        <span className="font-semibold">A note for the record (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="mt-2 w-full rounded-xl border border-clay-line p-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
      </label>
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button3D variant="mint" size="lg" className="sm:flex-1" disabled={achieve.isPending} onClick={() => achieve.mutate({ goalId: goal.id, note }, { onSuccess: () => { toast({ title: "Goal achieved", description: `${v.firstName} will see it in their app.`, tone: "success" }); onClose(); }, onError: (e) => setError(isApiError(e) ? e.message : "Try again.") })}>
          {achieve.isPending ? "Saving…" : "Confirm achieved"}
        </Button3D>
        <Button3D variant="white" size="lg" onClick={onClose}>Not yet</Button3D>
      </div>
    </Sheet>
  );
}
