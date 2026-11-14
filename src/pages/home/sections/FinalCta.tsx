import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Dumbbell, Kettlebell } from "@/components/gym/Equipment";
import { brand } from "@/config/brand";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="bg-clay-canvas pb-24 pt-8 lg:pb-28">
      <Container>
        <div className="relative overflow-hidden rounded-[2.5rem] bg-[linear-gradient(135deg,#FFF1E7_0%,#FFE0CC_55%,#F4F0FF_100%)] px-6 py-16 text-center shadow-[inset_0_2px_0_rgba(255,255,255,0.9),0_30px_60px_-30px_rgba(35,28,53,0.3)] sm:px-12 lg:py-20">
          <div aria-hidden="true" className="absolute -left-10 bottom-6 hidden w-44 -rotate-12 sm:block">
            <Dumbbell className="w-full" />
          </div>
          <div aria-hidden="true" className="absolute -right-4 top-8 hidden w-28 sm:block">
            <Kettlebell className="w-full" />
          </div>
          <h2 id="cta-title" className="relative text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.025em]">
            Try {brand.name} free for {brand.trialDays} days
          </h2>
          <p className="relative mx-auto mt-4 max-w-[34rem] text-lg leading-relaxed text-clay-muted">
            No card required. You can import your members and start checking people in on the same day.
          </p>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/signup" variant="primary" size="lg">
              Start free trial
            </ButtonLink>
            <ButtonLink to={`mailto:${brand.supportEmail}?subject=Book%20a%20demo`} variant="clay" size="lg">
              Book a demo
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
