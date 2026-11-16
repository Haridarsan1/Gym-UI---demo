import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { brand } from "@/config/brand";
import { pricingTiers, type PricingTier } from "@/data/content";
import { cn, formatINR, formatIndian } from "@/lib/format";

type Billing = "monthly" | "annual";
const MIN = 25;
const MAX = 750;

function tierFor(members: number): PricingTier {
  return pricingTiers.find((t) => t.memberLimit !== null && members <= t.memberLimit) ?? pricingTiers[pricingTiers.length - 1];
}

export function Pricing() {
  const sliderId = useId();
  const [members, setMembers] = useState(150);
  const [billing, setBilling] = useState<Billing>("annual");
  const fit = useMemo(() => tierFor(members), [members]);
  const fillPct = ((members - MIN) / (MAX - MIN)) * 100;

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-[linear-gradient(180deg,#FBF8F4,#F4F0FF)] py-24 lg:py-32">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <SectionHeader
            id="pricing-title"
            title="Pricing"
            intro={`You pay based on how many active members you have. Every plan starts with a ${brand.trialDays}-day free trial. Prices are in rupees and don’t include 18% GST.`}
          />
          <fieldset className="clay-well inline-flex !rounded-full p-1.5">
            <legend className="sr-only">Billing period</legend>
            {(["monthly", "annual"] as const).map((b) => (
              <label key={b} className={cn("relative cursor-pointer rounded-full px-5 py-2.5 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ember-500", billing === b ? "text-clay-ink" : "text-clay-subtle")}>
                {billing === b && <motion.span layoutId="billing-pill" className="clay-flat absolute inset-0 !rounded-full" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                <input type="radio" name="billing" value={b} checked={billing === b} onChange={() => setBilling(b)} className="sr-only" />
                <span className="relative">{b === "monthly" ? "Monthly" : "Yearly, save 20%"}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="clay mt-12 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label htmlFor={sliderId} className="text-lg font-semibold">
              How many active members do you have?
            </label>
            <p className="font-display text-6xl font-extrabold leading-none tabular text-ember-500">{members >= MAX ? `${formatIndian(MAX)}+` : formatIndian(members)}</p>
          </div>
          <input
            id={sliderId}
            type="range"
            min={MIN}
            max={MAX}
            step={5}
            value={members}
            onChange={(e) => setMembers(Number(e.target.value))}
            aria-valuetext={`${members} active members, fits the ${fit.name} plan`}
            className="power-range mt-7 w-full"
            style={{ ["--fill" as string]: `${fillPct}%` }}
          />
          <div className="relative mt-3 h-4 text-xs text-clay-subtle" aria-hidden="true">
            {[25, 75, 250, 500, 750].map((v) => (
              <span key={v} className={cn("absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full", (v === 75 || v === 250) && "max-sm:hidden")} style={{ left: `${((v - MIN) / (MAX - MIN)) * 100}%` }}>
                {v === 750 ? `${formatIndian(MAX)}+` : formatIndian(v)}
              </span>
            ))}
          </div>
          <p className="mt-4 text-[1rem] text-clay-muted" aria-live="polite">
            <span className="font-semibold text-clay-ink">{fit.name}</span> fits your gym. {fit.summary}
          </p>
        </div>

        <ul className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {pricingTiers.map((t) => (
            <PriceCard key={t.id} tier={t} billing={billing} highlighted={t.id === fit.id} />
          ))}
        </ul>
      </Container>
    </section>
  );
}

function PriceCard({ tier, billing, highlighted }: { tier: PricingTier; billing: Billing; highlighted: boolean }) {
  const perMonth = billing === "annual" ? tier.yearlyMonthly : tier.monthly;
  return (
    <motion.li
      layout
      animate={{ y: highlighted ? -10 : 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={cn("clay flex flex-col p-7", highlighted && "ring-[3px] ring-ember-400")}
      aria-current={highlighted ? "true" : undefined}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">{tier.name}</h3>
        {highlighted && <span className="clay-ember rounded-full px-3 py-1 text-xs font-semibold">Fits your gym</span>}
      </div>
      <p className="mt-1 text-sm text-clay-subtle">{tier.memberLimit ? `Up to ${formatIndian(tier.memberLimit)} active members` : "500+ active members"}</p>
      <div className="mt-6 min-h-[5rem]">
        {perMonth === null ? (
          <p className="font-display text-5xl font-extrabold leading-tight">Custom</p>
        ) : (
          <>
            <p className="flex items-baseline gap-1">
              <span className="relative inline-block h-[3.2rem] overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={perMonth}
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "-100%" }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className={cn("block font-display text-[3rem] font-extrabold leading-none tabular", highlighted && "text-ember-500")}
                  >
                    {formatINR(perMonth)}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="text-sm text-clay-subtle">/month</span>
            </p>
            <p className="mt-1.5 text-[0.82rem] text-clay-subtle">{billing === "annual" ? `${formatINR(perMonth * 12)} billed yearly` : "Billed monthly"}</p>
          </>
        )}
      </div>
      <ul className="mt-6 flex-1 space-y-2.5 text-[0.95rem]">
        {tier.features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", highlighted ? "bg-ember-50 text-ember-600" : "bg-clay-canvas text-clay-subtle")}>
              <Check className="h-3 w-3" aria-hidden="true" />
            </span>
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-8">
        {tier.id === "enterprise" ? (
          <ButtonLink to={`mailto:${brand.supportEmail}?subject=Enterprise%20plan`} variant="ink" className="w-full">
            Talk to us
          </ButtonLink>
        ) : (
          <ButtonLink to={`/signup?plan=${tier.id}`} variant={highlighted ? "primary" : "clay"} className="w-full">
            Start free trial
          </ButtonLink>
        )}
      </div>
    </motion.li>
  );
}
