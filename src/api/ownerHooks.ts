import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { retry } from "@/api/hooks";
import { useSession } from "@/app/SessionContext";

/** Hooks for the owner and branch manager console. Apart from the other areas’ hooks so nobody else downloads them. */
export function useDashboard(q: import("@/api/dashboard").DashboardQuery) {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "dashboard", q], queryFn: async () => (await import("@/api/dashboard")).getDashboard(session, q), enabled: !!session, retry, staleTime: 0, placeholderData: keepPreviousData });
}
