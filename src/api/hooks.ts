import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe } from "@/api/me";
import { listMembers, type MemberListParams } from "@/api/members";
import { getToday } from "@/api/member";
import type { DraftInput, SubmitInput } from "@/api/workout";
import type { FeedbackInput } from "@/api/workoutSummary";
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
