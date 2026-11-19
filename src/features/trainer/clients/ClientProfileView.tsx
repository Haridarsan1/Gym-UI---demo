import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClipboardList, Dumbbell, Sparkles } from "lucide-react";
import { useAddPrivateNote, useClient } from "@/api/trainerHooks";
import type { ClientProfile, ProfileGoal, ProfileLog, ProfileNote } from "@/api/clients";
import { Avatar } from "@/design/Avatar";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { BarChart } from "@/design/charts/Charts";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { MembershipStatusPill, WorkoutStatusPill } from "@/design/StatusPills";
import { useToast } from "@/design/Toast";
import { useWide } from "@/design/useMediaQuery";
import { isApiError } from "@/api/errors";
import { cn } from "@/lib/format";
import { formatDate, formatDayMonth, formatWeekdayDate } from "@/lib/when";
import { Glance } from "@/features/trainer/clients/Glance";

type Tab = "overview" | "logs" | "notes";
const TABS: Array<{ value: Tab; label: string }> = [{ value: "overview", label: "Overview" }, { value: "logs", label: "Workouts" }, { value: "notes", label: "Notes and reviews" }];

/** One client (T02, T05, T06, A02): who they are, how they are doing, what they did and who wrote what. */
export function ClientProfileView({ memberId }: { memberId: string }) {
  const query = useClient(memberId);
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this client" skeleton={<SkeletonCard label="Loading client" />}>
      {(p) => <Profile p={p} />}
    </QueryBoundary>
  );
}

function Profile({ p }: { p: ClientProfile }) {
  const wide = useWide();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ?? "overview") as Tab;
  const setTab = (t: Tab) => setParams((q) => (t === "overview" ? q.delete("tab") : q.set("tab", t), q), { replace: true });
  return (
    <article aria-label={`${p.name}, client`} className="space-y-4">
      <header className="clay p-4">
        <div className="flex items-center gap-3">
          <Avatar name={p.name} className="h-14 w-14 text-lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">{p.name}</h1>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-clay-muted">
              <MembershipStatusPill status={p.membership.status} />
              <span>{p.membership.planName}</span>
              <span>{p.branchName}</span>
            </p>
          </div>
        </div>
        <p className="mt-2 text-sm text-clay-muted">
          Member since {formatDate(p.joinedOn)}. {p.phone}{p.email ? `, ${p.email}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button3DLink to={`/t/library/programs?member=${p.memberId}`} size="md" variant={p.program ? "white" : "ember"}>
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            {p.program ? "Revise plan" : "Build a plan"}
          </Button3DLink>
          <Button3DLink to={`/t/clients/${p.memberId}/assessment`} size="md" variant="white">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
            Assessment and goals
          </Button3DLink>
        </div>
      </header>

      <div role="tablist" aria-label="Client sections" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.value} role="tab" id={`tab-${t.value}`} aria-selected={t.value === tab} aria-controls="client-panel" type="button" onClick={() => setTab(t.value)} className={cn("min-h-[2.75rem] shrink-0 rounded-full px-4 text-sm font-semibold", t.value === tab ? "bg-clay-ink text-white" : "bg-clay-lavender")}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="client-panel" aria-labelledby={`tab-${tab}`} className="space-y-4">
        {tab === "overview" && (
          <>
            {!wide && <Glance p={p} />}
            <Adherence p={p} />
            <Program p={p} />
            <Goals goals={p.goals} memberId={p.memberId} />
          </>
        )}
        {tab === "logs" && <Logs logs={p.logs} />}
        {tab === "notes" && <Notes p={p} />}
      </div>
    </article>
  );
}

function Adherence({ p }: { p: ClientProfile }) {
  const a = p.adherence;
  return (
    <section aria-labelledby="ad-title" className="clay p-4">
      <h2 id="ad-title" className="text-lg font-bold">Sticking to the plan</h2>
      {a.scheduled === 0 ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">{p.program ? "No workouts were scheduled in the last four weeks." : "There is no plan yet, so there is nothing to follow."}</p>
      ) : (
        <>
          <p className="mt-2">
            <span className="font-display text-4xl font-extrabold tabular">{a.completionRate === null ? "–" : `${Math.round(a.completionRate * 100)}%`}</span>
            <span className="ml-2 text-clay-muted">of scheduled workouts completed in 4 weeks</span>
          </p>
          <p className="text-sm text-clay-muted">
            {a.completed} completed, {a.partial} partly done, {a.skipped} skipped, {a.missed} not logged, out of {a.scheduled}.
          </p>
          <div className="mt-3">
            <BarChart label="Workouts done each week" unit="workouts" weeks={p.weeks.map((w) => w.weekStart)} values={p.weeks.map((w) => (w.planned === 0 ? null : w.done))} noun="workouts" />
          </div>
        </>
      )}
    </section>
  );
}

function Program({ p }: { p: ClientProfile }) {
  return (
    <section aria-labelledby="pg-title" className="clay p-4">
      <h2 id="pg-title" className="flex items-center gap-2 text-lg font-bold">
        <Dumbbell className="h-5 w-5 text-clay-muted" aria-hidden="true" />
        Program
      </h2>
      {!p.program ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">No program yet. Build one and publish it, and {p.firstName} sees it in the app.</p>
      ) : (
        <>
          <p className="mt-2 font-semibold">{p.program.name}</p>
          <p className="text-sm text-clay-muted">Version {p.program.versionNumber} by {p.program.authorName}, from {formatDate(p.program.startsOn)}</p>
          <ol aria-label="Program versions" className="mt-3 space-y-1.5 text-[0.95rem]">
            {p.program.versions.map((v) => (
              <li key={v.id} className="flex items-baseline justify-between gap-3 rounded-2xl bg-clay-canvas px-3 py-2">
                <span>Version {v.versionNumber}: {v.name}{v.current ? " (current)" : ""}</span>
                <span className="shrink-0 text-sm text-clay-muted">{v.authorName}, {formatDayMonth(v.startsOn)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Goals({ goals, memberId }: { goals: ProfileGoal[]; memberId: string }) {
  return (
    <section aria-labelledby="gs-title" className="clay p-4">
      <h2 id="gs-title" className="text-lg font-bold">Goals</h2>
      {goals.length === 0 ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">No goals yet. Set them with the assessment.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {goals.map((g) => (
            <li key={g.id} className="rounded-2xl bg-clay-canvas px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{g.title}</span>
                <span className="shrink-0 text-xs font-semibold text-clay-muted">{{ active: "Active", achieved: "Achieved", revised: "Revised", closed: "Closed" }[g.status]}</span>
              </div>
              {g.fraction !== null && (
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-clay-line" role="img" aria-label={`${Math.round(g.fraction * 100)}% of the way`}>
                  <div className="h-full rounded-full bg-ember-600" style={{ width: `${Math.round(g.fraction * 100)}%` }} />
                </div>
              )}
              <p className="mt-1 text-sm text-clay-muted">
                {g.current !== undefined ? `Now ${g.current} ${g.unit}. ` : ""}Target {g.target} {g.unit} by {formatDayMonth(g.targetDate)}. Reviewed every {g.reviewEveryDays} days.
                {g.targetReached && g.status === "active" ? " Target reached, ready to confirm." : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/t/clients/${memberId}/assessment`} className="mt-2 inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">Manage goals</Link>
    </section>
  );
}

