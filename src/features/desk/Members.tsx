import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useMembers } from "@/api/hooks";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { MembershipStatusPill } from "@/design/StatusPills";
import { ResponsiveTable } from "@/design/layout/ResponsiveTable";
import { useBranch } from "@/design/shells/BranchContext";
import { formatDate } from "@/lib/when";
import { cn } from "@/lib/format";

const STATUSES = ["all", "active", "frozen", "expired", "canceled", "scheduled", "pending"] as const;

/** Members (M02): every member at the branches the person works in, searched by name or phone and filtered by status. A row opens the profile. */
export default function Members() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { branchId } = useBranch();
  const q = params.get("q") ?? "";
  const s = (STATUSES as readonly string[]).includes(params.get("status") ?? "") ? (params.get("status") as (typeof STATUSES)[number]) : "all";
  const query = useMembers({ search: q, status: s === "all" ? undefined : s, branchId: branchId === "all" ? undefined : branchId, pageSize: 100 });
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); setParams(n, { replace: true }); };
  return (
    <div className="space-y-4">
      <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Members</h1>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[14rem] flex-1 sm:max-w-md">
          <span className="sr-only">Search members</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-clay-muted" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => set({ q: e.target.value })} placeholder="Name or phone number" className="h-12 w-full rounded-2xl border border-clay-line bg-white pl-11 pr-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
        </label>
        <div role="radiogroup" aria-label="Membership status" className="flex flex-wrap gap-2">
          {STATUSES.map((x) => <button key={x} type="button" role="radio" aria-checked={s === x} onClick={() => set({ status: x === "all" ? "" : x })} className={cn("min-h-[2.75rem] cursor-pointer rounded-full px-4 text-sm font-semibold capitalize", s === x ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{x === "all" ? "All" : x}</button>)}
        </div>
      </div>
      <QueryBoundary query={query} errorTitle="We couldn’t load the members" skeleton={<SkeletonRows rows={8} />}>
        {(page) =>
          page.rows.length === 0 ? <EmptyState title="No members match">Clear the search or the status filter to see everyone.</EmptyState> : (
            <>
              <p className="text-sm text-clay-muted" aria-live="polite">{page.total} {page.total === 1 ? "member" : "members"}{page.total > page.rows.length ? `, showing ${page.rows.length}` : ""}</p>
              <ResponsiveTable
                caption="Members"
                rows={page.rows}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/desk/members/${r.id}`)}
                columns={[
                  { key: "name", header: "Name", primary: true, cell: (r) => <span className="font-semibold">{r.name}</span> },
                  { key: "phone", header: "Phone", cell: (r) => r.phone },
                  { key: "branch", header: "Branch", cell: (r) => r.branchName },
                  { key: "plan", header: "Plan", cell: (r) => r.planName ?? "None" },
                  { key: "status", header: "Status", cell: (r) => (r.membershipStatus === "none" ? "No membership" : <MembershipStatusPill status={r.membershipStatus} />) },
                  { key: "ends", header: "Ends", hideOnPhone: true, cell: (r) => (r.endsOn ? formatDate(r.endsOn) : "") },
                  { key: "trainer", header: "Trainer", hideOnPhone: true, cell: (r) => r.trainerName ?? "" },
                  // A real link for keyboards and screen readers; on phones the whole card opens the profile.
                  { key: "open", header: "", hideOnPhone: true, cell: (r) => <Link to={`/desk/members/${r.id}`} onClick={(e) => e.stopPropagation()} aria-label={`Open ${r.name}`} className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center font-bold text-ember-700 underline underline-offset-4">Open</Link> },
                ]}
              />
            </>
          )
        }
      </QueryBoundary>
    </div>
  );
}
