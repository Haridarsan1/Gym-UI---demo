import { useState } from "react";
import { isApiError, useReplayGatewayEvent, useSetPaymentFailure } from "@/api";
import type { GatewayEventView, MembershipData, ReplayResult } from "@/api";
import { Button3D } from "@/design/Button3D";
import { Switch } from "@/design/Switch";
import { formatRupees } from "@/lib/when";

const MADE: Record<GatewayEventView["purpose"], { label: string; of: (e: { payments: number; memberships: number; creditEntries: number }) => number }> = {
  renewal: { label: "Renewals made", of: (e) => e.memberships },
  sessions: { label: "Session packs added", of: (e) => e.creditEntries },
  invoice: { label: "Invoices settled", of: (e) => e.payments },
};

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 text-center">
      <p className="font-display text-3xl font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-sm text-clay-muted">{label}</p>
    </div>
  );
}

/**
 * Demo controls, shown only in demo mode. They exist to demonstrate two promises: a failed payment activates nothing (M03), and
 * the same “payment succeeded” event arriving twice makes one payment and one renewal (M04).
 */
export function DemoPanel({ d }: { d: MembershipData }) {
  const fail = useSetPaymentFailure();
  const replay = useReplayGatewayEvent();
  const [last, setLast] = useState<ReplayResult>();
  const [error, setError] = useState<string>();
  const event = d.demo.events.find((e) => e.type === "payment.succeeded");

  const send = async () => {
    if (!event) return;
    setError(undefined);
    try {
      setLast(await replay.mutateAsync(event.id));
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t send the event. Check your connection and try again.");
    }
  };
  const made = event ? MADE[event.purpose] : undefined;

  return (
    <section aria-labelledby="demo-title" className="clay-flat !bg-lilac-100 space-y-5 p-5">
      <div>
        <h2 id="demo-title" className="text-lg font-bold">Demo controls</h2>
        <p className="text-[0.95rem]">These controls are only in the demo. They show how payments stay safe.</p>
      </div>

      <Switch
        id="demo-fail"
        checked={d.demo.paymentFails}
        onChange={(on) => fail.mutate(on)}
        disabled={fail.isPending}
        label="Make payments fail"
        description="The demo gateway declines every payment. Nothing is charged and nothing is activated."
      />

      <div className="border-t border-lilac-300 pt-4">
        <h3 className="font-bold">Send a payment event again</h3>
        <p className="text-[0.95rem]">A payment gateway can send the same “payment succeeded” message twice. Replay the last one: it must not make a second payment or a second renewal.</p>
        {event && made ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm">
              Last event <code className="break-all rounded bg-white/70 px-1">{event.id}</code> for invoice {event.invoiceNumber}, {formatRupees(event.amountPaise)}.
            </p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="What this event has made">
              <Tile label="Times sent" value={last?.deliveries ?? event.deliveries} />
              <Tile label="Payments made" value={last?.payments ?? event.payments} />
              <Tile label={made.label} value={last ? (event.purpose === "renewal" ? last.memberships : event.purpose === "sessions" ? last.creditEntries : last.payments) : made.of(event)} />
            </div>
            <Button3D variant="white" onClick={send} disabled={replay.isPending}>{replay.isPending ? "Sending…" : "Send this event again"}</Button3D>
            <div aria-live="polite">
              {last && (
                <p className="rounded-2xl bg-white px-4 py-3 text-[0.95rem]">
                  Sent again. The gateway’s event id was recognised as a repeat, so nothing new was made: still {last.payments} {last.payments === 1 ? "payment" : "payments"}
                  {event.purpose === "renewal" ? ` and ${last.memberships} ${last.memberships === 1 ? "renewal" : "renewals"}` : ""}
                  {event.purpose === "sessions" ? ` and ${last.creditEntries} session ${last.creditEntries === 1 ? "pack" : "packs"}` : ""}. The event has now arrived {last.deliveries} times.
                </p>
              )}
              {error && <p role="alert" className="rounded-2xl bg-status-pending-bg px-4 py-3 text-status-pending-fg">{error}</p>}
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[0.95rem]">No payment event yet. Pay an invoice, renew, or buy sessions, then come back here to send its event again.</p>
        )}
      </div>
    </section>
  );
}
