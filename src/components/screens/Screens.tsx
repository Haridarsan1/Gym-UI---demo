import { useRef, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import { AlertCircle, CalendarClock, Check, ClipboardList, Flame, QrCode, Search, Timer, UserRound } from "lucide-react";
import { cn, formatINR } from "@/lib/format";
import { usePrefersReducedMotion } from "@/hooks/motion";

/* ───────────────────────── Frames ───────────────────────── */

export function ConsoleFrame({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <figure aria-label={label} className={cn("clay overflow-hidden text-clay-ink", className)}>
      <div className="flex items-center gap-3 border-b border-clay-line px-5 py-3" aria-hidden="true">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF8A80]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFC86B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#7FD1AE]" />
        </span>
        <span className="mx-auto rounded-full bg-clay-canvas px-4 py-0.5 text-[0.68rem] text-clay-subtle">app.ember.fit</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </figure>
  );
}

export function PhoneFrame({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <figure
      aria-label={label}
      className={cn(
        "relative w-[15.5rem] shrink-0 rounded-[2.6rem] bg-[linear-gradient(160deg,#FFFFFF,#EEE8F3)] p-[7px] shadow-[inset_0_2px_0_#fff,inset_0_-4px_0_rgba(35,28,53,0.06),0_30px_60px_-24px_rgba(35,28,53,0.45)]",
        className,
      )}
    >
      <div className="rounded-[2.15rem] bg-clay-canvas p-3.5 text-clay-ink">
        <div className="mx-auto mb-3 h-[1.1rem] w-20 rounded-full bg-clay-ink" aria-hidden="true" />
        {children}
      </div>
    </figure>
  );
}

/* ───────────────────────── Heat map ───────────────────────── */

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = ["5a", "6a", "7a", "8a", "9a", "12p", "5p", "6p", "7p", "8p", "9p"];
const grid = days.map((_, d) =>
  hours.map((_, h) => {
    const morning = [0.35, 0.85, 1, 0.7, 0.4, 0.2][h] ?? 0;
    const evening = [0, 0, 0, 0, 0, 0, 0.55, 0.9, 0.95, 0.7, 0.35][h] ?? 0;
    const weekday = d < 5 ? 1 : d === 5 ? 0.75 : 0.45;
    return Math.min(1, Math.max(morning, evening) * weekday + ((d * 7 + h * 3) % 5) * 0.03);
  }),
);
/** Peach to ember ramp. */
const ramp = ["#FFF1E7", "#FFDCC7", "#FFBE9A", "#FF9A64", "#FF7333", "#FC5200"];
const rampColor = (v: number) => ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];

export function CheckInHeatmap({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("grid", compact ? "grid-cols-[1.6rem_repeat(11,1fr)] gap-[3px]" : "grid-cols-[2rem_repeat(11,1fr)] gap-1")}>
      <span />
      {hours.map((h) => (
        <span key={h} className="text-center text-[0.6rem] text-clay-subtle">
          {h}
        </span>
      ))}
      {days.map((d, di) => (
        <HeatRow key={d} label={d} values={grid[di]} compact={compact} />
      ))}
    </div>
  );
}

function HeatRow({ label, values, compact }: { label: string; values: number[]; compact: boolean }) {
  return (
    <>
      <span className="self-center text-[0.62rem] text-clay-subtle">{label}</span>
      {values.map((v, i) => (
        <span
          key={i}
          title={`${label} ${hours[i]}: ${Math.round(v * 100)}% busy`}
          className={cn(compact ? "h-3.5 rounded-[5px]" : "h-7 rounded-lg")}
          style={{ background: rampColor(v) }}
        />
      ))}
    </>
  );
}

/* ───────────────────────── Owner ───────────────────────── */

const branches = [
  { name: "Andheri", billed: 482300, collected: 451200 },
  { name: "Bandra", billed: 391000, collected: 388400 },
  { name: "Powai", billed: 276500, collected: 219900 },
];

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "ember" | "lilac" | "mint" }) {
  return (
    <div className="clay-flat p-3">
      <p className="text-[0.68rem] text-clay-subtle">{label}</p>
      <p className="font-display text-[1.7rem] font-extrabold leading-tight tabular">{value}</p>
      <p
        className={cn(
          "inline-block rounded-full px-2 py-0.5 text-[0.62rem] font-semibold",
          tone === "ember" && "bg-ember-50 text-ember-700",
          tone === "lilac" && "bg-lilac-100 text-lilac-700",
          tone === "mint" && "bg-mint-100 text-mint-700",
        )}
      >
        {sub}
      </p>
    </div>
  );
}

