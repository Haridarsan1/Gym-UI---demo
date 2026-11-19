import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { retry } from "@/api/hooks";
import { useSession } from "@/app/SessionContext";

/** Hooks for the finance screens and the cash day close. Apart from `deskHooks` so the first desk download (check-in) doesn’t carry them. */

const financeApi = () => import("@/api/finance");
const dayCloseApi = () => import("@/api/dayClose");

/** Invoices or payments across the branches finance works in, with billed and collected shown apart. */
export function useFinanceList(q: import("@/api/finance").FinanceListQuery) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "finance-list", q], queryFn: async () => (await financeApi()).getFinanceList(session, q), enabled: !!session, retry, staleTime: 0, placeholderData: keepPreviousData });
}

export function useReconciliation() {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "reconciliation"], queryFn: async () => (await financeApi()).getReconciliation(session), enabled: !!session, retry, staleTime: 0 });
}

export function useReconciliationActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["desk", session?.userId] });
  return {
    run: useMutation({ mutationFn: async () => (await financeApi()).runReconciliation(session), onSuccess: refresh }),
    review: useMutation({ mutationFn: async (i: Parameters<typeof import("@/api/finance").reviewIssue>[1]) => (await financeApi()).reviewIssue(session, i), onSuccess: refresh }),
  };
}

export function useCreateExport() {
  const { session } = useSession();
  return useMutation({ mutationFn: async (i: Parameters<typeof import("@/api/finance").createExport>[1]) => (await financeApi()).createExport(session, i) });
}

export function useDayClose(branchId: string | undefined, date: string) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "day-close", branchId, date], queryFn: async () => (await dayCloseApi()).getDayClose(session, { branchId: branchId!, date: date || undefined }), enabled: !!session && !!branchId, retry, staleTime: 0 });
}

export function useDayCloseActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["desk", session?.userId] });
  return {
    close: useMutation({ mutationFn: async (i: import("@/api/dayClose").CloseInput) => (await dayCloseApi()).closeDay(session, i), onSuccess: refresh }),
  };
}
