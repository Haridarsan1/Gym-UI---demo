import { Link } from "react-router-dom";
import { CalendarClock, Check, ClipboardList, Moon, Snowflake } from "lucide-react";
import type { TodayData } from "@/api/member";
import { Button3DLink } from "@/design/Button3D";
import { formatDate, formatDayMonth, formatWeekdayDate } from "@/lib/when";
import type { ReactNode } from "react";

function Card({ labelledBy, tone = "white", children }: { labelledBy: string; tone?: "white" | "mint" | "ember"; children: ReactNode }) {
  // The workout to do is the warm card on the screen: an Ember tint from ember-50 to ember-100.
  const surface = tone === "mint" ? "clay-mint rounded-[1.75rem]" : tone === "ember" ? "clay bg-gradient-to-br from-ember-50 to-ember-100" : "clay";
  return (
    <section aria-labelledby={labelledBy} className={`${surface} p-6`}>
      {children}
    </section>
  );
}

const coach = (name: string) => `Coach ${name.split(" ")[0]}`;

/**
 * The main card. It shows today’s workout, or a rest day, or says the plan is on its way, or explains that the
 * membership needs attention. A skipped or partly done workout is never shown in red.
 */
export function WorkoutCard({ t }: { t: TodayData }) {
  const m = t.membership;

  if (!m) {
    return (
      <Card labelledBy="hero-title">
        <ClipboardList className="h-7 w-7 text-clay-muted" aria-hidden="true" />
        <h2 id="hero-title" className="mt-3 text-xl font-bold">No membership yet</h2>
        <p className="mt-1 text-clay-muted">Ask the front desk to set up your membership, and your plan will appear here.</p>
      </Card>
    );
  }
  if (m.status === "frozen") {
    return (
      <Card labelledBy="hero-title">
        <Snowflake className="h-7 w-7 text-status-frozen-fg" aria-hidden="true" />
        <h2 id="hero-title" className="mt-3 text-xl font-bold">Taking a break</h2>
        <p className="mt-1 text-clay-muted">Your workouts start again when your freeze ends{m.frozenUntil ? ` on ${formatDate(m.frozenUntil)}` : ""}. Your plan is waiting.</p>
      </Card>
    );
  }
  if (m.status === "expired" || m.status === "canceled" || m.status === "pending" || m.status === "scheduled") {
    const copy = {
      expired: ["Your membership has ended", `It ended on ${m.endsOn ? formatDate(m.endsOn) : "an earlier date"}. Renew to keep training and checking in.`, "Renew membership"],
      canceled: ["Your membership was canceled", "Renew to start training again. Your plan and history are kept.", "Renew membership"],
      pending: ["Your membership is waiting for payment", "Pay your invoice and your plan opens up.", "See invoice"],
      scheduled: ["Your membership starts soon", `It starts on ${formatDate(m.startsOn)}.`, ""],
    }[m.status];
    return (
      <Card labelledBy="hero-title">
        <CalendarClock className="h-7 w-7 text-clay-muted" aria-hidden="true" />
        <h2 id="hero-title" className="mt-3 text-xl font-bold">{copy[0]}</h2>
        <p className="mt-1 text-clay-muted">{copy[1]}</p>
        {copy[2] && (
          <Button3DLink to="/m/membership" size="lg" className="mt-5 w-full">
            {copy[2]}
          </Button3DLink>
        )}
      </Card>
    );
  }

  const p = t.plan;
  if (p.state === "no_plan") {
    return (
      <Card labelledBy="hero-title">
        <ClipboardList className="h-7 w-7 text-lilac-700" aria-hidden="true" />
        <h2 id="hero-title" className="mt-3 text-xl font-bold">Your plan is on its way</h2>
        <p className="mt-1 text-clay-muted">
          {t.trainerName
            ? `${coach(t.trainerName)} is putting your plan together. It will appear here as soon as it is ready.`
            : "Your gym will assign a trainer and publish your plan. Ask the front desk if it has been a while."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button3DLink to="/m/pass" variant="white">
            Open check-in pass
          </Button3DLink>
        </div>
      </Card>
    );
  }
  if (p.state === "rest") {
    return (
      <Card labelledBy="hero-title">
        <Moon className="h-7 w-7 text-lilac-700" aria-hidden="true" />
        <h2 id="hero-title" className="mt-3 text-xl font-bold">Rest day</h2>
        <p className="mt-1 text-clay-muted">
          {p.next ? `Your next workout is ${formatWeekdayDate(p.next.date)}: ${p.next.title}.` : "Nothing is planned for the next few weeks."} Rest is part of the plan.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button3DLink to="/m/pass" variant="white">
            Open check-in pass
          </Button3DLink>
          <Button3DLink to="/m/progress?log=weight" variant="white">
            Log your weight
          </Button3DLink>
          <Button3DLink to="/m/bookings" variant="white">
            Book a session
          </Button3DLink>
        </div>
      </Card>
    );
  }

  // A workout today.
  if (p.logStatus === "completed" || p.logStatus === "partial" || p.logStatus === "skipped") {
    const words = { completed: ["Workout done", "Nice work. Rest up and eat well."], partial: ["Workout partly done", "Every session counts. You can do the rest next time."], skipped: ["Skipped today", "That is fine. Your next workout is waiting when you are."] }[p.logStatus];
    return (
      <Card labelledBy="hero-title" tone={p.logStatus === "completed" ? "mint" : "white"}>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white/70">
          <Check className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 id="hero-title" className="mt-3 text-xl font-bold">{words[0]}</h2>
        <p className="mt-1">{words[1]}</p>
        {p.logStatus !== "skipped" && (
          <Link to={`/m/workout/${p.date}/complete`} className="mt-4 inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">
            See summary
          </Link>
        )}
      </Card>
    );
  }
  const resume = p.logStatus === "draft";
  return (
    <Card labelledBy="hero-title" tone="ember">
      <p className="text-sm font-semibold text-ember-800">Today’s workout, week {p.weekNumber}</p>
      <h2 id="hero-title" className="mt-1 text-2xl font-bold tracking-tight">{p.title}</h2>
      <p className="mt-1 text-clay-muted">
        {p.exerciseCount} exercises, about {p.minutes} min
      </p>
      <ul aria-label="Exercises" className="mt-3 space-y-0.5 text-[0.95rem]">
        {p.exercises.map((name) => (
          <li key={name}>{name}</li>
        ))}
        {p.moreExercises > 0 && <li className="font-semibold text-ember-800">+{p.moreExercises} more</li>}
      </ul>
      {p.newPlan && (
        <p className="mt-3 inline-flex rounded-full bg-lilac-100 px-3 py-1 text-sm font-semibold text-lilac-700">
          New plan from {coach(p.authorName)}, {formatDayMonth(p.startedOn)}
        </p>
      )}
      <Button3DLink to={`/m/workout/${p.date}`} size="lg" haptic className="mt-5 w-full">
        {resume ? "Continue workout" : "Start workout"}
      </Button3DLink>
      {resume && <p className="mt-3 text-center text-sm text-clay-muted">Your sets are saved. Carry on where you stopped.</p>}
    </Card>
  );
}
