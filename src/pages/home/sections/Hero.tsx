import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { BellRing, Check, Dumbbell as DumbbellIcon, Flame, IndianRupee, Mail, Pause, Play, QrCode, RefreshCw, TrendingUp, UserPlus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Dumbbell, Kettlebell, Stopwatch, WeightPlate } from "@/components/gym/Equipment";
import { brand } from "@/config/brand";
import { usePrefersReducedMotion } from "@/hooks/motion";
import { cn, formatINR } from "@/lib/format";

/* ───────────── The member journey (acceptance scenario A01) ───────────── */

type StepKey = "join" | "pay" | "checkin" | "train" | "progress" | "renew";
interface Step {
  key: StepKey;
  label: string;
  caption: string;
  /** Small confirmation that pops out of the screen for this step. */
  toast: { text: string; icon: typeof UserPlus };
  icon: typeof UserPlus;
  /** Which headline line this step belongs to (0 sign up, 1 train, 2 progress, 3 renew). */
  line: number;
  /** Arjun's day with the gym at this step. */
  day: number;
}

const steps: Step[] = [
  { key: "join", label: "Join", caption: "Front desk adds Arjun in 2 minutes", toast: { text: "Welcome email sent", icon: Mail }, icon: UserPlus, line: 0, day: 1 },
  { key: "pay", label: "Pay", caption: "GST invoice, paid by UPI", toast: { text: "Receipt emailed", icon: Mail }, icon: IndianRupee, line: 0, day: 1 },
  { key: "checkin", label: "Check in", caption: "QR at the desk, visit counted once", toast: { text: "Visit counted once", icon: Check }, icon: QrCode, line: 1, day: 2 },
  { key: "train", label: "Train", caption: "Coach Meera’s plan, logged set by set", toast: { text: "Coach Meera notified", icon: BellRing }, icon: DumbbellIcon, line: 1, day: 9 },
  { key: "progress", label: "Progress", caption: "Bench press up 20.5 kg in 10 weeks", toast: { text: "New personal record", icon: Flame }, icon: TrendingUp, line: 2, day: 70 },
  { key: "renew", label: "Renew", caption: "Reminder email, renewed in one tap", toast: { text: "Renewal confirmed", icon: Check }, icon: RefreshCw, line: 3, day: 90 },
];

const headline = ["Sign them up.", "Train them.", "Track progress.", "Renew."];

/* ───────────── Product screen for each step ───────────── */

function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-clay-line py-2 text-[0.9rem] last:border-0">
      <span className="text-clay-muted">{k}</span>
      <span className={cn("text-right", strong && "font-semibold")}>{v}</span>
    </div>
  );
}

