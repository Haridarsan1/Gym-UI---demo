import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { stories } from "@/data/content";

/** Customer quotes. Placeholders until real, approved quotes are available. */
export function Stories() {
  return (
    <section id="stories" aria-labelledby="stories-title" className="bg-clay-canvas py-24 lg:py-28">
      <Container>
        <SectionHeader id="stories-title" title="What gym owners say" />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {stories.map((s) => (
            <figure key={s.person} className="clay flex flex-col p-7 sm:p-9">
              <blockquote className="flex-1 text-[1.15rem] leading-relaxed">“{s.quote}”</blockquote>
              <figcaption className="mt-7 flex items-center gap-3 text-[0.95rem]">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-ember-50 text-sm font-bold text-ember-700">
                  {s.person
                    .split(" ")
                    .map((p) => p[0])
                    .join("")}
                </span>
                <span>
                  <span className="block font-semibold">{s.person}</span>
                  <span className="text-clay-muted">{s.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}
