import { useState } from "react";
import { X } from "lucide-react";
import { isApiError, useSetAutoRenew } from "@/api";
import type { MembershipData } from "@/api";
import { Button3D } from "@/design/Button3D";
import { Dialog } from "@/design/Dialog";
import { useToast } from "@/design/Toast";
import { addDays } from "@/domain/dates";
import { formatDate, formatRupees } from "@/lib/when";

const METHODS = [
  { value: "upi" as const, label: "UPI AutoPay", note: "You approve the limit once in your UPI app." },
  { value: "card" as const, label: "Saved card", note: "We charge the card you pay with." },
];

/** Auto-renew is opt-in (M04). It says exactly when, how much and how to stop before it asks for anything. */
export function AutoRenewCard({ d }: { d: MembershipData }) {
  const toast = useToast();
  const set = useSetAutoRenew();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"upi" | "card">("upi");
  const [error, setError] = useState<string>();
  const a = d.autoRenew;
  const t = a.terms;

  const turnOn = async () => {
    setError(undefined);
    try {
      await set.mutateAsync({ on: true, method });
      setOpen(false);
      toast({ title: "Auto-renew is on", description: t ? `We will charge ${formatRupees(t.amountPaise)} on ${formatDate(t.chargeOn)}.` : undefined, tone: "success" });
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t turn auto-renew on. Check your connection and try again.");
    }
  };
  const turnOff = async () => {
    try {
      await set.mutateAsync({ on: false });
      toast({ title: "Auto-renew is off", description: "Nothing will be charged automatically.", tone: "info" });
    } catch (e) {
      toast({ title: "We couldn’t turn auto-renew off", description: isApiError(e) ? e.message : "Check your connection and try again.", tone: "error" });
    }
  };

  return (
    <section aria-labelledby="auto-title" className="clay-flat p-5">
      <h2 id="auto-title" className="font-bold">Auto-renew</h2>
      {a.on && t ? (
        <>
          <p className="mt-1">On. We will charge <strong>{formatRupees(t.amountPaise)}</strong> on <strong>{formatDate(t.chargeOn)}</strong>, the last day of your membership, by {a.method === "card" ? "your saved card" : "UPI AutoPay"}.</p>
          <p className="mt-1 text-[0.95rem] text-clay-muted">We email you on {formatDate(t.reminderOn)} first. Turn it off before {formatDate(t.chargeOn)} and nothing is charged.</p>
          <Button3D variant="white" className="mt-3" onClick={turnOff} disabled={set.isPending}>Turn off auto-renew</Button3D>
        </>
      ) : (
        <>
          <p className="mt-1 text-[0.95rem] text-clay-muted">
            {a.available && t
              ? `Off. Your membership ends on ${formatDate(t.chargeOn)} and then stops. Turn this on and we renew it for you, so you never lose a day.`
              : (a.unavailableReason ?? "Auto-renew isn’t available right now.")}
          </p>
          {a.available && t && (
            <Button3D variant="white" className="mt-3" onClick={() => { setError(undefined); setOpen(true); }}>
              Set up auto-renew
            </Button3D>
          )}
        </>
      )}

      <Dialog open={open} onClose={() => !set.isPending && setOpen(false)} label="Turn on auto-renew" placement="bottom" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold">Turn on auto-renew</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {t && (
          <div className="mt-2 space-y-3">
            <section aria-label="When you are charged" className="rounded-2xl bg-clay-peach px-4 py-4">
              <p className="font-bold">When you are charged</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.95rem]">
                <li>On {formatDate(t.chargeOn)}, the last day of your membership, we charge <strong>{formatRupees(t.amountPaise)}</strong>: {t.planName} at today’s price plus 18% GST.</li>
                <li>That starts your next period, from {formatDate(addDays(t.chargeOn, 1))} to {formatDate(t.newEndsOn)}.</li>
                <li>We email you on {formatDate(t.reminderOn)}, three days before.</li>
                <li>Turn it off any time before {formatDate(t.chargeOn)} and nothing is charged. If the price changes before then, we tell you first.</li>
              </ul>
            </section>
            <div role="radiogroup" aria-label="Pay automatically with" className="space-y-2">
              {METHODS.map((m) => (
                <button key={m.value} type="button" role="radio" aria-checked={method === m.value} onClick={() => setMethod(m.value)} className={`flex min-h-[3.5rem] w-full flex-col items-start justify-center rounded-2xl border-2 px-4 py-2 text-left ${method === m.value ? "border-ember-500 bg-ember-50" : "border-clay-line bg-white"}`}>
                  <span className="font-semibold">{m.label}</span>
                  <span className="text-sm text-clay-muted">{m.note}</span>
                </button>
              ))}
            </div>
            {error && <p role="alert" className="rounded-2xl bg-status-pending-bg px-4 py-3 text-status-pending-fg">{error}</p>}
            <Button3D size="lg" className="w-full" onClick={turnOn} disabled={set.isPending}>{set.isPending ? "Turning on…" : "Turn on auto-renew"}</Button3D>
            <Button3D variant="white" className="w-full" onClick={() => setOpen(false)} disabled={set.isPending}>Not now</Button3D>
          </div>
        )}
      </Dialog>
    </section>
  );
}
