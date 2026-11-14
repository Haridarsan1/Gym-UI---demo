import { Link } from "react-router-dom";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { brand } from "@/config/brand";

const columns = [
  { title: "Product", links: [{ label: "Features", href: "/#features" }, { label: "Demo", href: "/#demo" }, { label: "Pricing", href: "/#pricing" }, { label: "FAQ", href: "/#faq" }] },
  { title: "Company", links: [{ label: "Contact", href: `mailto:${brand.supportEmail}` }, { label: "Careers", href: `mailto:${brand.supportEmail}?subject=Careers` }] },
  { title: "Legal", links: [{ label: "Privacy policy", href: "/privacy" }, { label: "Terms of service", href: "/terms" }, { label: "Refund policy", href: "/refunds" }] },
];

export function Footer() {
  return (
    <footer className="border-t border-clay-line bg-white text-clay-ink">
      <Container className="grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link to="/" aria-label={`${brand.name} home`}>
            <Logo />
          </Link>
          <p className="mt-4 max-w-xs leading-relaxed text-clay-muted">Gym management for owners, front desks, trainers and members.</p>
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold">{c.title}</h2>
            <ul className="mt-4 space-y-3 text-clay-muted">
              {c.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="transition-colors hover:text-clay-ink">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <Container className="flex flex-col gap-2 border-t border-clay-line py-6 text-sm text-clay-muted sm:flex-row sm:justify-between">
        <p>
          © {brand.year} {brand.name}. Made in India.
        </p>
        <p>Prices exclude GST.</p>
      </Container>
    </footer>
  );
}
