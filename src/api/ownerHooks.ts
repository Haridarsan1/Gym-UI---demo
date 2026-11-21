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

export function useStaff() {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "staff"], queryFn: async () => (await import("@/api/staff")).getStaff(session), enabled: !!session, retry, staleTime: 0 });
}

export function useStaffActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const done = () => { void qc.invalidateQueries({ queryKey: ["owner", session?.userId, "staff"] }); void qc.invalidateQueries({ queryKey: ["demo", session?.userId] }); };
  return {
    invite: useMutation({ mutationFn: async (i: import("@/api/staff").InviteStaffInput) => (await import("@/api/staff")).inviteStaff(session, i), onSuccess: done }),
    update: useMutation({ mutationFn: async (i: import("@/api/staff").UpdateStaffInput) => (await import("@/api/staff")).updateStaff(session, i), onSuccess: done }),
    status: useMutation({ mutationFn: async (i: import("@/api/staff").StaffStatusInput) => (await import("@/api/staff")).setStaffActive(session, i), onSuccess: done }),
    resend: useMutation({ mutationFn: async (i: { userId: string; key: string }) => (await import("@/api/staff")).resendInvite(session, i), onSuccess: done }),
  };
}

export function useBranches() {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "branches"], queryFn: async () => (await import("@/api/branches")).getBranches(session), enabled: !!session, retry, staleTime: 0 });
}

export function useBranchActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  return { save: useMutation({ mutationFn: async (i: import("@/api/branches").SaveBranchInput) => (await import("@/api/branches")).saveBranch(session, i), onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", session?.userId, "branches"] }) }) };
}

export function useCommunications(q: import("@/api/communications").CommsQuery) {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "comms", q], queryFn: async () => (await import("@/api/communications")).getCommunications(session, q), enabled: !!session, retry, staleTime: 0, placeholderData: keepPreviousData });
}

export function useCommsActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["owner", session?.userId, "comms"] });
  const api = () => import("@/api/communications");
  return {
    send: useMutation({ mutationFn: async (i: import("@/api/communications").SendInput) => (await api()).sendToGroup(session, i), onSuccess: done }),
    retry: useMutation({ mutationFn: async (i: { id: string }) => (await api()).retryEmail(session, i), onSuccess: done }),
    retryAll: useMutation({ mutationFn: async (i: { branchId?: string }) => (await api()).retryAllFailed(session, i), onSuccess: done }),
    template: useMutation({ mutationFn: async (i: import("@/api/communications").SaveTemplateInput) => (await api()).saveTemplate(session, i), onSuccess: done }),
    failure: useMutation({ mutationFn: async (on: boolean) => (await api()).setEmailFailure(session, on), onSuccess: done }),
  };
}

export function useImportActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  return {
    preview: useMutation({ mutationFn: async (csv: string) => (await import("@/api/memberImport")).previewMemberImport(session, { csv }) }),
    invite: useMutation({ mutationFn: async (i: import("@/api/memberInvites").InviteInput) => (await import("@/api/memberInvites")).inviteMembers(session, i), onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", session?.userId, "imports"] }) }),
    run: useMutation({ mutationFn: async (i: import("@/api/memberImport").RunImportInput) => (await import("@/api/memberImport")).runMemberImport(session, i), onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", session?.userId] }) }),
  };
}

export function useSubscription() {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "subscription"], queryFn: async () => (await import("@/api/subscription")).getSubscription(session), enabled: !!session, retry, staleTime: 0 });
}

export function useAuditLog(q: import("@/api/audit").AuditQuery) {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "audit", q], queryFn: async () => (await import("@/api/audit")).getAuditLog(session, q), enabled: !!session, retry, staleTime: 0, placeholderData: keepPreviousData });
}

export function useAuditExport() {
  const { session } = useSession();
  return useMutation({ mutationFn: async (q: import("@/api/audit").AuditQuery) => (await import("@/api/audit")).exportAuditLog(session, q) });
}

export function useSettings() {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "settings"], queryFn: async () => (await import("@/api/settings")).getSettings(session), enabled: !!session, retry, staleTime: 0 });
}

export function useSaveSettings() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: import("@/api/settings").SaveSettingsInput) => (await import("@/api/settings")).saveSettings(session, i),
    // The gym’s name and logo are in the header, the sidebar and every receipt.
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["owner", session?.userId, "settings"] }), qc.invalidateQueries({ queryKey: ["me"] }), qc.invalidateQueries({ queryKey: ["desk"] }), qc.invalidateQueries({ queryKey: ["member"] })]),
  });
}

export function useImports() {
  const { session } = useSession();
  return useQuery({ queryKey: ["owner", session?.userId, "imports"], queryFn: async () => (await import("@/api/memberImport")).listImports(session), enabled: !!session, retry, staleTime: 0 });
}

export function useSubscriptionActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const done = () => Promise.all([qc.invalidateQueries({ queryKey: ["owner", session?.userId] }), qc.invalidateQueries({ queryKey: ["me"] })]);
  return {
    reactivate: useMutation({ mutationFn: async (i: { key: string }) => (await import("@/api/subscription")).reactivateSubscription(session, i), onSuccess: done }),
    requestPlan: useMutation({ mutationFn: async (i: { planId: string; note?: string; key: string }) => (await import("@/api/subscription")).requestPlanChange(session, i), onSuccess: done }),
  };
}
