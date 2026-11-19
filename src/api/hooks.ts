import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MemberListParams } from "@/api/members";
import { isRetryable } from "@/api/errors";
import { useSession } from "@/app/SessionContext";

/**
 * Screens use these hooks and nothing else to read data. Each one calls an API function with the signed-in session,
 * so switching user or signing out never shows the previous person’s data (the user id is part of every key).
 */

export const retry = (count: number, error: unknown) => count < 2 && isRetryable(error);

export function useMe() {
  const { session } = useSession();
  return useQuery({ queryKey: ["me", session?.userId], queryFn: async () => (await import("@/api/me")).getMe(session), enabled: !!session, retry, staleTime: 5 * 60_000 });
}

export function useMembers(params: MemberListParams = {}) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["members", session?.userId, params],
    queryFn: async () => (await import("@/api/members")).listMembers(session, params),
    enabled: !!session,
    retry,
    placeholderData: keepPreviousData,
  });
}

/** The member’s Today screen: workout or rest day, week, streak, sessions, and anything needing attention. */
export function useToday() {
  const { session } = useSession();
  return useQuery({ queryKey: ["member", session?.userId, "today"], queryFn: async () => (await import("@/api/member")).getToday(session), enabled: !!session, retry, staleTime: 15_000 });
}
