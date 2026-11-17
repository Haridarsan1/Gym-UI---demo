import { useCallback, useState } from "react";

/**
 * A yes or no the browser remembers for one member, such as whether “More charts” is open. The key includes the member’s id,
 * so two people on one device each keep their own. Storage can be blocked; then it just starts closed each time.
 */
export function useRememberedFlag(key: string, fallback = false): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw === "1";
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {
        /* Not remembered. The chart section still opens and closes. */
      }
    },
    [key],
  );
  return [value, set];
}
