import { UserCog, UserPlus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useStaff } from "@/api/ownerHooks";
import type { StaffRow, StaffView } from "@/api/staff";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { StaffStatusPill } from "@/design/StatusPills";
import { useShortcut } from "@/design/useShortcut";
import { ResponsiveTable, type Column } from "@/design/layout/ResponsiveTable";
import { useBranch } from "@/design/shells/BranchContext";
import { ROLE_LABEL } from "@/domain/roles";
import { limitsThatApply, type StaffRoleName } from "@/domain/staffRules";
import { cn } from "@/lib/format";
import { formatRupees } from "@/lib/when";
import { StaffEditor } from "@/features/owner/staff/StaffEditor";

const FILTERS: Array<{ id: string; label: string; roles?: StaffRoleName[] }> = [
  { id: "all", label: "Everyone" }, { id: "managers", label: "Managers", roles: ["owner", "branch_manager"] }, { id: "desk", label: "Front desk", roles: ["front_desk"] }, { id: "finance", label: "Finance", roles: ["finance"] }, { id: "trainers", label: "Trainers", roles: ["trainer"] },
];

/** A short line of what a person’s limits allow, for the list: “Refunds to ₹50,000 · Discounts to 10% · Overrides 2 a day”. */
function access(p: StaffRow): string {
  const a = limitsThatApply(p.role);
  const out: string[] = [];
  if (a.refund) out.push(p.limits.refundLimitPaise === null ? "Refunds: any size" : p.limits.refundLimitPaise === 0 ? "No refunds" : `Refunds to ${formatRupees(p.limits.refundLimitPaise)}`);
  if (a.discount && p.limits.maxDiscountBp > 0) out.push(`Discounts to ${Number((p.limits.maxDiscountBp / 100).toFixed(2))}%`);
  if (a.override && p.limits.canOverrideCheckIn) out.push(p.limits.maxOverridesPerDay == null ? "Overrides" : `Overrides ${p.limits.maxOverridesPerDay} a day`);
  if (a.health && p.limits.canViewClientHealth) out.push("Client health");
  if (a.frontline && p.limits.canManageFrontline) out.push("Manages front desk and trainers");
  return out.join(" · ") || (p.role === "trainer" ? "Own clients" : "");
}

/**
 * Staff and roles (R02, S03): everyone who works at the gym, what they may do, and who may change it. The owner invites and changes anyone; a branch manager the owner has allowed does so for
 * front desk and trainers at their own branches; anyone else with access reads. The open person is in the address (?person=, or ?invite=1), so a link opens them.
 */
export default function Staff() {
  const query = useStaff();
  return (
    <div className="max-w-6xl space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load the staff" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Staff and roles</h1><SkeletonRows rows={6} /></>}>
        {(v) => <Loaded v={v} />}
      </QueryBoundary>
    </div>
  );
}

function Loaded({ v }: { v: StaffView }) {
  const { branchId } = useBranch();
  const [params, setParams] = useSearchParams();
  const canInvite = v.authority.scope !== "none";
  const filter = FILTERS.find((f) => f.id === params.get("show")) ?? FILTERS[0]!;
  const person = params.get("person");
  const selected = person ? v.staff.find((s) => s.userId === person) : undefined;
  const inviting = params.get("invite") === "1";
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(params); for (const [k, val] of Object.entries(patch)) (val ? n.set(k, val) : n.delete(k)); setParams(n, { replace: true }); };
  useShortcut("n", () => set({ invite: "1", person: null }), canInvite);
  const rows = v.staff.filter((s) => (!filter.roles || filter.roles.includes(s.role)) && (branchId === "all" || s.role === "owner" || s.branchIds.includes(branchId)));
  const columns: Array<Column<StaffRow>> = [
    { key: "name", header: "Person", primary: true, cell: (p) => <span><span className="font-semibold">{p.name}</span>{p.you && <span className="ml-1.5 text-sm font-normal text-clay-muted">(you)</span>}{p.email && <span className="block text-sm font-normal text-clay-muted">{p.email}</span>}</span> },
    { key: "role", header: "Role", cell: (p) => ROLE_LABEL[p.role] },
    { key: "where", header: "Works at", cell: (p) => (p.role === "owner" ? "Every branch" : p.branchNames.join(", ")) },
    { key: "access", header: "What they may do", hideOnPhone: true, cell: (p) => <span className="text-[0.95rem]">{access(p)}</span> },
    { key: "status", header: "Status", cell: (p) => <StaffStatusPill status={p.status} /> },
    { key: "open", header: "", action: true, cell: (p) => <Button3D variant="white" size="md" onClick={() => set({ person: p.userId, invite: null })} aria-label={`${p.manage.ok || p.you ? "Edit" : "View"} ${p.name}`}>{p.manage.ok || p.you ? "Edit" : "View"}</Button3D> },
  ];
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Staff and roles</h1>
          <p className="max-w-[70ch] text-clay-muted">{v.authority.scope === "all" ? "Everyone who works at the gym. Invite people, set what each may do, and switch off an account when someone leaves. Changes apply from the person’s next action and are in the audit log." : v.authority.scope === "frontline" ? "Staff at your branches. The owner has allowed you to invite and manage front desk and trainers at your own branches, within your own limits. Everyone else here you can see but not change." : "Staff at your branches. You can see them, but only the owner can invite or change staff. Ask the owner to allow you to manage front desk and trainers."}</p>
        </div>
        {canInvite && <Button3D variant="ember" size="md" onClick={() => set({ invite: "1", person: null })}><UserPlus className="h-4 w-4" aria-hidden="true" />Invite staff</Button3D>}
      </header>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter.id === f.id} onClick={() => set({ show: f.id === "all" ? null : f.id })} className={cn("min-h-[2.75rem] cursor-pointer rounded-full border border-clay-line px-4 text-sm font-semibold", filter.id === f.id ? "bg-clay-ink text-white" : "bg-white hover:bg-clay-canvas")}>{f.label}</button>)}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={UserCog} title="No one here" action={canInvite ? <Button3D variant="ember" size="md" onClick={() => set({ invite: "1" })}>Invite staff</Button3D> : undefined}>{filter.id === "all" ? "No staff work at this branch yet." : "No one in this group works at this branch."}</EmptyState>
      ) : <ResponsiveTable rows={rows} columns={columns} rowKey={(p) => p.userId} caption="Staff" onRowClick={(p) => set({ person: p.userId, invite: null })} />}
      <Sheet open={inviting || !!selected} onClose={() => set({ person: null, invite: null })} label={selected ? `Staff: ${selected.name}` : "Invite staff"}>
        <StaffEditor key={selected?.userId ?? "new"} row={selected} view={v} onClose={() => set({ person: null, invite: null })} />
      </Sheet>
    </>
  );
}
