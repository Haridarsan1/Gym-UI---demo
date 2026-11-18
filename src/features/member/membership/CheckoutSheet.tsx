import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { isApiError, usePayInvoice, useStartCheckout } from "@/api";
import type { CheckoutView, MembershipData, PayResult, RenewalOption } from "@/api";
import { DEMO_MODE } from "@/app/mode";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { celebrate } from "@/design/celebrate";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { ErrorState } from "@/design/States";
import type { PayMethod } from "@/domain/renewal";
import { PayForm, payErrors, type PayFields } from "@/features/member/membership/PayForm";
import { cn } from "@/lib/format";
import { formatDate, formatRupees } from "@/lib/when";

export type Intent = { kind: "invoice"; invoiceId: string } | { kind: "renewal" } | { kind: "sessions" };
type Step = "choose" | "pay" | "result";

const newKey = () => `pay-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const DEMO_FIELDS: PayFields = { upi: "member@okbank", card: "4242 4242 4242 4242", expiry: "12/30", cvv: "123", bank: "" };
const BLANK_FIELDS: PayFields = { upi: "", card: "", expiry: "", cvv: "", bank: "" };

const TITLE: Record<Intent["kind"], string> = { invoice: "Pay invoice", renewal: "Renew your membership", sessions: "Buy more sessions" };

/**
 * One sheet for the three ways to pay: an open invoice (Today’s “Pay”, ?pay=), a renewal or upgrade (?renew=1), and a pack of
 * sessions (?buy=sessions). It shows what will be bought, with the dates and the price before anything is charged, then the
 * gateway form, then the result. A declined payment says what happened and how to try again, and activates nothing.
 */
export function CheckoutSheet({ intent, d, onClose }: { intent: Intent | null; d: MembershipData; onClose: () => void }) {
  const start = useStartCheckout();
  const pay = usePayInvoice();
  const [step, setStep] = useState<Step>("choose");
  const [planId, setPlanId] = useState<string>();
  const [pack, setPack] = useState<number>();
  const [checkout, setCheckout] = useState<CheckoutView>();
  const [result, setResult] = useState<PayResult>();
  const [method, setMethod] = useState<PayMethod>("upi");
  const [fields, setFields] = useState<PayFields>(DEMO_MODE ? DEMO_FIELDS : BLANK_FIELDS);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string>();
  const key = useRef(newKey());
  const heading = useRef<HTMLHeadingElement>(null);
  const open = intent !== null;
  const kind = intent?.kind;
  const invoiceId = intent?.kind === "invoice" ? intent.invoiceId : undefined;

  const begin = async (input: Parameters<typeof start.mutateAsync>[0]) => {
    setError(undefined);
    try {
      setCheckout(await start.mutateAsync(input));
      setStep("pay");
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t start the payment. Check your connection and try again.");
    }
  };

  // Each time the sheet opens it starts fresh. Paying an invoice goes straight to the payment step.
  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setCheckout(undefined);
    setResult(undefined);
    setError(undefined);
    setShowErrors(false);
    setMethod("upi");
    setFields(DEMO_MODE ? DEMO_FIELDS : BLANK_FIELDS);
    key.current = newKey();
    setPlanId((d.renewal.options.find((o) => o.current) ?? d.renewal.options[0])?.planId);
    setPack(d.sessions.packs[1]?.sessions ?? d.sessions.packs[0]?.sessions);
    if (invoiceId) void begin({ kind: "invoice", invoiceId });
    // Only a new intent restarts the sheet, not the data refreshing behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, invoiceId]);

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, step, error]);

  // A renewal is celebrated once: a short buzz and the stamp, never confetti, because money is involved.
  const celebrated = useRef<string>();
  useEffect(() => {
    if (result?.status === "succeeded" && result.effects.kind === "renewal" && celebrated.current !== result.paymentId && !result.repeated) {
      celebrated.current = result.paymentId;
      celebrate("result");
    }
  }, [result]);

  const busy = start.isPending || pay.isPending;
  const close = () => (busy ? undefined : onClose());
  const selected: RenewalOption | undefined = d.renewal.options.find((o) => o.planId === planId);

  const toPayment = () => {
    if (kind === "renewal" && planId) void begin({ kind: "renewal", planId });
    else if (kind === "sessions" && pack) void begin({ kind: "sessions", sessions: pack });
  };

  const submit = async () => {
    if (!checkout) return;
    const errors = payErrors(method, fields, d.today);
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setError(undefined);
    try {
      const r = await pay.mutateAsync({ invoiceId: checkout.invoiceId, method, idempotencyKey: key.current });
      setResult(r);
      setStep("result");
      // A declined payment is over; the next try is a new attempt with its own key. A dropped connection keeps the key, so sending it again cannot charge twice.
      if (r.status === "failed") key.current = newKey();
    } catch (e) {
      setError(isApiError(e) && e.code !== "network" ? e.message : "We couldn’t confirm the payment. Check your connection and press Pay again. You won’t be charged twice.");
    }
  };

  const heading1 = step === "result" ? (result?.status === "succeeded" ? "Payment received" : "Payment didn’t go through") : TITLE[kind ?? "invoice"];
  return (
    <Sheet open={open} onClose={close} label={TITLE[kind ?? "invoice"]} className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 ref={heading} tabIndex={-1} className="text-xl font-bold focus:outline-none">{heading1}</h2>
          <p className="text-sm text-clay-muted">{step === "choose" ? (kind === "renewal" ? "Choose your plan" : "Choose a pack") : step === "pay" ? "Check the details, then pay" : result?.status === "succeeded" ? result.invoiceNumber : "Nothing was activated"}</p>
        </div>
        <button type="button" onClick={close} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* An invoice that can’t be opened for payment, or a plan that can’t be started */}
      {error && step === "choose" && (
        <div className="mt-3">
          <ErrorState title="We couldn’t start this payment" error={new Error(error)} onRetry={invoiceId ? () => void begin({ kind: "invoice", invoiceId }) : undefined} />
          <p role="alert" className="mt-3 text-center text-[0.95rem]">{error}</p>
        </div>
      )}
      {start.isPending && step === "choose" && !error && invoiceId && <SkeletonRows rows={3} label="Opening your invoice" />}

      {step === "choose" && !error && kind === "renewal" && (
        d.renewal.options.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-clay-lavender px-4 py-4">{d.renewal.blockedReason ?? "No plan is on offer at your branch right now. Ask the front desk."}</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div role="radiogroup" aria-label="Plan" className="space-y-2">
              {d.renewal.options.map((o) => (
                <button key={o.planId} type="button" role="radio" aria-checked={o.planId === planId} onClick={() => setPlanId(o.planId)} className={cn("flex min-h-[3.75rem] w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-2 text-left", o.planId === planId ? "border-ember-500 bg-ember-50" : "border-clay-line bg-white")}>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{o.planName}</span>
                      {o.current && <span className="rounded-full bg-lilac-100 px-2 py-0.5 text-xs font-bold text-lilac-700">Your plan</span>}
                      {!o.current && o.upgrade && <span className="rounded-full bg-mint-100 px-2 py-0.5 text-xs font-bold text-mint-700">Upgrade</span>}
                    </span>
                    <span className="block text-sm text-clay-muted">{o.visits ? `${o.visits} visits, ` : ""}{o.durationDays} days{o.ptCredits ? `, ${o.ptCredits} training sessions` : ""}</span>
                  </span>
                  <span className="shrink-0 font-bold">{formatRupees(o.totalPaise)}</span>
                </button>
              ))}
            </div>
            {selected && (
              <section aria-label="What you will get" className="rounded-2xl bg-clay-peach px-4 py-4">
                <p className="font-bold">New period: {formatDate(selected.startsOn)} to {formatDate(selected.endsOn)}</p>
                <p className="text-[0.95rem] text-clay-muted">
                  {selected.status === "scheduled" && d.current?.endsOn ? `Your current membership runs until ${formatDate(d.current.endsOn)}, and the new one follows it.` : "It starts today."}
                  {selected.upgrade && !selected.current ? " The upgrade starts when your current period ends." : ""}
                </p>
                <p className="mt-2">
                  <span className="font-display text-3xl font-extrabold">{formatRupees(selected.totalPaise)}</span>{" "}
                  <span className="text-[0.95rem] text-clay-muted">{formatRupees(selected.subtotalPaise)} plus {formatRupees(selected.taxPaise)} GST</span>
                </p>
              </section>
            )}
            <Button3D size="lg" className="w-full" disabled={!selected || busy} onClick={toPayment}>{start.isPending ? "Preparing…" : "Continue to payment"}</Button3D>
          </div>
        )
      )}

      {step === "choose" && !error && kind === "sessions" && (
        d.sessions.blockedReason ? (
          <p className="mt-3 rounded-2xl bg-clay-lavender px-4 py-4">{d.sessions.blockedReason}</p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-[0.95rem] text-clay-muted">Each session is {formatRupees(d.sessions.pricePaise)} plus 18% GST. Sessions you buy can be booked for 150 days.</p>
            <div role="radiogroup" aria-label="Number of sessions" className="space-y-2">
              {d.sessions.packs.map((p) => (
                <button key={p.sessions} type="button" role="radio" aria-checked={p.sessions === pack} onClick={() => setPack(p.sessions)} className={cn("flex min-h-[3.5rem] w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-2 text-left", p.sessions === pack ? "border-ember-500 bg-ember-50" : "border-clay-line bg-white")}>
                  <span className="font-bold">{p.sessions} sessions</span>
                  <span className="text-right">
                    <span className="block font-bold">{formatRupees(p.totalPaise)}</span>
                    <span className="block text-sm text-clay-muted">with GST</span>
                  </span>
                </button>
              ))}
            </div>
            <Button3D size="lg" className="w-full" disabled={!pack || busy} onClick={toPayment}>{start.isPending ? "Preparing…" : "Continue to payment"}</Button3D>
          </div>
        )
      )}

      {step === "pay" && checkout && (
        <div className="mt-3 space-y-4">
          <section aria-label="Summary" className="rounded-2xl bg-clay-peach px-4 py-4">
            <p className="font-bold">{checkout.description}</p>
            <p className="text-sm text-clay-muted">Invoice {checkout.number}</p>
            <dl className="mt-2 space-y-0.5 text-[0.95rem]">
              <div className="flex justify-between"><dt>Amount</dt><dd>{formatRupees(checkout.subtotalPaise)}</dd></div>
              <div className="flex justify-between"><dt>GST at 18%</dt><dd>{formatRupees(checkout.taxPaise)}</dd></div>
              <div className="flex justify-between border-t border-clay-line pt-1 text-lg font-bold"><dt>To pay</dt><dd>{formatRupees(checkout.duePaise)}</dd></div>
            </dl>
            {checkout.effects.map((line) => (
              <p key={line} className="mt-1 text-sm text-clay-muted">{line}</p>
            ))}
          </section>
          <PayForm method={method} onMethod={setMethod} fields={fields} onFields={setFields} errors={payErrors(method, fields, d.today)} showErrors={showErrors} demo={DEMO_MODE} />
          {error && <p role="alert" className="rounded-2xl bg-status-pending-bg px-4 py-3 text-status-pending-fg">{error}</p>}
          <Button3D size="lg" haptic className="w-full" disabled={busy} onClick={submit}>{pay.isPending ? "Paying…" : `Pay ${formatRupees(checkout.duePaise)}`}</Button3D>
          {!invoiceId && !busy && <Button3D variant="white" className="w-full" onClick={() => { setStep("choose"); setError(undefined); }}>Back</Button3D>}
        </div>
      )}

      {step === "result" && result && <Result r={result} onClose={onClose} onRetry={() => { setStep("pay"); setError(undefined); }} />}
    </Sheet>
  );
}

function Result({ r, onClose, onRetry }: { r: PayResult; onClose: () => void; onRetry: () => void }) {
  if (r.status === "failed") {
    return (
      <div className="mt-4 space-y-4" role="alert">
        <p className="rounded-2xl bg-status-pending-bg px-4 py-4 text-status-pending-fg">{r.message}</p>
        <p className="text-[0.95rem] text-clay-muted">Your membership and sessions are as they were, and invoice {r.invoiceNumber} is still open. When you try again, you will not be charged twice.</p>
        <Button3D size="lg" className="w-full" onClick={onRetry}>Try again</Button3D>
        <Button3D variant="white" className="w-full" onClick={onClose}>Close</Button3D>
      </div>
    );
  }
  const fx = r.effects;
  const label = fx.kind === "renewal" ? "Renewed" : fx.kind === "sessions" ? "Sessions added" : "Paid";
  return (
    <div className="mt-4 space-y-4" role="status">
      <div className="flex justify-center py-2 text-status-active-fg">
        <span className="stamp"><Check className="h-6 w-6" aria-hidden="true" />{label}</span>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold">{formatRupees(r.amountPaise)} received</p>
        {fx.kind === "renewal" && fx.membership && (
          <p className="mt-1">{fx.membership.planName} runs {formatDate(fx.membership.startsOn)} to {formatDate(fx.membership.endsOn!)}.{fx.membership.status === "scheduled" ? " Your current membership carries on until then." : ""}</p>
        )}
        {fx.kind === "sessions" && <p className="mt-1">{fx.sessionsAdded} training sessions added. You now have {fx.balance?.available} to book.</p>}
        {fx.kind === "invoice" && <p className="mt-1">Invoice {r.invoiceNumber} is paid.</p>}
        <p className="mt-1 text-sm text-clay-muted">Receipt {r.receiptNumber}. We emailed it to you.</p>
      </div>
      <Button3DLink to={`/m/membership/invoices/${r.invoiceId}`} variant="white" className="w-full" onClick={onClose}>Open receipt</Button3DLink>
      {fx.kind === "sessions" && <Button3DLink to="/m/bookings?book=1" className="w-full" onClick={onClose}>Book a session</Button3DLink>}
      <Button3D variant={fx.kind === "sessions" ? "white" : "ember"} className="w-full" onClick={onClose}>Done</Button3D>
    </div>
  );
}
