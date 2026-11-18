import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A modal layer for the command palette and the “More” sheet. It traps focus, closes on Escape or a tap outside,
 * and puts focus back where it was.
 */
export function Dialog({ open, onClose, label, placement = "center", children, className }: { open: boolean; onClose: () => void; label: string; placement?: "center" | "bottom" | "top" | "right"; children: ReactNode; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    // With nothing to focus yet (content still loading) the panel itself takes focus, so Escape and Tab stay inside.
    (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current)?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = "";
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className={cn("fixed inset-0 z-[70] flex justify-center bg-[rgba(35,28,53,0.45)] backdrop-blur-[2px]", placement === "bottom" ? "items-end" : placement === "top" ? "items-start pt-[12vh]" : placement === "right" ? "items-stretch justify-end" : "items-center")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown} className={cn("clay max-h-[85dvh] w-full overflow-auto focus:outline-none", placement === "bottom" ? "max-w-lg !rounded-b-none pb-[env(safe-area-inset-bottom)]" : placement === "right" ? "!max-h-dvh h-dvh max-w-[28rem] !rounded-r-none pb-[env(safe-area-inset-bottom)]" : "mx-4 max-w-xl", className)}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
