import { Link } from "react-router-dom";
import { AlertTriangle, Users } from "lucide-react";
import type { DuplicateCheck, WizardOptions } from "@/api/newMember";
import { Switch } from "@/design/Switch";
import { Field, inputClass } from "@/features/trainer/assessment/fields";
import { invoiceTotals } from "@/domain/billing";
import { formatDate, formatRupees } from "@/lib/when";
import { cn } from "@/lib/format";
import { rupeesToPaise, type Draft } from "@/features/desk/newmember/draft";

type Set = (patch: Partial<Draft>) => void;
const input = inputClass;

/** Step 1: who they are. A phone number or an email that already belongs to a member stops the registration; the same name is a warning. */
export function DetailsStep({ d, set, dup, errors }: { d: Draft; set: Set; dup?: DuplicateCheck; errors: Record<string, string> }) {
  const v = d.details;
  const up = (patch: Partial<Draft["details"]>) => set({ details: { ...v, ...patch }, notADuplicate: false, sharesWith: [] });
  return (
    <div className="space-y-4">
      {dup && dup.sharing.length > 0 && (
        <div role="alert" aria-label="This phone number or email is already used" className="rounded-2xl bg-status-pending-bg p-4 text-status-pending-fg">
          <p className="flex items-center gap-2 font-bold"><Users className="h-5 w-5" aria-hidden="true" />A member already has this {dup.sharing.some((m) => m.match === "phone") ? "phone number" : "email address"}</p>
          <ul className="mt-2 space-y-1">
            {dup.sharing.map((m) => (
              <li key={m.memberId}><span className="font-semibold">{m.name}</span> ({m.branchName}{m.status ? `, ${m.status}` : ""}) has this {m.match === "phone" ? "phone number" : "email address"}.</li>
            ))}
          </ul>
          <p className="mt-2 text-sm">Families often share one number. Is this the same person, or someone else?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/desk/members/${dup.sharing[0]!.memberId}`} className="inline-flex min-h-[2.75rem] items-center rounded-2xl bg-white px-4 font-bold text-clay-ink hover:bg-clay-canvas">Same person: open their profile</Link>
            <button type="button" role="radio" aria-checked={dup.sharing.every((m) => d.sharesWith.includes(m.memberId))} onClick={() => set({ sharesWith: dup.sharing.map((m) => m.memberId) })} className={cn("min-h-[2.75rem] cursor-pointer rounded-2xl border-2 px-4 font-bold", dup.sharing.every((m) => d.sharesWith.includes(m.memberId)) ? "border-ember-600 bg-ember-50 text-clay-ink" : "border-clay-ink/20 bg-white text-clay-ink hover:bg-clay-canvas")}>Different person sharing this number</button>
          </div>
          {dup.sharing.every((m) => d.sharesWith.includes(m.memberId)) && <p className="mt-2 text-sm font-semibold">Noted. This is recorded on the new member, and at login they choose their own profile.</p>}
        </div>
      )}
      {dup && dup.warnings.length > 0 && (
        <div role="alert" className="rounded-2xl bg-status-pending-bg p-4 text-status-pending-fg">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5" aria-hidden="true" />A member with this name already exists</p>
          <ul className="mt-2 space-y-1">
            {dup.warnings.map((m) => (
              <li key={m.memberId}><span className="font-semibold">{m.name}</span>, {m.phone}, {m.branchName}{m.status ? `, ${m.status}` : ""}. <Link to={`/desk/members/${m.memberId}`} className="font-bold underline underline-offset-4">Open their profile</Link></li>
            ))}
          </ul>
          <label className="mt-3 flex min-h-[2.75rem] cursor-pointer items-center gap-3 font-semibold">
            <input type="checkbox" checked={d.notADuplicate} onChange={(e) => set({ notADuplicate: e.target.checked })} className="h-5 w-5" />
            This is a different person
          </label>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="nm-name" error={errors.name}><input id="nm-name" autoFocus value={v.name} onChange={(e) => up({ name: e.target.value })} autoComplete="off" className={input} /></Field>
        <Field label="Mobile number" htmlFor="nm-phone" hint="10 digits. It is how they sign in." error={errors.phone}><input id="nm-phone" inputMode="tel" value={v.phone} onChange={(e) => up({ phone: e.target.value })} autoComplete="off" className={input} /></Field>
        <Field label="Email" htmlFor="nm-email" hint="Their pass and receipts go here. Leave empty if they have none." error={errors.email}><input id="nm-email" type="email" value={v.email} onChange={(e) => up({ email: e.target.value })} autoComplete="off" className={input} /></Field>
        <Field label="Date of birth" htmlFor="nm-dob" error={errors.dateOfBirth}><input id="nm-dob" type="date" value={v.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => up({ dateOfBirth: e.target.value })} className={input} /></Field>
        <Field label="Gender" htmlFor="nm-gender">
          <select id="nm-gender" value={v.gender} onChange={(e) => up({ gender: e.target.value })} className={input}>
            <option value="">Not said</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="undisclosed">Prefer not to say</option>
          </select>
        </Field>
        <Field label="How did they hear about the gym?" htmlFor="nm-source" hint="The lead source, for reports.">
          <select id="nm-source" value={v.leadSource} onChange={(e) => up({ leadSource: e.target.value })} className={input}>
            <option value="">Not said</option>{["Walk-in", "Referral", "Instagram", "Google search", "Flyer or hoarding", "Corporate tie-up", "Trial"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Emergency contact name" htmlFor="nm-em"><input id="nm-em" value={v.emergencyName} onChange={(e) => up({ emergencyName: e.target.value })} autoComplete="off" className={input} /></Field>
        <Field label="Emergency contact mobile" htmlFor="nm-emp" error={errors.emergencyPhone}><input id="nm-emp" inputMode="tel" value={v.emergencyPhone} onChange={(e) => up({ emergencyPhone: e.target.value })} autoComplete="off" className={input} /></Field>
      </div>
    </div>
  );
}

const CONSENTS = [
  { key: "data" as const, title: "Using their details", text: "The gym keeps their name, contact details and attendance to run the membership. Required.", required: true },
  { key: "photos" as const, title: "Progress photos", text: "Their trainer can keep photos to show progress. Only they and their trainer can see them, never the front desk or finance." },
  { key: "assessments" as const, title: "Assessments", text: "Their trainer can record a fitness assessment and goals. They can turn this off later and the records are hidden." },
  { key: "marketing" as const, title: "Offers and news", text: "The gym may email offers and news. Receipts and booking emails are always sent." },
];

/** Step 2: what they agree to, in plain words. Only the first is required. */
export function ConsentStep({ d, set, notice }: { d: Draft; set: Set; notice: string }) {
  return (
    <div className="space-y-3">
      <p className="text-clay-muted">Read these out or let them read them. Each can be changed by the member later, in their app or at the desk. Privacy notice version {notice}.</p>
      <ul className="divide-y divide-clay-line rounded-2xl bg-white">
        {CONSENTS.map((c) => (
          <li key={c.key} className="p-4">
            {c.required ? <Switch checked disabled label={c.title} description={c.text} onChange={() => undefined} /> : <Switch checked={d.consents[c.key as "photos" | "assessments" | "marketing"]} label={c.title} description={c.text} onChange={(on) => set({ consents: { ...d.consents, [c.key]: on } })} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

const KIND = { time: "Time-based", visit: "Visit pass", trial: "Free trial" } as const;

/** Step 3: the plan. The terms shown are the terms copied into the membership. */
export function PlanStep({ d, set, o }: { d: Draft; set: Set; o: WizardOptions }) {
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-2">
        {o.plans.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={d.planId === p.id} onClick={() => set({ planId: p.id, amount: "" })} className={cn("min-h-[3.5rem] cursor-pointer rounded-2xl border-2 p-4 text-left", d.planId === p.id ? "border-ember-600 bg-ember-50" : "border-clay-line bg-white hover:bg-clay-canvas")}>
            <span className="flex items-baseline justify-between gap-2"><span className="font-bold">{p.name}</span><span className="font-display text-2xl font-extrabold tabular">{p.totalPaise === 0 ? "Free" : formatRupees(p.totalPaise)}</span></span>
            <span className="block text-sm text-clay-muted">{KIND[p.kind]}{p.durationDays ? `, ${p.durationDays} days` : ""}{p.visits ? `, ${p.visits} visits` : ""}{p.ptCredits ? `, ${p.ptCredits} training sessions` : ""}{p.classEntitlements ? `, ${p.classEntitlements} classes` : ""}</span>
            {p.totalPaise > 0 && <span className="block text-sm text-clay-muted">{formatRupees(p.subtotalPaise)} + {formatRupees(p.taxPaise)} GST</span>}
          </button>
        ))}
      </div>
      <p className="text-sm text-clay-muted">Today’s price and terms are copied into the membership. A later price change never touches it.</p>
      <Field label="Starts on" htmlFor="nm-starts" hint="Today, or up to 60 days ahead. A later start is scheduled once paid.">
        <input id="nm-starts" type="date" value={d.startsOn} min={o.today} onChange={(e) => set({ startsOn: e.target.value })} className={cn(input, "max-w-[14rem]")} />
      </Field>
    </div>
  );
}

/** Step 4: a trainer, and from when. Optional: a member can have one later. */
export function TrainerStep({ d, set, o }: { d: Draft; set: Set; o: WizardOptions }) {
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Trainer" className="grid gap-3 sm:grid-cols-2">
        {[{ id: "", name: "No trainer yet" }, ...o.trainers].map((t) => (
          <button key={t.id || "none"} type="button" role="radio" aria-checked={d.trainerId === t.id} onClick={() => set({ trainerId: t.id })} className={cn("min-h-[3.25rem] cursor-pointer rounded-2xl border-2 p-4 text-left font-semibold", d.trainerId === t.id ? "border-ember-600 bg-ember-50" : "border-clay-line bg-white hover:bg-clay-canvas")}>{t.name}</button>
        ))}
      </div>
      {d.trainerId && (
        <Field label="From" htmlFor="nm-ton" hint="The day the trainer takes the member on. Later, a transfer closes this and opens another; what each trainer wrote keeps its author.">
          <input id="nm-ton" type="date" value={d.trainerOn} min={o.today} onChange={(e) => set({ trainerOn: e.target.value })} className={cn(input, "max-w-[14rem]")} />
        </Field>
      )}
    </div>
  );
}

const METHODS = [{ v: "cash", l: "Cash" }, { v: "upi", l: "UPI" }, { v: "card", l: "Card" }, { v: "transfer", l: "Bank transfer" }] as const;

/** Step 5: the invoice, a discount within the person’s limit, and the first payment (or pay later). */
export function PaymentStep({ d, set, o, errors }: { d: Draft; set: Set; o: WizardOptions; errors: Record<string, string> }) {
  const plan = o.plans.find((p) => p.id === d.planId);
  if (!plan) return null;
  const discount = rupeesToPaise(d.discount) ?? 0;
  const t = invoiceTotals([{ quantity: 1, unitPaise: plan.pricePaise, taxRateBp: plan.taxRateBp }], discount);
  const maxDiscount = Math.floor((plan.pricePaise * o.maxDiscountBp) / 10000);
  const free = t.totalPaise === 0;
  return (
    <div className="space-y-5">
      <section aria-label="Invoice" className="rounded-2xl bg-white p-4">
        <h3 className="font-bold">Invoice</h3>
        <dl className="mt-2 space-y-1">
          <div className="flex justify-between gap-4"><dt>{plan.name}{plan.durationDays ? `, ${plan.durationDays} days` : ""}</dt><dd className="tabular">{formatRupees(plan.pricePaise)}</dd></div>
          {discount > 0 && <div className="flex justify-between gap-4 text-clay-muted"><dt>Discount</dt><dd className="tabular">−{formatRupees(discount)}</dd></div>}
          <div className="flex justify-between gap-4 text-clay-muted"><dt>GST {(plan.taxRateBp / 100).toFixed(0)}% (CGST + SGST)</dt><dd className="tabular">{formatRupees(t.taxPaise)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-clay-line pt-1 text-lg font-bold"><dt>Total</dt><dd className="tabular">{formatRupees(t.totalPaise)}</dd></div>
        </dl>
        {!free && maxDiscount > 0 && (
          <div className="mt-3 max-w-xs">
            <Field label="Discount (₹)" htmlFor="nm-disc" hint={`You can give up to ${formatRupees(maxDiscount)} on this plan.`} error={errors.discount}><input id="nm-disc" inputMode="decimal" value={d.discount} onChange={(e) => set({ discount: e.target.value, amount: "" })} className={input} /></Field>
          </div>
        )}
      </section>
      {free ? <p className="rounded-2xl bg-status-active-bg p-4 font-semibold text-status-active-fg">There is nothing to pay. The trial starts as soon as you register.</p> : (
        <section aria-label="Payment" className="space-y-3">
          <div role="radiogroup" aria-label="When do they pay" className="grid gap-3 sm:grid-cols-2">
            {[{ v: true, l: "Collect payment now", s: "The membership starts when it is paid in full." }, { v: false, l: "Pay later", s: "The invoice stays open and the membership waits. Their pass won’t open the door until it is paid." }].map((x) => (
              <button key={String(x.v)} type="button" role="radio" aria-checked={d.payNow === x.v} onClick={() => set({ payNow: x.v })} className={cn("min-h-[3.5rem] cursor-pointer rounded-2xl border-2 p-4 text-left", d.payNow === x.v ? "border-ember-600 bg-ember-50" : "border-clay-line bg-white hover:bg-clay-canvas")}>
                <span className="block font-bold">{x.l}</span><span className="block text-sm text-clay-muted">{x.s}</span>
              </button>
            ))}
          </div>
          {d.payNow && (
            <>
              <div role="radiogroup" aria-label="Payment method" className="flex flex-wrap gap-2">
                {METHODS.map((m) => <button key={m.v} type="button" role="radio" aria-checked={d.method === m.v} onClick={() => set({ method: m.v })} className={cn("min-h-[2.75rem] cursor-pointer rounded-full px-5 font-semibold", d.method === m.v ? "bg-clay-ink text-white" : "bg-clay-lavender")}>{m.l}</button>)}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Amount received (₹)" htmlFor="nm-amt" hint={o.partialPaymentsEnabled ? "Less than the total is a part payment." : "This gym takes the full amount at once."} error={errors.amount}><input id="nm-amt" inputMode="decimal" value={d.amount === "" ? String(t.totalPaise / 100) : d.amount} onChange={(e) => set({ amount: e.target.value })} className={input} /></Field>
                {d.method !== "cash" && <Field label={d.method === "upi" ? "UPI reference" : d.method === "card" ? "Card slip number or last 4 digits" : "Transfer reference"} htmlFor="nm-ref"><input id="nm-ref" value={d.reference} onChange={(e) => set({ reference: e.target.value })} autoComplete="off" className={input} /></Field>}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** What this registration is, at a glance, beside the wizard on a wide screen and above the buttons on a phone. */
export function Summary({ d, o }: { d: Draft; o?: WizardOptions }) {
  const plan = o?.plans.find((p) => p.id === d.planId);
  const trainer = o?.trainers.find((t) => t.id === d.trainerId);
  const row = (label: string, value?: string) => <div><dt className="text-sm text-clay-muted">{label}</dt><dd className="font-semibold">{value || "Not set yet"}</dd></div>;
  return (
    <aside aria-label="This registration" className="clay p-4">
      <h2 className="text-lg font-bold">This registration</h2>
      <dl className="mt-2 space-y-2">
        {row("Member", d.details.name)}
        {row("Mobile", d.details.phone)}
        {row("Branch", o?.branchName)}
        {row("Plan", plan ? `${plan.name}, ${plan.totalPaise === 0 ? "free" : formatRupees(plan.totalPaise)}` : undefined)}
        {row("Starts", plan ? formatDate(d.startsOn) : undefined)}
        {row("Trainer", d.trainerId ? `${trainer?.name ?? ""} from ${formatDate(d.trainerOn)}` : d.step > 3 ? "No trainer yet" : undefined)}
      </dl>
    </aside>
  );
}
