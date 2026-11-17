import { cn } from "@/lib/format";

/** A grey block that stands in for content that is loading. Used instead of spinners for page loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton h-4 w-full", className)} />;
}

/** A list of loading rows. Announces itself once to screen readers. */
export function SkeletonRows({ rows = 6, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="clay-flat flex items-center gap-4 p-4">
          <Skeleton className="h-10 w-10 shrink-0 !rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 !rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="clay space-y-4 p-6">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}