function Logs({ logs }: { logs: ProfileLog[] }) {
  if (logs.length === 0) return <section className="clay p-4"><h2 className="text-lg font-bold">Workouts</h2><p className="mt-2 text-[0.95rem] text-clay-muted">No workouts logged yet.</p></section>;
  return (
    <section aria-labelledby="lg-title" className="clay p-4">
      <h2 id="lg-title" className="text-lg font-bold">Recent workouts</h2>
      <ul aria-label="Recent workouts" className="mt-2 space-y-2">
        {logs.map((l) => (
          <li key={l.id} className="rounded-2xl bg-clay-canvas px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{l.title}</span>
              <WorkoutStatusPill status={l.status} />
            </div>
            <p className="text-sm text-clay-muted">{formatWeekdayDate(l.date)}{l.effort ? `, effort ${l.effort} of 10` : ""}{l.volumeKg ? `, ${Math.round(l.volumeKg)} kg lifted` : ""}</p>
            <p className="text-sm text-clay-muted">
              Logged by {l.enteredByRole === "trainer" ? `${l.enteredByName} (coach)` : l.enteredByName.toLowerCase()}{l.corrected ? ", corrected later" : ""}
            </p>
            {l.notes && <p className="mt-1 text-[0.95rem]">“{l.notes}”</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

const KIND: Record<ProfileNote["kind"], string> = { shared_review: "Shared with the client", private_note: "Private note, only you can read it", member_checkin: "Client check-in" };

function Notes({ p }: { p: ClientProfile }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const add = useAddPrivateNote(p.memberId);
  const toast = useToast();
  const save = () =>
    add.mutate(body, {
      onSuccess: () => { setBody(""); setError(undefined); toast({ title: "Note saved", description: "Only you can read it.", tone: "success" }); },
      onError: (e) => setError(isApiError(e) ? e.message : "We couldn’t save that. Try again."),
    });
  return (
    <div className="space-y-4">
      <section aria-labelledby="nt-add" className="clay p-4">
        <h2 id="nt-add" className="text-lg font-bold">Add a private note</h2>
        <label className="mt-2 block">
          <span className="sr-only">Private note</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Something to remember about this client. Only you can read it." className="clay-flat w-full resize-y p-3 outline-none" />
        </label>
        {error && <p role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{error}</p>}
        <Button3D size="md" className="mt-2" disabled={add.isPending || !body.trim()} onClick={save}>Save note</Button3D>
      </section>
      <section aria-labelledby="nt-list" className="clay p-4">
        <h2 id="nt-list" className="text-lg font-bold">Notes and reviews</h2>
        {p.notes.length === 0 ? (
          <p className="mt-2 text-[0.95rem] text-clay-muted">Nothing yet.</p>
        ) : (
          <ul aria-label="Notes and reviews" className="mt-2 space-y-2">
            {p.notes.map((n) => (
              <li key={n.id} className="rounded-2xl bg-clay-canvas px-3 py-2.5">
                <p className="text-sm font-semibold text-clay-muted">{KIND[n.kind]}</p>
                <p className="mt-0.5 text-[0.95rem]">{n.body}</p>
                {n.kind === "member_checkin" && n.effort !== undefined && <p className="text-sm text-clay-muted">Effort {n.effort} of 10{n.recovery ? `, recovery ${n.recovery} of 5` : ""}{n.obstacles ? `. ${n.obstacles}` : ""}</p>}
                <p className="mt-1 text-xs text-clay-muted">
                  {n.authorIsMe ? "You" : n.authorName}, {formatDayMonth(n.createdAt.slice(0, 10))}{n.followUpOn ? `. Follow-up ${formatDayMonth(n.followUpOn)}.` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
