import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { retry } from "@/api/hooks";
import { useSession } from "@/app/SessionContext";

/** Hooks for the owner and branch manager console. Apart from the other areas’ hooks so nobody else downloads them. */
export function useDashboard(q: import("@/api/dashboard").DashboardQuery) {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "dashboard", q], queryFn: async () => (await import("@/api/dashboard")).getDashboard(session, q), enabled: !!session, retry, staleTime: 0, placeholderData: keepPreviousData });
}

export function useReport(q: import("@/api/reports").ReportQuery | null) {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "report", q], queryFn: async () => (await import("@/api/reports")).getReport(session, q!), enabled: !!session && !!q, retry, staleTime: 0, placeholderData: keepPreviousData });
}

export function useReportActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  return {
    exportCsv: useMutation({ mutationFn: async (q: import("@/api/reports").ReportQuery) => (await import("@/api/reports")).exportReport(session, q) }),
    reopen: useMutation({ mutationFn: async (i: Parameters<typeof import("@/api/dayClose").reopenDay>[1]) => (await import("@/api/dayClose")).reopenDay(session, i), onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", session?.userId] }) }),
  };
}
