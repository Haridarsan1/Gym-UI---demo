import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe } from "@/api/me";
import { listMembers, type MemberListParams } from "@/api/members";
import { getToday } from "@/api/member";
import { getProgram, getWorkout, saveWorkoutDraft, submitWorkout, type DraftInput, type SubmitInput } from "@/api/workout";
import { isRetryable } from "@/api/errors";
import { useSession } from "@/app/SessionContext";

/**
 * Screens use these hooks and nothing else to read data. Each one calls an API function with the signed-in session,
 * so switching user or signing out never shows the previous person’s data (the user id is part of every key).
 */
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
  return useQuery({ queryKey: ["member", session?.userId, "program"], queryFn: () => getProgram(session), enabled: !!session, retry, staleTime: 15_000 });
}

/**
 * One workout day: the prescription and what is logged. It is read fresh each time (never kept), because the logging screen
 * copies it into its own state and saves from there; a stale copy must not overwrite newer sets.
 */
export function useWorkout(date: string, enabled = true) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["member", session?.userId, "workout", date],
    queryFn: () => getWorkout(session, date),
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
  return useMutation({ mutationFn: (input: DraftInput) => saveWorkoutDraft(session, input), retry });
}

/** Finishes a workout. Repeating it with the same key makes no second log. Refreshes Today and the program path. */
export function useSubmitWorkout() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitInput) => submitWorkout(session, input),
    retry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["member", session?.userId] }),
  });
}
