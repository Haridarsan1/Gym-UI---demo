import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { usePlanActions } from "@/api/ownerHooks";
import { isApiError } from "@/api/errors";
import type { PlanRow, PlansView } from "@/api/plans";
import { Button3D } from "@/design/Button3D";
import { Choice } from "@/design/Choice";
import { Field, inputClass } from "@/design/Field";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { GST_RATES_BP, gstLabel, planPreview, rupeesToPaise, validatePlan, type PlanDraft, type PlanErrors } from "@/domain/plans";
import { formatDate, formatRupees } from "@/lib/when";

/** What the owner types, as text, so half-typed numbers stay as typed. */
export interface Form {
  name: string;
  kind: PlanDraft["kind"];
  price: string;
  taxRateBp: number;
  days: string;
  visits: string;
  classes: string;
  ptCredits: string;
  from: string;
  to: string;
  branchIds: string[];
  cap: string;
  grace: string;
}

const text = (n: number | undefined | null) => (n === undefined || n === null ? "" : String(n));
const paiseText = (p: number) => String(p / 100);
export const formFor = (p: PlanRow | undefined, v: PlansView): Form =>
  p
    ? { name: p.name, kind: p.kind, price: paiseText(p.pricePaise), taxRateBp: p.taxRateBp, days: text(p.durationDays), visits: text(p.visits), classes: text(p.classEntitlements), ptCredits: text(p.ptCredits), from: p.effectiveFrom, to: p.effectiveTo ?? "", branchIds: p.branchIds, cap: p.maxDiscountBp === undefined ? "" : String(p.maxDiscountBp / 100), grace: text(p.graceDays) }
    : { name: "", kind: "time", price: "", taxRateBp: 1800, days: "30", visits: "", classes: "", ptCredits: "", from: v.today, to: "", branchIds: v.branches.map((b) => b.id), cap: "", grace: "" };

/** A whole number typed in a box: empty is “nothing”, and anything else that isn’t a whole number is NaN, which the rules refuse. */
const whole = (s: string): number | null => (s.trim() === "" ? null : /^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);
const percentBp = (s: string): number | null => (s.trim() === "" ? null : /^\d+(\.\d{1,2})?$/.test(s.trim()) ? Math.round(Number(s.trim()) * 100) : Number.NaN);

export const toDraft = (f: Form): PlanDraft => ({
  name: f.name, kind: f.kind, pricePaise: f.price.trim() === "" ? null : rupeesToPaise(f.price), taxRateBp: f.taxRateBp, durationDays: whole(f.days), visits: f.kind === "visit" ? whole(f.visits) : null,
  branchIds: f.branchIds, classEntitlements: whole(f.classes), ptCredits: whole(f.ptCredits), effectiveFrom: f.from, effectiveTo: f.to || null, maxDiscountBp: percentBp(f.cap), graceDays: whole(f.grace),
});

const KINDS: Array<{ kind: PlanDraft["kind"]; label: string; note: string }> = [
  { kind: "time", label: "Time-based", note: "Runs for a number of days." },
  { kind: "visit", label: "Visit pass", note: "A set number of visits within a time." },
  { kind: "trial", label: "Trial", note: "A short, usually free, first visit." },
];

/**
 * The plan editor (M01, M03): everything a plan has, with the bill the member would get shown as you type, built by the same rules as an invoice. For anyone who can’t edit it is the same
 * page read-only. A plan already sold is never changed by this: each sale kept the terms it was sold with.
 */
