import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MemberScreen, ProgressChart, WorkoutScreen } from "@/components/screens/Screens";
import { usePrefersReducedMotion } from "@/hooks/motion";
import { cn } from "@/lib/format";

const stats = [
  { label: "Baseline", value: "62 kg", cls: "bg-clay-canvas" },
  { label: "Latest", value: "82.5 kg", cls: "bg-clay-canvas" },
  { label: "Change", value: "+20.5 kg", cls: "clay-ember" },
  { label: "Workouts done", value: "34 of 38", cls: "bg-mint-100 text-mint-700" },
];

export function ProgressStory() {
  const ref = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const yFront = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [90, -90]);
  const yBack = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [150, -30]);

  return (
    <section ref={ref} aria-labelledby="progress-title" className="relative overflow-hidden bg-[linear-gradient(180deg,#FBF8F4,#FFF3EA)] py-24 lg:py-32">
      <Container>
        <SectionHeader
          id="progress-title"
          title="Progress members can see"
          intro="Members log their sets on their phone. They and their trainer can see what was planned against what was done, their best lifts and how many workouts they’ve completed. Weeks without a measurement show as gaps."
        />
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <figure className="clay p-5 sm:p-7">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-lg font-bold">Bench press, best set</span>
              <span className="text-sm text-clay-subtle">Arjun Kumar, 10 weeks</span>
            </figcaption>
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className={cn("rounded-2xl p-3", s.cls)}>
                  <dt className="text-xs opacity-75">{s.label}</dt>
                  <dd className="font-display text-2xl font-extrabold">{s.value}</dd>
                </div>
              ))}
            </dl>
            <ProgressChart className="mt-6" />
            <p className="mt-1 text-xs text-clay-subtle">Dashed line: week 4 not measured.</p>
          </figure>
          <div className="relative mx-auto flex h-[34rem] w-full max-w-[24rem] justify-center">
            <motion.div style={{ y: yBack }} className="absolute left-0 top-0 hidden sm:block">
              <MemberScreen className="w-[14rem] -rotate-[6deg]" />
            </motion.div>
            <motion.div style={{ y: yFront }} className="absolute right-0 top-10 sm:top-16">
              <WorkoutScreen className="rotate-[4deg]" />
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  );
}
