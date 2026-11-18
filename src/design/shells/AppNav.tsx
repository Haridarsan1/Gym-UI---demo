import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Button3DLink } from "@/design/Button3D";
import { cn } from "@/lib/format";

export interface NavEntry {
  id: string;
  to: string;
  /** Full label, used in the sidebar. */
  label: string;
  /** One short word for the narrow rail. */
  short: string;
  icon: LucideIcon;
  end?: boolean;
}
export interface NavGroup {
  heading?: string;
  items: NavEntry[];
}
export interface RaisedNav {
  label: string;
  short: string;
  to: string;
  icon: LucideIcon;
}

/** Width of the rail and the sidebar. Screens use `NAV_PAD` so content never sits under them. */
export const NAV_PAD = "sm:pl-[5.5rem] lg:pl-64";

/**
 * Tablet navigation (640 to 1023 px): a rail down the left with an icon and a short word for each entry. The raised
 * action is the first item, styled as Button3D. The account menu sits at the bottom.
 */
export function NavRail({ brand, raised, groups, footer, className }: { brand?: ReactNode; raised?: RaisedNav; groups: NavGroup[]; footer?: ReactNode; className?: string }) {
  const item = ({ isActive }: { isActive: boolean }) =>
    cn("flex min-h-[3.5rem] w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-center text-[0.7rem] font-semibold leading-tight transition-colors", isActive ? "bg-white text-ember-700 shadow-sm" : "text-clay-muted hover:bg-white/70 hover:text-clay-ink");
  return (
    <nav aria-label="Main" className={cn("print-hide fixed inset-y-0 left-0 z-40 hidden w-[5.5rem] flex-col items-center border-r border-clay-line bg-clay-peach/60 py-4 sm:flex lg:hidden", className)}>
      {brand && <div className="mb-3">{brand}</div>}
      {raised && (
        <div className="mb-3 flex flex-col items-center gap-1">
          <Button3DLink to={raised.to} haptic aria-label={raised.label} className="!h-14 !min-h-0 !w-14 !rounded-2xl !p-0">
            <raised.icon className="h-6 w-6" aria-hidden="true" />
          </Button3DLink>
          <span aria-hidden="true" className="text-[0.7rem] font-semibold text-clay-muted">
            {raised.short}
          </span>
        </div>
      )}
      <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto">
        {groups.flatMap((g) => g.items).map((e) => (
          <NavLink key={e.id} to={e.to} end={e.end} className={item}>
            <e.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2">{e.short}</span>
          </NavLink>
        ))}
      </div>
      {footer && <div className="mt-2">{footer}</div>}
    </nav>
  );
}

/**
 * Desktop navigation (1024 px and up): the gym’s logo and name, the raised action as a full-width Button3D, the
 * navigation, and the account menu at the bottom.
 */
export function NavSidebar({ brand, raised, groups, footer, className }: { brand: ReactNode; raised?: RaisedNav; groups: NavGroup[]; footer?: ReactNode; className?: string }) {
  const item = ({ isActive }: { isActive: boolean }) =>
    cn("flex min-h-[2.75rem] items-center gap-3 rounded-xl px-3 text-[0.95rem] transition-colors", isActive ? "bg-ember-50 font-semibold text-ember-700" : "text-clay-muted hover:bg-white hover:text-clay-ink");
  return (
    <aside className={cn("print-hide fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-clay-line bg-clay-peach/60 lg:flex", className)}>
      <div className="px-5 pb-4 pt-6">{brand}</div>
      <nav aria-label="Main" className="flex flex-1 flex-col overflow-y-auto px-3 pb-4">
        {raised && (
          <Button3DLink to={raised.to} haptic className="mb-4 w-full justify-center gap-2">
            <raised.icon className="h-5 w-5" aria-hidden="true" />
            {raised.label}
          </Button3DLink>
        )}
        {groups.map((g, i) => (
          <div key={g.heading ?? i} className="mt-4 first:mt-0">
            {g.heading && <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-clay-subtle">{g.heading}</p>}
            <ul>
              {g.items.map((e) => (
                <li key={e.id}>
                  <NavLink to={e.to} end={e.end} className={item}>
                    <e.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {e.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer && <div className="border-t border-clay-line p-3">{footer}</div>}
    </aside>
  );
}
