import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useDashboard } from "@/api/ownerHooks";
import type { DashboardData } from "@/api/dashboard";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { useBranch } from "@/design/shells/BranchContext";
import { addDays, todayIST } from "@/domain/dates";
import { HeatMapView, MoneyBars } from "@/features/owner/dashboard/Charts";
import { cn } from "@/lib/format";
import { formatDate, formatRupees } from "@/lib/when";

const PRESETS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]] as const;

/**
 * Dashboard (O06, O07): the gym at a glance for a range of dates and a branch (or every branch the person may see). Billed and collected are shown apart; renewals are measured
 * against the memberships due to expire in the range; coached hours against the hours trainers could be booked. A branch manager sees only their own branches.
 */
export default function Dashboard() {
  const { branchId } = useBranch();
  const [params, setParams] = useSearchParams();
  const today = todayIST();
  const custom = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from") ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("to") ?? "");
  const preset = PRESETS.some(([v]) => v === params.get("range")) ? params.get("range")! : "30";
  const from = custom ? params.get("from")! : addDays(today, -(Number(preset) - 1));
  const to = custom ? params.get("to")! : today;
  const query = useDashboard({ branchId: branchId === "all" ? undefined : branchId, from, to });
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); setParams(n, { replace: true }); };
  const field = "h-11 rounded-xl border border-clay-line bg-white px-3";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Dashboard</h1>
        <p className="text-sm text-clay-muted">{formatDate(from)} to {formatDate(to)}</p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Range" className="flex flex-wrap gap-1">
          {PRESETS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={!custom && preset === v} onClick={() => set({ range: v === "30" ? "" : v, from: "", to: "" })} className={cn("min-h-[2.75rem] cursor-pointer rounded-full px-4 text-sm font-semibold", !custom && preset === v ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{l}</button>)}
        </div>
        <label className="text-sm font-semibold">From<input type="date" value={from} max={to} onChange={(e) => e.target.value && set({ from: e.target.value, to, range: "" })} className={cn(field, "mt-1 block")} /></label>
        <label className="text-sm font-semibold">To<input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && set({ to: e.target.value, from, range: "" })} className={cn(field, "mt-1 block")} /></label>
      </div>
      <QueryBoundary query={query} errorTitle="We couldn’t load the dashboard" skeleton={<SkeletonRows rows={8} />}>
        {(d) => <Body d={d} />}
      </QueryBoundary>
    </div>
  );
}

function Body({ d }: { d: DashboardData }) {
  const scope = d.scope.length === d.branches.length ? (d.branches.length === 1 ? d.branches[0]!.name : "all branches") : d.branches.filter((b) => d.scope.includes(b.id)).map((b) => b.name).join(", ");
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <dl aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label="Billed" value={formatRupees(d.money.billedPaise)} note="Invoiced in this range" />
          <Kpi label="Collected" value={formatRupees(d.money.collectedPaise)} note={d.money.refundedPaise > 0 ? `${formatRupees(d.money.refundedPaise)} refunded` : "Money received"} />
          <Kpi label="Dues" value={formatRupees(d.dues.duePaise)} note={`${formatRupees(d.dues.overduePaise)} overdue, ${d.dues.overdueInvoices} ${d.dues.overdueInvoices === 1 ? "invoice" : "invoices"}`} />
          <Kpi label="Active memberships" value={String(d.memberships.active)} note={`${d.memberships.frozen} frozen`} />
          <Kpi label="Ending soon" value={String(d.memberships.expiring)} note={`Within ${d.expiryWindowDays} days`} />
          <Kpi label="Renewals" value={d.renewals.ratePercent === null ? "None due" : `${d.renewals.ratePercent}%`} note={d.renewals.due === 0 ? "No membership ended in this range" : `${d.renewals.renewed} of ${d.renewals.due} that ended`} />
        </dl>
        <Card title="Billed and collected by week"><MoneyBars weeks={d.weekly} /></Card>
        <Card title="When members come in" note={`${d.heat.total} visits, ${scope}`}><HeatMapView heat={d.heat} /></Card>
      </div>
      <div className="space-y-5">
        <Card title="Needs attention">
          {d.alerts.length === 0 ? (
            <p className="flex items-center gap-2 text-clay-muted"><CheckCircle2 className="h-5 w-5 text-status-active-fg" aria-hidden="true" />Nothing needs attention.</p>
          ) : (
            <ul aria-label="Alerts" className="space-y-3">
              {d.alerts.map((a) => (
                <li key={a.kind} className="rounded-2xl bg-clay-canvas p-3">
                  <p className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ember-700" aria-hidden="true" />{a.text}</p>
                  <p className="mt-0.5 pl-6 text-sm text-clay-muted">{a.detail}</p>
                  <Link to={`/owner/reports?report=${a.report}`} className="mt-1 inline-flex min-h-[2.75rem] items-center pl-6 font-semibold underline underline-offset-4">See the report</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Trainer utilisation" note={d.utilisation.percent === null ? "No hours available" : `${d.utilisation.coachedHours} of ${d.utilisation.availableHours} hours coached, ${d.utilisation.percent}%`}>
          {d.utilisation.trainers.length === 0 ? <p className="text-clay-muted">No trainer was available to book in this range.</p> : (
            <ul aria-label="Trainers" className="space-y-3">
              {d.utilisation.trainers.map((t) => (
                <li key={t.trainerId}>
                  <p className="flex justify-between gap-2"><span className="font-semibold">{t.name}</span><span className="tabular">{t.percent === null ? "–" : `${t.percent}%`}</span></p>
                  <div role="img" aria-label={`${t.coachedHours} of ${t.availableHours} hours`} className="mt-1 h-2 overflow-hidden rounded-full bg-clay-lavender"><div className="h-full rounded-full bg-ember-600" style={{ width: `${Math.min(100, t.percent ?? 0)}%` }} /></div>
                  <p className="mt-0.5 text-xs text-clay-muted">{t.coachedHours} of {t.availableHours} hours coached</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-clay-muted">Coached hours are attended personal-training sessions. Available hours are the windows each trainer can be booked, less leave.</p>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="clay p-4"><dt className="text-sm text-clay-muted">{label}</dt><dd className="font-display text-2xl font-extrabold tabular lg:text-3xl">{value}</dd><p className="text-xs text-clay-muted">{note}</p></div>;
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section aria-label={title} className="clay p-4 sm:p-5"><h2 className="text-lg font-bold">{title}</h2>{note && <p className="mb-2 text-sm text-clay-muted">{note}</p>}<div className="mt-2">{children}</div></section>;
}
