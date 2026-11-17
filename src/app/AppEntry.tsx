import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Area } from "@/domain/roles";
import { homePathFor } from "@/domain/roles";
import { readSession } from "@/app/session";
import { SessionProvider } from "@/app/SessionContext";
import { RequireArea } from "@/app/guards";
import { ToastProvider } from "@/design/Toast";
import { DemoGate } from "@/design/DemoGate";

/**
 * The only door into the app from the marketing site. App.tsx loads this file lazily, so React Query,
 * the demo database and every area stay out of the bundles for /, /signup and /login.
 */
const areas = {
  member: lazy(() => import("@/features/member")),
  trainer: lazy(() => import("@/features/trainer")),
  desk: lazy(() => import("@/features/desk")),
  owner: lazy(() => import("@/features/owner")),
  admin: lazy(() => import("@/features/admin")),
};

/** Development only, and off while Playwright runs because its floating button covers the bottom bar. */
const Devtools = import.meta.env.DEV && !import.meta.env.VITE_E2E
  ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
  : null;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false } },
});

/** /app sends people to the home of their role, or to log in. */
function AppIndex() {
  const session = readSession();
  return <Navigate to={session ? homePathFor(session.role) : "/login"} replace />;
}

export default function AppEntry({ area }: { area: Area | "index" }) {
  const Area = area === "index" ? null : areas[area];
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ToastProvider>
          <Suspense fallback={<div className="min-h-screen bg-clay-canvas" />}>
            {area === "index" || !Area ? (
              <AppIndex />
            ) : (
              <RequireArea area={area}>
                <DemoGate>
                  <Area />
                </DemoGate>
              </RequireArea>
            )}
          </Suspense>
        </ToastProvider>
      </SessionProvider>
      {Devtools && (
        <Suspense fallback={null}>
          <Devtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
