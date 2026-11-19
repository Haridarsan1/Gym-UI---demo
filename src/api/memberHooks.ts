import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DraftInput, SubmitInput } from "@/api/workout";
import type { FeedbackInput } from "@/api/workoutSummary";
import type { CheckInInput, MeasurementInput, PhotoInput } from "@/api/progress";
import type { BookInput, CancelInput, RescheduleInput } from "@/api/bookings";
import type { AutoRenewInput, CheckoutInput, PayInput } from "@/api/membership";
import type { ConsentInput, RequestInput, SettingsInput } from "@/api/profile";
import { retry } from "@/api/hooks";
import { useSession } from "@/app/SessionContext";

/** The member app’s hooks for every screen but Today. Apart from `hooks.ts` so Today and the shell download none of them. */
const workoutApi = () => import("@/api/workout");
const summaryApi = () => import("@/api/workoutSummary");
const progressApi = () => import("@/api/progress");
const bookingsApi = () => import("@/api/bookings");
const membershipApi = () => import("@/api/membership");
const passApi = () => import("@/api/pass");
const profileApi = () => import("@/api/profile");

/** The member’s plan as weeks of days, and how each day went. */
export function useProgram() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "program"], queryFn: async () => (await workoutApi()).getProgram(session), enabled: !!session, retry, staleTime: 15_000 });
}

/**
 * One workout day: the prescription and what is logged. It is read fresh each time (never kept), because the logging screen
 * copies it into its own state and saves from there; a stale copy must not overwrite newer sets.
 */
export function useWorkout(date: string, enabled = true) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["member", session?.userId, "workout", date],
    queryFn: async () => (await workoutApi()).getWorkout(session, date),
    enabled: !!session && enabled,
    retry,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Saves a workout in progress. Safe to repeat. */
export function useSaveWorkoutDraft() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DraftInput) => (await workoutApi()).saveWorkoutDraft(session, input),
    retry,
    retryDelay: 400,
    // Today shows “Continue workout” from the draft, so it must hear about a new one.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId, "today"] }),
  });
}

/** Finishes a workout. Repeating it with the same key makes no second log. Refreshes Today and the program path. */
export function useSubmitWorkout() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitInput) => (await workoutApi()).submitWorkout(session, input),
    retry,
    retryDelay: 600,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId] }),
  });
}

/** The finished workout’s summary: result, volume, new records, week, streak and badges. Read fresh, so a badge is never shown from a stale copy. */
export function useWorkoutSummary(date: string) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["member", session?.userId, "summary", date],
    queryFn: async () => (await summaryApi()).getWorkoutSummary(session, date),
    enabled: !!session,
    retry,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/** Saves effort and recovery for a finished workout (P04). Each tap saves; nothing needs submitting. */
export function useSaveWorkoutFeedback() {
  const { session } = useSession();
  return useMutation({ mutationFn: async (input: FeedbackInput) => (await summaryApi()).saveWorkoutFeedback(session, input), retry, retryDelay: 400 });
}

/** Everything the Progress screen charts, for the member’s whole history. The date range is applied on the screen. */
export function useProgress() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "progress"], queryFn: async () => (await progressApi()).getProgress(session), enabled: !!session, retry, staleTime: 15_000 });
}

/** Saves a weight or measurement. Refreshes the charts and goals. */
export function useLogMeasurement() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MeasurementInput) => (await progressApi()).logMeasurement(session, input),
    retry,
    retryDelay: 400,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId] }),
  });
}

export function usePhotos() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "photos"], queryFn: async () => (await progressApi()).getPhotos(session), enabled: !!session, retry, staleTime: 15_000 });
}

export function useAddPhoto() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: async (input: PhotoInput) => (await progressApi()).addProgressPhoto(session, input), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId, "photos"] }) });
}

export function useDeletePhoto() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: async (id: string) => (await progressApi()).deleteProgressPhoto(session, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId, "photos"] }) });
}

/** Shared reviews and the member’s own check-ins. Read fresh, so “new” is never shown from a stale copy. */
export function useReviews() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "reviews"], queryFn: async () => (await progressApi()).getReviews(session), enabled: !!session, retry, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
}

/** Marks shared reviews as read, which clears the card on Today. */
export function useMarkReviewsRead() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: async () => (await progressApi()).markReviewsRead(session), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId, "today"] }) });
}

export function useSubmitCheckIn() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CheckInInput) => (await progressApi()).submitCheckIn(session, input),
    retry,
    retryDelay: 400,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId, "reviews"] }),
  });
}

/** Upcoming and past sessions, the credit balance and the gym’s booking rules. Read fresh each visit: credits and slots change. */
export function useBookings() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "bookings"], queryFn: async () => (await bookingsApi()).getBookings(session), enabled: !!session, retry, staleTime: 0 });
}

