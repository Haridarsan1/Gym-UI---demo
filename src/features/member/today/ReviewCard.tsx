import { Link } from "react-router-dom";
import { MessageSquareText } from "lucide-react";
import type { TodayData } from "@/api/member";
import { formatDayMonth } from "@/lib/when";
import { istDateOf } from "@/domain/dates";

/** A card that appears while there is a shared review you have not opened (T06). */
export function ReviewCard({ t }: { t: TodayData }) {
  const r = t.newReview;
  if (!r) return null;
  return (
    <section aria-labelledby="review-title" className="clay-flat p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lilac-100 text-lilac-700">
          <MessageSquareText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="review-title" className="font-bold">
            New review from Coach {r.trainerName.split(" ")[0]}
          </h2>
          <p className="text-xs text-clay-subtle">{formatDayMonth(istDateOf(r.createdAt))}</p>
          <p className="mt-1 text-[0.95rem] text-clay-muted">{r.excerpt}</p>
          <Link to="/m/progress/reviews" className="mt-2 inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">
            Read review
          </Link>
        </div>
      </div>
    </section>
  );
}
