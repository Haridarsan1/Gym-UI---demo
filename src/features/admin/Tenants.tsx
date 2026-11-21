import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAdminActions, useTenants } from "@/api/adminHooks";
import type { TenantRow } from "@/api/platform";
import { isApiError } from "@/api/errors";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { Field, inputClass } from "@/design/Field";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { HealthPill, TenantStatePill } from "@/design/StatusPills";
import { useToast } from "@/design/Toast";
import { ResponsiveTable, type Column } from "@/design/layout/ResponsiveTable";
import { cn } from "@/lib/format";
import { formatRupees } from "@/lib/when";

const FILTERS = [{ id: "all", label: "All gyms" }, { id: "risk", label: "At risk" }, { id: "watch", label: "Needs a look" }, { id: "good", label: "Healthy" }] as const;

export function UsageLines({ usage }: { usage: TenantRow["usage"] }) {
  return (
    <ul aria-label="Use against the plan’s limits" className="space-y-0.5 text-sm">
      {usage.map((u) => <li key={u.key} className={cn("tabular", u.level === "full" ? "font-semibold text-status-danger-fg" : u.level === "near" ? "font-semibold text-status-pending-fg" : "text-clay-muted")}>{u.used}{u.limit === null ? "" : ` of ${u.limit}`} {u.label.toLowerCase()}</li>)}
    </ul>
  );
}

export function OnboardingBar({ percent, steps }: { percent: number; steps: TenantRow["onboarding"]["steps"] }) {
  return (
    <div className="min-w-[7rem]">
      <div className="flex items-baseline justify-between gap-2 text-sm"><span className="tabular font-semibold">{percent}%</span><span className="text-clay-muted">{steps.filter((s) => s.done).length} of {steps.length}</span></div>
      <div role="img" aria-label={`Set-up ${percent}% done`} className="mt-1 h-2 overflow-hidden rounded-full bg-clay-lavender"><div className={cn("h-full rounded-full", percent === 100 ? "bg-status-active-fg" : "bg-ember-650")} style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

/**
 * Tenants (R01, S01, S02): every gym as an account, with its subscription state, its health, what it uses against its plan’s limits and how far its set-up has got. Never a gym’s members or money:
 * those are the gym’s own, and the only way in is a support session.
 */
export default function Tenants() {
  const query = useTenants();
  return (
    <div className="max-w-6xl space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load the gyms" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Tenants</h1><SkeletonRows rows={5} /></>}>
        {(v) => <Loaded v={v} />}
      </QueryBoundary>
    </div>
  );
}

function Loaded({ v }: { v: { tenants: TenantRow[]; plans: Array<{ id: string; name: string }> } }) {
  const nav = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [adding, setAdding] = useState(false);
  const rows = v.tenants.filter((t) => filter === "all" || t.health.level === filter);
  const count = (id: string) => (id === "all" ? v.tenants.length : v.tenants.filter((t) => t.health.level === id).length);
  const columns: Array<Column<TenantRow>> = [
    { key: "name", header: "Gym", primary: true, cell: (t) => <span><Link to={`/admin/tenants/${t.id}`} className="inline-flex min-h-[2.75rem] items-center font-semibold underline-offset-4 hover:underline lg:min-h-0">{t.name}</Link><span className="block text-sm font-normal text-clay-muted">{t.owner ? `${t.owner.name}${t.owner.status === "invited" ? " (invited)" : ""}` : "No owner yet"}{t.city ? `, ${t.city}` : ""}</span><span className="block text-sm font-normal text-clay-muted">{t.planName}, {t.monthlyPaise === null ? "agreed" : `${formatRupees(t.monthlyPaise)} a month`}</span></span> },
    { key: "state", header: "Subscription and health", cell: (t) => <span className="flex flex-col items-start gap-1"><TenantStatePill state={t.effective} />{t.effective !== t.state && <span className="text-sm text-clay-muted">Set to {t.state.replace("_", " ")}</span>}<HealthPill level={t.health.level} />{t.health.reasons[0] && <span className="max-w-[26ch] text-sm text-clay-muted">{t.health.reasons[0]}{t.health.reasons.length > 1 ? ` and ${t.health.reasons.length - 1} more` : ""}</span>}</span> },
    { key: "use", header: "Use", hideOnPhone: true, cell: (t) => <UsageLines usage={t.usage} /> },
    { key: "setup", header: "Set-up", hideOnPhone: true, cell: (t) => <OnboardingBar percent={t.onboarding.percent} steps={t.onboarding.steps} /> },
    { key: "open", header: "", action: true, cell: (t) => <Button3DLink to={`/admin/tenants/${t.id}`} variant="white" size="md" aria-label={`Open ${t.name}`}>Open</Button3DLink> },
  ];
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Tenants</h1><p className="max-w-[70ch] text-clay-muted">Every gym on Ember: its subscription, its health, what it uses of its plan and how far its set-up has got. A gym’s members and money are its own and are not shown here.</p></div>
        <Button3D variant="ember" size="md" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden="true" />New gym</Button3D>
      </header>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={cn("min-h-[2.75rem] cursor-pointer rounded-full border border-clay-line px-4 text-sm font-semibold", filter === f.id ? "bg-clay-ink text-white" : "bg-white hover:bg-clay-canvas")}>{f.label}<span className="ml-1.5 tabular font-normal">{count(f.id)}</span></button>)}
      </div>
      {rows.length === 0 ? <EmptyState icon={Building2} title="No gyms here">{filter === "all" ? "Create the first gym with New gym." : "No gym is in this group right now."}</EmptyState> : <ResponsiveTable rows={rows} columns={columns} rowKey={(t) => t.id} caption="Gyms" cardIsLink onRowClick={(t) => nav(`/admin/tenants/${t.id}`)} />}
      <Sheet open={adding} onClose={() => setAdding(false)} label="New gym"><NewGym plans={v.plans} onClose={() => setAdding(false)} onMade={(id) => nav(`/admin/tenants/${id}`)} /></Sheet>
    </>
  );
}

