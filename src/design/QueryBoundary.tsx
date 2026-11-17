import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { SkeletonCard } from "@/design/Skeleton";
import { ErrorState } from "@/design/States";

/**
 * Every list and screen has a loading placeholder and an error with a retry. This gives both, so a screen only writes
 * what to show when the data is there.
 */
export function QueryBoundary<T>({ query, skeleton, errorTitle, children }: { query: UseQueryResult<T>; skeleton?: ReactNode; errorTitle?: string; children: (data: T) => ReactNode }) {
  if (query.isPending) return <>{skeleton ?? <SkeletonCard />}</>;
  if (query.isError) return <ErrorState error={query.error} title={errorTitle} onRetry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}
