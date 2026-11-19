import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ScanLine, Search } from "lucide-react";
import { useMe } from "@/api/hooks";
import { useCheckInActions, useMemberSearch, useTodayCheckIns } from "@/api/deskHooks";
import type { CheckInOutcome, MemberHit } from "@/api/checkin";
import { isApiError } from "@/api/errors";
import { Avatar } from "@/design/Avatar";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { useBranch } from "@/design/shells/BranchContext";
import { useShortcut } from "@/design/useShortcut";
import { Result } from "@/features/desk/checkin/Result";
import { formatTime } from "@/lib/when";
import { cn } from "@/lib/format";

/** The scanner and its camera code load only when it is opened. */
const Scanner = lazy(() => import("@/features/desk/scan/Scanner"));

const newKey = () => `ck-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

const RESULT_WORDS = { allowed: "In", allowed_with_dues: "In, payment due", repeat_scan: "Repeat scan", override: "Override", denied: "Turned away" } as const;

/**
 * Check-in (M05), the front desk’s home. Search for a member (or scan their pass) and the answer is on screen at once: large, plain, and
 * readable from across the counter. Today’s check-ins stay beside it and refresh by themselves. Keys: “/” search, “s” scan, “n” next member.
 * The desk works in one branch at a time: the branch switcher decides, or the list below when a person has more than one.
 */
export default function CheckIn() {
  const me = useMe();
  const { branchId: chosen } = useBranch();
  const branches = me.data?.branches ?? [];
  const [local, setLocal] = useState<string>();
  const branchId = chosen !== "all" ? chosen : (local ?? branches[0]?.id);
  const { checkIn } = useCheckInActions();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const [error, setError] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const search = useMemberSearch(q);
  const hits = q.trim().length >= 2 ? (search.data ?? []) : [];

  useEffect(() => setActive(0), [q]);
  const focusSearch = useCallback(() => input.current?.focus(), []);
  const next = useCallback(() => { setOutcome(null); setError(undefined); setQ(""); focusSearch(); }, [focusSearch]);

  const run = useCallback(async (who: { memberId?: string; token?: string }, method: "desk" | "qr") => {
    if (!branchId) return;
    setError(undefined);
    try {
      setOutcome(await checkIn.mutateAsync({ ...who, branchId, method, key: newKey() }));
      setQ("");
    } catch (e) {
      setError(isApiError(e) ? e.message : "We couldn’t check them in. Try again.");
    }
  }, [branchId, checkIn]);

  useShortcut("/", focusSearch);
  useShortcut("s", () => setScanning(true));
  useShortcut("n", next, !!outcome);

  const pick = (h: MemberHit) => void run({ memberId: h.memberId }, "desk");
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && hits[active]) { e.preventDefault(); pick(hits[active]!); }
    else if (e.key === "Escape") { setQ(""); }
  };

  const onToken = useCallback((token: string) => { setScanning(false); void run({ token }, "qr"); }, [run]);
  const onCode = useCallback(async (code: string) => {
    setScanning(false);
    setQ(code);
  }, []);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Check-in</h1>
        {chosen === "all" && branches.length > 1 && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            Branch
            <select value={branchId} onChange={(e) => setLocal(e.target.value)} className="h-11 rounded-xl border border-clay-line bg-white px-3">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Find a member" className="clay p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-[14rem] flex-1">
                <span className="sr-only">Search members by name or phone</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-clay-muted" aria-hidden="true" />
                <input ref={input} type="search" role="combobox" aria-expanded={hits.length > 0} aria-controls="hits" aria-activedescendant={hits[active] ? `hit-${hits[active]!.memberId}` : undefined} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoFocus autoComplete="off" placeholder="Name or phone number" className="h-14 w-full rounded-2xl border border-clay-line bg-white pl-11 pr-3 text-lg focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
              </label>
              <Button3D variant="ember" size="lg" onClick={() => setScanning(true)}>
                <ScanLine className="h-5 w-5" aria-hidden="true" />
                Scan QR
              </Button3D>
            </div>
            <p className="mt-2 hidden text-sm text-clay-muted md:block">Press <kbd className="rounded bg-clay-canvas px-1.5">/</kbd> to search, <kbd className="rounded bg-clay-canvas px-1.5">S</kbd> to scan, <kbd className="rounded bg-clay-canvas px-1.5">Enter</kbd> to check in the highlighted member.</p>
            {q.trim().length >= 2 && (
              <ul id="hits" role="listbox" aria-label="Matching members" className="mt-3 divide-y divide-clay-line overflow-hidden rounded-2xl border border-clay-line bg-white">
                {hits.length === 0 && !search.isFetching && <li className="px-4 py-3 text-clay-muted">No member matches “{q.trim()}” at this branch. Check the spelling, or register them in New member.</li>}
                {hits.map((h, i) => (
                  <li key={h.memberId} id={`hit-${h.memberId}`} role="option" aria-selected={i === active}>
                    <button type="button" onClick={() => pick(h)} disabled={checkIn.isPending} className={cn("flex min-h-[3.5rem] w-full cursor-pointer items-center gap-3 px-4 py-2 text-left", i === active ? "bg-ember-50" : "hover:bg-clay-canvas")}>
                      <Avatar name={h.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{h.name}</span>
                        <span className="block truncate text-sm text-clay-muted">{h.phone}{h.planName ? `, ${h.planName}` : ""}</span>
                      </span>
                      <span className="shrink-0 font-bold text-ember-700">Check in</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && <p role="alert" className="mt-3 rounded-2xl bg-status-danger-bg px-4 py-3 font-semibold text-status-danger-fg">{error}</p>}
          </section>

          {outcome ? <Result key={outcome.checkInId} r={outcome} onNext={next} onOutcome={setOutcome} /> : (
            <section className="clay grid place-items-center px-6 py-14 text-center text-clay-muted" aria-label="Waiting for a member">
              <div>
                <ScanLine className="mx-auto h-10 w-10" aria-hidden="true" />
                <p className="mt-3 text-xl font-semibold text-clay-ink">Ready for the next member</p>
                <p className="mt-1">Search by name or phone, or scan their pass. The answer shows here.</p>
              </div>
            </section>
          )}
        </div>

        <TodayList branchId={branchId} />
      </div>

      <Sheet open={scanning} onClose={() => setScanning(false)} label="Scan a pass" className="p-5">
        <h2 className="text-xl font-bold">Scan a pass</h2>
        <div className="mt-3">
          <Suspense fallback={<SkeletonRows rows={3} />}>
            {scanning && <Scanner onToken={onToken} onCode={(c) => void onCode(c)} />}
          </Suspense>
        </div>
      </Sheet>
    </div>
  );
}

function TodayList({ branchId }: { branchId?: string }) {
  const query = useTodayCheckIns(branchId);
  return (
    <section aria-labelledby="today-title" className="clay min-w-0 p-4">
      <h2 id="today-title" className="text-lg font-bold">Today’s check-ins</h2>
      <QueryBoundary query={query} errorTitle="We couldn’t load today’s check-ins" skeleton={<SkeletonRows rows={5} />}>
        {(t) => (
          <>
            <p className="mt-1 text-sm text-clay-muted" aria-live="polite">{t.branchName}: {t.entered} in{t.denied ? `, ${t.denied} turned away` : ""}{t.overrides ? `, ${t.overrides} by override` : ""}</p>
            {t.rows.length === 0 ? <p className="mt-3 text-[0.95rem] text-clay-muted">Nobody has checked in yet today.</p> : (
              <ul aria-label="Today’s check-ins" className="mt-2 max-h-[32rem] divide-y divide-clay-line overflow-y-auto">
                {t.rows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.name}</span>
                      <span className="block truncate text-sm text-clay-muted">{formatTime(r.at)}, {r.method === "qr" ? "scanned" : "at the desk"}{r.note ? `, ${r.note}` : ""}</span>
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold", r.result === "denied" ? "bg-status-danger-bg text-status-danger-fg" : r.result === "allowed" ? "bg-status-active-bg text-status-active-fg" : "bg-lilac-100 text-lilac-700")}>{RESULT_WORDS[r.result]}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
