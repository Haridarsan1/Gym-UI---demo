import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Ellipsis, LogOut, Search } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { useMe } from "@/api/hooks";
import { mobileBar, screenPath, sidebarFor } from "@/app/navigation";
import { railLabel } from "@/app/screens";
import { useCan, useSession } from "@/app/SessionContext";
import { useSignOut } from "@/app/useSessionActions";
import { Dialog } from "@/design/Dialog";
import { AvatarMenu } from "@/design/shells/AvatarMenu";
import { NAV_PAD, NavRail, NavSidebar, type NavGroup } from "@/design/shells/AppNav";
import { BranchProvider } from "@/design/shells/BranchContext";
import { BranchSwitcher } from "@/design/shells/BranchSwitcher";
import { CommandPalette } from "@/design/shells/CommandPalette";
import { AREA_PATH, ROLE_LABEL, type Area } from "@/domain/roles";
import { cn } from "@/lib/format";

type StaffArea = Extract<Area, "desk" | "owner" | "admin">;

/**
 * Shell for the desk, owner and admin consoles: a sidebar on desktop, a bottom bar with “More” on phones, a branch
 * switcher, and ⌘K. Calm and quick: no confetti or badges where money or access is handled.
 */
export function StaffShell({ area }: { area: StaffArea }) {
  const { session } = useSession();
  const can = useCan();
  const me = useMe();
  const signOut = useSignOut();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  if (!session) return null;

  const groups = sidebarFor(area, can);
  const all = groups.flatMap((g) => g.items);
  const { bar, more } = mobileBar(all);
  const branches = me.data?.branches ?? [];
  const name = me.data?.name || session.name;

  const navGroups: NavGroup[] = groups.map((g) => ({ heading: g.group, items: g.items.map((s) => ({ id: s.id, to: screenPath(area, s), label: s.title, short: railLabel(s), icon: s.icon, end: s.path === "" })) }));
  const brand = (compact: boolean) => (
    <Link to={AREA_PATH[area]} className={cn("flex min-h-[2.75rem] min-w-[2.75rem] items-center gap-2.5", compact && "justify-center")} aria-label="Home">
      <LogoMark />
      {!compact && <span className="truncate text-lg font-bold tracking-tight">{me.data?.tenant?.name ?? "Ember"}</span>}
    </Link>
  );
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn("flex h-14 min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.7rem] font-semibold", isActive ? "text-ember-700" : "text-clay-muted");

  return (
    <BranchProvider userId={session.userId} branchIds={branches.map((b) => b.id)}>
      <div className={cn("min-h-dvh bg-clay-canvas text-clay-ink", NAV_PAD)}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
          Skip to content
        </a>
        <NavRail brand={brand(true)} groups={navGroups} footer={<AvatarMenu drop="up" />} />
        <NavSidebar
          brand={brand(false)}
          groups={navGroups}
          footer={
            <div className="flex items-center gap-3 px-1">
              <AvatarMenu drop="up" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="text-xs text-clay-muted">{ROLE_LABEL[session.role]}</p>
              </div>
            </div>
          }
        />

        <div className="min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
          <header className="sticky top-0 z-30 border-b border-clay-line bg-clay-canvas/90 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-2 px-4 pt-[env(safe-area-inset-top,0px)] sm:px-8 lg:px-10">
              <Link to={AREA_PATH[area]} className="flex min-h-[2.75rem] min-w-[2.75rem] items-center gap-2 sm:hidden" aria-label="Home">
                <LogoMark className="h-8 w-8" />
              </Link>
              {area !== "admin" && <BranchSwitcher branches={branches} />}
              <div className="flex-1" />
              <button type="button" onClick={() => setPaletteOpen(true)} className="flex h-11 min-w-[2.75rem] items-center justify-center gap-2 rounded-full bg-white px-3 text-sm text-clay-muted shadow-sm hover:text-clay-ink sm:px-4" aria-label="Open command palette">
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="ml-1 hidden rounded-md bg-clay-canvas px-1.5 py-0.5 text-xs font-sans text-clay-subtle sm:inline">⌘K</kbd>
              </button>
              <div className="sm:hidden">
                <AvatarMenu />
              </div>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-6 focus:outline-none sm:px-8 lg:px-10 lg:py-8">
            <Outlet />
          </main>
        </div>

        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:hidden">
          <div className="clay mx-auto flex max-w-md items-center justify-around !rounded-3xl px-1 py-1">
            {bar.map((s) => (
              <NavLink key={s.id} to={screenPath(area, s)} end={s.path === ""} className={tab}>
                <s.icon className="h-6 w-6" aria-hidden="true" />
                <span className="max-w-[4.5rem] truncate">{s.label ?? s.title}</span>
              </NavLink>
            ))}
            {more.length > 0 && (
              <button type="button" onClick={() => setMoreOpen(true)} className={tab({ isActive: false })} aria-haspopup="dialog">
                <Ellipsis className="h-6 w-6" aria-hidden="true" />
                More
              </button>
            )}
          </div>
        </nav>

        <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} label="More" placement="bottom">
          <ul className="p-3">
            {more.map((s) => (
              <li key={s.id}>
                <Link to={screenPath(area, s)} onClick={() => setMoreOpen(false)} className="flex min-h-[3rem] items-center gap-3 rounded-xl px-3 hover:bg-clay-canvas">
                  <s.icon className="h-5 w-5 text-clay-muted" aria-hidden="true" />
                  {s.title}
                </Link>
              </li>
            ))}
            <li className="mt-1 border-t border-clay-line pt-1">
              <button type="button" onClick={signOut} className="flex min-h-[3rem] w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-clay-canvas">
                <LogOut className="h-5 w-5 text-clay-muted" aria-hidden="true" />
                Sign out
              </button>
            </li>
          </ul>
        </Dialog>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </BranchProvider>
  );
}
