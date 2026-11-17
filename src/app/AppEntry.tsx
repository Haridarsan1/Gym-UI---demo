import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Area } from "@/domain/roles";
import { homePathFor } from "@/domain/roles";
import { readSession } from "@/app/session";

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

const Devtools = import.meta.env.DEV
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
      <Suspense fallback={<div className="min-h-screen bg-clay-canvas" />}>{Area ? <Area /> : <AppIndex />}</Suspense>
      {Devtools && (
        <Suspense fallback={null}>
          <Devtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
