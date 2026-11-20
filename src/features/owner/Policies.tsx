import { useMemo, useRef, useState } from "react";
import { usePolicies, usePolicyActions } from "@/api/ownerHooks";
import type { PoliciesView } from "@/api/policyScreen";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { useToast } from "@/design/Toast";
import { POLICY_DEFS, POLICY_GROUPS, policyChanges, validatePolicies, type PolicyDef, type PolicyKey, type PolicyValues } from "@/domain/policies";
import { rupeesToPaise } from "@/domain/plans";
import { formatDate, formatTime } from "@/lib/when";
import { istDateOf } from "@/domain/dates";
import { PolicyRow } from "@/features/owner/policies/PolicyRow";

const paiseText = (p: number) => String(p / 100);
const textOf = (d: PolicyDef, v: number | boolean) => (d.input.kind === "rupees" ? paiseText(v as number) : String(v));
/** What was typed as a number: a whole number, or NaN, which the rules refuse. Rupees become paise. */
const parse = (d: PolicyDef, t: string): number => (d.input.kind === "rupees" ? (rupeesToPaise(t) ?? Number.NaN) : /^\d+$/.test(t.trim()) ? Number(t.trim()) : Number.NaN);

/**
 * Policies (M02, M05, T04, O02): every value the gym can set, in groups, each with what it does in plain words and an example worked from the numbers as they stand on screen, made by the same
 * rules the app runs. The owner changes them (a review lists each from and to, and the change is audited); a branch manager reads them. A change is in force from the moment it is saved.
 */
export default function Policies() {
  const query = usePolicies();
  return (
    <div className="max-w-6xl space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load the policies" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Policies</h1><SkeletonRows rows={6} /></>}>
        {(v) => <Loaded key={JSON.stringify(v.values)} v={v} />}
      </QueryBoundary>
    </div>
  );
}

