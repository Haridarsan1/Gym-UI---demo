import { useRef, useState } from "react";
import { Download, Trash2, X } from "lucide-react";
import { isApiError, useRequestData } from "@/api";
import type { ProfileData, RequestView } from "@/api";
import { Button3D } from "@/design/Button3D";
import { Dialog } from "@/design/Dialog";
import { useToast } from "@/design/Toast";
import { istDateOf } from "@/domain/dates";
import { formatDate } from "@/lib/when";

const STATUS: Record<RequestView["status"], string> = { requested: "Requested", in_progress: "In progress", completed: "Completed", declined: "Declined" };
const newKey = () => `dr-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const TEXT = {
  export: {
    title: "Ask for a copy of your data",
    body: ["We prepare everything the gym holds about you: your details, workouts, measurements, bookings and payments, and your photos if you have agreed to them.", "The gym emails it to you, and you can follow its status on this screen."],
    button: "Request a copy",
    done: "Your request is in. The gym will email you a copy.",
  },
  deletion: {
    title: "Ask for your data to be deleted",
    body: ["The gym reviews your request and tells you by email what was deleted.", "Some records, such as invoices and tax receipts, must be kept for the time the law requires. Those stay, and the gym tells you which.", "Once your data is deleted you can no longer use your membership. If you only want a break, ask the front desk about a freeze."],
    button: "Request deletion",
    done: "Your request is in. The gym will email you about it.",
  },
} as const;

/** Requests for a copy of the member’s data and for deletion (S04), and their status. */
export function DataRequests({ p }: { p: ProfileData }) {
  const [kind, setKind] = useState<"export" | "deletion" | null>(null);
  const [error, setError] = useState<string>();
  const request = useRequestData();
  const toast = useToast();
  const key = useRef(newKey());
  const open = (k: "export" | "deletion") => {
    key.current = newKey();
    setError(undefined);
    setKind(k);
  };
  const submit = async () => {
    if (!kind) return;
    try {
      const r = await request.mutateAsync({ kind, idempotencyKey: key.current });
      toast({ title: r.repeated ? "You already have this request open" : "Request received", description: r.repeated ? "We’ll email you when it moves on." : TEXT[kind].done, tone: r.repeated ? "info" : "success" });
      setKind(null);
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t send your request. Check your connection and try again. Sending it again won’t create a second request.");
    }
  };
  const t = kind ? TEXT[kind] : undefined;
  const openOf = (k: RequestView["kind"]) => p.requests.some((r) => r.kind === k && (r.status === "requested" || r.status === "in_progress"));

  return (
    <section aria-labelledby="data-title" className="clay-flat space-y-4 p-5">
      <div>
        <h2 id="data-title" className="text-lg font-bold">Your data</h2>
        <p className="text-[0.95rem] text-clay-muted">You can ask the gym for a copy of what it holds about you, or ask for it to be deleted. The gym answers under its retention policy.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button3D variant="white" onClick={() => open("export")}>
          <Download className="h-5 w-5" aria-hidden="true" />
          Ask for a copy
        </Button3D>
        <Button3D variant="white" onClick={() => open("deletion")}>
          <Trash2 className="h-5 w-5" aria-hidden="true" />
          Ask for deletion
        </Button3D>
      </div>
      {(openOf("export") || openOf("deletion")) && <p className="text-sm text-clay-muted">You already have a request open. Asking again won’t make a second one.</p>}
      <div>
        <h3 className="font-bold">Your requests</h3>
        {p.requests.length === 0 ? (
          <p className="text-[0.95rem] text-clay-muted">No requests yet. When you ask, it is listed here with its status.</p>
        ) : (
          <ul className="mt-1 divide-y divide-clay-line" aria-label="Your requests">
            {p.requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="block font-semibold">{r.kind === "export" ? "Copy of your data" : "Deletion of your data"}</span>
                  <span className="block text-sm text-clay-muted">Asked on {formatDate(istDateOf(r.requestedAt))}</span>
                </span>
                <span className="rounded-full bg-clay-lavender px-3 py-1 text-sm font-semibold">{STATUS[r.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={kind !== null} onClose={() => !request.isPending && setKind(null)} label={t?.title ?? "Request"} placement="bottom" className="p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold">{t?.title}</h2>
          <button type="button" onClick={() => setKind(null)} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-lavender">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {t?.body.map((line) => (
            <p key={line} className="text-[0.95rem]">{line}</p>
          ))}
          {error && <p role="alert" className="rounded-2xl bg-status-pending-bg px-4 py-3 text-status-pending-fg">{error}</p>}
          <Button3D size="lg" className="mt-2 w-full" onClick={submit} disabled={request.isPending}>{request.isPending ? "Sending…" : t?.button}</Button3D>
          <Button3D variant="white" className="w-full" onClick={() => setKind(null)} disabled={request.isPending}>Not now</Button3D>
        </div>
      </Dialog>
    </section>
  );
}
