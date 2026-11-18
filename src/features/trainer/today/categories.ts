import { CalendarClock, ClipboardCheck, ClipboardList, Hourglass, TrendingDown, type LucideIcon } from "lucide-react";
import type { TrainerTodayData } from "@/api/trainer";
import { formatDayMonth, formatTime } from "@/lib/when";

export type CategoryKey = "sessions" | "reviews" | "missed" | "credits" | "plans";

export interface Row {
  id: string;
  memberId: string;
  name: string;
  /** The line under the name: why this client is here. */
  detail: string;
  /** The small note on the right. */
  trailing: string;
  /** How loudly the trailing note speaks. “now” and “next” are about sessions. */
  tone: "plain" | "now" | "next" | "quiet";
}

export interface Category {
  key: CategoryKey;
  title: string;
  icon: LucideIcon;
  /** One line under the title in the list. */
  hint: string;
  rows: Row[];
  empty: { title: string; body: string };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The five things the trainer’s day is made of, in the order they matter. Each is a list of clients with one reason each. */
export function categoriesFor(t: TrainerTodayData): Category[] {
  const phaseText = { done: "", now: "Now", next: "Next", later: "", unmarked: "Needs marking" } as const;
  return [
    {
      key: "sessions", title: "Sessions today", icon: CalendarClock,
      hint: t.sessions.length ? `${t.sessions.filter((s) => s.phase !== "done").length} still to come` : "Nothing booked",
      rows: t.sessions.map((s) => ({
        id: s.id, memberId: s.memberId, name: s.name, detail: `${formatTime(s.startsAt)} to ${formatTime(s.endsAt)}, ${s.branchName}`,
        trailing: s.status === "attended" ? "Done" : s.status === "no_show" ? "No-show" : phaseText[s.phase],
        tone: s.phase === "now" ? "now" : s.phase === "next" ? "next" : s.phase === "done" ? "quiet" : "plain",
      })),
      empty: { title: "No sessions today", body: "Sessions your clients book with you appear here, in time order." },
    },
    {
      key: "reviews", title: "Reviews overdue", icon: ClipboardCheck, hint: "On each client’s own cadence",
      rows: t.overdueReviews.map((r) => ({ id: r.memberId, memberId: r.memberId, name: r.name, detail: r.reason, trailing: `${plural(r.daysOver, "day")} overdue`, tone: "plain" })),
      empty: { title: "Every review is up to date", body: "A client appears here when their next review date has passed." },
    },
    {
      key: "missed", title: "Missed workouts", icon: TrendingDown, hint: "Two or more in 7 days",
      rows: t.missed.map((m) => ({
        id: m.memberId, memberId: m.memberId, name: m.name, detail: `Missed ${m.missed} of ${m.scheduled} workouts in 7 days`,
        trailing: m.lastDoneOn ? `Last trained ${formatDayMonth(m.lastDoneOn)}` : "No workout logged", tone: "plain",
      })),
      empty: { title: "Nobody has fallen behind", body: "Clients who miss two or more workouts in 7 days appear here. Skipped workouts and frozen days don’t count." },
    },
    {
      key: "credits", title: "Credits expiring", icon: Hourglass, hint: "Within two weeks",
      rows: t.expiring.map((e) => ({
        id: e.memberId, memberId: e.memberId, name: e.name, detail: `${plural(e.credits, "session")} expire${e.credits === 1 ? "s" : ""} ${formatDayMonth(e.expiresOn)}`,
        trailing: e.daysLeft === 0 ? "Today" : `${plural(e.daysLeft, "day")} left`, tone: "plain",
      })),
      empty: { title: "No credits about to expire", body: "Training credits that run out within two weeks are listed here, so you can help the client book them." },
    },
    {
      key: "plans", title: "Waiting for a plan", icon: ClipboardList, hint: "Active, no program yet",
      rows: t.awaitingPlan.map((a) => ({
        id: a.memberId, memberId: a.memberId, name: a.name, detail: a.planName, trailing: a.daysWaiting === 0 ? "Assigned today" : `Waiting ${plural(a.daysWaiting, "day")}`, tone: "plain",
      })),
      empty: { title: "Every client has a plan", body: "New clients without a program appear here until you publish one." },
    },
  ];
}

/** Everything the trainer should know about one client from today’s lists, as sentences. */
export function flagsFor(t: TrainerTodayData, memberId: string): string[] {
  const out: string[] = [];
  const s = t.sessions.find((x) => x.memberId === memberId);
  if (s) out.push(`Session today at ${formatTime(s.startsAt)}, ${s.branchName}`);
  const r = t.overdueReviews.find((x) => x.memberId === memberId);
  if (r) out.push(`Review ${plural(r.daysOver, "day")} overdue. ${r.reason}.`);
  const m = t.missed.find((x) => x.memberId === memberId);
  if (m) out.push(`Missed ${m.missed} of ${m.scheduled} workouts in the last 7 days`);
  const e = t.expiring.find((x) => x.memberId === memberId);
  if (e) out.push(`${plural(e.credits, "training credit")} expire${e.credits === 1 ? "s" : ""} ${formatDayMonth(e.expiresOn)}`);
  const p = t.awaitingPlan.find((x) => x.memberId === memberId);
  if (p) out.push(`No plan yet on ${p.planName}`);
  return out;
}
