import { useState } from "react";
import { Plus } from "lucide-react";
import { useAdminActions, useSaasPlans } from "@/api/adminHooks";
import type { SaasPlanRow } from "@/api/platform";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Choice } from "@/design/Choice";
import { Field, inputClass } from "@/design/Field";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { useToast } from "@/design/Toast";
import { featureKeys, validateSaasPlan, type PlanDraft } from "@/domain/platform";
import { FEATURE_LABEL } from "@/domain/subscription";
import { cn } from "@/lib/format";
import { formatRupees } from "@/lib/when";

const lim = (n: number | null) => (n === null ? "No limit" : String(n));

/** Ember’s plans (S02): the price, the limits on branches, staff and active members, and the features each includes. A change applies to every gym on the plan from then on, and each gym’s owner is told in their audit log. */
export default function SaasPlans() {
  const query = useSaasPlans();
  const [open, setOpen] = useState<SaasPlanRow | "new" | null>(null);
  return (
    <div className="max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">SaaS plans</h1><p className="max-w-[70ch] text-clay-muted">What Ember sells to gyms. Limits stop a gym adding more than its plan allows, and features decide what its owner can open.</p></div>
        <Button3D variant="ember" size="md" onClick={() => setOpen("new")}><Plus className="h-4 w-4" aria-hidden="true" />New plan</Button3D>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load the plans" skeleton={<SkeletonRows rows={4} />}>
        {(plans) => (
          <>
            <ul aria-label="Ember plans" className="grid gap-4 md:grid-cols-2">
              {plans.map((p) => (
                <li key={p.id} className={cn("clay flex flex-col p-4 sm:p-5", p.archived && "opacity-75")}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-xl font-bold">{p.name}{p.archived && <span className="ml-2 text-sm font-semibold text-clay-muted">Withdrawn</span>}</h2><p className="tabular text-clay-muted">{p.monthlyPaise === null ? "Agreed with the gym" : `${formatRupees(p.monthlyPaise)} a month before GST`}</p></div><Button3D variant="white" size="md" onClick={() => setOpen(p)} aria-label={`Edit ${p.name}`}>Edit</Button3D></div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-clay-canvas p-2"><dt className="text-xs text-clay-muted">Branches</dt><dd className="tabular font-bold">{lim(p.limits.branches)}</dd></div><div className="rounded-2xl bg-clay-canvas p-2"><dt className="text-xs text-clay-muted">Staff</dt><dd className="tabular font-bold">{lim(p.limits.staff)}</dd></div><div className="rounded-2xl bg-clay-canvas p-2"><dt className="text-xs text-clay-muted">Active members</dt><dd className="tabular font-bold">{lim(p.limits.activeMembers)}</dd></div></dl>
                  <p className="mt-3 text-[0.95rem] text-clay-muted">{p.features.includes("everything") ? "Everything, with a custom agreement." : p.features.map((f) => FEATURE_LABEL[f] ?? f).join(", ")}.</p>
                  <p className="mt-auto pt-3 text-sm"><span className="font-semibold">{p.gyms.length}</span> {p.gyms.length === 1 ? "gym" : "gyms"} on it{p.gyms.length ? `: ${p.gyms.map((g) => g.name).join(", ")}` : ""}</p>
                  {!p.archived && p.gyms.length === 0 && <ArchiveButton plan={p} />}
                  {p.archived && <ArchiveButton plan={p} restore />}
                </li>
              ))}
            </ul>
            <Sheet open={open !== null} onClose={() => setOpen(null)} label={open && open !== "new" ? `Plan: ${open.name}` : "New plan"}>{open && <PlanEditor key={open === "new" ? "new" : open.id} plan={open === "new" ? undefined : open} others={plans.filter((p) => open === "new" || p.id !== open.id).map((p) => p.name)} onClose={() => setOpen(null)} />}</Sheet>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}

function ArchiveButton({ plan, restore }: { plan: SaasPlanRow; restore?: boolean }) {
  const { archive } = useAdminActions();
  const toast = useToast();
  return <button type="button" disabled={archive.isPending} onClick={() => void archive.mutateAsync({ planId: plan.id, archived: !restore }).then(() => toast({ title: restore ? "Offered again" : "Withdrawn", description: restore ? `${plan.name} can be chosen for gyms again.` : `${plan.name} is no longer offered to new gyms.`, tone: "success" })).catch((e) => toast({ title: "Not done", description: isApiError(e) ? e.message : "Try again.", tone: "error" }))} className="mt-2 min-h-[2.75rem] cursor-pointer self-start text-sm font-semibold underline underline-offset-2">{restore ? "Offer again" : "Withdraw from sale"}</button>;
}

function PlanEditor({ plan, others, onClose }: { plan?: SaasPlanRow; others: string[]; onClose: () => void }) {
  const { savePlan } = useAdminActions();
  const toast = useToast();
  const [d, setD] = useState<PlanDraft>({ name: plan?.name ?? "", monthlyRupees: plan?.monthlyPaise != null ? String(plan.monthlyPaise / 100) : "", branches: plan?.limits.branches?.toString() ?? "", staff: plan?.limits.staff?.toString() ?? "", activeMembers: plan?.limits.activeMembers?.toString() ?? "", features: plan?.features ?? ["memberships", "invoices"], blurb: plan?.blurb ?? "" });
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [key] = useState(() => `splan-${crypto.randomUUID()}`);
  const errors = validateSaasPlan(d, others);
  const set = (p: Partial<PlanDraft>) => setD((x) => ({ ...x, ...p }));
  const submit = async () => {
    setTried(true); setFailure(undefined);
    if (Object.keys(errors).length) return;
    try { await savePlan.mutateAsync({ key, planId: plan?.id, ...d }); toast({ title: plan ? "Plan saved" : "Plan made", description: plan && plan.gyms.length ? `${plan.gyms.length} ${plan.gyms.length === 1 ? "gym is" : "gyms are"} on it and follow the change now. Their owners can see it in their audit log.` : undefined, tone: "success" }); onClose(); }
    catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t save the plan. Try again."); }
  };
  const e = (k: keyof typeof errors) => (tried ? errors[k] : undefined);
  return (
    <form onSubmit={(ev) => { ev.preventDefault(); void submit(); }} noValidate aria-label={plan ? `Plan: ${plan.name}` : "New plan"} className="flex min-h-full flex-col">
      <header className="px-5 pb-2 pt-5"><h2 className="text-xl font-bold">{plan ? `Edit ${plan.name}` : "New plan"}</h2>{plan && plan.gyms.length > 0 && <p className="text-sm text-clay-muted">{plan.gyms.length} {plan.gyms.length === 1 ? "gym is" : "gyms are"} on this plan. Changes apply to {plan.gyms.length === 1 ? "it" : "them"} at once.</p>}</header>
      <div className="min-w-0 flex-1 space-y-4 px-5 pb-4 pt-2">
        <Field label="Name" htmlFor="sp-name" error={e("name")}><input id="sp-name" value={d.name} onChange={(x) => set({ name: x.target.value })} className={inputClass} data-autofocus autoComplete="off" /></Field>
        <Field label="Price a month before GST (₹)" htmlFor="sp-price" hint="Leave empty for “agreed with the gym”." error={e("monthlyRupees")}><input id="sp-price" inputMode="decimal" value={d.monthlyRupees} onChange={(x) => set({ monthlyRupees: x.target.value })} className={inputClass} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Branches" htmlFor="sp-branches" hint="Empty: no limit" error={e("branches")}><input id="sp-branches" inputMode="numeric" value={d.branches} onChange={(x) => set({ branches: x.target.value })} className={inputClass} /></Field>
          <Field label="Staff accounts" htmlFor="sp-staff" hint="Empty: no limit" error={e("staff")}><input id="sp-staff" inputMode="numeric" value={d.staff} onChange={(x) => set({ staff: x.target.value })} className={inputClass} /></Field>
          <Field label="Active members" htmlFor="sp-members" hint="Empty: no limit" error={e("activeMembers")}><input id="sp-members" inputMode="numeric" value={d.activeMembers} onChange={(x) => set({ activeMembers: x.target.value })} className={inputClass} /></Field>
        </div>
        <fieldset><legend className="text-sm font-semibold">Features</legend><div className="mt-1 grid gap-2">{featureKeys.map((f) => <Choice key={f} type="checkbox" checked={d.features.includes(f)} onChange={(on) => set({ features: on ? [...d.features, f] : d.features.filter((x) => x !== f) })} label={FEATURE_LABEL[f] ?? f} />)}</div>{e("features") && <p role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{e("features")}</p>}</fieldset>
        <Field label="A line about it" htmlFor="sp-blurb"><input id="sp-blurb" value={d.blurb} onChange={(x) => set({ blurb: x.target.value })} className={inputClass} /></Field>
      </div>
      {failure && <p role="alert" className="mx-5 mb-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
      <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-clay-line bg-white/95 px-5 py-3 backdrop-blur"><Button3D type="submit" variant="ember" size="md" disabled={savePlan.isPending}>{savePlan.isPending ? "Saving…" : "Save plan"}</Button3D><Button3D type="button" variant="white" size="md" onClick={onClose}>Cancel</Button3D></footer>
    </form>
  );
}
