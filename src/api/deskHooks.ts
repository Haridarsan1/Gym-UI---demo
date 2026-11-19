import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { retry } from "@/api/hooks";
import { useSession } from "@/app/SessionContext";

/** Hooks for the front desk and finance console. Apart from the other hooks so the member and trainer apps never download them. */
const checkinApi = () => import("@/api/checkin");

export function useMemberSearch(q: string) {
  const { session } = useSession();
  const text = q.trim();
  return useQuery({ queryKey: ["desk", session?.userId, "search", text], queryFn: async () => (await checkinApi()).searchMembers(session, text), enabled: !!session && text.length >= 2, retry, placeholderData: keepPreviousData, staleTime: 5_000 });
}

/** Today’s check-ins at one branch. It refreshes by itself every few seconds so the list stays live at a busy desk. */
export function useTodayCheckIns(branchId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "checkins", branchId], queryFn: async () => (await checkinApi()).getTodayCheckIns(session, branchId!), enabled: !!session && !!branchId, retry, refetchInterval: 5_000, staleTime: 0 });
}

export function useCheckInActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["desk", session?.userId, "checkins"] });
  return {
    checkIn: useMutation({ mutationFn: async (i: import("@/api/checkin").CheckInInput) => (await checkinApi()).checkInMember(session, i), onSuccess: refresh }),
    override: useMutation({ mutationFn: async (i: import("@/api/checkin").OverrideInput) => (await checkinApi()).overrideCheckIn(session, i), onSuccess: refresh }),
  };
}

