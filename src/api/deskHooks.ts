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

const newMemberApi = () => import("@/api/newMember");

/** The plans on sale, the branch’s trainers and the person’s own limits, for the new member wizard. */
export function useWizardOptions(branchId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "wizard", branchId], queryFn: async () => (await newMemberApi()).getWizardOptions(session, branchId!), enabled: !!session && !!branchId, retry, staleTime: 30_000 });
}

/** Members who match what has been typed so far, so a duplicate is flagged as soon as the phone number is complete. */
export function useDuplicates(q: import("@/api/newMember").DuplicateQuery, enabled: boolean) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "duplicates", q.name, q.phone, q.email, q.dateOfBirth], queryFn: async () => (await newMemberApi()).checkDuplicates(session, q), enabled: !!session && enabled, retry, staleTime: 0 });
}

export function useRegisterMember() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (i: import("@/api/newMember").RegisterInput) => (await newMemberApi()).registerMember(session, i), onSuccess: () => qc.invalidateQueries({ queryKey: ["desk", session?.userId] }) });
}

const profileApi = () => import("@/api/memberProfile");
const lifecycleApi = () => import("@/api/lifecycle");
const paymentsApi = () => import("@/api/payments");

/** One member for the desk and finance: membership, what can be done to it, billing, credits, bookings, check-ins, messages, trainer. */
export function useMemberProfile(memberId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "profile", memberId], queryFn: async () => (await profileApi()).getMemberProfile(session, memberId!), enabled: !!session && !!memberId, retry, staleTime: 0 });
}

export function usePlanChoices(memberId: string, enabled: boolean) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "plan-choices", memberId], queryFn: async () => (await lifecycleApi()).getPlanChoices(session, memberId), enabled: !!session && enabled, retry, staleTime: 0, gcTime: 0 });
}

export function useCancelPreview(memberId: string, effectiveOn: string, enabled: boolean) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "cancel-preview", memberId, effectiveOn], queryFn: async () => (await lifecycleApi()).previewCancel(session, { memberId, effectiveOn }), enabled: !!session && enabled, retry, staleTime: 0, gcTime: 0 });
}

/** Every write on a member: it refreshes the profile, the member lists and Today’s check-ins afterwards. */
export function useMemberActions(memberId: string) {
  const { session } = useSession();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["desk", session?.userId] });
  const life = <I, O>(fn: (api: typeof import("@/api/lifecycle"), input: I) => Promise<O>) => ({ mutationFn: async (input: I) => fn(await lifecycleApi(), input), onSuccess: refresh });
  return {
    freeze: useMutation(life((api, i: import("@/api/lifecycle").FreezeInput) => api.freezeMembership(session, i))),
    unfreeze: useMutation(life((api, _: void) => api.unfreezeMembership(session, { memberId }))),
    change: useMutation(life((api, i: import("@/api/lifecycle").ChangeInput) => api.changePlan(session, i))),
    cancel: useMutation(life((api, i: import("@/api/lifecycle").CancelInput) => api.cancelMembership(session, i))),
    keep: useMutation(life((api, _: void) => api.keepMembership(session, { memberId }))),
    requestRefund: useMutation(life((api, i: import("@/api/lifecycle").RefundRequestInput) => api.requestRefund(session, i))),
    collect: useMutation({ mutationFn: async (i: import("@/api/payments").CollectInput) => (await paymentsApi()).collectPayment(session, i), onSuccess: refresh }),
    transfer: useMutation({ mutationFn: async (i: import("@/api/assignments").TransferInput) => (await import("@/api/assignments")).transferTrainer(session, i), onSuccess: refresh }),
  };
}

const duesApi = () => import("@/api/dues");

/** Unpaid and part-paid invoices, and recent declined payments, at the person’s branches. */
export function useDues(branchId?: string) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "dues", branchId ?? "all"], queryFn: async () => (await duesApi()).getDues(session, { branchId }), enabled: !!session, retry, staleTime: 0 });
}

export function useSendReminder() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (invoiceId: string) => (await duesApi()).sendReminder(session, { invoiceId }), onSuccess: () => qc.invalidateQueries({ queryKey: ["desk", session?.userId] }) });
}

export function useDeskReceipt(invoiceId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "receipt", invoiceId], queryFn: async () => (await paymentsApi()).getDeskReceipt(session, invoiceId!), enabled: !!session && !!invoiceId, retry, staleTime: 0 });
}

const refundsApi = () => import("@/api/refunds");

/** The finance queue: refund requests waiting for a decision, and the decided ones. */
export function useRefunds() {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "refunds"], queryFn: async () => (await refundsApi()).getRefunds(session), enabled: !!session, retry, staleTime: 0 });
}

export function useDecideRefund() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (i: import("@/api/refunds").DecideInput) => (await refundsApi()).decideRefund(session, i), onSuccess: () => qc.invalidateQueries({ queryKey: ["desk", session?.userId] }) });
}

const bookingsApi = () => import("@/api/deskBookings");

/** The calendar: a day or a week at one branch, by trainer and room. It refreshes by itself so two desks see each other’s bookings. */
export function useCalendar(branchId: string | undefined, date: string, days: 1 | 7) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "calendar", branchId, date, days], queryFn: async () => (await bookingsApi()).getCalendar(session, { branchId: branchId!, date, days }), enabled: !!session && !!branchId, retry, refetchInterval: 15_000, staleTime: 0, placeholderData: keepPreviousData });
}

export function useBookingFacts(memberId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "booking-facts", memberId], queryFn: async () => (await bookingsApi()).getBookingFacts(session, memberId!), enabled: !!session && !!memberId, retry, staleTime: 0, gcTime: 0 });
}

export function useCalendarActions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["desk", session?.userId] });
  return {
    book: useMutation({ mutationFn: async (i: import("@/api/deskBookings").DeskBookInput) => (await bookingsApi()).bookForMember(session, i), onSuccess: refresh }),
    move: useMutation({ mutationFn: async (i: import("@/api/schedule").MoveInput) => (await bookingsApi()).moveDeskConflict(session, i), onSuccess: refresh }),
  };
}

export function useDeskConflictOptions(bookingId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["desk", session?.userId, "conflict-options", bookingId], queryFn: async () => (await bookingsApi()).getDeskConflictOptions(session, bookingId!), enabled: !!session && !!bookingId, retry, staleTime: 0, gcTime: 0 });
}
