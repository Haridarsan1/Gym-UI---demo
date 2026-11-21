import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { retry } from "@/api/hooks";
import { useSession } from "@/app/SessionContext";

/** Hooks for the platform admin console. Apart from the other areas’ hooks so nobody else downloads them. */
const api = () => import("@/api/platform");

export function useTenants() {
  const { session } = useSession();
  return useQuery({ queryKey: ["admin", session?.userId, "tenants"], queryFn: async () => (await api()).listTenants(session), enabled: !!session, retry, staleTime: 0 });
}

export function useTenant(tenantId: string) {
  const { session } = useSession();
  return useQuery({ queryKey: ["admin", session?.userId, "tenant", tenantId], queryFn: async () => (await api()).getTenantDetail(session, tenantId), enabled: !!session && !!tenantId, retry, staleTime: 0 });
}

export function useSaasPlans() {
  const { session } = useSession();
  return useQuery({ queryKey: ["admin", session?.userId, "plans"], queryFn: async () => (await api()).listSaasPlans(session), enabled: !!session, retry, staleTime: 0 });
}

export function useSupport() {
  const { session } = useSession();
  return useQuery({ queryKey: ["admin", session?.userId, "support"], queryFn: async () => (await api()).listSupport(session), enabled: !!session, retry, staleTime: 0 });
}

export function useAdminActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["admin", session?.userId] });
  const m = <I, O>(fn: (a: typeof import("@/api/platform"), i: I) => Promise<O>) => useMutation({ mutationFn: async (i: I) => fn(await api(), i), onSuccess: done });
  return {
    createTenant: m((a, i: import("@/api/platform").NewTenantInput) => a.createTenant(session, i)),
    setState: m((a, i: import("@/api/platform").SetStateInput) => a.setSubscriptionState(session, i)),
    changePlan: m((a, i: { key: string; tenantId: string; planId: string }) => a.changeTenantPlan(session, i)),
    issueInvoice: m((a, i: { tenantId: string; key: string }) => a.issueInvoice(session, i)),
    markPaid: m((a, i: { invoiceId: string }) => a.markInvoicePaid(session, i)),
    decide: m((a, i: { key: string; requestId: string; approve: boolean; note?: string }) => a.decidePlanRequest(session, i)),
    savePlan: m((a, i: import("@/api/platform").SaveSaasPlanInput) => a.saveSaasPlan(session, i)),
    archive: m((a, i: { planId: string; archived: boolean }) => a.setSaasPlanArchived(session, i)),
    requestSupport: m((a, i: import("@/api/platform").RequestSupportInput) => a.requestSupportAccess(session, i)),
    endSupport: m((a, i: { sessionId: string }) => a.endSupportAccess(session, i)),
    enterSupport: useMutation({ mutationFn: async (i: { sessionId: string }) => (await api()).enterSupport(session, i) }),
  };
}
