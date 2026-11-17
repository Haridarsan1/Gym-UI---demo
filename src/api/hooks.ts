import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getMe } from "@/api/me";
import { listMembers, type MemberListParams } from "@/api/members";
import { getToday } from "@/api/member";
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
