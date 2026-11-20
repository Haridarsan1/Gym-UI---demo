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

export function usePlans() {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "plans"], queryFn: async () => (await import("@/api/plans")).getPlans(session), enabled: !!session, retry, staleTime: 0 });
}

export function usePlanActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["owner", session?.userId, "plans"] });
  return {
    save: useMutation({ mutationFn: async (i: import("@/api/plans").SavePlanInput) => (await import("@/api/plans")).savePlan(session, i), onSuccess: done }),
    onSale: useMutation({ mutationFn: async (i: { planId: string; on: boolean; key: string }) => (await import("@/api/plans")).setPlanOnSale(session, i), onSuccess: done }),
    savePt: useMutation({ mutationFn: async (i: import("@/api/plans").SavePtPricingInput) => (await import("@/api/plans")).savePtPricing(session, i), onSuccess: done }),
  };
}

export function usePolicies() {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "policies"], queryFn: async () => (await import("@/api/policyScreen")).getPolicies(session), enabled: !!session, retry, staleTime: 0 });
}

export function usePolicyActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  return { save: useMutation({ mutationFn: async (i: import("@/api/policyScreen").SavePoliciesInput) => (await import("@/api/policyScreen")).savePolicies(session, i), onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", session?.userId, "policies"] }) }) };
}
