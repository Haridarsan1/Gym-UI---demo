import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Repeat, ShieldCheck, XCircle } from "lucide-react";
import { useCheckInActions } from "@/api/deskHooks";
import type { CheckInOutcome } from "@/api/checkin";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { formatDate, formatRupees } from "@/lib/when";
import { cn } from "@/lib/format";

const TONE = {
  allowed: { box: "bg-status-active-bg text-status-active-fg", icon: CheckCircle2 },
  allowed_with_dues: { box: "bg-status-pending-bg text-status-pending-fg", icon: CheckCircle2 },
  repeat_scan: { box: "bg-lilac-100 text-lilac-700", icon: Repeat },
  override: { box: "bg-lilac-100 text-lilac-700", icon: ShieldCheck },
  denied: { box: "bg-status-danger-bg text-status-danger-fg", icon: XCircle },
} as const;

const newKey = () => `ov-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

/**
 * The answer, large and plain, readable from across the counter: one icon, one line, the member’s name, and what to do next. Colour is never
 * the only signal (the words and the icon say it too). No confetti: this is a door, not a reward.
 */
export function Result({ r, onNext, onOutcome }: { r: CheckInOutcome; onNext: () => void; onOutcome: (r: CheckInOutcome) => void }) {
  const tone = TONE[r.result];
  const Icon = r.inGrace ? AlertTriangle : tone.icon;
  const [overriding, setOverriding] = useState(false);
  return (
    <section aria-label="Check-in result" aria-live="polite" data-result={r.result} className={cn("rounded-[2rem] p-6 sm:p-8", tone.box)}>
      <div className="flex items-start gap-4 sm:gap-6">
        <Icon className="h-14 w-14 shrink-0 sm:h-20 sm:w-20" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-[2.1rem] font-extrabold leading-tight tracking-tight sm:text-5xl">{r.inGrace ? "Checked in, membership ended" : r.headline}</h2>
          <p className="mt-1 truncate text-2xl font-bold sm:text-3xl">{r.name}</p>
        </div>
      </div>
      <p className="mt-4 max-w-[60ch] text-lg sm:text-xl">{r.detail}</p>
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-base sm:text-lg">
        {r.planName && <div><dt className="opacity-80">Plan</dt><dd className="font-bold">{r.planName}</dd></div>}
        {r.validTo && <div><dt className="opacity-80">Valid to</dt><dd className="font-bold">{formatDate(r.validTo)}</dd></div>}
        {r.visitsLeft !== null && <div><dt className="opacity-80">Visits left</dt><dd className="font-bold tabular">{r.visitsLeft}</dd></div>}
        {r.dues && <div><dt className="opacity-80">Owes</dt><dd className="font-bold tabular">{formatRupees(r.dues.amountPaise)}</dd></div>}
        <div><dt className="opacity-80">Branch</dt><dd className="font-bold">{r.branchName}</dd></div>
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        {r.canOverride && <Button3D variant="white" size="lg" onClick={() => setOverriding(true)}>Let in anyway…</Button3D>}
        <Link to={`/desk/members/${r.memberId}`} className="inline-flex min-h-[3rem] items-center rounded-2xl bg-white/70 px-5 font-bold text-clay-ink hover:bg-white">Open profile</Link>
        <Button3D variant="white" size="lg" onClick={onNext}>Next member</Button3D>
      </div>
      {overriding && <OverrideSheet r={r} onClose={() => setOverriding(false)} onDone={onOutcome} />}
    </section>
  );
}

function OverrideSheet({ r, onClose, onDone }: { r: CheckInOutcome; onClose: () => void; onDone: (r: CheckInOutcome) => void }) {
  const { override } = useCheckInActions();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [key] = useState(newKey);
  const save = async () => {
    if (reason.trim().length < 3) return setError("Say why you are letting them in. The reason is kept and audited.");
    try {
      onDone(await override.mutateAsync({ checkInId: r.checkInId, reason, key }));
      onClose();
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t save this. Try again.");
    }
  };
  return (
    <Sheet open onClose={onClose} label="Let in anyway" kind="confirm" className="p-5 text-clay-ink">
      <h2 className="text-xl font-bold">Let {r.firstName} in anyway?</h2>
      <p className="mt-1 text-clay-muted">{r.detail}</p>
      <p className="mt-2 text-sm text-clay-muted">The reason is kept with the check-in and written to the audit log. No visit is used, and it covers this visit only.</p>
      <label className="mt-4 block">
        <span className="font-semibold">Reason</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} autoFocus className="mt-2 w-full rounded-xl border border-clay-line p-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
      </label>
      {error && <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button3D variant="ember" size="lg" className="sm:flex-1" disabled={override.isPending} onClick={() => void save()}>{override.isPending ? "Saving…" : "Let in"}</Button3D>
        <Button3D variant="white" size="lg" onClick={onClose}>Cancel</Button3D>
      </div>
    </Sheet>
  );
}
