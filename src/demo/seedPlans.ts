import { TENANT_ID } from "@/app/demoAccounts";
import { addDays, istDateTime, weekStart } from "@/domain/dates";
import { scheduledBetween } from "@/domain/metrics";
import type { Member, Membership, PlanDay, TrainerAssignment, WorkoutPlanVersion } from "@/domain/types";
import { PERSONAS, type Persona } from "@/demo/personas";
import { rng } from "@/demo/rng";

/**
 * What the front desk, finance and the owner need to know about the sample members’ training, and nothing more: which days a plan puts a workout on, which of
 * them the member did, and at what time of day. Check-in times are built from this. The workouts themselves (exercises, sets, loads, reviews, goals, photos’ worth
 * of detail) are `seedTraining.ts`, which only the member and trainer apps ever download.
 */

export type Template = "push" | "pull" | "legs" | "upper" | "fullA" | "fullB";
export const hash = (text: string): number => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

export interface VersionSpec { n: number; name: string; startOffset: number; pattern: Array<[number, Template]>; weeks: number; firstWeekNo: number; notes: string }
const FULL3: Array<[number, Template]> = [[0, "fullA"], [2, "fullB"], [4, "fullA"]];
export const PERSONA_VERSIONS: Record<string, VersionSpec[]> = {
  mem_arjun: [
    { n: 1, name: "Foundation block", startOffset: -84, pattern: [[0, "push"], [1, "pull"], [3, "legs"], [5, "upper"]], weeks: 10, firstWeekNo: 0, notes: "Learn the lifts and build a base." },
    { n: 2, name: "Strength and size block", startOffset: -13, pattern: [[0, "push"], [2, "pull"], [4, "legs"], [6, "upper"]], weeks: 8, firstWeekNo: 10, notes: "Heavier compounds on the same four days." },
  ],
  mem_priya: [{ n: 1, name: "Getting started", startOffset: -29, pattern: FULL3, weeks: 8, firstWeekNo: 0, notes: "Three full-body days to build the habit." }],
  mem_rahul: [{ n: 1, name: "Base strength", startOffset: -60, pattern: FULL3, weeks: 12, firstWeekNo: 0, notes: "Three full-body days a week." }],
  mem_sneha: [],
};
/** The first-week pattern every roster client starts on. */
export const ROSTER_PATTERN: Array<[number, "fullA" | "fullB"]> = [[0, "fullA"], [2, "fullB"], [4, "fullA"]];

/** A plan’s days with nothing prescribed yet: enough to know which dates carry a workout. */
export function lightDays(pattern: Array<[number, Template]>, weeks: number): PlanDay[] {
  const days: PlanDay[] = [];
  for (let w = 0; w < weeks; w++) pattern.forEach(([offset], dayIndex) => days.push({ dayOffset: w * 7 + offset, weekIndex: w, dayIndex, title: "", canceled: false, prescriptions: [] }));
  return days;
}

export function personaVersion(persona: Persona, spec: VersionSpec, today: string, days: PlanDay[]): WorkoutPlanVersion {
  const startsOn = addDays(today, spec.startOffset);
  return {
    id: `wpv_${persona.memberId}_${spec.n}`, tenantId: TENANT_ID, memberId: persona.memberId, programId: `prog_${persona.memberId}`, versionNumber: spec.n, name: spec.name, status: "published", startsOn,
    publishedAt: istDateTime(addDays(startsOn, -1), "17:00"), authorId: persona.trainerId!, notes: spec.notes, days,
  };
}

export const personaMemberships = (persona: Persona, memberships: Membership[]) => {
  const mine = memberships.filter((m) => m.memberId === persona.memberId).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const current = mine.find((m) => m.status === persona.status && !m.id.includes("_prior"))!;
  return { mine, current };
};

export interface Outline { date: string; status: "completed" | "partial" | "skipped"; evening: boolean }

/**
 * Which scheduled days a sample member did, skipped or did in part (a day not listed was missed), and whether it was the evening. In the last six weeks no week falls below
 * 75%, so the streak is real. The same answer for the desk (check-in times) and for the training seed (the logs), because both ask this function.
 */
export function personaOutline(persona: Persona, memberships: Membership[], today: string): Outline[] {
  const { current } = personaMemberships(persona, memberships);
  const versions = (PERSONA_VERSIONS[persona.memberId] ?? []).map((s) => personaVersion(persona, s, today, lightDays(s.pattern, s.weeks)));
  const freeze = current.freezes[0];
  const lastDay = freeze ? addDays(freeze.from, -1) : addDays(today, -1);
  const scheduled = versions.length ? scheduledBetween(versions, versions[0]!.startsOn, lastDay) : [];
  const o = rng(hash(`outline${persona.memberId}`));
  const plannedPerWeek = new Map<string, number>();
  for (const s of scheduled) plannedPerWeek.set(weekStart(s.date), (plannedPerWeek.get(weekStart(s.date)) ?? 0) + 1);
  const badInWeek = new Map<string, number>();
  const recent = addDays(weekStart(today), -35);
  const out: Outline[] = [];
  for (const s of scheduled) {
    const roll = o.next();
    let status: Outline["status"] | "missed" = roll < 0.07 ? "missed" : roll < 0.15 ? "skipped" : roll < 0.28 ? "partial" : "completed";
    const ws = weekStart(s.date);
    if (s.date >= recent && status !== "completed") {
      const allowed = Math.floor((plannedPerWeek.get(ws) ?? 0) * 0.25);
      if ((badInWeek.get(ws) ?? 0) >= allowed || status === "missed") status = "completed";
      else if (status === "skipped") status = "partial";
      else badInWeek.set(ws, badInWeek.get(ws) ?? 0);
    }
    if (status === "missed") continue;
    out.push({ date: s.date, status, evening: o.next() < 0.5 });
  }
  return out;
}

export interface RosterClient { assignment: TrainerAssignment; member: Member; membership: Membership; profile: "strong" | "steady" | "slipping" }
export type RosterProfile = "strong" | "steady" | "slipping" | "awaiting";
export const profileFor = (memberId: string): RosterProfile => {
  const n = hash(memberId) % 100;
  return n < 25 ? "strong" : n < 50 ? "steady" : n < 80 ? "slipping" : "awaiting";
};

/** The non-sample members who have a trainer, an active membership and a plan (one in five has a trainer but no plan yet). */
export function rosterClients(input: { members: Member[]; memberships: Membership[]; trainerAssignments: TrainerAssignment[] }): RosterClient[] {
  const personas = new Set(PERSONAS.map((p) => p.memberId));
  const out: RosterClient[] = [];
  for (const a of input.trainerAssignments) {
    if (a.effectiveTo || personas.has(a.memberId)) continue;
    const member = input.members.find((m) => m.id === a.memberId)!;
    const membership = input.memberships.find((m) => m.memberId === member.id && m.status === "active");
    if (!membership) continue;
    const profile = profileFor(member.id);
    if (profile === "awaiting") continue;
    out.push({ assignment: a, member, membership, profile });
  }
  return out;
}
