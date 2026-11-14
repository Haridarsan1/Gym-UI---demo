import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { brand } from "@/config/brand";

/** Placeholder for legal pages. Replace with the real policy text before launch. */
export default function LegalPage({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} · ${brand.name}`;
  }, [title]);
  return (
    <main className="min-h-screen bg-clay-canvas px-5 py-10 text-clay-ink">
      <div className="mx-auto max-w-2xl">
        <Link to="/" aria-label={`${brand.name} home`} className="inline-block">
          <Logo />
        </Link>
        <div className="clay mt-10 p-8 sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-4 leading-relaxed text-clay-muted">
            This page will be published before launch. For questions in the meantime, email{" "}
            <a href={`mailto:${brand.supportEmail}`} className="font-medium text-clay-ink underline decoration-ember-500/70 decoration-2 underline-offset-4">
              {brand.supportEmail}
            </a>
            .
          </p>
          <ButtonLink to="/" variant="clay" className="mt-8">
            Back to home page
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
