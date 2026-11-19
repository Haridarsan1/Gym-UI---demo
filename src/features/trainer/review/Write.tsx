import { useState } from "react";
import { Lock, Send } from "lucide-react";
import { useSaveReview } from "@/api/trainerHooks";
import type { ReviewData } from "@/api/review";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { useToast } from "@/design/Toast";
import { addDays } from "@/domain/dates";
import { formatDate } from "@/lib/when";
import { cn } from "@/lib/format";

const newKey = () => `rev-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

/** Write the review: feedback the client reads, or a private note only you read, and when to look again. */
export function WriteReview({ v }: { v: ReviewData }) {
  const save = useSaveReview(v.memberId);
  const toast = useToast();
  const [kind, setKind] = useState<"shared_review" | "private_note">("shared_review");
  const [body, setBody] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [error, setError] = useState<string>();
  // One key for what is on screen: a retry or a double tap makes one review. It changes once the review is saved.
  const [key, setKey] = useState(newKey);
  const shared = kind === "shared_review";
  const tomorrow = addDays(v.today, 1);
  const presets = [{ label: "In 1 week", days: 7 }, { label: "In 2 weeks", days: 14 }, { label: `Every ${v.due?.cadenceDays ?? 28} days`, days: v.due?.cadenceDays ?? 28 }];

  const submit = () => {
    setError(undefined);
    if (body.trim().length < 3) return setError(shared ? `Write the feedback first. It is what ${v.firstName} reads.` : "Write something first.");
    if (shared && followUp && followUp <= v.today) return setError("Choose a follow-up date after today.");
    save.mutate({ memberId: v.memberId, kind, body, followUpOn: shared && followUp ? followUp : undefined, key }, {
      onSuccess: () => {
        toast({ title: shared ? `Review shared with ${v.firstName}` : "Private note saved", description: shared ? (followUp ? `Next review ${formatDate(followUp)}.` : "They will see it on their Today screen.") : "Only you can read it.", tone: "success" });
        setBody("");
        setFollowUp("");
        setKey(newKey());
      },
      onError: (e) => setError(isApiError(e) ? e.message : "We couldn’t save this. Try again."),
    });
  };

  return (
    <section aria-labelledby="wr-title" className="clay p-4">
      <h2 id="wr-title" className="text-lg font-bold">Write your review</h2>
      <div role="radiogroup" aria-label="Who can read it" className="mt-3 grid gap-2 sm:grid-cols-2">
        {([
          { value: "shared_review", title: `Shared with ${v.firstName}`, text: "They read it in their app and see a new-review card on Today." },
          { value: "private_note", title: "Private note", text: "Only you can read it. It stays with you even if the client moves to another trainer." },
        ] as const).map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={kind === o.value} onClick={() => setKind(o.value)} className={cn("min-h-[2.75rem] cursor-pointer rounded-2xl border-2 p-3 text-left", kind === o.value ? "border-ember-600 bg-ember-50" : "border-clay-line bg-white hover:bg-clay-canvas")}>
            <span className="flex items-center gap-2 font-semibold">{o.value === "private_note" ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}{o.title}</span>
            <span className="mt-0.5 block text-sm text-clay-muted">{o.text}</span>
          </button>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="font-semibold">{shared ? `Feedback for ${v.firstName}` : "Your note"}</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} className="mt-2 w-full max-w-[70ch] rounded-xl border border-clay-line p-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
      </label>
      {shared && (
        <fieldset className="mt-3">
          <legend className="font-semibold">Follow-up date</legend>
          <p className="text-sm text-clay-muted">When the next review is due. Leave it empty to use the usual rhythm{v.due ? `, every ${v.due.cadenceDays} days` : ""}.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="date" aria-label="Follow-up date" value={followUp} min={tomorrow} onChange={(e) => setFollowUp(e.target.value)} className="h-11 rounded-xl border border-clay-line px-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
            {presets.map((p) => (
              <button key={p.label} type="button" onClick={() => setFollowUp(addDays(v.today, p.days))} className="min-h-[2.75rem] cursor-pointer rounded-full bg-clay-lavender px-4 text-sm font-semibold hover:bg-clay-lavender/70">{p.label}</button>
            ))}
            {followUp && <button type="button" onClick={() => setFollowUp("")} className="min-h-[2.75rem] cursor-pointer px-2 text-sm font-semibold underline underline-offset-4">Clear</button>}
          </div>
        </fieldset>
      )}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="mt-4">
        <Button3D variant="ember" size="lg" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : shared ? "Share review" : "Save private note"}</Button3D>
      </div>
    </section>
  );
}

const KIND_WORDS = { shared_review: "Shared with the client", private_note: "Private note, only you can read it", member_checkin: "Client check-in" } as const;

/** Shared reviews and your own private notes, newest first, with the follow-up each one set. */
export function ReviewHistory({ v }: { v: ReviewData }) {
  return (
    <section aria-labelledby="hs-title" className="clay p-4">
      <h2 id="hs-title" className="text-lg font-bold">Reviews and notes</h2>
      {v.history.length === 0 ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">Nothing written yet. Your reviews and private notes list here.</p>
      ) : (
        <ul aria-label="Reviews and notes" className="mt-2 space-y-2">
          {v.history.map((n) => (
            <li key={n.id} className="rounded-2xl bg-clay-canvas p-3">
              <p className="text-sm font-semibold">{KIND_WORDS[n.kind]}</p>
              <p className="text-sm text-clay-muted">{n.authorIsMe ? "You" : n.authorName}, {formatDate(n.createdAt.slice(0, 10))}{n.followUpOn ? `, follow-up ${formatDate(n.followUpOn)}` : ""}</p>
              <p className="mt-1 max-w-[70ch] whitespace-pre-wrap text-[0.95rem]">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
