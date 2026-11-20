import { Plus, Tags } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { usePlans } from "@/api/ownerHooks";
import type { PlanRow, PlansView } from "@/api/plans";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { PlanStatePill } from "@/design/StatusPills";
import { useShortcut } from "@/design/useShortcut";
import { ResponsiveTable, type Column } from "@/design/layout/ResponsiveTable";
import { cn } from "@/lib/format";
import { formatRupees } from "@/lib/when";
import { PlanEditor } from "@/features/owner/plans/PlanEditor";
import { PtPricingCard } from "@/features/owner/plans/PtPricing";

const KIND: Record<PlanRow["kind"], string> = { trial: "Trial", time: "Time-based", visit: "Visit pass" };
const FILTERS = [{ id: "all", label: "All plans" }, { id: "sale", label: "On sale" }, { id: "off", label: "Not on sale" }] as const;
type Filter = (typeof FILTERS)[number]["id"];

const lasts = (p: PlanRow) => (p.kind === "visit" ? `${p.visits} visits in ${p.durationDays} days` : `${p.durationDays ?? 30} days`);
const where = (p: PlanRow, v: PlansView) => (p.branchIds.length === v.branches.length ? "Every branch" : v.branches.filter((b) => p.branchIds.includes(b.id)).map((b) => b.name).join(", "));

/**
 * Plans and pricing (M01, M03): every plan the gym sells with its state, price with GST, length, branches and how many memberships are on it, a plan editor with the bill the member would
 * get, and what personal training costs. The owner edits; a branch manager reads. The open plan is in the address (?plan=), so a link opens it.
 */
export default function Plans() {
  const query = usePlans();
  return (
    <div className="max-w-6xl space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load the plans" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Plans and pricing</h1><SkeletonRows rows={6} /></>}>
        {(v) => <Loaded v={v} />}
      </QueryBoundary>
    </div>
  );
}

function Loaded({ v }: { v: PlansView }) {
  const [params, setParams] = useSearchParams();
  const filter: Filter = FILTERS.some((f) => f.id === params.get("show")) ? (params.get("show") as Filter) : "all";
  const open = params.get("plan");
  const selected = open && open !== "new" ? v.plans.find((p) => p.id === open) : undefined;
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(params); for (const [k, val] of Object.entries(patch)) (val ? n.set(k, val) : n.delete(k)); setParams(n, { replace: true }); };
  useShortcut("n", () => set({ plan: "new" }), v.canEdit);
  const rows = v.plans.filter((p) => (filter === "all" ? true : filter === "sale" ? p.state === "on_sale" : p.state !== "on_sale"));
  const columns: Array<Column<PlanRow>> = [
    { key: "name", header: "Plan", primary: true, cell: (p) => <span><span className="font-semibold">{p.name}</span><span className="block text-sm font-normal text-clay-muted">{KIND[p.kind]}</span></span> },
    { key: "price", header: "Price", cell: (p) => <span className="tabular">{formatRupees(p.pricePaise)}<span className="block text-sm text-clay-muted">{formatRupees(p.totalPaise)} with GST</span></span> },
    { key: "lasts", header: "Runs for", cell: (p) => lasts(p) },
    { key: "where", header: "Sold at", hideOnPhone: true, cell: (p) => where(p, v) },
    { key: "state", header: "Status", cell: (p) => <PlanStatePill state={p.state} /> },
    { key: "members", header: "In progress", align: "right", cell: (p) => <span className="tabular">{p.members}</span> },
    { key: "open", header: "", action: true, cell: (p) => <Button3D variant="white" size="md" onClick={() => set({ plan: p.id })} aria-label={`${v.canEdit ? "Edit" : "View"} ${p.name}`}>{v.canEdit ? "Edit" : "View"}</Button3D> },
  ];
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Plans and pricing</h1><p className="text-clay-muted">{v.canEdit ? "What the gym sells. A sale keeps the terms it was sold with, so changing a plan never changes a member who already bought it." : "What the gym sells. Only the owner can change plans."}</p></div>
        {v.canEdit && <Button3D variant="ember" size="md" onClick={() => set({ plan: "new" })}><Plus className="h-4 w-4" aria-hidden="true" />New plan</Button3D>}
      </header>
      {v.plans.length === 0 ? (
        <EmptyState icon={Tags} title="No plans yet" action={v.canEdit ? <Button3D variant="ember" size="md" onClick={() => set({ plan: "new" })}>Make a plan</Button3D> : undefined}>The front desk needs at least one plan on sale to register a member. Make a monthly plan to start.</EmptyState>
      ) : (
        <>
          <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => set({ show: f.id === "all" ? null : f.id })} className={cn("min-h-[2.75rem] cursor-pointer rounded-full border border-clay-line px-4 text-sm font-semibold", filter === f.id ? "bg-clay-ink text-white" : "bg-white hover:bg-clay-canvas")}>{f.label}</button>)}
          </div>
          {rows.length === 0 ? <EmptyState title="No plans here">{filter === "sale" ? "Nothing is on sale. Open a plan and choose Sell this plan again." : "Every plan is on sale."}</EmptyState> : <ResponsiveTable rows={rows} columns={columns} rowKey={(p) => p.id} caption="Plans" onRowClick={(p) => set({ plan: p.id })} />}
        </>
      )}
      <PtPricingCard view={v} />
      <Sheet open={open === "new" || !!selected} onClose={() => set({ plan: null })} label={selected ? `Plan: ${selected.name}` : "New plan"}>
        <PlanEditor key={selected?.id ?? "new"} plan={selected} view={v} onClose={() => set({ plan: null })} />
      </Sheet>
    </>
  );
}