function Loaded({ v }: { v: PoliciesView }) {
  const { save } = usePolicyActions();
  const toast = useToast();
  const readOnly = !v.canEdit;
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() => Object.fromEntries(POLICY_DEFS.map((d) => [d.key, d.input.kind === "toggle" ? (v.values[d.key] as boolean) : textOf(d, v.values[d.key])])));
  const [reviewing, setReviewing] = useState(false);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string>();
  const key = useRef(`policy-${crypto.randomUUID()}`);

  /** The numbers as typed; a box that isn’t a valid number keeps the saved value for the example, and says so under the box. */
  const typed = useMemo(() => {
    const out = { ...v.values } as Record<PolicyKey, number | boolean>;
    for (const d of POLICY_DEFS) out[d.key] = d.input.kind === "toggle" ? (draft[d.key] as boolean) : parse(d, draft[d.key] as string);
    return out as PolicyValues;
  }, [draft, v.values]);
  const errors = validatePolicies(typed);
  /** Values the examples are worked from: what is typed, unless that box has a value that isn’t in its range. */
  const shown = useMemo(() => {
    const out = { ...typed } as Record<PolicyKey, number | boolean>;
    for (const d of POLICY_DEFS) {
      const t = typed[d.key];
      const bad = d.input.kind !== "toggle" && (typeof t !== "number" || !Number.isInteger(t) || t < (d.input.kind === "number" ? d.input.min : 0) || t > d.input.max);
      if (bad) out[d.key] = v.values[d.key];
    }
    return out as PolicyValues;
  }, [typed, v.values]);
  const changes = policyChanges(v.values, shown);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = POLICY_DEFS.some((d) => (d.input.kind === "toggle" ? draft[d.key] !== v.values[d.key] : draft[d.key] !== textOf(d, v.values[d.key])));

  const submit = async () => {
    setFailure(undefined);
    try {
      const r = await save.mutateAsync({ key: key.current, changes: Object.fromEntries(changes.map((c) => [c.key, shown[c.key]])), reason: reason.trim() || undefined });
      toast({ title: "Policies saved", description: `${r.changed.length} ${r.changed.length === 1 ? "setting" : "settings"} changed and in force now. The change is in the audit log.`, tone: "success" });
      setReviewing(false);
    } catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t save the policies. Try again."); }
  };

  return (
    <>
      <header>
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Policies</h1>
        <p className="text-clay-muted">{readOnly ? "How this gym runs bookings, freezes, cancellations and entry. Only the owner can change them." : "How this gym runs bookings, freezes, cancellations and entry. A change is in force as soon as it is saved. Each setting shows an example that follows what you type."}</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="space-y-5">
          {POLICY_GROUPS.map((g) => (
            <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="clay scroll-mt-4 p-4 sm:p-5">
              <h2 id={`${g.id}-title`} className="text-lg font-bold">{g.title}</h2>
              <p className="mb-3 text-[0.95rem] text-clay-muted">{g.summary}</p>
              <ul aria-label={g.title} className="divide-y divide-clay-line">
                {POLICY_DEFS.filter((d) => d.group === g.id).map((d) => (
                  <PolicyRow key={d.key} def={d} text={typeof draft[d.key] === "string" ? (draft[d.key] as string) : ""} value={shown[d.key]} stored={v.values[d.key]} example={d.example(shown, { today: v.today })} error={errors[d.key]} readOnly={readOnly}
                    onText={(t) => setDraft((x) => ({ ...x, [d.key]: t }))} onToggle={(on) => setDraft((x) => ({ ...x, [d.key]: on }))} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <aside aria-label="About these settings" className="space-y-4 lg:sticky lg:top-4">
          <nav aria-label="Groups" className="clay hidden p-4 lg:block">
            <h2 className="font-bold">On this page</h2>
            <ul className="mt-2 space-y-1">{POLICY_GROUPS.map((g) => <li key={g.id}><a href={`#${g.id}`} className="inline-flex min-h-[2.25rem] items-center text-[0.95rem] font-semibold underline underline-offset-4">{g.title}</a></li>)}</ul>
          </nav>
          <section aria-labelledby="hist-title" className="clay p-4">
            <h2 id="hist-title" className="font-bold">Recent changes</h2>
            {v.history.length === 0 ? <p className="mt-1 text-[0.95rem] text-clay-muted">No changes yet. The values on this page are the ones the gym started with.</p> : (
              <ol aria-label="Recent changes" className="mt-2 divide-y divide-clay-line">
                {v.history.map((h) => (
                  <li key={h.id} className="py-3 first:pt-1 last:pb-0">
                    <p className="text-sm text-clay-muted">{formatDate(istDateOf(h.at))}, {formatTime(h.at)}</p>
                    <p className="font-semibold">{h.by}</p>
                    <ul className="mt-1 space-y-0.5 text-[0.95rem]">{h.changes.map((c) => <li key={c.key}>{c.label}: {c.from} to {c.to}</li>)}</ul>
                    {h.reason && <p className="mt-1 text-sm text-clay-muted">“{h.reason}”</p>}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-2 text-sm text-clay-muted">Every change is also kept in the audit log.</p>
          </section>
        </aside>
      </div>

      {!readOnly && dirty && (
        <div role="region" aria-label="Unsaved changes" className="sticky bottom-0 z-30 -mx-4 flex flex-wrap items-center gap-3 border-t border-clay-line bg-clay-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
          <p className="min-w-0 flex-1 font-semibold">{hasErrors ? "Fix the settings marked in red to save." : `${changes.length} ${changes.length === 1 ? "change" : "changes"} not saved`}</p>
          <Button3D variant="white" size="md" onClick={() => setDraft(Object.fromEntries(POLICY_DEFS.map((d) => [d.key, d.input.kind === "toggle" ? (v.values[d.key] as boolean) : textOf(d, v.values[d.key])])))}>Discard</Button3D>
          <Button3D variant="ember" size="md" disabled={hasErrors || changes.length === 0} onClick={() => setReviewing(true)}>Review and save</Button3D>
        </div>
      )}

      <Sheet open={reviewing} onClose={() => setReviewing(false)} label="Review policy changes" kind="confirm">
        <div className="space-y-3 p-5">
          <h2 className="text-xl font-bold">Save {changes.length} {changes.length === 1 ? "change" : "changes"}?</h2>
          <p className="text-clay-muted">They apply to everyone straight away and are written to the audit log with your name.</p>
          <ul aria-label="What will change" className="divide-y divide-clay-line rounded-2xl bg-clay-canvas px-4">{changes.map((c) => <li key={c.key} className="py-2.5"><span className="font-semibold">{c.label}</span><span className="block text-[0.95rem]">{c.from} <span aria-hidden="true">→</span><span className="sr-only">to</span> <strong>{c.to}</strong></span></li>)}</ul>
          <label className="block"><span className="text-sm font-semibold">Reason (optional)</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="clay-flat mt-1 min-h-[2.75rem] w-full px-3 outline-none focus-visible:ring-2 focus-visible:ring-ember-300" placeholder="Why the gym is changing it" /></label>
          {failure && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
          <div className="flex flex-wrap gap-3"><Button3D variant="ember" size="md" disabled={save.isPending} onClick={() => void submit()}>{save.isPending ? "Saving…" : `Save ${changes.length === 1 ? "change" : "changes"}`}</Button3D><Button3D variant="white" size="md" onClick={() => setReviewing(false)}>Keep editing</Button3D></div>
        </div>
      </Sheet>
    </>
  );
}
