import { useState } from "react";
import { X } from "lucide-react";
import { isApiError, useCancelBooking } from "@/api";
import type { BookingPolicy, BookingView } from "@/api";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { istDateOf } from "@/domain/dates";
import { cancelNowText, formatTime, formatWeekdayDate, lateTermsText } from "@/lib/when";

/**
 * Cancelling, with the consequence for the credit in plain words before the member confirms. It sends the outcome the member
 * was shown; if the free-cancellation time passes while they decide, nothing happens and the new terms are shown.
 */
export function CancelSheet({ booking, policy, nowIso, onClose }: { booking: BookingView | null; policy: BookingPolicy; nowIso: string; onClose: () => void }) {
  const cancel = useCancelBooking();
  const toast = useToast();
  const [error, setError] = useState<string>();
  const close = () => {
    setError(undefined);
    cancel.reset();
    onClose();
  };
  const outcome = booking && booking.outcomeNow !== "too_late" ? booking.outcomeNow : undefined;
  const submit = async () => {
    if (!booking || !outcome) return;
    setError(undefined);
    try {
      const r = await cancel.mutateAsync({ bookingId: booking.id, expectedOutcome: outcome });
      toast({ title: "Session cancelled", description: r.outcome === "consumed" ? "The session credit was used, as the terms said." : "Your session credit is back in your balance. A confirmation email is on its way.", tone: "success" });
      close();
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t cancel that. Check your connection and try again.");
    }
  };
  return (
    <Sheet open={booking !== null} onClose={cancel.isPending ? () => undefined : close} label="Cancel session" kind="confirm" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      {booking && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Cancel this session?</h2>
              <p className="text-clay-muted">
                {formatWeekdayDate(istDateOf(booking.startsAt))}, {formatTime(booking.startsAt)} with Coach {booking.trainerName.split(" ")[0]}
              </p>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <p role="note" className={`mt-4 rounded-2xl px-4 py-3 text-[0.95rem] font-semibold ${outcome === "consumed" ? "bg-status-pending-bg text-status-pending-fg" : "bg-mint-100 text-mint-700"}`}>
            {cancelNowText(booking.outcomeNow, booking.freeUntil, nowIso)}
          </p>
          <p className="mt-2 text-sm text-clay-muted">{lateTermsText(booking.freeUntil, nowIso, policy.lateCancelConsumesCredit, policy.noShowConsumesCredit)}</p>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button3D variant="ink" size="lg" className="sm:flex-1" disabled={cancel.isPending || !outcome} onClick={() => void submit()}>
              {cancel.isPending ? "Cancelling…" : booking.outcomeNow === "consumed" ? "Cancel and use the credit" : "Cancel session"}
            </Button3D>
            <Button3D variant="white" size="lg" disabled={cancel.isPending} onClick={close}>
              Keep session
            </Button3D>
          </div>
        </>
      )}
    </Sheet>
  );
}
