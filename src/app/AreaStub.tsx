import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";

/** Temporary empty home for an area. Replaced by the real shell and home screen later in M0. */
export function AreaStub({ title }: { title: string }) {
  return (
    <main className="min-h-screen bg-clay-canvas px-5 py-10 text-clay-ink">
      <Link to="/" aria-label="Ember home" className="inline-block">
        <Logo />
      </Link>
      <h1 className="mt-10 text-2xl font-bold tracking-tight">{title}</h1>
    </main>
  );
}
