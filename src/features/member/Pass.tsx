import { useEffect, useRef, useState } from "react";
import { Check, QrCode as QrIcon, ScanLine, Sun } from "lucide-react";
import { isApiError, usePass, useSimulateScan } from "@/api";
import type { PassData } from "@/api";
import { DEMO_MODE } from "@/app/mode";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { celebrate } from "@/design/celebrate";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { Switch } from "@/design/Switch";
import { istDateOf } from "@/domain/dates";
import { QrCode } from "@/features/member/pass/QrCode";
import { useWakeLock } from "@/features/member/pass/useWakeLock";
import { formatTime, formatWeekdayDate } from "@/lib/when";

/** Check-in pass (M05): the code the front desk scans, a brightness hint, and the last visits. */
export default function Pass() {
  const query = usePass();
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-clay-muted">{query.data ? formatWeekdayDate(query.data.today) : "Your way in"}</p>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">Check-in pass</h1>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load your pass" skeleton={<PassSkeleton />}>
        {(d) => <PassContent d={d} />}
      </QueryBoundary>
    </div>
  );
}

function PassContent({ d }: { d: PassData }) {
  const [awake, setAwake] = useState(true);
  useWakeLock(awake && d.ready);
  // The pass notices a scan that happens while it is open (the screen reads again every few seconds).
  const openedAt = useRef(d.nowIso);
  const scanned = d.recent.find((x) => x.at > openedAt.current);
  const entered = scanned && (scanned.result === "allowed" || scanned.result === "allowed_with_dues" || scanned.result === "override");
  const buzzed = useRef<string>();
  useEffect(() => {
    if (entered && scanned && buzzed.current !== scanned.id) {
      buzzed.current = scanned.id;
      celebrate("result");
    }
  }, [entered, scanned]);

  // Desktop: the pass in a centred card on the left, recent check-ins beside it.
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10">
      <div className="min-w-0 space-y-5">
      <section aria-labelledby="pass-title" className="clay p-5">
        <h2 id="pass-title" className="sr-only">Your pass</h2>
        {scanned ? (
          <div className="pop-in text-center" role="status">
            <span className={`mx-auto grid h-20 w-20 place-items-center rounded-full ${entered || scanned.result === "repeat_scan" ? "bg-status-active-bg text-status-active-fg" : "bg-status-pending-bg text-status-pending-fg"}`}>
              {entered || scanned.result === "repeat_scan" ? <Check className="h-10 w-10" aria-hidden="true" /> : <ScanLine className="h-10 w-10" aria-hidden="true" />}
            </span>
            <p className="mt-3 text-xl font-bold">{entered ? `Checked in at ${scanned.branchName}` : scanned.result === "repeat_scan" ? "You’re already checked in" : "Not checked in"}</p>
            <p className="text-clay-muted">{formatTime(scanned.at)}. {scanned.outcome}.</p>
            {entered && d.visitsLeft !== null && <p className="mt-1 font-semibold">{d.visitsLeft} {d.visitsLeft === 1 ? "visit" : "visits"} left</p>}
          </div>
        ) : (
          <div className="text-center">
            <div className={`mx-auto w-full max-w-[17rem] rounded-2xl bg-white p-2 shadow-sm ${d.ready ? "" : "opacity-40"}`}>
              <QrCode value={d.token} label={`Your check-in QR code, ${d.name}`} className="h-auto w-full" />
            </div>
            <p className="mt-3 text-xl font-bold">{d.name}</p>
            <p className="text-sm text-clay-muted">{d.gymName}, {d.branchName}</p>
            <p className="text-sm text-clay-muted">Member ID {d.memberCode}</p>
          </div>
        )}
        {!scanned && (
          <div className={`mt-4 rounded-2xl px-4 py-3 ${d.ready ? "bg-status-active-bg text-status-active-fg" : "bg-status-pending-bg text-status-pending-fg"}`} role={d.ready ? undefined : "alert"}>
            <p className="font-bold">{d.headline}</p>
            <p className="text-[0.95rem]">{d.detail}</p>
            {d.visitsLeft !== null && d.ready && <p className="mt-1 text-[0.95rem] font-semibold">{d.visitsLeft} {d.visitsLeft === 1 ? "visit" : "visits"} left on your pass</p>}
          </div>
        )}
        {!d.ready && !scanned && (
          <Button3DLink to="/m/membership" className="mt-3 w-full">Open membership</Button3DLink>
        )}
      </section>

      <section aria-labelledby="bright-title" className="clay-flat space-y-3 p-5">
        <div className="flex items-start gap-3">
          <Sun className="mt-0.5 h-5 w-5 shrink-0 text-ember-600" aria-hidden="true" />
          <div>
            <h2 id="bright-title" className="font-bold">Turn your brightness up</h2>
            <p className="text-[0.95rem] text-clay-muted">A bright screen is read faster at the door. Raise your phone’s brightness before you scan. A browser can’t do that for you.</p>
          </div>
        </div>
        <Switch id="stay-awake" checked={awake} onChange={setAwake} label="Keep my screen on" description="While this pass is open, your screen stays awake so it doesn’t go dark at the door." />
      </section>

      </div>

      <div className="min-w-0 space-y-5">
      <section aria-labelledby="recent-title" className="space-y-3">
        <h2 id="recent-title" className="text-lg font-bold">Recent check-ins</h2>
        {d.recent.length === 0 ? (
          <EmptyState icon={QrIcon} title="No check-ins yet">Your visits appear here after the front desk scans your pass. Show the code above on your next visit.</EmptyState>
        ) : (
          <ol className="space-y-2" aria-label="Recent check-ins">
            {d.recent.map((c) => (
              <li key={c.id} className="clay-flat flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{formatWeekdayDate(istDateOf(c.at))}, {formatTime(c.at)}</p>
                  <p className="text-sm text-clay-muted">{c.branchName}</p>
                </div>
                <p className="max-w-[55%] text-right text-sm text-clay-muted">{c.outcome}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {DEMO_MODE && <DemoScan />}
      </div>
    </div>
  );
}

/** Demo only: scan the pass as the door would, to see the pass flip and a repeat scan use no second visit. */
function DemoScan() {
  const scan = useSimulateScan();
  const [error, setError] = useState<string>();
  return (
    <section aria-labelledby="demo-scan-title" className="clay-flat !bg-lilac-100 space-y-3 p-5">
      <h2 id="demo-scan-title" className="text-lg font-bold">Demo controls</h2>
      <p className="text-[0.95rem]">Scan this pass as the front door would. Scan twice within 10 minutes to see that the second scan uses no extra visit.</p>
      <Button3D variant="white" onClick={() => { setError(undefined); scan.mutate(undefined, { onError: (e) => setError(isApiError(e) ? e.message : "We couldn’t scan the pass. Try again.") }); }} disabled={scan.isPending}>
        {scan.isPending ? "Scanning…" : "Scan my pass at the door"}
      </Button3D>
      {error && <p role="alert" className="rounded-2xl bg-status-pending-bg px-4 py-3 text-status-pending-fg">{error}</p>}
    </section>
  );
}

function PassSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading your pass">
      <SkeletonCard />
      <SkeletonRows rows={3} />
    </div>
  );
}
