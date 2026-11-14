import { useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Clock, QrCode, RotateCcw, Search, Snowflake, XCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { demoMembers, type DemoMember } from "@/data/content";
import { cn } from "@/lib/format";

interface LogEntry {
  id: number;
  time: string;
  text: string;
  tone: "ok" | "info" | "warn";
}

const overrideReasons = ["Manager approved", "Trial session with trainer", "Payment collected at desk"];

function clock(minutesAfter: number) {
  const d = new Date();
  d.setHours(6, 52 + minutesAfter, 0, 0);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/**
 * A working slice of the front desk with the real rules from the spec:
 * eligibility checks, one visit per check-in window (M05), and overrides that need a reason.
 */
export function DeskDemo() {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DemoMember | null>(null);
  const [visits, setVisits] = useState<Record<string, number | null>>(() => Object.fromEntries(demoMembers.map((m) => [m.id, m.visitsLeft])));
  const [checkedAt, setCheckedAt] = useState<Record<string, string>>({});
  const [repeatNotice, setRepeatNotice] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const tick = useRef(0);
  const scanIndex = useRef(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? demoMembers.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 4) : [];
  }, [query]);

  const addLog = (text: string, tone: LogEntry["tone"]) => {
    const t = tick.current++;
    setLog((l) => [{ id: t, time: clock(t), text, tone }, ...l].slice(0, 4));
    return clock(t);
  };

  const pick = (m: DemoMember) => {
    setSelected(m);
    setQuery("");
    setRepeatNotice(null);
    setOverrideOpen(false);
  };

  const scan = () => pick(demoMembers[scanIndex.current++ % demoMembers.length]);

  const checkIn = (m: DemoMember, reason?: string) => {
    if (checkedAt[m.id]) {
      setRepeatNotice(`Already checked in at ${checkedAt[m.id]}. No visit used.`);
      addLog(`${m.name} scanned again, no visit used`, "info");
      return;
    }
    const left = visits[m.id];
    if (left !== null) setVisits((v) => ({ ...v, [m.id]: left - 1 }));
    const time = addLog(reason ? `${m.name} checked in. Override: ${reason.toLowerCase()}` : `${m.name} checked in`, reason ? "warn" : "ok");
    setCheckedAt((c) => ({ ...c, [m.id]: time }));
    setOverrideOpen(false);
    setRepeatNotice(null);
  };

  const reset = () => {
    setSelected(null);
    setQuery("");
    setVisits(Object.fromEntries(demoMembers.map((m) => [m.id, m.visitsLeft])));
    setCheckedAt({});
    setLog([]);
    setRepeatNotice(null);
    setOverrideOpen(false);
    tick.current = 0;
  };

  return (
    <section id="demo" aria-labelledby="demo-title" className="relative overflow-hidden bg-[linear-gradient(180deg,#FBF8F4_0%,#F4F0FF_100%)] py-24 lg:py-32">
      <Container className="relative grid items-start gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-32">
          <SectionHeader
            id="demo-title"
            title="Try the check-in desk"
            intro="Search for a member or press Scan QR, then check them in. Try scanning the same person twice, or checking in someone whose membership is frozen or expired."
          />
          <p className="mt-5 max-w-md leading-relaxed text-clay-muted">
            This uses the same rules as the real front desk: a second scan in the same visit window doesn’t use another visit, and letting someone in
            without a valid plan needs a reason, which is saved.
          </p>
        </div>

        <div className="clay rounded-[2.25rem] p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-clay-muted">Front desk, Andheri</p>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-clay-subtle hover:bg-clay-canvas hover:text-clay-ink">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset demo
            </button>
          </div>

          <div className="relative mt-3 flex gap-2">
            <label htmlFor={inputId} className="sr-only">
              Search members by name
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-clay-subtle" aria-hidden="true" />
              <input
                id={inputId}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) pick(matches[0]);
                }}
                placeholder="Type a name, like Priya"
                autoComplete="off"
                className="clay-well h-14 w-full !rounded-2xl pl-11 pr-3 text-base text-clay-ink placeholder:text-clay-subtle focus:outline-none focus:ring-2 focus:ring-ember-400"
              />
              {matches.length > 0 && (
                <ul className="clay absolute inset-x-0 top-[calc(100%+8px)] z-20 overflow-hidden !rounded-2xl p-1.5" aria-label="Matching members">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => pick(m)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-clay-canvas">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-lilac-100 text-xs font-bold text-lilac-700">{m.initials}</span>
                        <span>
                          <span className="block font-semibold">{m.name}</span>
                          <span className="text-xs text-clay-subtle">{m.plan}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim() && matches.length === 0 && (
                <p className="clay absolute inset-x-0 top-[calc(100%+8px)] z-20 !rounded-2xl px-4 py-3 text-sm text-clay-muted">
                  No member matches “{query.trim()}”. Try Arjun, Priya, Rahul or Vikram.
                </p>
              )}
            </div>
            <button type="button" onClick={scan} className="press clay-night inline-flex h-14 items-center gap-2 rounded-2xl px-5 text-sm font-semibold">
              <QrCode className="h-4 w-4" aria-hidden="true" /> Scan QR
            </button>
          </div>

          <div className="mt-5 min-h-[14rem]" aria-live="polite">
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div key={selected.id} initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
                  <ResultCard
                    member={selected}
                    visitsLeft={visits[selected.id]}
                    checkedAt={checkedAt[selected.id]}
                    repeatNotice={repeatNotice}
                    overrideOpen={overrideOpen}
                    onCheckIn={() => checkIn(selected)}
                    onOverride={() => setOverrideOpen(true)}
                    onOverrideReason={(r) => checkIn(selected, r)}
                  />
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="clay-well grid h-[14rem] place-items-center !rounded-3xl text-center">
                  <div>
                    <p className="font-semibold">Waiting for the next member</p>
                    <p className="mt-1 text-sm text-clay-subtle">Search above or press Scan QR</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {demoMembers.slice(0, 4).map((m) => (
                        <button key={m.id} type="button" onClick={() => pick(m)} className="press clay-flat !rounded-full px-3.5 py-1.5 text-xs font-medium">
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-5 border-t border-clay-line pt-4">
            <p className="text-xs font-medium text-clay-subtle">Today at the desk</p>
            {log.length === 0 ? (
              <p className="mt-2 text-sm text-clay-subtle">Check-ins you make will appear here.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                <AnimatePresence initial={false}>
                  {log.map((l) => (
                    <motion.li key={l.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 text-sm">
                      <span className="w-16 shrink-0 tabular text-clay-subtle">{l.time}</span>
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", l.tone === "ok" && "bg-mint-500", l.tone === "info" && "bg-clay-subtle", l.tone === "warn" && "bg-ember-400")} aria-hidden="true" />
                      <span>{l.text}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}

function ResultCard({
  member,
  visitsLeft,
  checkedAt,
  repeatNotice,
  overrideOpen,
  onCheckIn,
  onOverride,
  onOverrideReason,
}: {
  member: DemoMember;
  visitsLeft: number | null;
  checkedAt?: string;
  repeatNotice: string | null;
  overrideOpen: boolean;
  onCheckIn: () => void;
  onOverride: () => void;
  onOverrideReason: (reason: string) => void;
}) {
  const s = member.status;
  const canEnter = s === "allowed" || s === "allowed-dues";
  const ok = canEnter || !!checkedAt;
  const surface = ok ? "clay-mint" : s === "frozen" ? "bg-[linear-gradient(150deg,#E3EEFC,#C9DDF8)] text-[#183F73] clay-flat" : "bg-[linear-gradient(150deg,#FDE7E4,#F9CFC9)] text-[#7A1D14] clay-flat";
  const headline = checkedAt ? `${member.name} is in` : canEnter ? `${member.name} can enter` : s === "frozen" ? "Membership frozen" : s === "expired" ? "Membership expired" : "No visits left";
  const Icon = ok ? Check : s === "frozen" ? Snowflake : XCircle;

  return (
    <div>
      <div className={cn("!rounded-3xl p-5", surface)}>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/70 font-bold">{member.initials}</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-lg font-bold">
              <Icon className="h-5 w-5" aria-hidden="true" /> {headline}
            </p>
            <p className="text-sm opacity-80">
              {ok ? "" : `${member.name}, `}
              {member.plan}, {member.branch}
              {visitsLeft !== null && `, ${visitsLeft} ${visitsLeft === 1 ? "visit" : "visits"} left`}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm opacity-80">{checkedAt ? `Checked in at ${checkedAt}.` : member.detail}</p>
      </div>

      {s === "allowed-dues" && !checkedAt && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-[#FFF1D6] px-4 py-2.5 text-sm text-[#8A5A12]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> Entry allowed. Remind them about the overdue invoice.
        </p>
      )}
      {repeatNotice && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-lilac-100 px-4 py-2.5 text-sm text-lilac-700">
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" /> {repeatNotice}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {ok ? (
          <button type="button" onClick={onCheckIn} className="press clay-night h-12 rounded-full px-6 text-sm font-semibold">
            {checkedAt ? "Scan again" : "Check in"}
          </button>
        ) : (
          <>
            <button type="button" className="press clay-night h-12 rounded-full px-6 text-sm font-semibold" onClick={onOverride}>
              Override with reason
            </button>
            <span className="text-sm text-clay-subtle">{s === "frozen" ? "or unfreeze in the member profile" : s === "expired" ? "or renew at the desk" : "or sell a new pass"}</span>
          </>
        )}
      </div>

      {overrideOpen && !checkedAt && (
        <fieldset className="clay-well mt-3 !rounded-2xl p-3">
          <legend className="sr-only">Why are you letting them in?</legend>
          <p className="mb-2 text-xs text-clay-muted">Why are you letting them in?</p>
          <div className="flex flex-wrap gap-2">
            {overrideReasons.map((r) => (
              <button key={r} type="button" onClick={() => onOverrideReason(r)} className="press clay-flat !rounded-full px-3.5 py-1.5 text-sm">
                {r}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
