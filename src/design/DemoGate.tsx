import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ensureSeeded } from "@/demo";
import { Skeleton, SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { ErrorState } from "@/design/States";
import { GymMark } from "@/design/GymMark";
import { readGym } from "@/app/gymCache";
import { readSession } from "@/app/session";

/**
 * The first time someone opens the app on a device, the demo gym is built in the browser. This shows a short
 * “Setting up demo gym” placeholder while that happens, and nothing at all on later visits. Marketing pages never get here.
 */
export function DemoGate({ children }: { children: ReactNode }) {
  const ready = useQuery({ queryKey: ["demo-ready"], queryFn: async () => (await ensureSeeded(), true), retry: false, staleTime: Infinity });

  const gym = readGym(readSession()?.tenantId);
  if (ready.isPending) {
    return (
      <main className="min-h-dvh bg-clay-canvas px-4 py-8" aria-busy="true">
        <div className="mx-auto max-w-2xl space-y-6">
          <div role="status" className="flex items-center gap-3">
            {gym ? <GymMark name={gym.name} logoUrl={gym.logoUrl} /> : <Skeleton className="h-8 w-8 !rounded-lg" />}
            <p className="font-semibold">{gym ? `Setting up ${gym.name}` : "Setting up demo gym"}</p>
          </div>
          <SkeletonCard label="Loading your home screen" />
          <SkeletonRows rows={3} />
        </div>
      </main>
    );
  }
  if (ready.isError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-clay-canvas px-4">
        <div className="w-full max-w-md">
          {gym && (
            <div className="mb-4 flex items-center justify-center gap-3">
              <GymMark name={gym.name} logoUrl={gym.logoUrl} />
              <p className="font-bold">{gym.name}</p>
            </div>
          )}
          <ErrorState title="The demo gym couldn’t be set up" error={ready.error} onRetry={() => void ready.refetch()} />
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
