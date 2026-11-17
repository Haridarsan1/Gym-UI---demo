/** A short buzz on Android for a set logged, a personal record or a check-in. Quietly does nothing elsewhere. */
export function haptic(pattern: number | number[] = 12): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    /* Some browsers block vibration. No feedback is fine. */
  }
}
