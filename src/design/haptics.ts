/** The device’s own setting, kept so a buzz can be skipped without asking the database. Me saves it; the app reads it here. */
const KEY = "ember.haptics";

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* Not saved. Vibration then follows the default, which is on. */
  }
}

const enabled = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
};

/** A short buzz on Android for a set logged, a personal record or a check-in. Quietly does nothing elsewhere, or when the member turned it off in Me. */
export function haptic(pattern: number | number[] = 12): void {
  try {
    if (enabled() && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    /* Some browsers block vibration. No feedback is fine. */
  }
}
