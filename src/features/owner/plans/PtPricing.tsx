import { useRef, useState } from "react";
import { X } from "lucide-react";
import { usePlanActions } from "@/api/ownerHooks";
import { isApiError } from "@/api/errors";
import type { PlansView } from "@/api/plans";
import { Button3D } from "@/design/Button3D";
import { Field, inputClass } from "@/design/Field";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { invoiceTotals } from "@/domain/billing";
import { GST_RATES_BP, gstLabel, rupeesToPaise, validatePtPricing } from "@/domain/plans";
import { formatRupees } from "@/lib/when";

const packsOf = (t: string): number[] => t.split(/[,\s]+/).filter(Boolean).map(Number);
const quote = (n: number, price: number, bp: number) => invoiceTotals([{ quantity: n, unitPaise: price, taxRateBp: bp }]);

/** What personal training costs and how it is sold: the price of a session, the packs on offer and how long a pack lasts. Shown with the packs as a member sees them. */
export function PtPricingCard({ view }: { view: PlansView }) {
  const [open, setOpen] = useState(false);
  const p = view.ptPricing;
  return (
    <section aria-labelledby="pt-title" className="clay p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pt-title" className="text-lg font-bold">Personal training sessions</h2>
          <p className="text-[0.95rem] text-clay-muted">{formatRupees(p.sessionPricePaise)} a session before {gstLabel(p.taxRateBp)}. Packs last {p.expiryDays} days.{view.ptIsDefault ? " These are Ember’s starting prices; set your own." : ""}</p>
        </div>
        {view.canEdit && <Button3D variant="white" size="md" onClick={() => setOpen(true)}>Edit session pricing</Button3D>}
      </div>
      <dl aria-label="Packs on offer" className="mt-3 grid gap-2 sm:grid-cols-3">
        {p.packs.map((n) => { const q = quote(n, p.sessionPricePaise, p.taxRateBp); return (
          <div key={n} className="rounded-2xl bg-clay-canvas p-3"><dt className="font-semibold">{n} {n === 1 ? "session" : "sessions"}</dt><dd className="tabular text-xl font-bold">{formatRupees(q.totalPaise)}</dd><dd className="text-sm text-clay-muted">{formatRupees(q.subtotalPaise)} + {formatRupees(q.taxPaise)} GST</dd></div>
        ); })}
      </dl>
      <Sheet open={open} onClose={() => setOpen(false)} label="Session pricing"><PtEditor view={view} onClose={() => setOpen(false)} /></Sheet>
    </section>
  );
}

function PtEditor({ view, onClose }: { view: PlansView; onClose: () => void }) {
  const { savePt } = usePlanActions();
  const toast = useToast();
  const p = view.ptPricing;
  const [price, setPrice] = useState(String(p.sessionPricePaise / 100));
  const [bp, setBp] = useState(p.taxRateBp);
  const [packs, setPacks] = useState(p.packs.join(", "));
  const [days, setDays] = useState(String(p.expiryDays));
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string>();
  const key = useRef(`pt-${crypto.randomUUID()}`);
  const paise = rupeesToPaise(price);
  const list = packsOf(packs);
  const expiry = /^\d+$/.test(days.trim()) ? Number(days) : null;
  const errors = validatePtPricing({ sessionPricePaise: paise, taxRateBp: bp, packs: list, expiryDays: expiry });
  const show = (k: keyof typeof errors) => (tried ? errors[k] : undefined);
  const submit = async () => {
    setTried(true);
    setFailure(undefined);
    if (Object.keys(errors).length) return;
    try {
      await savePt.mutateAsync({ key: key.current, sessionPricePaise: paise, taxRateBp: bp, packs: list, expiryDays: expiry });
      toast({ title: "Session pricing saved", description: "Packs bought from now on use it. Packs already bought and invoices already raised are not changed.", tone: "success" });
      onClose();
    } catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t save the pricing. Try again."); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label="Session pricing" className="flex min-h-full flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
        <h2 className="text-xl font-bold">Session pricing</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-clay-canvas"><X className="h-5 w-5" aria-hidden="true" /></button>
      </header>
      <div className="flex-1 space-y-4 px-5 pb-4 pt-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price of one session before GST (₹)" htmlFor="pt-price" error={show("sessionPricePaise")}><input id="pt-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} data-autofocus aria-invalid={show("sessionPricePaise") ? true : undefined} aria-describedby={show("sessionPricePaise") ? "pt-price-error" : undefined} /></Field>
          <Field label="GST rate" htmlFor="pt-gst" error={show("taxRateBp")}><select id="pt-gst" value={bp} onChange={(e) => setBp(Number(e.target.value))} className={inputClass}>{GST_RATES_BP.map((r) => <option key={r} value={r}>{r === 0 ? "No GST" : `${Number((r / 100).toFixed(2))}%`}</option>)}</select></Field>
        </div>
        <Field label="Packs on offer (sessions in each)" htmlFor="pt-packs" hint="Separate with commas, for example 4, 8, 12." error={show("packs")}><input id="pt-packs" value={packs} onChange={(e) => setPacks(e.target.value)} className={inputClass} aria-invalid={show("packs") ? true : undefined} aria-describedby={show("packs") ? "pt-packs-error" : undefined} /></Field>
        <Field label="A pack lasts (days)" htmlFor="pt-days" error={show("expiryDays")}><input id="pt-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={inputClass} aria-invalid={show("expiryDays") ? true : undefined} aria-describedby={show("expiryDays") ? "pt-days-error" : undefined} /></Field>
        <section aria-label="What the member pays" aria-live="polite" className="rounded-2xl bg-clay-canvas p-4">
          <h3 className="font-bold">What the member pays</h3>
          {paise !== null && !errors.packs && !errors.sessionPricePaise ? (
            <ul className="mt-2 space-y-1">{list.slice().sort((a, b) => a - b).map((n) => { const q = quote(n, paise, bp); return <li key={n} className="flex justify-between gap-4"><span>{n} {n === 1 ? "session" : "sessions"}<span className="block text-sm text-clay-muted">{formatRupees(q.subtotalPaise)} + {formatRupees(q.taxPaise)} GST</span></span><span className="tabular font-bold">{formatRupees(q.totalPaise)}</span></li>; })}</ul>
          ) : <p className="mt-1 text-[0.95rem] text-clay-muted">Enter the price and the packs to see what each pack costs with GST.</p>}
        </section>
      </div>
      {failure && <p role="alert" className="mx-5 mb-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
      <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-clay-line bg-white/95 px-5 py-3 backdrop-blur">
        <Button3D type="submit" variant="ember" size="md" disabled={savePt.isPending}>{savePt.isPending ? "Saving…" : "Save pricing"}</Button3D>
        <Button3D type="button" variant="white" size="md" onClick={onClose}>Cancel</Button3D>
      </footer>
    </form>
  );
}