function NewGym({ plans, onClose, onMade }: { plans: Array<{ id: string; name: string }>; onClose: () => void; onMade: (id: string) => void }) {
  const { createTenant } = useAdminActions();
  const toast = useToast();
  const [d, setD] = useState({ name: "", ownerName: "", ownerEmail: "", planId: plans.find((p) => p.name === "Starter")?.id ?? plans[0]?.id ?? "" });
  const [error, setError] = useState<string>();
  const [key] = useState(() => `tenant-${crypto.randomUUID()}`);
  const submit = async () => {
    setError(undefined);
    try { const r = await createTenant.mutateAsync({ key, ...d }); toast({ title: "Gym created", description: "It starts on a 14-day trial and its owner has been sent an invitation.", tone: "success" }); onClose(); onMade(r.id); }
    catch (e) { setError(isApiError(e) ? e.message : "We couldn’t create the gym. Try again."); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label="New gym" className="space-y-4 p-5">
      <h2 className="text-xl font-bold">New gym</h2>
      <p className="text-sm text-clay-muted">Creates the account on a 14-day free trial and invites its owner, who then adds branches and imports members.</p>
      <Field label="Gym name" htmlFor="ng-name"><input id="ng-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={inputClass} data-autofocus autoComplete="off" /></Field>
      <Field label="Owner’s name" htmlFor="ng-owner"><input id="ng-owner" value={d.ownerName} onChange={(e) => setD({ ...d, ownerName: e.target.value })} className={inputClass} autoComplete="off" /></Field>
      <Field label="Owner’s email" htmlFor="ng-email" hint="The invitation goes here."><input id="ng-email" type="email" value={d.ownerEmail} onChange={(e) => setD({ ...d, ownerEmail: e.target.value })} className={inputClass} autoComplete="off" /></Field>
      <Field label="Plan" htmlFor="ng-plan"><select id="ng-plan" value={d.planId} onChange={(e) => setD({ ...d, planId: e.target.value })} className={inputClass}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      {error && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="flex flex-wrap gap-3"><Button3D type="submit" variant="ember" size="md" disabled={createTenant.isPending}>{createTenant.isPending ? "Creating…" : "Create gym"}</Button3D><Button3D type="button" variant="white" size="md" onClick={onClose}>Cancel</Button3D></div>
    </form>
  );
}

