import { useCallback, useEffect, useRef, useState } from "react";
import { useSaveWorkoutDraft } from "@/api";
import type { LoggedExercise } from "@/domain/types";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Saves the workout as it is logged (W03). Changes are batched for half a second, saves run one after another so an older
 * one can never land after a newer one, and everything left is saved when the person leaves or the page is hidden.
 * `flush` resolves once the latest sets are saved, and the final submit waits for it.
 */
export function useAutosave(date: string, idempotencyKey: string) {
  const { mutateAsync } = useSaveWorkoutDraft();
  const save = useCallback((entries: LoggedExercise[]) => mutateAsync({ date, entries, idempotencyKey }), [date, idempotencyKey, mutateAsync]);
  return useDraftSaver(save);
}

/** The same saving for any draft: the coach’s logging gives it its own `save`, which must keep the same identity between renders. */
export function useDraftSaver(save: (entries: LoggedExercise[]) => Promise<unknown>) {
  const [state, setState] = useState<SaveState>("idle");
  const pending = useRef<LoggedExercise[] | null>(null);
  const failed = useRef<LoggedExercise[] | null>(null);
  const timer = useRef<number>();
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const flush = useCallback((): Promise<unknown> => {
    window.clearTimeout(timer.current);
    const entries = pending.current ?? failed.current;
    if (!entries) return chain.current;
    pending.current = null;
    failed.current = null;
    setState("saving");
    chain.current = chain.current
      .then(() => save(entries))
      .then(() => setState((s) => (pending.current ? s : "saved")))
      .catch(() => {
        failed.current ??= entries;
        setState("error");
      });
    return chain.current;
  }, [save]);

  const schedule = useCallback(
    (entries: LoggedExercise[]) => {
      pending.current = entries;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 500);
    },
    [flush],
  );

  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", hide);
      void flush();
    };
  }, [flush]);

  return { schedule, flush, state };
}
