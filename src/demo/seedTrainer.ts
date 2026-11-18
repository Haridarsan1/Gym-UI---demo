import { TENANT_ID } from "@/app/demoAccounts";
import { addDays, istDateTime, weekStart } from "@/domain/dates";
import { scheduledBetween } from "@/domain/metrics";
import { slotKeyFor, weekdayOf } from "@/domain/slots";
import type { Assessment, Booking, CreditLedgerEntry, Goal, Member, Membership, TrainerAssignment, TrainerAvailability, TrainerReview, WorkoutLog, WorkoutPlanVersion } from "@/domain/types";
import { buildDays, hash } from "@/demo/seedMember";
import { PERSONAS } from "@/demo/personas";

/**
 * The trainers’ rosters (M2). The four sample members are built by `seedMember.ts`; this gives every other member who has a
 * trainer and an active membership a believable place in that trainer’s book of clients, so the trainer’s Today has something
 * true to say. Everything is relative to today.
 *
 *   strong     25%  a plan, nearly every workout done, a recent review
 *   steady     25%  a plan, most workouts done, a review that may be getting old
 *   slipping   30%  a plan, fine until the last week and a half, then nothing; the review is overdue
 *   awaiting   20%  a trainer, but no plan yet
 *
 * These clients have no login, so their logs are coach-led: the trainer entered them (T05), and the log says so.
 *
 * Each trainer also has sessions booked today, with the credit held, and anyone whose plan carries training credits that
 * run out soon shows up as expiring (that comes from the existing ledger).
 */
export interface RosterInput {
  today: string;
  members: Member[];
  memberships: Membership[];
  trainerAssignments: TrainerAssignment[];
  availability: TrainerAvailability[];
  deskFor: (branchId: string) => string;
  /** Members whose assessment consent is agreed and not withdrawn. */
  assessmentConsent: Set<string>;
}

export interface RosterSeed {
  workoutPlanVersions: WorkoutPlanVersion[];
  workoutLogs: WorkoutLog[];
  trainerReviews: TrainerReview[];
  goals: Goal[];
  assessments: Assessment[];
  bookings: Booking[];
  creditLedger: CreditLedgerEntry[];
}

export type RosterProfile = "strong" | "steady" | "slipping" | "awaiting";
export const profileFor = (memberId: string): RosterProfile => {
  const n = hash(memberId) % 100;
  return n < 25 ? "strong" : n < 50 ? "steady" : n < 80 ? "slipping" : "awaiting";
};

const PATTERN: Array<[number, "fullA" | "fullB"]> = [[0, "fullA"], [2, "fullB"], [4, "fullA"]];

