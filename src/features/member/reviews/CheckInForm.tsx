import { useRef, useState } from "react";
import { isApiError, useSubmitCheckIn } from "@/api";
import { Button3D } from "@/design/Button3D";
import { cn } from "@/lib/format";

export const RECOVERY_WORDS = ["Drained", "Tired", "Okay", "Good", "Fresh"];
const newKey = () => `chk-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

/**
 * How the training is going, in the member’s words (P04): effort, recovery and what got in the way. All optional, but at
 * least one answer is needed. Sending twice (a double tap, a retry) makes one check-in, because the form keeps one key until
 * it has been sent.
 */
export function CheckInForm() {
  const send = useSubmitCheckIn();
  const key = useRef(newKey());
  const [effort, setEffort] = useState<number>();
  const [recovery, setRecovery] = useState<number>();
  const [obstacles, setObstacles] = useState("");
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(undefined);
    try {
      await send.mutateAsync({ key: key.current, effort, recovery, obstacles });
      key.current = newKey();
      setEffort(undefined);
      setRecovery(undefined);
      setObstacles("");
      setSent(true);
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t send that. Check your connection and try again. Your answers are still here.");
    }
  };
  const pick = (setter: (n: number | undefined) => void, current: number | undefined, n: number) => {
    setSent(false);
    setter(current === n ? undefined : n);
  };

  return (
    <section aria-labelledby="checkin-title" className="clay p-5">
      <h2 id="checkin-title" className="text-lg font-bold">Check in with your trainer</h2>
      <p className="text-sm text-clay-muted">Tell them how training is going. Answer one question or all three.</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset>
          <legend className="text-sm font-semibold">How hard has training felt?</legend>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" aria-pressed={effort === n} aria-label={`Effort ${n} of 10`} onClick={() => pick(setEffort, effort, n)} className={cn("font-display h-11 rounded-xl text-xl font-extrabold", effort === n ? "bg-clay-ink text-white" : "bg-clay-lavender")}>
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-clay-muted">1 is very easy, 10 is all you had.</p>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">How recovered do you feel?</legend>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {RECOVERY_WORDS.map((word, i) => (
              <button key={word} type="button" aria-pressed={recovery === i + 1} onClick={() => pick(setRecovery, recovery, i + 1)} className={cn("min-h-[2.75rem] rounded-xl px-1 text-[0.8rem] font-bold leading-tight", recovery === i + 1 ? "bg-clay-ink text-white" : "bg-clay-lavender")}>
                {word}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="text-sm font-semibold">Anything getting in the way?</span>
          <textarea value={obstacles} onChange={(e) => (setSent(false), setObstacles(e.target.value))} maxLength={1000} rows={3} placeholder="Travel, a sore knee, not enough time" className="mt-2 w-full rounded-xl border border-clay-line p-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-status-danger-fg">{error}</p>}
        {sent && <p role="status" className="text-sm font-semibold text-mint-700">Sent to your trainer. Thank you.</p>}
        <Button3D type="submit" size="lg" haptic disabled={send.isPending} className="w-full">
          {send.isPending ? "Sending…" : "Send check-in"}
        </Button3D>
      </form>
    </section>
  );
}
