import { useRef, useState, type ReactElement } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DeskScreen, MemberScreen, OwnerScreen, TrainerScreen } from "@/components/screens/Screens";
import { tourRoles, type RoleKey } from "@/data/content";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/motion";
import { cn } from "@/lib/format";

const screens: Record<RoleKey, ReactElement> = {
  owner: <OwnerScreen className="w-full max-w-[36rem]" />,
  desk: <DeskScreen className="w-full max-w-[30rem]" />,
  trainer: <TrainerScreen className="lg:scale-[1.15]" />,
  member: <MemberScreen className="lg:scale-[1.15]" />,
};

/** Stage tint and progress colour per role. */
const tones: Record<RoleKey, { stage: string; bar: string; label: string }> = {
  owner: { stage: "from-ember-50 to-[#FFE3D0]", bar: "#FC5200", label: "text-ember-600" },
  desk: { stage: "from-mint-100 to-[#CDEFE0]", bar: "#3FB68B", label: "text-mint-700" },
  trainer: { stage: "from-lilac-100 to-[#E0D7FD]", bar: "#8B6CF6", label: "text-lilac-700" },
  member: { stage: "from-[#FFF1D6] to-[#FFE2C2]", bar: "#FF7A3D", label: "text-ember-700" },
};

const title = "What each person at your gym gets";
const intro = "Everyone logs in to the same system. Each role only sees what they need for their job.";

export function RoleTour() {
  const wide = useMediaQuery("(min-width: 1024px)");
  const reduced = usePrefersReducedMotion();
  return wide && !reduced ? <PinnedTour /> : <StackedTour />;
}

function PinnedTour() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  const n = tourRoles.length;

  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(n - 1, Math.max(0, Math.floor(v * n)))));

  const jumpTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (el.offsetHeight - window.innerHeight) * ((i + 0.5) / n), behavior: "smooth" });
  };

  const role = tourRoles[active];
  const tone = tones[role.key];

  return (
    <section id="tour" ref={ref} aria-labelledby="tour-title" style={{ height: `${n * 85 + 40}vh` }} className="relative bg-clay-canvas">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <Container className="grid grid-cols-[0.82fr_1.18fr] items-center gap-14 pt-20">
          <div>
            <SectionHeader id="tour-title" title={title} intro={intro} />
            <ol className="mt-9 space-y-3">
              {tourRoles.map((r, i) => (
                <TourItem key={r.key} index={i} total={n} progress={scrollYProgress} active={i === active} onSelect={() => jumpTo(i)} role={r} />
              ))}
            </ol>
          </div>

          <div className={cn("relative flex h-[38rem] items-center justify-center rounded-[3rem] bg-gradient-to-br p-10 transition-colors duration-700", tone.stage)}>
            <div aria-hidden="true" className="absolute inset-0 rounded-[3rem] shadow-[inset_0_3px_0_rgba(255,255,255,0.8),inset_0_-8px_0_rgba(35,28,53,0.04)]" />
            <AnimatePresence mode="wait">
              <motion.div
                key={role.key}
                initial={{ opacity: 0, y: 40, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 200, damping: 22 }}
                className="relative flex w-full justify-center"
              >
                {screens[role.key]}
              </motion.div>
            </AnimatePresence>
          </div>
        </Container>
      </div>
    </section>
  );
}

function TourItem({
  index,
  total,
  progress,
  active,
  onSelect,
  role,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  active: boolean;
  onSelect: () => void;
  role: (typeof tourRoles)[number];
}) {
  const fill = useTransform(progress, [index / total, (index + 1) / total], [0, 1], { clamp: true });
  const tone = tones[role.key];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "step" : undefined}
        className={cn("press w-full rounded-clay-sm px-5 py-4 text-left transition-[background-color,box-shadow] duration-300", active ? "clay" : "hover:bg-white/60")}
      >
        <span className="flex items-center justify-between gap-4">
          <span className={cn("text-lg font-semibold transition-colors", active ? "text-clay-ink" : "text-clay-subtle")}>{role.tab}</span>
          <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-clay-line" aria-hidden="true">
            <motion.span className="absolute inset-0 origin-left rounded-full" style={{ scaleX: fill, background: tone.bar }} />
          </span>
        </span>
        <AnimatePresence initial={false}>
          {active && (
            <motion.span initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35 }} className="block overflow-hidden">
              <span className={cn("mt-2 block font-semibold", tone.label)}>{role.title}</span>
              <span className="mt-1 block leading-relaxed text-clay-muted">{role.body}</span>
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </li>
  );
}

function StackedTour() {
  return (
    <section id="tour" aria-labelledby="tour-title" className="bg-clay-canvas py-20">
      <Container>
        <SectionHeader id="tour-title" title={title} intro={intro} />
        <div className="mt-12 space-y-16">
          {tourRoles.map((r) => (
            <article key={r.key}>
              <p className={cn("text-sm font-semibold", tones[r.key].label)}>{r.tab}</p>
              <h3 className="mt-1 text-h3 font-bold">{r.title}</h3>
              <p className="mt-3 max-w-prose leading-relaxed text-clay-muted">{r.body}</p>
              <div className={cn("mt-7 overflow-x-auto rounded-[2rem] bg-gradient-to-br p-5 no-scrollbar [&_figure]:!scale-100", tones[r.key].stage)}>
                <div className="flex min-w-[19rem] justify-center">{screens[r.key]}</div>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
