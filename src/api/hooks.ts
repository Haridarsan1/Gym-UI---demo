import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe } from "@/api/me";
import { listMembers, type MemberListParams } from "@/api/members";
import { getToday } from "@/api/member";
import type { DraftInput, SubmitInput } from "@/api/workout";
import type { FeedbackInput } from "@/api/workoutSummary";
import type { CheckInInput, MeasurementInput, PhotoInput } from "@/api/progress";
import type { BookInput, CancelInput, RescheduleInput } from "@/api/bookings";
import type { AutoRenewInput, CheckoutInput, PayInput } from "@/api/membership";
import type { ConsentInput, RequestInput, SettingsInput } from "@/api/profile";
import { isRetryable } from "@/api/errors";
import { useSession } from "@/app/SessionContext";

/**
 * Screens use these hooks and nothing else to read data. Each one calls an API function with the signed-in session,
 * so switching user or signing out never shows the previous person’s data (the user id is part of every key).
 */
/**
 * The workout API checks its input with Zod, which Today and the other areas never need. It is loaded the first time a
 * program or workout screen asks for it, so it stays out of every area’s first download (the `/m` budget).
 */
const workoutApi = () => import("@/api/workout");
const summaryApi = () => import("@/api/workoutSummary");
const progressApi = () => import("@/api/progress");
const bookingsApi = () => import("@/api/bookings");
const membershipApi = () => import("@/api/membership");
const passApi = () => import("@/api/pass");
const profileApi = () => import("@/api/profile");
/** The trainer app’s reads load with the trainer area, not with the member app or the marketing site. */
const trainerApi = () => import("@/api/trainer");

const retry = (count: number, error: unknown) => count < 2 && isRetryable(error);

export function useMe() {
  const { session } = useSession();
  return useQuery({ queryKey: ["me", session?.userId], queryFn: () => getMe(session), enabled: !!session, retry, staleTime: 5 * 60_000 });
}

export function useMembers(params: MemberListParams = {}) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["members", session?.userId, params],
    queryFn: () => listMembers(session, params),
    enabled: !!session,
    retry,
    placeholderData: keepPreviousData,
  });
}

/** The member’s Today screen: workout or rest day, week, streak, sessions, and anything needing attention. */
export function useToday() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "today"], queryFn: () => getToday(session), enabled: !!session, retry, staleTime: 15_000 });
}

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

/** The trainer’s Today (T07): sessions, overdue reviews, missed workouts, expiring credits and clients waiting for a plan. */
export function useTrainerToday() {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "today"], queryFn: async () => (await trainerApi()).getTrainerToday(session), enabled: !!session, retry, staleTime: 15_000 });
}

const clientsApi = () => import("@/api/clients");

/** The trainer’s clients (T01), searched and filtered. The previous list stays on screen while a new search loads. */
export function useClients(params: import("@/api/clients").ClientListParams) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["trainer", session?.userId, "clients", params.search ?? "", params.flag ?? ""],
    queryFn: async () => (await clientsApi()).listClients(session, params),
    enabled: !!session,
    retry,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/** One client’s profile, for their trainer (T02, T05, T06, A02). */
export function useClient(memberId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "client", memberId], queryFn: async () => (await clientsApi()).getClient(session, memberId!), enabled: !!session && !!memberId, retry, staleTime: 15_000 });
}

/** Writes a note only the trainer can read. */
export function useAddPrivateNote(memberId: string) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => (await clientsApi()).addPrivateNote(session, { memberId, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trainer", session?.userId, "client", memberId] }),
  });
}

const assessmentsApi = () => import("@/api/assessments");

/** A client’s assessments and goals (T02), for their trainer. Assessments are health data: they come through the audited door and need consent. */
export function useAssessment(memberId: string | undefined) {
  const { session } = useSession();
  return useQuery({ queryKey: ["trainer", session?.userId, "assessment", memberId], queryFn: async () => (await assessmentsApi()).getAssessment(session, memberId!), enabled: !!session && !!memberId, retry, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
}

/** Everything that changes after an assessment or a goal is saved: the assessment screen, the client’s profile and Today. */
function useRefreshClient() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return () => Promise.all(["assessment", "client", "clients", "today"].map((k) => queryClient.invalidateQueries({ queryKey: ["trainer", session?.userId, k] })));
}

export function useSaveAssessment() {
  const { session } = useSession();
  const refresh = useRefreshClient();
  return useMutation({ mutationFn: async (input: import("@/api/assessments").AssessmentInput) => (await assessmentsApi()).saveAssessment(session, input), onSuccess: refresh });
}

export function useGoalActions(memberId: string) {
  const { session } = useSession();
  const refresh = useRefreshClient();
  const api = assessmentsApi;
  return {
    create: useMutation({ mutationFn: async (i: import("@/api/assessments").GoalInput) => (await api()).createGoal(session, i), onSuccess: refresh }),
    revise: useMutation({ mutationFn: async (i: import("@/api/assessments").GoalInput & { goalId: string; reason: string }) => (await api()).reviseGoal(session, i), onSuccess: refresh }),
    close: useMutation({ mutationFn: async (i: { goalId: string; reason: string }) => (await api()).closeGoal(session, { memberId, ...i }), onSuccess: refresh }),
    achieve: useMutation({ mutationFn: async (i: { goalId: string; note?: string }) => (await api()).confirmGoalAchieved(session, { memberId, ...i }), onSuccess: refresh }),
  };
}
