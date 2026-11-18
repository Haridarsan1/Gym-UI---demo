import { useSyncExternalStore } from "react";

/**
 * The three layouts every area uses. They match Tailwind’s `sm` (640 px) and `lg` (1024 px), so a class like `sm:flex`
 * and this hook always agree.
 */
export type Breakpoint = "phone" | "tablet" | "desktop";

export const MEDIA = { tablet: "(min-width: 640px)", desktop: "(min-width: 1024px)", split: "(min-width: 768px)" } as const;

function subscribe(query: string, notify: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", notify);
  return () => list.removeEventListener("change", notify);
}

/** True while the media query matches. Re-renders when it changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => subscribe(query, notify),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useBreakpoint(): Breakpoint {
  const tablet = useMediaQuery(MEDIA.tablet);
  const desktop = useMediaQuery(MEDIA.desktop);
  return desktop ? "desktop" : tablet ? "tablet" : "phone";
}

/** From 768 px a list and its detail sit side by side (see ListDetail). */
export const useSplit = () => useMediaQuery(MEDIA.split);
