import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Button3DLink } from "@/design/Button3D";
import { GymMark } from "@/design/GymMark";
import { Skeleton } from "@/design/Skeleton";
import { useGym } from "@/app/useGym";
import { menuFor, raisedAction, screenPath, tabsFor, type TodaysWorkout } from "@/app/navigation";
import { railLabel } from "@/app/screens";
import { useCan, useSession } from "@/app/SessionContext";
import { QrCode, ListChecks, Dumbbell } from "lucide-react";
import { AvatarMenu } from "@/design/shells/AvatarMenu";
import { NAV_PAD, NavRail, NavSidebar, type NavEntry, type NavGroup, type RaisedNav } from "@/design/shells/AppNav";
import { useMe } from "@/api/hooks";
import { AREA_PATH, ROLE_LABEL } from "@/domain/roles";
import type { ScreenDef } from "@/app/screens";
import { cn } from "@/lib/format";

const entry = (area: "member" | "trainer", s: ScreenDef): NavEntry => ({ id: s.id, to: screenPath(area, s), label: s.label ?? s.title, side: s.side, short: railLabel(s), icon: s.icon, end: s.path === "" });

/**
 * Shell for the member and trainer apps, one navigation pattern for each width:
 * - phone (under 640 px): a slim top bar and a bottom tab bar with the raised action in the middle;
 * - tablet (640 to 1023 px): a rail on the left, the raised action as its first item;
 * - desktop (1024 px and up): a sidebar with the gym’s logo and name, the raised action, the navigation and the account menu.
 * Content is capped at about 1200 px wide, so a phone-width column never floats in the middle of a wide screen.
 */
export function PlayShell({ area, todaysWorkout }: { area: "member" | "trainer"; todaysWorkout?: TodaysWorkout }) {
  const can = useCan();
  const gym = useGym();
  const { session } = useSession();
  const me = useMe();
  // Logging a workout takes the whole screen at every width: the navigation steps aside for the session’s own controls.
  const immersive = area === "member" && /^\/m\/workout\/[^/]+\/?$/.test(useLocation().pathname);
  const tabs = tabsFor(area, can);
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);
  const raisedDef = raisedAction(area, todaysWorkout);
  const RaisedIcon = area === "trainer" ? ListChecks : raisedDef.to.includes("workout") ? Dumbbell : QrCode;
  const short = area === "trainer" ? "Log" : raisedDef.label.startsWith("Start") ? "Start" : raisedDef.label.startsWith("Continue") ? "Continue" : "Pass";
  const raised: RaisedNav = { label: raisedDef.label, side: raisedDef.label.replace(/ today’s workout$/, " workout") === raisedDef.label ? undefined : raisedDef.label.replace(/ today’s workout$/, " workout"), short, to: raisedDef.to, icon: RaisedIcon };
  const groups: NavGroup[] = [
    { items: tabs.map((s) => entry(area, s)) },
    { items: menuFor(area, can).map((s) => entry(area, s)).filter((e) => e.to !== raised.to) },
  ].filter((g) => g.items.length > 0);
  const name = me.data?.name || session?.name || "";

  const tab = ({ isActive }: { isActive: boolean }) =>
    cn("flex h-14 min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.7rem] font-semibold transition-colors", isActive ? "text-ember-700" : "text-clay-muted hover:text-clay-ink");

  const brand = (compact: boolean) => (
    <Link to={AREA_PATH[area]} className={cn("flex min-h-[2.75rem] min-w-[2.75rem] items-center gap-2.5", compact ? "justify-center" : "min-w-0")} aria-label="Home">
      {gym ? (
        <>
          <GymMark name={gym.name} logoUrl={gym.logoUrl} />
          {!compact && <span className="truncate font-bold tracking-tight">{gym.name}</span>}
        </>
      ) : (
        <>
          <Skeleton className="h-8 w-8 !rounded-lg" />
          {!compact && <Skeleton className="h-4 w-28" />}
        </>
      )}
    </Link>
  );

  return (
    <div className={cn("min-h-dvh bg-clay-canvas pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))] text-clay-ink sm:pb-0", !immersive && NAV_PAD)}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      {!immersive && (
        <>
          <NavRail brand={brand(true)} raised={raised} groups={groups} footer={<AvatarMenu drop="up" />} />
          <NavSidebar
            brand={brand(false)}
            raised={raised}
            groups={groups}
            footer={
              <div className="flex items-center gap-3 px-1">
                <AvatarMenu drop="up" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="text-xs text-clay-muted">{session ? ROLE_LABEL[session.role] : ""}</p>
                </div>
              </div>
            }
          />
        </>
      )}
      <header className="print-hide sticky top-0 z-30 border-b border-clay-line bg-clay-canvas/90 backdrop-blur sm:hidden">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top,0px)]">
          {brand(false)}
          <AvatarMenu />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-6 focus:outline-none sm:px-8 sm:py-8 lg:px-10">
        <Outlet />
      </main>
      {!immersive && (
        <nav aria-label="Main" className="print-hide fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:hidden">
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
                {short}
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
      )}
    </div>
  );
}
