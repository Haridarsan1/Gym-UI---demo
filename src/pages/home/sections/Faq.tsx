import { Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { brand } from "@/config/brand";
import { faqs } from "@/data/content";

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-clay-canvas py-24 lg:py-32">
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <SectionHeader id="faq-title" title="Frequently asked questions" />
          <p className="mt-4 text-lg text-clay-muted">
            Can’t find your answer? Email{" "}
            <a className="font-medium text-clay-ink underline decoration-ember-500/70 decoration-2 underline-offset-4" href={`mailto:${brand.supportEmail}`}>
              {brand.supportEmail}
            </a>
            .
          </p>
        </div>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group clay-flat !rounded-3xl">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-6 py-5 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-clay-canvas transition-[transform,background-color,color] duration-300 group-open:rotate-45 group-open:bg-ember-500 group-open:text-white">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </span>
              </summary>
              <p className="max-w-prose px-6 pb-6 leading-relaxed text-clay-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
