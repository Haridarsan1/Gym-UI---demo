import { useEffect, useRef } from "react";

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/**
 * Runs `handler` when a single key is pressed and nobody is typing in a field, with no ctrl, alt or meta held.
 * Use it for frequent actions (“n” for next, “/” for search). Always keep the button too: shortcuts are a bonus.
 */
export function useShortcut(key: string, handler: () => void, enabled = true) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== key || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (TYPING.test(el.tagName) || el.isContentEditable)) return;
      // A dialog is open: its own keys come first.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      latest.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}