export function buildRoster(input: RosterInput): RosterSeed {
  const { today, members, memberships, trainerAssignments, availability, deskFor, assessmentConsent } = input;
  const at = (date: string, time: string) => istDateTime(date, time);
  const out: RosterSeed = { workoutPlanVersions: [], workoutLogs: [], trainerReviews: [], goals: [], assessments: [], bookings: [], creditLedger: [] };
  const personas = new Set(PERSONAS.map((p) => p.memberId));
  const yesterday = addDays(today, -1);
  const onPlan: Array<{ member: Member; trainerId: string }> = [];

  for (const a of trainerAssignments) {
    if (a.effectiveTo || personas.has(a.memberId)) continue;
    const member = members.find((m) => m.id === a.memberId)!;
    const ms = memberships.find((m) => m.memberId === member.id && m.status === "active");
    if (!ms) continue;
    const profile = profileFor(member.id);
    if (profile === "awaiting") continue;

    const startsOn = weekStart(ms.startsOn > addDays(weekStart(today), -28) ? ms.startsOn : addDays(weekStart(today), -28));
    const version: WorkoutPlanVersion = {
      id: `wpv_${member.id}_1`, tenantId: TENANT_ID, memberId: member.id, programId: `prog_${member.id}`, versionNumber: 1, name: "Getting started", status: "published", startsOn,
      publishedAt: at(addDays(startsOn, -1), "17:00"), authorId: a.trainerId, notes: "Three full-body days a week.", days: buildDays(PATTERN, 6, 0),
    };
    out.workoutPlanVersions.push(version);

    // Logs: what the profile says, one deterministic roll for every scheduled day.
    for (const s of scheduledBetween([version], startsOn, yesterday)) {
      const roll = hash(`${member.id}${s.date}`) % 100;
      const recentlyQuiet = profile === "slipping" && s.date >= addDays(today, -9);
      const done = recentlyQuiet ? false : profile === "strong" ? roll < 93 : roll < 78;
      if (!done) continue;
      const status: WorkoutLog["status"] = roll >= 72 && profile !== "strong" ? "partial" : "completed";
      const rx = s.day.prescriptions;
      const upTo = status === "partial" ? Math.ceil(rx.length * 0.6) : rx.length;
      out.workoutLogs.push({
        id: `wl_${member.id}_${s.date}`, tenantId: TENANT_ID, memberId: member.id, planVersionId: version.id, weekIndex: s.day.weekIndex, dayIndex: s.day.dayIndex, scheduledOn: s.date, status,
        startedAt: at(s.date, "18:00"), completedAt: at(s.date, "18:50"),
        entries: rx.map((p, idx) => ({
          exerciseId: p.exerciseId,
          sets: Array.from({ length: p.sets }, (_, i) => (idx >= upTo ? { setNumber: i + 1, skipped: true } : { setNumber: i + 1, reps: typeof p.reps === "number" ? p.reps : undefined, loadKg: p.loadKg, durationSec: p.durationSec, skipped: false, asPrescribed: true })),
        })),
        effort: 6 + (roll % 3), enteredBy: a.trainerId, enteredByRole: "trainer", corrections: [], idempotencyKey: `seed-log-${member.id}-${s.date}`,
      });
    }

    // Reviews: strong clients were reviewed lately; steady ones within five weeks; slipping ones are overdue (on a four-week cadence; a client on a two-week goal is overdue sooner, one on six weeks later).
    const daysAgo = profile === "strong" ? 4 + (hash(member.id) % 15) : profile === "steady" ? 9 + (hash(member.id) % 27) : 33 + (hash(member.id) % 22);
    out.trainerReviews.push({
      id: `rv_${member.id}_1`, tenantId: TENANT_ID, memberId: member.id, kind: "shared_review", authorId: a.trainerId,
      body: profile === "strong" ? "Great consistency. Keep the same loads for one more week, then we add a little." : "Good start. Let us look at how the week feels and adjust.",
      createdAt: at(addDays(today, -daysAgo), "18:00"), readByMemberAt: at(addDays(today, -daysAgo + 1), "08:00"),
    });
    // One goal each, set with the plan, and the cadence a trainer chose for it: a closer look every two, four or six weeks.
    out.goals.push({
      id: `goal_${member.id}_1`, tenantId: TENANT_ID, memberId: member.id, title: "Train three times a week", metric: "sessions_per_week", unit: "sessions", baseline: 1, target: 3,
      targetDate: addDays(today, 60), reviewEveryDays: [14, 28, 42][hash(`${member.id}cadence`) % 3]!, status: "active",
      history: [{ at: at(addDays(startsOn, -1), "17:00"), by: a.trainerId, note: "Goal set with the first plan." }], createdBy: a.trainerId, createdAt: at(addDays(startsOn, -1), "17:00"),
    });
    // An assessment when the client agreed to them, recorded the day before the plan began.
    if (assessmentConsent.has(member.id)) {
      const h = hash(`${member.id}assess`);
      out.assessments.push({
        id: `as_${member.id}_1`, tenantId: TENANT_ID, memberId: member.id, recordedBy: a.trainerId, recordedOn: addDays(startsOn, -1), createdAt: at(addDays(startsOn, -1), "11:00"),
        experience: (["new", "some", "experienced"] as const)[h % 3]!, yearsTraining: h % 3 === 0 ? undefined : 1 + (h % 5),
        availability: { days: h % 2 ? [1, 3, 5] : [2, 4, 6], time: (["morning", "evening", "any"] as const)[h % 3]! },
        preferences: ["Prefers machines.", "Likes free weights.", "Wants short sessions."][h % 3]!, restrictions: h % 4 === 0 ? "Occasional knee ache on stairs." : "",
        baseline: { weightKg: 55 + (h % 40), waistCm: 70 + (h % 30) },
      });
    }
    onPlan.push({ member, trainerId: a.trainerId });

    // About one client in six holds a pack of training credits that runs out within two weeks.
    if (hash(`${member.id}pack`) % 6 === 0) {
      const id = `cr_roster_pack_${member.id}`;
      out.creditLedger.push({
        id, tenantId: TENANT_ID, memberId: member.id, kind: "purchase", credits: 3 + (hash(member.id) % 4), expiresOn: addDays(today, 3 + (hash(member.id) % 10)), createdBy: deskFor(member.homeBranchId),
        createdAt: at(addDays(today, -40), "10:00"), idempotencyKey: `seed-${id}`,
      });
    }
  }

  // Sessions today: Meera has four, every other trainer two. The first has been done; the rest are still to come.
  const weekday = weekdayOf(today);
  const trainerIds = [...new Set(onPlan.map((o) => o.trainerId))].sort();
  trainerIds.forEach((trainerId, ti) => {
    const branchId = availability.find((x) => x.trainerId === trainerId && x.weekday === weekday)?.branchId;
    if (!branchId) return;
    const mine = onPlan.filter((o) => o.trainerId === trainerId);
    const times = trainerId === "u_trainer_meera" ? ["07:00", "17:00", "18:00", "19:00"] : ["08:00", "18:00"];
    times.forEach((time, k) => {
      const client = mine[(k + ti) % mine.length];
      if (!client || out.bookings.some((b) => b.memberId === client.member.id && b.startsAt.startsWith(today.slice(0, 7)) && b.id.startsWith("bk_roster") && b.status !== "canceled" && b.startsAt.slice(0, 10) === today && b.trainerId === trainerId)) return;
      const attended = k === 0;
      const id = `${client.member.id}_${today}_${time.slice(0, 2)}`;
      const purchase = `cr_roster_${id}`;
      const reservation = `cr_roster_res_${id}`;
      const entry = (eid: string, kind: CreditLedgerEntry["kind"], credits: number, extra: Partial<CreditLedgerEntry> = {}): CreditLedgerEntry => ({
        id: eid, tenantId: TENANT_ID, memberId: client.member.id, kind, credits, createdBy: kind === "purchase" ? deskFor(branchId) : trainerId, createdAt: at(addDays(today, -3), "09:00"), idempotencyKey: `seed-${eid}`, ...extra,
      });
      out.bookings.push({
        id: `bk_roster_${id}`, tenantId: TENANT_ID, memberId: client.member.id, branchId, kind: "pt_session", trainerId, startsAt: at(today, time), endsAt: at(today, `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`),
        status: attended ? "attended" : "booked", creditEntryId: reservation, slotKey: slotKeyFor(trainerId, today, time), createdBy: client.member.id, createdAt: at(addDays(today, -3), "09:00"), idempotencyKey: `seed-booking-${id}`,
      });
      out.creditLedger.push(entry(purchase, "purchase", 6, { expiresOn: addDays(today, 120) }), entry(reservation, "reservation", 1, { bookingId: `bk_roster_${id}` }));
      if (attended) out.creditLedger.push(entry(`cr_roster_con_${id}`, "consumption", 1, { bookingId: `bk_roster_${id}`, refEntryId: reservation, createdAt: at(today, "08:00") }));
    });
  });
  return out;
}
