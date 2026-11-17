import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";
import type { Action, Resource } from "@/domain/permissions";
import { areaFor, homePathFor, type Area } from "@/domain/roles";
import { useCan, useSession } from "@/app/SessionContext";

export function AccessDenied({ homePath }: { homePath?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-clay-canvas px-5 py-10 text-clay-ink">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="Ember home" className="mx-auto block w-fit">
          <Logo />
        </Link>
        <div role="alert" className="clay mt-8 p-7">
          <h1 className="text-2xl font-bold tracking-tight">You don’t have access to this page</h1>
          <p className="mt-2 text-clay-muted">Your role can’t open this part of Ember. Go back to your own home screen, or ask your gym owner to change your role.</p>
          <ButtonLink to={homePath ?? "/login"} variant="primary" className="mt-6">
            {homePath ? "Go to my home" : "Log in"}
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}

/** Signed-out visitors go to log in. People in the wrong area see the access-denied page. */
export function RequireArea({ area, children }: { area: Area; children: ReactNode }) {
  const { session } = useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (areaFor(session.role) !== area) return <AccessDenied homePath={homePathFor(session.role)} />;
  return <>{children}</>;
}

/** Route-level check for one action inside an area. */
export function RequireCan({ action, resource, children }: { action: Action; resource?: Resource; children: ReactNode }) {
  const can = useCan();
  const { session } = useSession();
  if (!can(action, resource)) return <AccessDenied homePath={session ? homePathFor(session.role) : undefined} />;
  return <>{children}</>;
}

/** Shows its children only when the signed-in person may do the action. Use for buttons and navigation items. */
export function Can({ action, resource, children, fallback = null }: { action: Action; resource?: Resource; children: ReactNode; fallback?: ReactNode }) {
  const can = useCan();
  return <>{can(action, resource) ? children : fallback}</>;
}
