import { useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { brand } from "@/config/brand";
import { DEMO_SCENARIOS } from "@/app/demoScenarios";
import { signInDemo } from "@/app/demoSignIn";
import { readSession } from "@/app/session";
import { Sheet } from "@/design/Sheet";

/**
 * The demo guide (demo mode): six short scenarios for someone presenting or trying Ember. Each Start signs in as the right person and opens the right screen. Nothing is reset by starting one;
 * resetting is a separate, confirmed action at the bottom.
 */
export default function DemoGuidePage() {
  const existing = readSession();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const start = (userId: string, to: string) => {
    if (!signInDemo(userId)) return;
    // A full load, so nothing from the last person is left in memory.
    window.location.assign(to);
  };

  const reset = async () => {
    setResetting(true);
    try {
      const { resetDemo } = await import("@/demo");
      await resetDemo({ training: false });
      setNote("Demo data reset. Pulse Fitness is back to how it started.");
      setConfirming(false);
    } catch {
      setNote("Demo data wasn’t reset. Reload the page and try again.");
      setConfirming(false);
    } finally {
      setResetting(false);
    }
  };

  return (
    <main id="main" className="min-h-screen bg-[linear-gradient(180deg,#FFF6EF,#FBF8F4)] px-5 py-10 text-clay-ink">
      <div className="mx-auto w-full max-w-3xl">
        <Link to="/" aria-label={`${brand.name} home`} className="block w-fit">
          <Logo />
        </Link>
        <h1 className="mt-8 text-3xl font-extrabold tracking-tight">Demo guide</h1>
        <p className="mt-2 max-w-[70ch] text-clay-muted">
          Six short scenarios on a sample gym, Pulse Fitness. Each one signs you in as the right person and opens the right screen. Starting one changes nothing you already did.
        </p>
        {existing && <p className="clay-flat mt-5 px-4 py-3 text-sm">You’re signed in as {existing.name}. Starting a scenario signs you in as someone else.</p>}

        <ol aria-label="Scenarios" className="mt-6 grid gap-4 sm:grid-cols-2">
          {DEMO_SCENARIOS.map((s, i) => (
            <li key={s.id} className="clay flex flex-col p-5">
              <p className="text-sm font-semibold text-clay-muted">Scenario {i + 1}</p>
              <h2 className="mt-1 text-lg font-bold">{s.title}</h2>
              <p className="mt-2 flex-1 text-[0.95rem]">{s.shows}</p>
              <p className="mt-2 text-sm text-clay-muted">You are {s.who}.</p>
              <Button type="button" variant="primary" className="mt-4 w-full" onClick={() => start(s.userId, s.to)} aria-label={`Start: ${s.title}`}>
                Start
              </Button>
            </li>
          ))}
        </ol>

        <section aria-labelledby="reset-h" className="mt-10 border-t border-clay-line pt-6">
          <h2 id="reset-h" className="text-lg font-bold">Start over</h2>
          <p className="mt-1 max-w-[70ch] text-clay-muted">Put the sample gym back to how it started, for the next person. Everything changed in this browser is lost.</p>
          <Button type="button" variant="clay" className="mt-3" onClick={() => { setNote(null); setConfirming(true); }}>
            Reset demo data
          </Button>
          <p role="status" className="mt-3 text-sm font-semibold">{note}</p>
        </section>
        <p className="mt-8 text-sm text-clay-muted">
          <Link to="/login" className="font-semibold underline decoration-ember-500/70 decoration-2 underline-offset-4">Back to log in</Link>
        </p>
      </div>

      <Sheet open={confirming} onClose={() => setConfirming(false)} label="Reset demo data" kind="confirm">
        <div className="p-5">
          <h2 className="text-lg font-bold">Reset demo data?</h2>
          <p className="mt-2 text-[0.95rem] text-clay-muted">Everything you changed in the demo goes back to how it started: members, payments, bookings and workouts. You stay signed in.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="clay" onClick={() => setConfirming(false)} data-autofocus>Keep my changes</Button>
            <Button type="button" variant="primary" onClick={() => void reset()} disabled={resetting}>{resetting ? "Resetting" : "Reset demo data"}</Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
