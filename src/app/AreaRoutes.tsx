import { Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { landingScreen, screenPath } from "@/app/navigation";
import { useCan } from "@/app/SessionContext";
import { ScreenStub } from "@/app/ScreenStub";
import { RequireCan } from "@/app/guards";
import { SCREENS } from "@/app/screens";
import { EmptyState } from "@/design/States";
import { SkeletonCard } from "@/design/Skeleton";
import type { Area } from "@/domain/roles";

/** The area home sends people to the first screen they may open when they may not open the home screen itself. */
function Landing({ area, homeId, children }: { area: Area; homeId: string; children: ReactNode }) {
  const can = useCan();
  const landing = landingScreen(area, can);
  if (landing && landing.id !== homeId) return <Navigate to={screenPath(area, landing)} replace />;
  return <>{children}</>;
}

/**
 * Builds one area’s routes from the screen registry and wraps them in the right shell. Each milestone replaces a stub
 * by passing the real screen in `implemented`, keyed by the screen id.
 */
export function AreaRoutes({ area, implemented = {}, shell }: { area: Area; implemented?: Record<string, ComponentType>; shell: ReactNode }) {
  return (
    <Routes>
      <Route element={shell}>
        {SCREENS[area].map((screen) => {
          const Real = implemented[screen.id];
          // Real screens are loaded on demand, one file each, so opening the app does not download every screen.
          const element = Real ? <Suspense fallback={<SkeletonCard label={`Loading ${screen.title}`} />}><Real /></Suspense> : <ScreenStub area={area} screen={screen} />;
          const guarded = screen.action ? <RequireCan action={screen.action}>{element}</RequireCan> : element;
          return <Route key={screen.id} index={screen.path === ""} path={screen.path || undefined} element={screen.path === "" ? <Landing area={area} homeId={screen.id}>{guarded}</Landing> : guarded} />;
        })}
        <Route path="*" element={<EmptyState title="We couldn’t find this page">Use the menu to go to a screen.</EmptyState>} />
      </Route>
    </Routes>
  );
}