export function OwnerScreen({ className }: { className?: string }) {
  const max = Math.max(...branches.map((b) => b.billed));
  return (
    <ConsoleFrame label="Owner dashboard with collections, members, renewals and a check-in heat map" className={className}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.7rem] text-clay-subtle">All branches, November</p>
          <p className="text-base font-bold">Good morning, Rohit</p>
        </div>
        <span className="clay-flat !rounded-full px-3 py-1 text-[0.68rem] text-clay-muted">3 branches</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <Kpi label="Collected" value="₹10.6L" sub="+8% vs Oct" tone="mint" />
        <Kpi label="Active members" value="1,186" sub="+12% vs Oct" tone="lilac" />
        <Kpi label="Renewals due" value="64" sub="next 7 days" tone="ember" />
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-[1.25fr_1fr]">
        <div className="clay-flat p-3">
          <p className="mb-2 text-[0.7rem] font-medium text-clay-muted">When members check in</p>
          <CheckInHeatmap compact />
        </div>
        <div className="clay-flat p-3">
          <p className="mb-2 text-[0.7rem] font-medium text-clay-muted">Billed and collected</p>
          <ul className="space-y-2.5">
            {branches.map((b) => (
              <li key={b.name} className="text-[0.68rem]">
                <div className="flex justify-between">
                  <span>{b.name}</span>
                  <span className="tabular text-clay-muted">{formatINR(b.collected)}</span>
                </div>
                <span className="relative mt-1 block h-2 rounded-full bg-clay-canvas shadow-[inset_0_1px_2px_rgba(35,28,53,0.08)]">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-ember-100" style={{ width: `${(b.billed / max) * 100}%` }} />
                  <span className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#FFA778,#FC5200)]" style={{ width: `${(b.collected / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 flex items-center gap-1 text-[0.64rem] font-medium text-ember-700">
            <AlertCircle className="h-3 w-3" aria-hidden="true" /> Powai: {formatINR(56600)} in dues
          </p>
        </div>
      </div>
    </ConsoleFrame>
  );
}

/* ───────────────────────── Front desk ───────────────────────── */

export function DeskScreen({ className }: { className?: string }) {
  return (
    <ConsoleFrame label="Front desk check-in showing an allowed member" className={className}>
      <div className="flex gap-2">
        <div className="clay-well flex h-11 flex-1 items-center gap-2 px-3 text-sm">
          <Search className="h-4 w-4 text-clay-subtle" aria-hidden="true" />
          <span>Arj</span>
          <span className="h-4 w-px animate-pulse bg-clay-ink" aria-hidden="true" />
        </div>
        <span className="clay-night flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-[0.75rem] font-semibold">
          <QrCode className="h-4 w-4" aria-hidden="true" /> Scan
        </span>
      </div>
      <div className="clay-mint mt-3 flex items-center gap-3 rounded-2xl p-3.5">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-white/70 text-sm font-bold">AK</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Arjun Kumar can enter</p>
          <p className="text-[0.74rem] opacity-80">Monthly Plus, Andheri, 12 visits left</p>
        </div>
        <span className="rounded-full bg-mint-700 px-3.5 py-1.5 text-[0.74rem] font-semibold text-white">Check in</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[0.72rem]">
        <div className="clay-flat p-3">
          <dt className="text-clay-subtle">Membership</dt>
          <dd className="mt-1">
            <span className="rounded-full bg-status-active-bg px-2 py-0.5 font-semibold text-status-active-fg">Active</span>
          </dd>
        </div>
        <div className="clay-flat p-3">
          <dt className="text-clay-subtle">Latest invoice</dt>
          <dd className="mt-1 flex items-center gap-1.5">
            <span className="rounded-full border-[1.5px] border-[#E0574B] px-1.5 font-semibold text-status-danger-fg">Overdue</span>
            <span className="tabular">{formatINR(2950)}</span>
          </dd>
        </div>
      </dl>
    </ConsoleFrame>
  );
}

/* ───────────────────────── Trainer ───────────────────────── */

const queue = [
  { icon: CalendarClock, title: "7:00 am, Rahul M.", sub: "PT session, Studio 2", cls: "bg-ember-50 text-ember-600" },
  { icon: ClipboardList, title: "Review due: Sneha P.", sub: "4-week check-in, 2 days late", cls: "bg-[#FFF1D6] text-[#8A5A12]" },
  { icon: AlertCircle, title: "Missed 2 workouts: Karan D.", sub: "Nudge or adjust the plan", cls: "bg-lilac-100 text-lilac-700" },
  { icon: UserRound, title: "Needs a plan: Ananya I.", sub: "Baseline recorded yesterday", cls: "bg-mint-100 text-mint-700" },
];

export function TrainerScreen({ className }: { className?: string }) {
  return (
    <PhoneFrame label="Trainer app: today’s action queue" className={className}>
      <p className="text-[0.68rem] text-clay-subtle">Thursday, 4 things need you</p>
      <p className="text-[1.6rem] font-bold leading-tight tracking-tight">Your day</p>
      <ul className="mt-3 space-y-2">
        {queue.map((q) => (
          <li key={q.title} className="clay-flat flex items-start gap-2.5 !rounded-2xl p-2.5">
            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", q.cls)}>
              <q.icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="text-[0.7rem] leading-snug">
              <span className="block font-semibold">{q.title}</span>
              <span className="text-clay-subtle">{q.sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </PhoneFrame>
  );
}

/* ───────────────────────── Member ───────────────────────── */

export function Ring({ value, size = 64, stroke = 8, color = "#FC5200" }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#EFE9F3" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function MemberScreen({ className }: { className?: string }) {
  return (
    <PhoneFrame label="Member app: home screen" className={className}>
      <p className="text-[0.68rem] text-clay-subtle">Good morning, Arjun</p>
      <p className="text-[1.6rem] font-bold leading-tight tracking-tight">Push day</p>
      <p className="text-[0.7rem] text-clay-muted">6 exercises, about 55 minutes</p>
      <div className="clay-flat mt-3 flex items-center gap-3 !rounded-2xl p-3">
        <Ring value={0.71} />
        <div>
          <p className="text-[0.66rem] text-clay-subtle">This week</p>
          <p className="font-display text-2xl font-extrabold leading-tight">5 of 7</p>
          <p className="text-[0.66rem] text-clay-muted">workouts done</p>
        </div>
      </div>
      <div className="clay-flat mt-2 !rounded-2xl p-3 text-[0.7rem]">
        <p className="font-semibold">PT with Coach Meera</p>
        <p className="text-clay-subtle">Tomorrow, 7:00 am, Studio 2</p>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-full bg-lilac-100 px-2 py-0.5 text-lilac-700">5 sessions left</span>
          <span className="rounded-full bg-mint-100 px-2 py-0.5 text-mint-700">Renews 2 Dec</span>
        </div>
      </div>
      <div className="clay-ember mt-3 rounded-full py-2.5 text-center text-[0.78rem] font-semibold">Start workout</div>
    </PhoneFrame>
  );
}

type SetRow = { n: number; target: string; kg: string; reps: string; state: "done" | "pr" | "open" };
const sets: SetRow[] = [
  { n: 1, target: "10 × 80", kg: "80", reps: "10", state: "done" },
  { n: 2, target: "10 × 80", kg: "82.5", reps: "10", state: "pr" },
  { n: 3, target: "10 × 80", kg: "80", reps: "", state: "open" },
];

export function WorkoutScreen({ className }: { className?: string }) {
  return (
    <PhoneFrame label="Member app: logging a bench press set" className={className}>
      <div className="flex items-center justify-between text-[0.66rem] text-clay-subtle">
        <span>Push day, week 4</span>
        <span className="inline-flex items-center gap-1">
          <Timer className="h-3 w-3" aria-hidden="true" /> 1:24 rest
        </span>
      </div>
      <p className="mt-1 text-[0.95rem] font-bold">Barbell bench press</p>
      <p className="text-[0.68rem] text-clay-subtle">Target 3 sets of 10 at 80 kg</p>
      <div className="mt-3 grid grid-cols-[1.1rem_1fr_2.5rem_2.1rem_1.8rem] items-center gap-1.5 text-[0.68rem]">
        <span className="text-clay-subtle">Set</span>
        <span className="text-clay-subtle">Target</span>
        <span className="text-clay-subtle">kg</span>
        <span className="text-clay-subtle">Reps</span>
        <span />
        {sets.map((s) => (
          <SetCells key={s.n} row={s} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-ember-50 px-3 py-2 text-[0.7rem] font-medium text-ember-700">
        <Flame className="h-3.5 w-3.5" aria-hidden="true" /> New personal record: 82.5 kg
      </div>
      <div className="clay-night mt-3 rounded-full py-2.5 text-center text-[0.78rem] font-semibold">Log set 3</div>
    </PhoneFrame>
  );
}

function SetCells({ row }: { row: SetRow }) {
  return (
    <>
      <span className="font-display text-base font-extrabold">{row.n}</span>
      <span className="text-clay-subtle">{row.target}</span>
      <span className={cn("clay-well !rounded-lg px-1.5 py-1 tabular", row.state === "open" && "ring-2 ring-ember-400")}>{row.kg}</span>
      <span className={cn("clay-well !rounded-lg px-1.5 py-1 tabular", !row.reps && "text-clay-subtle")}>{row.reps || "10"}</span>
      <span
        className={cn(
          "grid h-7 place-items-center rounded-lg text-[0.58rem] font-bold",
          row.state === "done" && "bg-mint-500 text-white",
          row.state === "pr" && "clay-ember",
          row.state === "open" && "border-2 border-dashed border-clay-line",
        )}
      >
        {row.state === "done" && <Check className="h-3.5 w-3.5" aria-label="Done" />}
        {row.state === "pr" && "PR"}
      </span>
    </>
  );
}

/* ───────────────────────── Progress chart ───────────────────────── */

/** Strength curve that draws itself in; gaps stay gaps (spec P03). */
export function ProgressChart({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const show = inView || reduced;
  const pts: Array<number | null> = [62, 63.5, 64, null, 67.5, 70, 72.5, 75, 77.5, 80, 82.5];
  const w = 520;
  const h = 220;
  const min = 58;
  const max = 86;
  const step = w / (pts.length - 1);
  const y = (v: number) => h - ((v - min) / (max - min)) * h;
  const segs: string[] = [];
  let cur = "";
  pts.forEach((v, i) => {
    if (v === null) {
      if (cur) segs.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${(i * step).toFixed(1)},${y(v).toFixed(1)} `;
  });
  if (cur) segs.push(cur);
  const filled = pts.map((v, i) => (v === null ? null : `${(i * step).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
  const area = `M0,${h} L${filled.join(" L")} L${w},${h} Z`;

  return (
    <svg ref={ref} viewBox={`-10 -20 ${w + 34} ${h + 44}`} className={cn("w-full", className)} role="img" aria-label="Bench press best set rising from 62 kg to 82.5 kg over 10 weeks. Week 4 was not measured.">
      <defs>
        <linearGradient id="prog-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FC5200" stopOpacity="0.2" />
          <stop offset="1" stopColor="#FC5200" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="prog-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2="0">
          <stop offset="0" stopColor="#FFA778" />
          <stop offset="1" stopColor="#FC5200" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="#EFE9F3" strokeWidth="1.5" />
      ))}
      {[65, 75, 85].map((v) => (
        <text key={v} x={w + 8} y={y(v) + 4} fontSize="13" fill="#9A93AE">
          {v}
        </text>
      ))}
      <motion.path d={area} fill="url(#prog-area)" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: show ? 1 : 0 }} transition={{ delay: 1.6, duration: 0.8 }} />
      <line x1={2 * step} x2={4 * step} y1={y(64)} y2={y(67.5)} stroke="#C9C2D6" strokeWidth="2.5" strokeDasharray="4 7" strokeLinecap="round" />
      {segs.map((d, i) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke="url(#prog-line)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: show ? 1 : 0 }}
          transition={{ duration: i === 0 ? 0.7 : 1.5, delay: i === 0 ? 0 : 0.75, ease: "easeInOut" }}
        />
      ))}
      <circle cx={0} cy={y(62)} r="7" fill="#fff" stroke="#FFA778" strokeWidth="3.5" />
      <motion.g
        initial={reduced ? false : { opacity: 0, scale: 0.3 }}
        animate={show ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.3 }}
        transition={{ delay: 2.2, type: "spring", stiffness: 300, damping: 12 }}
        style={{ transformOrigin: `${10 * step}px ${y(82.5)}px` }}
      >
        <circle cx={10 * step} cy={y(82.5)} r="20" fill="rgba(252,82,0,0.15)" />
        <circle cx={10 * step} cy={y(82.5)} r="9" fill="#FC5200" stroke="#fff" strokeWidth="3" />
      </motion.g>
    </svg>
  );
}
