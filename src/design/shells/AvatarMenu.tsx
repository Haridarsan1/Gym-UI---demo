import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { useMe } from "@/api/hooks";
import { useSession } from "@/app/SessionContext";
import { Avatar } from "@/design/Avatar";
import { Tooltip } from "@/design/Tooltip";

/**
 * The avatar in the top bar. Opens a panel with who you are, the “Me” links for the member and trainer apps,
 * a demo reset, and Sign out. Present in every shell.
 */
/** The panel (role switcher, “Me” links, reset, sign out) is fetched when the menu is first opened. */
const AvatarPanel = lazy(() => import("@/design/shells/AvatarPanel"));

export function AvatarMenu({ drop = "down" }: { drop?: "down" | "up" }) {
  const { session } = useSession();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!session) return null;
  const name = me.data?.name || session.name;

  return (
    <div ref={root} className="relative">
      <Tooltip label="Account" side={drop === "up" ? "right" : "bottom"}>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panelId} aria-label={`Account menu for ${name}`} className="grid h-11 w-11 cursor-pointer place-items-center rounded-full hover:ring-2 hover:ring-ember-200">
          <Avatar name={name} />
        </button>
      </Tooltip>
      {open && <Suspense fallback={null}><AvatarPanel id={panelId} drop={drop} name={name} tenantName={me.data?.tenant?.name} close={() => setOpen(false)} /></Suspense>}
    </div>
  );
}