export function PlanEditor({ plan, view, onClose }: { plan: PlanRow | undefined; view: PlansView; onClose: () => void }) {
  const { save, onSale } = usePlanActions();
  const toast = useToast();
  const [f, setF] = useState<Form>(() => formFor(plan, view));
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [stopping, setStopping] = useState(false);
  const key = useRef(`plan-${crypto.randomUUID()}`);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const readOnly = !view.canEdit;
  const draft = toDraft(f);
  const errors: PlanErrors = useMemo(() => validatePlan(draft, { branchIds: view.branches.map((b) => b.id), otherNames: view.plans.filter((p) => p.id !== plan?.id).map((p) => p.name) }), [draft, view, plan?.id]);
  const shown = (k: keyof PlanErrors) => (tried ? errors[k] : undefined);
  const stateCode = view.branches.find((b) => f.branchIds.includes(b.id))?.stateCode ?? view.branches[0]?.stateCode ?? "27";
  const cap = draft.maxDiscountBp && Number.isFinite(draft.maxDiscountBp) ? draft.maxDiscountBp : undefined;
  const preview = planPreview(draft, { startsOn: view.today, stateCode, discountBp: cap });
  const priceOk = draft.pricePaise !== null && !errors.pricePaise;
  const pay = (label: string, paise: number, bold = false) => <div className={bold ? "flex justify-between gap-4 border-t border-clay-line pt-1 text-lg font-bold" : "flex justify-between gap-4"}><dt>{label}</dt><dd className="tabular">{formatRupees(paise)}</dd></div>;

  const submit = async () => {
    setTried(true);
    setFailure(undefined);
    if (Object.keys(errors).length > 0) return;
    try {
      const r = await save.mutateAsync({ ...draft, planId: plan?.id, key: key.current, name: f.name.trim() });
      toast({ title: r.created ? "Plan made" : "Plan saved", description: r.created ? `${r.plan.name} can be sold at ${r.plan.branchIds.length === view.branches.length ? "every branch" : `${r.plan.branchIds.length} of ${view.branches.length} branches`} from ${formatDate(r.plan.effectiveFrom)}.` : "Members who already have it keep the terms they bought. The change is in the audit log.", tone: "success" });
      onClose();
    } catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t save the plan. Try again."); }
  };
  const toggleSale = async () => {
    if (!plan) return;
    try {
      await onSale.mutateAsync({ planId: plan.id, on: plan.state === "off", key: `sale-${crypto.randomUUID()}` });
      toast({ title: plan.state === "off" ? "On sale again" : "Stopped selling", description: plan.state === "off" ? `${plan.name} is back on the desk’s list.` : `${plan.name} is off the desk’s list. ${plan.members} ${plan.members === 1 ? "member keeps" : "members keep"} it.`, tone: "success" });
      setStopping(false);
      onClose();
    } catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t change that. Try again."); setStopping(false); }
  };
  const days = f.kind === "visit" ? "Visits can be used within (days)" : f.kind === "trial" ? "Trial lasts (days)" : "Lasts (days)";
  const err = (k: keyof PlanErrors, id: string) => ({ "aria-invalid": shown(k) ? true : undefined, "aria-describedby": shown(k) ? `${id}-error` : undefined });

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label={plan ? `Plan: ${plan.name}` : "New plan"} className="flex min-h-full flex-col">
        <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div><h2 className="text-xl font-bold">{plan ? (readOnly ? plan.name : "Edit plan") : "New plan"}</h2>{plan && !readOnly && <p className="text-sm text-clay-muted">{plan.name}, {plan.members} {plan.members === 1 ? "membership" : "memberships"} in progress</p>}{readOnly && <p className="text-sm text-clay-muted">Only the owner can change plans.</p>}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-clay-canvas"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>
        <fieldset disabled={readOnly} className="min-w-0 flex-1 space-y-4 border-0 px-5 pb-4 pt-2">
          <Field label="Plan name" htmlFor="pl-name" error={shown("name")}><input id="pl-name" value={f.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} autoComplete="off" {...err("name", "pl-name")} data-autofocus /></Field>
          <fieldset>
            <legend className="text-sm font-semibold">Type</legend>
            <div className="mt-1 grid gap-2">
              {KINDS.map((k) => <Choice key={k.kind} type="radio" name="pl-kind" checked={f.kind === k.kind} onChange={() => set({ kind: k.kind, days: k.kind === "trial" ? "3" : f.kind === "trial" ? "30" : f.days, ...(k.kind === "trial" && f.price === "" ? { price: "0" } : {}) })} label={k.label} note={k.note} />)}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price before GST (₹)" htmlFor="pl-price" error={shown("pricePaise")}><input id="pl-price" inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} className={inputClass} {...err("pricePaise", "pl-price")} /></Field>
            <Field label="GST rate" htmlFor="pl-gst" error={shown("taxRateBp")}><select id="pl-gst" value={f.taxRateBp} onChange={(e) => set({ taxRateBp: Number(e.target.value) })} className={inputClass} {...err("taxRateBp", "pl-gst")}>{GST_RATES_BP.map((bp) => <option key={bp} value={bp}>{bp === 0 ? "No GST" : `${Number((bp / 100).toFixed(2))}%`}</option>)}</select></Field>
            <Field label={days} htmlFor="pl-days" error={shown("durationDays")}><input id="pl-days" inputMode="numeric" value={f.days} onChange={(e) => set({ days: e.target.value })} className={inputClass} {...err("durationDays", "pl-days")} /></Field>
            {f.kind === "visit" && <Field label="Visits included" htmlFor="pl-visits" error={shown("visits")}><input id="pl-visits" inputMode="numeric" value={f.visits} onChange={(e) => set({ visits: e.target.value })} className={inputClass} {...err("visits", "pl-visits")} /></Field>}
          </div>

          <section aria-label="What the member pays" aria-live="polite" className="rounded-2xl bg-clay-canvas p-4">
            <h3 className="font-bold">What the member pays</h3>
            {priceOk ? (
              <>
                <dl className="mt-2 space-y-1">
                  {pay("Price", preview.pricePaise)}
                  {preview.taxPaise > 0 ? <div className="flex justify-between gap-4 text-clay-muted"><dt>{gstLabel(f.taxRateBp)}<span className="block text-sm">{preview.taxSplit}</span></dt><dd className="tabular">{formatRupees(preview.taxPaise)}</dd></div> : <div className="flex justify-between gap-4 text-clay-muted"><dt>GST</dt><dd>None</dd></div>}
                  {pay("Total", preview.totalPaise, true)}
                </dl>
                {preview.atDiscount && <p className="mt-2 text-[0.95rem]">With the largest discount this plan allows ({Number((preview.atDiscount.bp / 100).toFixed(2))}%), the member pays <strong className="tabular">{formatRupees(preview.atDiscount.totalPaise)}</strong>, {formatRupees(preview.atDiscount.discountPaise)} less before GST.</p>}
                <p className="mt-2 text-[0.95rem] text-clay-muted">{f.kind === "visit" ? "Joining today:" : "Joining today, it covers"} {preview.covers}.{preview.includes.length > 0 && ` Includes ${preview.includes.join(" and ")}.`}</p>
                {plan && <p className="mt-1 text-sm text-clay-muted">Members who already bought this plan keep the price and terms they bought.</p>}
              </>
            ) : <p className="mt-1 text-[0.95rem] text-clay-muted">Enter the price to see the bill the member gets, with GST.</p>}
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Personal training sessions included" htmlFor="pl-pt" hint="Optional" error={shown("ptCredits")}><input id="pl-pt" inputMode="numeric" value={f.ptCredits} onChange={(e) => set({ ptCredits: e.target.value })} className={inputClass} {...err("ptCredits", "pl-pt")} /></Field>
            <Field label="Class bookings included" htmlFor="pl-classes" hint="Optional" error={shown("classEntitlements")}><input id="pl-classes" inputMode="numeric" value={f.classes} onChange={(e) => set({ classes: e.target.value })} className={inputClass} {...err("classEntitlements", "pl-classes")} /></Field>
            <Field label="On sale from" htmlFor="pl-from" error={shown("effectiveFrom")}><input id="pl-from" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} className={inputClass} {...err("effectiveFrom", "pl-from")} /></Field>
            <Field label="Last day on sale" htmlFor="pl-to" hint="Leave empty to keep selling" error={shown("effectiveTo")}><input id="pl-to" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} className={inputClass} {...err("effectiveTo", "pl-to")} /></Field>
          </div>

          <fieldset aria-describedby={shown("branchIds") ? "pl-branches-error" : undefined}>
            <legend className="text-sm font-semibold">Sold at</legend>
            <div className="mt-1 grid gap-2">
              {view.branches.map((b) => <Choice key={b.id} type="checkbox" checked={f.branchIds.includes(b.id)} onChange={(on) => set({ branchIds: on ? [...f.branchIds, b.id] : f.branchIds.filter((x) => x !== b.id) })} label={b.name} />)}
            </div>
            {shown("branchIds") && <p id="pl-branches-error" role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{shown("branchIds")}</p>}
          </fieldset>

          <Field label="Largest discount on this plan (%)" htmlFor="pl-cap" hint="Optional. It can only lower what a person is allowed to give." error={shown("maxDiscountBp")}>
            <input id="pl-cap" inputMode="decimal" value={f.cap} onChange={(e) => set({ cap: e.target.value })} className={inputClass} {...err("maxDiscountBp", "pl-cap")} />
            <p className="mt-1 text-sm text-clay-muted">{view.discountLimits.map((l) => `${l.label} up to ${Number((l.bp / 100).toFixed(2))}%`).join(", ")}{cap !== undefined ? `. On this plan nobody can give more than ${Number((cap / 100).toFixed(2))}%.` : ". With no limit here, each person’s own limit applies."}</p>
          </Field>
        </fieldset>
        {failure && <p role="alert" className="mx-5 mb-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
        <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-clay-line bg-white/95 px-5 py-3 backdrop-blur">
          {readOnly ? <Button3D type="button" variant="white" size="md" onClick={onClose}>Close</Button3D> : (
            <>
              <Button3D type="submit" variant="ember" size="md" disabled={save.isPending}>{save.isPending ? "Saving…" : plan ? "Save plan" : "Make plan"}</Button3D>
              <Button3D type="button" variant="white" size="md" onClick={onClose}>Cancel</Button3D>
              {plan && <button type="button" onClick={() => (plan.state === "off" ? void toggleSale() : setStopping(true))} className="ml-auto min-h-[2.75rem] cursor-pointer px-2 text-sm font-semibold underline underline-offset-2">{plan.state === "off" ? "Sell this plan again" : "Stop selling"}</button>}
            </>
          )}
        </footer>
      </form>
      <Sheet open={stopping} onClose={() => setStopping(false)} label="Stop selling this plan" kind="confirm">
        <div className="space-y-3 p-5">
          <h2 className="text-xl font-bold">Stop selling {plan?.name}?</h2>
          <p>The front desk can no longer sell it and members can no longer renew onto it. The {plan?.members ?? 0} {plan?.members === 1 ? "membership" : "memberships"} already on it carry on to their end date. You can sell it again at any time.</p>
          <div className="flex flex-wrap gap-3"><Button3D variant="ember" size="md" onClick={() => void toggleSale()} disabled={onSale.isPending}>Stop selling</Button3D><Button3D variant="white" size="md" onClick={() => setStopping(false)}>Keep selling</Button3D></div>
        </div>
      </Sheet>
    </>
  );
}
