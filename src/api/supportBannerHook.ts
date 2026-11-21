import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/app/SessionContext";

/** What everyone in a gym sees while an Ember administrator has support access to it. Read again every 20 seconds so it appears and disappears without a reload. */
export function useSupportBanner() {
  const { session } = useSession();
  return useQuery({ queryKey: ["support-banner", session?.userId, session?.support?.sessionId], queryFn: async () => (await import("@/api/support")).getSupportBanner(session), enabled: !!session && !!session.tenantId, retry: false, staleTime: 0, refetchInterval: 20_000 });
}
