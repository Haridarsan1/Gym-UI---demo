import { useEffect, useRef, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { isApiError, useBookSession, useRescheduleBooking, useTrainerOptions, useTrainerSchedule } from "@/api";
import type { BookingPolicy, BookingView, Slot, TrainerOption } from "@/api";
import { Button3D } from "@/design/Button3D";
import { Dialog } from "@/design/Dialog";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { useToast } from "@/design/Toast";
import { cancellationDeadline, PT_CREDIT_COST } from "@/domain/booking";
import { istDateOf } from "@/domain/dates";
import { cn } from "@/lib/format";
import { formatTime, formatWeekdayDate, freeCancellationText, lateTermsText } from "@/lib/when";

type Step = "trainer" | "slot" | "confirm";
const newKey = () => `bk-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const coach = (name: string) => `Coach ${name.split(" ")[0]}`;

/**
 * Book a session in three steps: pick a trainer (their own first), a day, then a slot from the trainer’s availability inside
 * the branch hours. The last step shows the credit cost and the exact free-cancellation time before anything is confirmed.
 * The same sheet moves an existing booking, which keeps its one reserved credit.
 */
export function BookSheet({ open, reschedule, credits, policy, onClose }: { open: boolean; reschedule?: BookingView; credits: number; policy: BookingPolicy; onClose: () => void }) {
  const toast = useToast();
  const options = useTrainerOptions(open);
  const book = useBookSession();
  const move = useRescheduleBooking();
  const [step, setStep] = useState<Step>("trainer");
  const [trainerId, setTrainerId] = useState<string>();
  const [date, setDate] = useState<string>();
  const [slot, setSlot] = useState<Slot>();
  const [taken, setTaken] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string>();
  const key = useRef(newKey());
  const heading = useRef<HTMLHeadingElement>(null);
  const schedule = useTrainerSchedule(trainerId, reschedule?.id);

  // Each time the sheet opens it starts fresh. Moving a booking starts at the slot step, with the same trainer.
  useEffect(() => {
    if (!open) return;
    key.current = newKey();
    setSlot(undefined);
    setTaken(null);
    setError(undefined);
    book.reset();
    move.reset();
    setDate(undefined);
    if (reschedule?.trainerId) {
      setTrainerId(reschedule.trainerId);
      setStep("slot");
    } else {
      setTrainerId(undefined);
      setStep("trainer");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reschedule?.id]);

  // Each step replaces the buttons that had focus, so focus moves to the heading: Escape and Tab keep working, and a screen reader hears the new step.
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, step]);

  const pending = book.isPending || move.isPending;
  const close = () => (pending ? undefined : onClose());

  const choose = (t: TrainerOption) => {
    setTrainerId(t.trainerId);
    setDate(undefined);
    setTaken(null);
    setError(undefined);
    setStep("slot");
  };
  const pickSlot = (s: Slot) => {
    setSlot(s);
    setDate(s.date);
    setError(undefined);
    setTaken(null);
    setStep("confirm");
  };

  const confirm = async () => {
    if (!slot || !trainerId) return;
    setError(undefined);
    try {
      if (reschedule) await move.mutateAsync({ bookingId: reschedule.id, trainerId, startsAt: slot.startsAt, idempotencyKey: key.current });
      else await book.mutateAsync({ trainerId, startsAt: slot.startsAt, idempotencyKey: key.current });
      toast({ title: reschedule ? "Session moved" : "Session booked", description: `${formatWeekdayDate(slot.date)}, ${formatTime(slot.startsAt)}. A confirmation email is on its way.`, tone: "success" });
      onClose();
    } catch (e) {
      if (isApiError(e) && e.code === "conflict" && e.message === "That slot was just taken.") {
        // Someone else got it first. Nothing was held; show the next free slots and go back to choosing.
        setTaken(((e.details as { nextFree?: Slot[] } | undefined)?.nextFree) ?? []);
        setSlot(undefined);
        setStep("slot");
        key.current = newKey();
      } else {
        setError(isApiError(e) ? e.message : "We couldn’t save that. Check your connection and try again. You have not been charged a credit.");
      }
    }
  };

  const title = reschedule ? "Move your session" : "Book a session";
  return (
    <Dialog open={open} onClose={close} label={title} placement="bottom" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 ref={heading} tabIndex={-1} className="text-xl font-bold focus:outline-none">{title}</h2>
          <p className="text-sm text-clay-muted">{step === "trainer" ? "Choose a trainer" : step === "slot" ? "Choose a day and a time" : "Check the details"}</p>
        </div>
        <button type="button" onClick={close} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {step === "trainer" && (
        <QueryBoundary query={options} errorTitle="We couldn’t load the trainers" skeleton={<SkeletonRows rows={3} label="Loading trainers" />}>
          {({ trainers, branchName }) => (
            <div className="mt-3">
              <p className="text-sm text-clay-muted">Sessions at {branchName}.</p>
              <ul className="mt-2 space-y-2" aria-label="Trainers">
                {trainers.map((t) => (
                  <li key={t.trainerId}>
                    <button type="button" onClick={() => choose(t)} className="clay-flat flex min-h-[4rem] w-full items-center justify-between gap-3 p-3 text-left">
                      <span className="min-w-0">
                        <span className="block font-bold">{t.name}</span>
                        <span className="block text-sm text-clay-muted">{t.nextFree ? `Next free ${formatWeekdayDate(istDateOf(t.nextFree))}, ${formatTime(t.nextFree)}` : "No free slots in the next two weeks"}</span>
                      </span>
                      {t.assigned && <span className="shrink-0 rounded-full bg-lilac-100 px-2.5 py-1 text-xs font-bold text-lilac-700">Your trainer</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </QueryBoundary>
      )}

      {step === "slot" && (
        <div className="mt-3">
          {taken !== null && (
            <div role="alert" className="mb-3 rounded-2xl bg-status-pending-bg px-4 py-3 text-status-pending-fg">
              <p className="font-bold">That slot was just taken.</p>
              <p className="text-sm">Nothing was held and your session credits are unchanged. {taken.length ? "Here are the next free slots." : "Choose another day below."}</p>
              {taken.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2" aria-label="Next free slots">
                  {taken.map((s) => (
                    <li key={s.startsAt}>
                      <button type="button" onClick={() => pickSlot(s)} className="min-h-[2.75rem] rounded-xl bg-white px-3 font-bold text-clay-ink shadow-sm">
                        {formatWeekdayDate(s.date)}, {formatTime(s.startsAt)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!reschedule && (
            <button type="button" onClick={() => setStep("trainer")} className="-ml-1 inline-flex min-h-[2.75rem] items-center gap-1 font-semibold text-ember-700">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Change trainer
            </button>
          )}
          <QueryBoundary query={schedule} errorTitle="We couldn’t load the times" skeleton={<SkeletonRows rows={3} label="Loading times" />}>
            {(s) => <SlotPicker schedule={s} date={date} onDate={setDate} onPick={pickSlot} current={reschedule && reschedule.trainerId === s.trainerId ? reschedule.startsAt : undefined} />}
          </QueryBoundary>
        </div>
      )}

      {step === "confirm" && slot && schedule.data && (
        <div className="mt-3 space-y-3">
          <section aria-label="Booking details" className="clay-flat p-4">
            <p className="text-lg font-bold">{formatWeekdayDate(slot.date)}, {formatTime(slot.startsAt)} to {formatTime(slot.endsAt)}</p>
            <p className="text-clay-muted">{coach(schedule.data.trainerName)}</p>
            <p className="text-sm text-clay-muted">{schedule.data.branchName}</p>
          </section>
          <section aria-label="Credit" className="rounded-2xl bg-clay-lavender px-4 py-3">
            {reschedule ? (
              <p className="font-semibold">No extra credit. The session credit already held for this booking moves with it.</p>
            ) : (
              <p className="font-semibold">
                Costs {PT_CREDIT_COST} session credit. You have {credits} {credits === 1 ? "session" : "sessions"} left, and {credits - PT_CREDIT_COST} after this booking.
              </p>
            )}
          </section>
          <section aria-label="Cancellation" className="space-y-1">
            {(() => {
              const deadline = cancellationDeadline(slot.startsAt, policy.cancellationCutoffHours);
              return (
                <>
                  <p className="font-semibold">{freeCancellationText(deadline, schedule.data.nowIso, policy.lateCancelConsumesCredit)}</p>
                  <p className="text-[0.95rem] text-clay-muted">{lateTermsText(deadline, schedule.data.nowIso, policy.lateCancelConsumesCredit, policy.noShowConsumesCredit)}</p>
                </>
              );
            })()}
          </section>
          {error && <p role="alert" className="text-sm font-semibold text-status-danger-fg">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button3D size="lg" haptic className="flex-1" disabled={pending} onClick={() => void confirm()}>
              {pending ? "Saving…" : reschedule ? "Move session" : "Confirm booking"}
            </Button3D>
            <Button3D variant="white" size="lg" disabled={pending} onClick={() => setStep("slot")}>
              Back
            </Button3D>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** The days that have slots as chips, and the times of the chosen day. A taken slot is shown, and can’t be chosen. */
function SlotPicker({ schedule, date, onDate, onPick, current }: { schedule: { days: Array<{ date: string; slots: Slot[] }> }; date?: string; onDate: (d: string) => void; onPick: (s: Slot) => void; current?: string }) {
  const days = schedule.days;
  const firstFree = days.find((d) => d.slots.some((s) => !s.taken))?.date;
  const chosen = days.find((d) => d.date === date) ?? days.find((d) => d.date === firstFree) ?? days[0];
  if (!chosen) return <p className="mt-2 rounded-2xl bg-clay-lavender px-4 py-4">This trainer has no sessions in the next two weeks. Choose another trainer.</p>;
  return (
    <div>
      <div role="radiogroup" aria-label="Day" className="no-scrollbar -mx-1 mt-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const free = d.slots.filter((s) => !s.taken).length;
          const on = d.date === chosen.date;
          return (
            <button key={d.date} type="button" role="radio" aria-checked={on} onClick={() => onDate(d.date)} className={cn("flex min-h-[3.25rem] shrink-0 flex-col items-center justify-center rounded-2xl px-4 text-sm font-semibold", on ? "bg-clay-ink text-white" : "bg-clay-lavender")}>
              <span>{formatWeekdayDate(d.date)}</span>
              <span className={cn("text-xs", on ? "text-white/80" : "text-clay-muted")}>{free} free</span>
            </button>
          );
        })}
      </div>
      <ul aria-label={`Times on ${formatWeekdayDate(chosen.date)}`} className="mt-3 grid grid-cols-3 gap-2">
        {chosen.slots.map((s) => (
          <li key={s.startsAt}>
            <button
              type="button"
              disabled={s.taken || s.startsAt === current}
              onClick={() => onPick(s)}
              className={cn("min-h-[2.75rem] w-full rounded-xl px-2 text-[0.95rem] font-bold", s.taken ? "bg-clay-canvas text-clay-subtle line-through" : s.startsAt === current ? "bg-clay-lavender ring-2 ring-lilac-300" : "bg-white shadow-[0_2px_0_#e4dcee] ring-1 ring-clay-line active:translate-y-px")}
            >
              {formatTime(s.startsAt)}
              {s.taken && <span className="sr-only"> taken</span>}
              {s.startsAt === current && <span className="sr-only"> your current time</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
