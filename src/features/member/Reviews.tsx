import { useEffect, useRef, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { useMarkReviewsRead, useReviews } from "@/api";
import type { CheckInView, ReviewView } from "@/api";
import { SubNav } from "@/app/SubNav";
import { SCREENS } from "@/app/screens";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { istDateOf } from "@/domain/dates";
import { CheckInForm, RECOVERY_WORDS } from "@/features/member/reviews/CheckInForm";
import { formatDate, formatDayMonth } from "@/lib/when";

/** “Effort 8 of 10, recovery: tired”, or just the part that was answered. */
function checkInLine(c: CheckInView): string {
  const parts = [c.effort !== undefined ? `effort ${c.effort} of 10` : "", c.recovery !== undefined ? `recovery: ${RECOVERY_WORDS[c.recovery - 1]!.toLowerCase()}` : ""].filter(Boolean);
  const line = parts.join(", ");
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : "Note only";
}

/** Reviews (P04, T06): what the trainer shared, newest first, and a short check-in form in return. */
export default function Reviews() {
  const query = useReviews();
  const screen = SCREENS.member.find((s) => s.id === "reviews")!;
  return (
    <div>
      <SubNav area="member" screen={screen} />
      <div className="space-y-5">
        <header>
          <p className="text-sm text-clay-muted">From your trainer, and to your trainer</p>
          <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">Reviews and check-ins</h1>
        </header>
        <QueryBoundary query={query} errorTitle="We couldn’t load your reviews" skeleton={<SkeletonCard label="Loading your reviews" />}>
          {(data) => <ReviewsContent reviews={data.reviews} checkIns={data.checkIns} />}
        </QueryBoundary>
      </div>
    </div>
  );
}

function ReviewsContent({ reviews, checkIns }: { reviews: ReviewView[]; checkIns: CheckInView[] }) {
  const markRead = useMarkReviewsRead();
  const sent = useRef(false);
  // Which reviews were new when the screen opened stays on screen, even though opening it marks them read.
  const [wasNew] = useState(() => new Set(reviews.filter((r) => r.unread).map((r) => r.id)));
  useEffect(() => {
    if (wasNew.size && !sent.current) {
      sent.current = true;
      markRead.mutate();
    }
  }, [wasNew, markRead]);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
      <section aria-labelledby="shared-title" className="min-w-0 space-y-3">
        <h2 id="shared-title" className="text-lg font-bold">Shared with you</h2>
        {reviews.length === 0 ? (
          <EmptyState icon={MessageSquareText} title="No reviews yet">When your trainer shares a review of your progress it appears here, newest first.</EmptyState>
        ) : (
          <ol className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id}>
                <article aria-label={`Review from Coach ${r.trainerName.split(" ")[0]}, ${formatDayMonth(istDateOf(r.createdAt))}`} className={`p-5 ${wasNew.has(r.id) ? "clay ring-2 ring-lilac-300" : "clay-flat"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold">Coach {r.trainerName.split(" ")[0]}</h3>
                    {wasNew.has(r.id) && <span className="rounded-full bg-lilac-100 px-2.5 py-1 text-xs font-bold text-lilac-700">New</span>}
                  </div>
                  <p className="text-sm text-clay-muted">{formatDate(istDateOf(r.createdAt))}</p>
                  <p className="mt-2 max-w-[70ch] text-[0.95rem] leading-relaxed">{r.body}</p>
                  {r.followUpOn && <p className="mt-2 text-sm font-semibold">Follow-up {r.followUpOn < istDateOf(new Date().toISOString()) ? "was" : "is"} on {formatDate(r.followUpOn)}.</p>}
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="min-w-0 space-y-5">
      <CheckInForm />
      <section aria-labelledby="mine-title" className="space-y-3">
        <h2 id="mine-title" className="text-lg font-bold">Your check-ins</h2>
        {checkIns.length === 0 ? (
          <p className="rounded-2xl bg-clay-lavender px-4 py-4 text-[0.95rem]">You have not sent a check-in yet. It takes two taps.</p>
        ) : (
          <ol className="space-y-2">
            {checkIns.map((c) => (
              <li key={c.id} className="clay-flat px-4 py-3">
                <p className="text-sm text-clay-muted">{formatDate(istDateOf(c.createdAt))}</p>
                <p className="font-semibold">{checkInLine(c)}</p>
                {c.obstacles && <p className="text-[0.95rem] text-clay-muted">{c.obstacles}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
      </div>
    </div>
  );
}
