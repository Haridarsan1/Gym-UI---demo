import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { Dumbbell } from "@/components/gym/Equipment";

const coming = [
  { role: "Owner and branch manager", what: "Dashboard, branches, plans and pricing, reports" },
  { role: "Front desk and finance", what: "Check-in, members, invoices, payments and refunds" },
  { role: "Trainer", what: "Today’s sessions, client plans, workout reviews" },
  { role: "Member", what: "Today’s workout, bookings, progress and renewals" },
];

/** Where the trial flow and Log in lead until the role-based app (Phase 1) is built. */
export default function AppPlaceholder() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#FFF6EF,#FBF8F4)] px-5 py-10 text-clay-ink">
      <div className="mx-auto max-w-2xl">
        <Link to="/" aria-label="Ember home" className="inline-block">
          <Logo />
        </Link>
        <div className="clay relative mt-10 overflow-hidden p-8 sm:p-10">
          <div aria-hidden="true" className="absolute -right-8 -top-6 hidden w-44 rotate-12 sm:block">
            <Dumbbell className="w-full" />
          </div>
          <p className="inline-flex rounded-full bg-ember-50 px-3 py-1 text-sm font-semibold text-ember-700">Demo</p>
          <h1 className="mt-4 text-[clamp(1.75rem,3vw,2.25rem)] font-bold leading-tight tracking-[-0.02em]">The Ember app is the next part of this project</h1>
          <p className="mt-3 max-w-lg leading-relaxed text-clay-muted">
            This demo covers the website and the free trial signup. After signing in, each person will see the screens for their role:
          </p>
          <ul className="mt-6 space-y-3">
            {coming.map((c) => (
              <li key={c.role} className="clay-flat px-5 py-4">
                <p className="font-semibold">{c.role}</p>
                <p className="text-sm text-clay-muted">{c.what}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/" variant="primary">
              Back to home page
            </ButtonLink>
            <ButtonLink to="/signup" variant="clay">
              Try the signup again
            </ButtonLink>
          </div>
        </div>
      </div>
    </main>
  );
}
