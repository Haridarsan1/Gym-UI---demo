import { Link, NavLink, Outlet } from "react-router-dom";
import { Button3DLink } from "@/design/Button3D";
import { LogoMark } from "@/components/ui/Logo";
import { useMe } from "@/api/hooks";
import { raisedAction, screenPath, tabsFor } from "@/app/navigation";
import { useCan } from "@/app/SessionContext";
import { QrCode, ListChecks, Dumbbell } from "lucide-react";
import { AvatarMenu } from "@/design/shells/AvatarMenu";
import { AREA_PATH } from "@/domain/roles";
import { cn } from "@/lib/format";

/**
 * Shell for the member and trainer apps: a slim top bar with the avatar, and a bottom tab bar with a raised action in
 * the middle. These apps are phone first. On a wide screen the bar stays a compact pill in the centre.
 */
export function PlayShell({ area }: { area: "member" | "trainer" }) {
  const can = useCan();
  const me = useMe();
  const tabs = tabsFor(area, can);
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);
  // No workouts are scheduled until plans are built in M1, so members see their check-in pass for now.
  const raised = raisedAction(area, undefined);
  const RaisedIcon = area === "trainer" ? ListChecks : raised.to.includes("workout") ? Dumbbell : QrCode;

  const tab = ({ isActive }: { isActive: boolean }) =>
    cn("flex h-14 min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.7rem] font-semibold transition-colors", isActive ? "text-ember-700" : "text-clay-muted hover:text-clay-ink");

  return (
    <div className="min-h-dvh bg-clay-canvas pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] text-clay-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-clay-line bg-clay-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top,0px)]">
          <Link to={AREA_PATH[area]} className="flex min-w-0 items-center gap-2.5" aria-label="Home">
            <LogoMark className="h-8 w-8" />
            <span className="truncate font-bold tracking-tight">{me.data?.tenant?.name ?? "Ember"}</span>
          </Link>
          <AvatarMenu />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6 focus:outline-none">
        <Outlet />
      </main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="clay mx-auto grid max-w-md grid-cols-5 items-end !rounded-3xl px-1 pb-1 pt-1">
          {left.map((s) => (
            <NavLink key={s.id} to={screenPath(area, s)} end={s.path === ""} className={tab}>
              <s.icon className="h-6 w-6" aria-hidden="true" />
              {s.label ?? s.title}
            </NavLink>
          ))}
          <div className="relative flex h-14 justify-center">
            <Button3DLink to={raised.to} haptic aria-label={raised.label} className="absolute -top-8 !h-16 !min-h-0 !w-16 !rounded-full !p-0">
              <RaisedIcon className="h-7 w-7" aria-hidden="true" />
            </Button3DLink>
            <span aria-hidden="true" className="absolute bottom-1 text-[0.7rem] font-semibold text-clay-muted">
              {area === "trainer" ? "Log" : raised.label.startsWith("Start") ? "Start" : "Pass"}
            </span>
          </div>
          {right.map((s) => (
            <NavLink key={s.id} to={screenPath(area, s)} className={tab}>
              <s.icon className="h-6 w-6" aria-hidden="true" />
              {s.label ?? s.title}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
