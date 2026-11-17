import { useCallback, useEffect, useState } from "react";
import type { Stage } from "@/domain/celebration";

/**
 * Runs the celebration: one part is shown, stays for its time, then the next appears. A tap moves on early, “Skip” goes
 * straight to the end. With `instant` (reduced motion, or opening the summary later) everything is shown at once.
 * `step` is how many parts have appeared; `done` is true once the last one has had its time.
 */
export function useReveal(stages: Stage[], instant: boolean) {
  const n = stages.length;
  const [step, setStep] = useState(instant ? n : 1);
  const [done, setDone] = useState(instant);

  useEffect(() => {
    if (done) return;
    const timer = window.setTimeout(() => (step >= n ? setDone(true) : setStep(step + 1)), stages[step - 1]?.ms ?? 0);
    return () => window.clearTimeout(timer);
  }, [step, done, n, stages]);

  const advance = useCallback(() => (step >= n ? setDone(true) : setStep(step + 1)), [step, n]);
  const skipAll = useCallback(() => {
    setStep(n);
    setDone(true);
  }, [n]);

  return { step, done, active: done ? null : (stages[step - 1] ?? null), advance, skipAll };
}

/** A number that counts up while `running`, and is the final number otherwise (after a tap, or with reduced motion). */
export function useTween(target: number, running: boolean, ms: number): number {
  const [value, setValue] = useState(running ? 0 : target);
  useEffect(() => {
    if (!running) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, running, ms]);
  return value;
}