function StageScreen({ step }: { step: StepKey }) {
  switch (step) {
    case "join":
      return (
        <div>
          <p className="text-sm text-clay-subtle">New member</p>
          <p className="text-xl font-bold">Arjun Kumar</p>
          <div className="mt-3">
            <Row k="Plan" v="Monthly Plus" strong />
            <Row k="Branch" v="Andheri" />
            <Row k="Primary trainer" v="Coach Meera, from 4 Nov" />
            <Row k="Training credits" v="8 PT sessions" />
            <Row k="Consent" v={<span className="inline-flex items-center gap-1 text-mint-700"><Check className="h-4 w-4" aria-hidden="true" /> Photos and assessments</span>} />
          </div>
        </div>
      );
    case "pay":
      return (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-clay-subtle">Invoice INV-2026-0418</p>
            <span className="rounded-full border-[1.5px] border-mint-500 px-2.5 text-xs font-semibold text-mint-700">Paid</span>
          </div>
          <div className="mt-2">
            <Row k="Monthly Plus" v={formatINR(2500)} />
            <Row k="8 PT sessions" v={formatINR(9600)} />
            <Row k="CGST 9% and SGST 9%" v={formatINR(2178)} />
          </div>
          <div className="mt-3 flex items-end justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm text-clay-muted"><Mail className="h-4 w-4" aria-hidden="true" /> Receipt emailed</span>
            <span className="font-display text-4xl font-extrabold tabular text-ember-600">{formatINR(14278)}</span>
          </div>
        </div>
      );
    case "checkin":
      return (
        <div>
          <p className="text-sm text-clay-subtle">Front desk, 6:52 am</p>
          <div className="clay-mint mt-3 flex items-center gap-3 rounded-2xl p-4">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/70 font-bold">AK</span>
            <div>
              <p className="text-lg font-bold">Arjun can enter</p>
              <p className="text-sm opacity-80">Monthly Plus, Andheri, 12 visits left</p>
            </div>
          </div>
          <p className="mt-3 rounded-2xl bg-lilac-100 px-4 py-2.5 text-sm text-lilac-700">Scanned again at 6:53 am. No visit used.</p>
        </div>
      );
    case "train":
      return (
        <div>
          <p className="text-sm text-clay-subtle">Push day, week 4</p>
          <p className="text-xl font-bold">Barbell bench press</p>
          <div className="mt-3 grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 text-sm">
            <span className="text-clay-subtle">Set</span>
            <span className="text-clay-subtle">Target</span>
            <span className="text-clay-subtle">Done</span>
            <span />
            {[
              ["1", "10 × 80", "10 × 80", "done"],
              ["2", "10 × 80", "10 × 82.5", "pr"],
              ["3", "10 × 80", "8 × 80", "partial"],
            ].map(([n, t, d, s]) => (
              <Frag key={n}>
                <span className="font-display text-lg font-extrabold">{n}</span>
                <span className="text-clay-muted">{t}</span>
                <span className="font-semibold tabular">{d}</span>
                <span className={cn("justify-self-start rounded-full px-2 py-0.5 text-xs font-semibold", s === "done" && "bg-mint-100 text-mint-700", s === "pr" && "clay-ember", s === "partial" && "bg-clay-canvas text-clay-muted")}>
                  {s === "done" ? "Done" : s === "pr" ? "New PR" : "Partial"}
                </span>
              </Frag>
            ))}
          </div>
          <p className="mt-3 text-sm text-clay-subtle">Logged by Arjun, reviewed by Coach Meera</p>
        </div>
      );
    case "progress":
      return (
        <div>
          <p className="text-sm text-clay-subtle">Bench press, best set</p>
          <div className="mt-1 flex items-end gap-3">
            <span className="font-display text-5xl font-extrabold leading-none">82.5</span>
            <span className="mb-1 rounded-full bg-ember-50 px-2.5 py-0.5 text-sm font-semibold text-ember-700">+20.5 kg</span>
          </div>
          <svg viewBox="0 0 300 90" className="mt-3 w-full" aria-hidden="true">
            <defs>
              <linearGradient id="hero-prog" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FC5200" stopOpacity="0.25" />
                <stop offset="1" stopColor="#FC5200" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 80 L30 76 L60 74 L120 62 L150 54 L180 46 L210 38 L240 28 L270 20 L300 10 L300 90 L0 90Z" fill="url(#hero-prog)" />
            <motion.path d="M0 80 L30 76 L60 74 L120 62 L150 54 L180 46 L210 38 L240 28 L270 20 L300 10" fill="none" stroke="#FC5200" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
            <circle cx="300" cy="10" r="6" fill="#FC5200" stroke="#fff" strokeWidth="3" />
          </svg>
          <p className="text-sm text-clay-subtle">34 of 38 workouts done in 10 weeks</p>
        </div>
      );
    case "renew":
      return (
        <div>
          <p className="text-sm text-clay-subtle">Membership</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-xl font-bold">Arjun Kumar</p>
            <span className="rounded-full bg-status-active-bg px-2.5 py-0.5 text-xs font-semibold text-status-active-fg">Active</span>
          </div>
          <div className="mt-3">
            <Row k="Plan" v="Quarterly (upgraded)" strong />
            <Row k="Valid until" v="2 March 2027" />
            <Row k="Paid" v={`${formatINR(7080)} by UPI autopay`} />
          </div>
          <div className="clay-ember mt-4 flex items-center justify-center gap-2 rounded-full py-3 font-semibold">
            <Check className="h-5 w-5" aria-hidden="true" /> Renewed in one tap
          </div>
        </div>
      );
  }
}

function Frag({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/* ───────────── Background: warm cream with living light, plate rings and a gym-floor grid ───────────── */

function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#FFF6EF_0%,#FBF8F4_70%)]" />
      {/* Slowly drifting light, in the page's own colours */}
      <div className="absolute -right-32 -top-40 h-[44rem] w-[44rem] animate-drift rounded-full bg-[radial-gradient(circle,rgba(255,167,120,0.55),rgba(255,167,120,0)_65%)] blur-2xl" />
      <div className="absolute -left-48 top-[28%] h-[38rem] w-[38rem] animate-drift-slow rounded-full bg-[radial-gradient(circle,rgba(196,181,253,0.45),rgba(196,181,253,0)_65%)] blur-2xl" />
      <div className="absolute bottom-[-12rem] right-[20%] h-[30rem] w-[30rem] animate-drift rounded-full bg-[radial-gradient(circle,rgba(158,224,195,0.35),rgba(158,224,195,0)_65%)] blur-2xl [animation-delay:-6s]" />
      {/* Weight-plate rings behind the product */}
      <svg viewBox="0 0 800 800" className="absolute -right-[16rem] top-[46%] h-[60rem] w-[60rem] -translate-y-1/2 opacity-[0.5]">
        <g fill="none" stroke="#FC5200">
          <circle cx="400" cy="400" r="390" strokeWidth="1.5" strokeOpacity="0.18" />
          <circle cx="400" cy="400" r="330" strokeWidth="22" strokeOpacity="0.06" />
          <circle cx="400" cy="400" r="250" strokeWidth="1.5" strokeOpacity="0.18" />
          <circle cx="400" cy="400" r="170" strokeWidth="1.5" strokeOpacity="0.14" />
        </g>
      </svg>
      {/* Gym-floor grid fading in at the bottom */}
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(rgba(35,28,53,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(35,28,53,0.06)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(to_top,black_10%,transparent)] [transform:perspective(600px)_rotateX(55deg)] [transform-origin:bottom]" />
    </div>
  );
}

/* ───────────── Step button with a countdown ring ───────────── */

const STEP_MS = 3400;

function StepButton({ s, index, active, playing, onSelect }: { s: Step; index: number; active: number; playing: boolean; onSelect: () => void }) {
  const done = index < active;
  const current = index === active;
  const r = 36;
  const c = 2 * Math.PI * r;
  return (
    <button type="button" onClick={onSelect} aria-current={current ? "step" : undefined} className="group flex max-w-[10rem] flex-col items-center text-center">
      <span className="relative grid h-[4.75rem] w-[4.75rem] place-items-center">
        {current && playing && (
          <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r={r} fill="none" stroke="#FFE6D6" strokeWidth="3" />
            <motion.circle
              key={`ring-${active}`}
              cx="40"
              cy="40"
              r={r}
              fill="none"
              stroke="#FC5200"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: STEP_MS / 1000, ease: "linear" }}
            />
          </svg>
        )}
        <motion.span
          animate={{ scale: current ? 1 : 0.86 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className={cn(
            "grid h-16 w-16 place-items-center rounded-full",
            current && "clay-ember",
            done && "clay-flat !rounded-full text-ember-600",
            !current && !done && "clay-flat !rounded-full text-clay-subtle group-hover:text-clay-ink",
          )}
        >
          {done ? <Check className="h-6 w-6" aria-hidden="true" /> : <s.icon className="h-6 w-6" aria-hidden="true" />}
        </motion.span>
      </span>
      <span className={cn("mt-2 font-semibold transition-colors", current ? "text-clay-ink" : "text-clay-muted")}>{s.label}</span>
      <span className={cn("mt-0.5 hidden text-[0.8rem] leading-snug text-clay-muted transition-opacity lg:block", current ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>{s.caption}</span>
    </button>
  );
}

/* ───────────── Hero ───────────── */

export function Hero() {
  const reduced = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [hovering, setHovering] = useState(false);

  /* Pointer parallax for the equipment */
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 50, damping: 15 });
  const sy = useSpring(py, { stiffness: 50, damping: 15 });
  const nearX = useTransform(sx, (v) => v * 30);
  const nearY = useTransform(sy, (v) => v * 24);
  const farX = useTransform(sx, (v) => v * -16);
  const farY = useTransform(sy, (v) => v * -12);

  /* 3D tilt of the product card toward the pointer */
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const rotY = useSpring(useTransform(tx, [-0.5, 0.5], [-7, 7]), { stiffness: 140, damping: 16 });
  const rotX = useSpring(useTransform(ty, [-0.5, 0.5], [6, -6]), { stiffness: 140, damping: 16 });

  /* Scroll: copy drifts up and fades, the dumbbell turns */
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const copyY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, -80]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], reduced ? [1, 1] : [1, 0.2]);
  const spin = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-16, 24]);

  useEffect(() => {
    if (reduced || !playing || hovering) return;
    const id = window.setTimeout(() => {
      if (!document.hidden) setActive((a) => (a + 1) % steps.length);
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [reduced, playing, active, hovering]);

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };

  const onCardMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    tx.set((e.clientX - r.left) / r.width - 0.5);
    ty.set((e.clientY - r.top) / r.height - 0.5);
  };

  const step = steps[active];
  const enter = (delay: number) => (reduced ? {} : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.8, ease: [0.16, 1, 0.3, 1] } });
  const drop = (delay: number) => (reduced ? {} : { initial: { opacity: 0, y: -60, scale: 0.8 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { delay, type: "spring" as const, stiffness: 180, damping: 11 } });

  return (
    <section ref={sectionRef} aria-labelledby="hero-title" onPointerMove={onPointerMove} className="relative overflow-hidden pb-20 pt-28 text-clay-ink lg:pb-24 lg:pt-32">
      <HeroBackground />

      <Container className="relative">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-10">
          {/* Copy */}
          <motion.div style={{ y: copyY, opacity: copyOpacity }}>
            <motion.p {...enter(0.05)} className="clay-flat inline-flex items-center gap-2 !rounded-full px-4 py-1.5 text-sm font-medium text-clay-muted">
              <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ember-500" aria-hidden="true" />
              Gym management software for India
            </motion.p>
            <h1 id="hero-title" className="mt-6 text-[clamp(2.6rem,4.7vw,4.3rem)] font-bold leading-[1.04] tracking-[-0.035em]">
              {headline.map((line, i) => {
                const on = step.line === i || reduced;
                return (
                  <motion.span key={line} {...enter(0.12 + i * 0.08)} className="relative isolate block w-fit">
                    {/* Highlighter that slides to the line for the current stage */}
                    {step.line === i && !reduced && (
                      <motion.span layoutId="hero-highlight" transition={{ type: "spring", stiffness: 260, damping: 28 }} className="absolute -inset-x-2 bottom-[0.08em] top-[0.52em] -z-10 rounded-lg bg-ember-100" />
                    )}
                    <span className={cn("transition-colors duration-500", on ? "text-clay-ink" : "text-clay-subtle/70")}>{line}</span>
                  </motion.span>
                );
              })}
            </h1>
            <motion.p {...enter(0.45)} className="mt-6 max-w-[34rem] text-lg leading-relaxed text-clay-muted">
              {brand.name} connects every part of a member’s life at your gym: memberships, GST billing, QR check-in, trainer plans, workout
              logs and renewals. One system for owners, front desk, trainers and members.
            </motion.p>
            <motion.div {...enter(0.55)} className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink to="/signup" variant="primary" size="lg">
                Start {brand.trialDays}-day free trial
              </ButtonLink>
              <ButtonLink to="#tour" variant="clay" size="lg">
                Watch the tour
              </ButtonLink>
            </motion.div>
            <motion.p {...enter(0.65)} className="mt-4 text-sm text-clay-subtle">
              No card required. Set up in an afternoon.
            </motion.p>
            <motion.div {...enter(0.75)} className="mt-8 flex flex-wrap items-center gap-4">
              <div className="flex -space-x-2" aria-hidden="true">
                {[
                  ["NK", "from-[#FFA778] to-[#FC5200]"],
                  ["IS", "from-[#C4B5FD] to-[#8B6CF6]"],
                  ["RG", "from-[#9EE0C3] to-[#3FB68B]"],
                  ["MP", "from-[#FFD38A] to-[#F29A2E]"],
                ].map(([i, g]) => (
                  <span key={i} className={cn("grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br text-xs font-bold text-white ring-4 ring-clay-canvas", g)}>
                    {i}
                  </span>
                ))}
              </div>
              <div className="text-sm leading-snug">
                <p className="flex items-center gap-1 font-semibold text-clay-ink">
                  <span className="text-ember-500" aria-hidden="true">★★★★★</span>
                  <span>4.9 from gym owners</span>
                </p>
                <p className="text-clay-muted">Trusted by 120+ gyms across India</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Stage */}
          <div
            className="relative mx-auto w-full max-w-[30rem] [perspective:1200px]"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => {
              setHovering(false);
              tx.set(0);
              ty.set(0);
            }}
            onPointerMove={onCardMove}
          >
            {/* Soft spotlight under the card */}
            <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.9),rgba(255,255,255,0)_60%)]" />

            <motion.div {...drop(0.9)} className="absolute -right-24 -top-20 w-44 sm:w-52">
              <motion.div style={{ x: farX, y: farY }}>
                <WeightPlate className="w-full animate-float-slow" />
              </motion.div>
            </motion.div>
            <motion.div {...drop(0.75)} className="absolute -left-28 -top-24 z-20 hidden w-52 sm:block">
              <motion.div style={{ x: nearX, y: nearY, rotate: spin }}>
                <Dumbbell className="w-full animate-float" />
              </motion.div>
            </motion.div>
            <motion.div {...drop(1.05)} className="absolute -bottom-14 -left-4 z-20 w-20 sm:-bottom-16 sm:-left-28 sm:w-28">
              <motion.div style={{ x: nearX, y: nearY }}>
                <Kettlebell className="w-full animate-float-slow" />
              </motion.div>
            </motion.div>
            <motion.div {...drop(1.2)} className="absolute -bottom-10 -right-12 z-20 hidden w-24 sm:block">
              <motion.div style={{ x: farX, y: farY }}>
                <div className="rotate-[10deg]">
                  <Stopwatch className="w-full animate-float" />
                </div>
              </motion.div>
            </motion.div>

            <motion.div
              {...(reduced ? {} : { initial: { opacity: 0, scale: 0.92, y: 30 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { delay: 0.35, type: "spring", stiffness: 140, damping: 18 } })}
              style={{ rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }}
              className="clay relative z-10 p-6 sm:p-7"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full bg-ember-50 px-3 py-1 text-sm font-semibold text-ember-700">
                  <step.icon className="h-4 w-4" aria-hidden="true" />
                  Step {active + 1} of {steps.length}: {step.label}
                </span>
                {!reduced && (
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? "Pause the journey" : "Play the journey"}
                    className="press grid h-9 w-9 place-items-center rounded-full bg-clay-canvas text-clay-muted hover:text-clay-ink"
                  >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <div className="mt-4 min-h-[13rem]" aria-live="polite">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step.key}
                    initial={reduced ? false : { opacity: 0, x: 24, filter: "blur(4px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: -24, filter: "blur(4px)" }}
                    transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <StageScreen step={step.key} />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Arjun's timeline: the steps become a 90-day story */}
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-clay-canvas px-3.5 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#C4B5FD] to-[#8B6CF6] text-sm font-bold text-white">AK</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-semibold">Arjun Kumar</span>
                    <span className="shrink-0 text-clay-muted">
                      Day{" "}
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={step.day}
                          initial={reduced ? false : { y: 10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -10, opacity: 0 }}
                          className="inline-block font-display text-base font-extrabold text-clay-ink tabular"
                        >
                          {step.day}
                        </motion.span>
                      </AnimatePresence>{" "}
                      of 90
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-clay-line">
                    <motion.div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#FFA778,#FC5200)]"
                      animate={{ width: `${Math.max(4, (step.day / 90) * 100)}%` }}
                      transition={{ type: "spring", stiffness: 90, damping: 18 }}
                    />
                  </div>
                </div>
              </div>

              {/* Confirmation toast that pops out of the screen */}
              <div className="absolute -bottom-5 left-0 right-0 flex justify-center sm:justify-end sm:pr-24">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`toast-${step.key}`}
                  initial={reduced ? false : { opacity: 0, y: 16, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: reduced ? 0 : 0.7, type: "spring", stiffness: 320, damping: 18 }}
                  className="clay-night flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium"
                >
                  <step.toast.icon className="h-4 w-4 text-ember-300" aria-hidden="true" />
                  {step.toast.text}
                </motion.div>
              </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Journey track */}
        <motion.nav {...enter(0.8)} aria-label="Member journey" className="relative mt-20 lg:mt-16">
          <div className="clay-well absolute left-[8%] right-[8%] top-[2.1rem] hidden h-2.5 !rounded-full sm:block" aria-hidden="true" />
          <motion.div
            aria-hidden="true"
            className="absolute left-[8%] top-[2.1rem] hidden h-2.5 rounded-full bg-[linear-gradient(90deg,#FFA778,#FC5200)] sm:block"
            animate={{ width: `${(active / (steps.length - 1)) * 84}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
          <ol className="relative grid grid-cols-3 gap-y-6 sm:grid-cols-6">
            {steps.map((s, i) => (
              <li key={s.key} className="flex justify-center">
                <StepButton
                  s={s}
                  index={i}
                  active={active}
                  playing={playing && !reduced && !hovering}
                  onSelect={() => {
                    setActive(i);
                    setPlaying(false);
                  }}
                />
              </li>
            ))}
          </ol>
        </motion.nav>
      </Container>
    </section>
  );
}