/** Trainers the member can book, their own first. Only fetched while the booking sheet is open. */
export function useTrainerOptions(enabled: boolean) {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "trainers"], queryFn: async () => (await bookingsApi()).getTrainerOptions(session), enabled: !!session && enabled, retry, staleTime: 0, gcTime: 0 });
}

/** One trainer’s days and slots. Never kept: a slot can be taken at any moment. */
export function useTrainerSchedule(trainerId: string | undefined, excludeBookingId?: string) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["member", session?.userId, "schedule", trainerId, excludeBookingId],
    queryFn: async () => (await bookingsApi()).getTrainerSchedule(session, trainerId!, excludeBookingId),
    enabled: !!session && !!trainerId,
    retry,
    staleTime: 0,
    gcTime: 0,
  });
}

function useBookingMutation<I, O>(fn: (api: typeof import("@/api/bookings"), session: ReturnType<typeof useSession>["session"], input: I) => Promise<O>) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => fn(await bookingsApi(), session, input),
    // A failed booking can leave the slots or terms changed, so everything the member sees is read again either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId] }),
  });
}

export const useBookSession = () => useBookingMutation((api, session, input: BookInput) => api.bookSession(session, input));
export const useCancelBooking = () => useBookingMutation((api, session, input: CancelInput) => api.cancelBooking(session, input));
export const useRescheduleBooking = () => useBookingMutation((api, session, input: RescheduleInput) => api.rescheduleBooking(session, input));

// ── Membership, payment and receipts ─────────────────────────────────────────────────────────────

/** Plan, dues, renewal options, invoices and payments. Read fresh each visit: money changes. */
export function useMembership() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "membership"], queryFn: async () => (await membershipApi()).getMembership(session), enabled: !!session, retry, staleTime: 0 });
}

export function useReceipt(invoiceId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "receipt", invoiceId], queryFn: async () => (await membershipApi()).getReceipt(session, invoiceId!), enabled: !!session && !!invoiceId, retry, staleTime: 0 });
}

function useMembershipMutation<I, O>(fn: (api: typeof import("@/api/membership"), session: ReturnType<typeof useSession>["session"], input: I) => Promise<O>) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => fn(await membershipApi(), session, input),
    // Whatever happened, what the member sees about money, sessions and the plan is read again.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId] }),
  });
}

/** Opens a payment: for an open invoice, a renewal or a pack of sessions. Makes the invoice for the last two. */
export const useStartCheckout = () => useMembershipMutation((api, session, input: CheckoutInput) => api.startCheckout(session, input));
/** Pays through the simulated gateway. The same key sent again after a dropped connection charges once. */
export const usePayInvoice = () => useMembershipMutation((api, session, input: PayInput) => api.payInvoice(session, input));
export const useReplayGatewayEvent = () => useMembershipMutation((api, session, eventId: string) => api.replayGatewayEvent(session, eventId));
export const useSetAutoRenew = () => useMembershipMutation((api, session, input: AutoRenewInput) => api.setAutoRenew(session, input));
export const useSetPaymentFailure = () => useMembershipMutation((api, session, on: boolean) => api.setDemoPaymentFailure(session, on));

// ── Check-in pass ────────────────────────────────────────────────────────────────────────────────

/** The pass and recent check-ins. Read again every few seconds while the screen is open, so the pass notices a scan (M05). */
export function usePass() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "pass"], queryFn: async () => (await passApi()).getPass(session), enabled: !!session, retry, staleTime: 0, refetchInterval: 4000, refetchIntervalInBackground: false });
}

/** Demo control: scan the pass at the door. */
export function useSimulateScan() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: async () => (await passApi()).simulateDoorScan(session), onSettled: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId] }) });
}

// ── Me: profile, consent, preferences and data requests ──────────────────────────────────────────

export function useProfile() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "profile"], queryFn: async () => (await profileApi()).getProfile(session), enabled: !!session, retry, staleTime: 0 });
}

function useProfileMutation<I, O>(fn: (api: typeof import("@/api/profile"), session: ReturnType<typeof useSession>["session"], input: I) => Promise<O>) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => fn(await profileApi(), session, input),
    // Consent changes what Progress may show, so everything the member sees is read again.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId] }),
  });
}

export const useSetConsent = () => useProfileMutation((api, session, input: ConsentInput) => api.setConsent(session, input));
export const useSaveSettings = () => useProfileMutation((api, session, input: SettingsInput) => api.saveSettings(session, input));
export const useRequestData = () => useProfileMutation((api, session, input: RequestInput) => api.requestData(session, input));
