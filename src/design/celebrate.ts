import { haptic } from "@/design/haptics";

export type CelebrationKind = "result" | "record" | "badge" | "goal";

const PATTERN: Record<CelebrationKind, number[]> = { result: [30, 40, 30], record: [40, 50, 40, 50, 80], badge: [60, 40, 60], goal: [60, 50, 60, 50, 120] };

/**
 * The one place celebrations are triggered. Every kind buzzes on Android. Records, new badges and achieved goals also throw a short burst of
 * confetti, loaded only then so it stays out of the app’s first download. Reduced motion gets the buzz and no confetti.
 * Never used where money or access is handled.
 */
export function celebrate(kind: CelebrationKind): void {
  haptic(PATTERN[kind]);
  if (kind === "result") return;
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  void import("@/design/confetti").then((m) => m.burst()).catch(() => undefined);
}
