import { useEffect, useState } from "react";
import { haptic } from "@/design/haptics";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Counts down from the time the rest ends, not by ticking once a second, so it stays right when the phone sleeps or the tab
 * is in the background. It buzzes once at the end. The bar is decoration; the time is always in words.
 */
export function RestTimer({ endsAt, total, onAdd, onClose }: { endsAt: number; total: number; onAdd: (seconds: number) => void; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const over = left === 0;
  useEffect(() => {
    if (over) haptic([40, 60, 40]);
  }, [over]);
  const share = Math.min(1, Math.max(0, 1 - (endsAt - now) / (total * 1000)));
  return (
    <section aria-label="Rest timer" className="clay overflow-hidden !rounded-2xl">
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-clay-muted">{over ? "Rest over" : "Rest"}</p>
          <p role="timer" aria-live="off" className="font-display text-3xl font-extrabold tabular-nums leading-none">
            {clock(left)}
          </p>
        </div>
        {!over && (
          <button type="button" onClick={() => onAdd(15)} aria-label="Add 15 seconds" className="min-h-[2.75rem] rounded-xl bg-clay-lavender px-3 font-bold">
            +15 s
          </button>
        )}
        <button type="button" onClick={onClose} className="min-h-[2.75rem] rounded-xl px-3 font-bold text-ember-700 underline underline-offset-4">
          {over ? "Dismiss" : "Skip rest"}
        </button>
      </div>
      <div aria-hidden="true" className="h-1.5 bg-clay-line">
        <div className="h-full bg-mint-500 transition-[width] duration-200" style={{ width: `${share * 100}%` }} />
      </div>
      <p role="status" className="sr-only">{over ? "Rest is over. Ready for the next set." : ""}</p>
    </section>
  );
}
