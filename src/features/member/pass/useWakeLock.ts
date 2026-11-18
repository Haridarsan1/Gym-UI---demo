import { useEffect } from "react";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}
interface WakeLockApi {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

/**
 * Keeps the screen awake while the pass is open, so it doesn’t go dark at the door. Browsers that can’t do this, or that
 * refuse, simply carry on: the pass still works, and the screen may dim as usual. A browser also lets the lock go when the page
 * is hidden, so it is asked for again when the page comes back.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api) return;
    let lock: WakeLockSentinelLike | undefined;
    let stopped = false;
    const ask = () => {
      api.request("screen").then((l) => (stopped ? void l.release() : void (lock = l)), () => undefined);
    };
    const onVisible = () => document.visibilityState === "visible" && ask();
    ask();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [enabled]);
}
