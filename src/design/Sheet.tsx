import type { ReactNode } from "react";
import { Dialog } from "@/design/Dialog";
import { useMediaQuery, MEDIA } from "@/design/useMediaQuery";

/**
 * The one way to open detail, a form or a confirmation on top of a screen.
 *
 * - `panel` (default, for detail and forms): a bottom sheet on phones, a panel on the right from 640 px.
 * - `confirm` (for “are you sure” and short decisions): a bottom sheet on phones, a centred dialog from 640 px.
 *
 * It traps focus, closes on Escape or a tap outside, and puts focus back where it was (see Dialog).
 */
export function Sheet({ open, onClose, label, kind = "panel", className, children }: { open: boolean; onClose: () => void; label: string; kind?: "panel" | "confirm"; className?: string; children: ReactNode }) {
  const wide = useMediaQuery(MEDIA.tablet);
  const placement = !wide ? "bottom" : kind === "confirm" ? "center" : "right";
  return (
    <Dialog open={open} onClose={onClose} label={label} placement={placement} className={className}>
      {children}
    </Dialog>
  );
}
