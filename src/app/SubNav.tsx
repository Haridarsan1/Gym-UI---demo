import { NavLink } from "react-router-dom";
import { screenPath } from "@/app/navigation";
import { SCREENS, type ScreenDef } from "@/app/screens";
import { useCan } from "@/app/SessionContext";
import type { Area } from "@/domain/roles";
import { cn } from "@/lib/format";

/**
 * Tabs inside a section: the Library has exercises, templates and programs, and Clients leads to a client’s pages.
 * Only screens without an id in the address and that the person may open are listed.
 */
export function SubNav({ area, screen }: { area: Area; screen: ScreenDef }) {
  const can = useCan();
  const rootId = screen.parent ?? screen.id;
  const root = SCREENS[area].find((s) => s.id === rootId);
  const tabs = [root, ...SCREENS[area].filter((s) => s.parent === rootId)].filter((s): s is ScreenDef => !!s && !s.path.includes(":") && (!s.action || can(s.action)));
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Section" className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1">
      {tabs.map((s) => (
        <NavLink key={s.id} to={screenPath(area, s)} end className={({ isActive }) => cn("inline-flex min-h-[2.75rem] shrink-0 items-center rounded-full px-4 text-sm font-semibold", isActive ? "clay-night" : "clay-flat text-clay-muted")}>
          {s.label ?? s.title}
        </NavLink>
      ))}
    </nav>
  );
}
