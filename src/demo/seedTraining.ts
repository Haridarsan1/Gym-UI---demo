import { TENANT_ID } from "@/app/demoAccounts";
import { earnedBadges } from "@/domain/badges";
import { addDays, istDateTime, weekStart } from "@/domain/dates";
import { detectPRs, scheduledBetween, streakWeeks, weekStats } from "@/domain/metrics";
import type {
  Assessment, BadgeAward, CheckIn, Consent, Goal, Measurement, Member, MemberSettings, Membership, PlanDay, Prescription, TrainerAssignment, TrainerReview, WorkoutLog, WorkoutPlanVersion,
} from "@/domain/types";
import { EXERCISES } from "@/demo/exercises";
import { PERSONAS } from "@/demo/personas";
import { rng } from "@/demo/rng";
import { buildTemplates } from "@/demo/seedTemplates";
import { hash, PERSONA_VERSIONS, personaMemberships, personaOutline, personaVersion, ROSTER_PATTERN, rosterClients, type Template } from "@/demo/seedPlans";
import { formatDayMonth } from "@/lib/when";

/**
 * Everything about training for the sample gym: the exercise library and templates, the sample members’ plans, workouts, measurements, goals, assessments, reviews, settings and badges, and
 * the trainers’ clients. Only the member and trainer apps read this, so it is a chunk of its own, built the first time one of them makes a call (`ensureTraining` in `demo/index.ts`) from the
 * gym that is already stored. The front desk, finance and the owner never download or build it.
 */

interface Slot {
  ex: string;
  section: Prescription["section"];
  sets: number;
  reps?: number;
  /** Load in kg in week 0. Loads grow a little every week. */
  base?: number;
  rest?: number;
  duration?: number;
  cue?: string;
}

const warm = (ex: string, duration: number): Slot => ({ ex, section: "warmup", sets: 1, duration });
const cool = (ex: string, duration: number): Slot => ({ ex, section: "cooldown", sets: 1, duration });
const main = (ex: string, sets: number, reps: number, base: number, rest: number, cue?: string): Slot => ({ ex, section: "main", sets, reps, base, rest, cue });

export const TEMPLATES: Record<Template, { title: string; slots: Slot[] }> = {
  push: { title: "Push", slots: [warm("ex_cat_cow", 60), warm("ex_arm_circles", 45), main("ex_bench_press", 3, 10, 40, 90, "Pause the bar on your chest for a beat."), main("ex_incline_db", 3, 10, 14, 75), main("ex_ohp", 3, 8, 25, 90), main("ex_lateral_raise", 3, 12, 6, 60), main("ex_tricep_pushdown", 3, 12, 25, 60), cool("ex_chest_stretch", 60)] },
  pull: { title: "Pull", slots: [warm("ex_foam_roll", 60), main("ex_deadlift", 3, 5, 70, 120, "Keep the bar close to your legs."), main("ex_barbell_row", 3, 10, 45, 90), main("ex_lat_pulldown", 3, 10, 45, 75), main("ex_face_pull", 3, 15, 15, 60), main("ex_bicep_curl", 3, 12, 10, 60), cool("ex_chest_stretch", 60)] },
  legs: { title: "Legs", slots: [warm("ex_cat_cow", 60), main("ex_back_squat", 3, 8, 60, 120, "Knees track over your toes."), main("ex_leg_press", 3, 12, 100, 90), main("ex_rdl", 3, 10, 50, 90), main("ex_lunge", 3, 10, 12, 60), main("ex_calf_raise", 3, 15, 40, 45), cool("ex_hip_flexor_stretch", 60)] },
  upper: { title: "Upper body and core", slots: [warm("ex_arm_circles", 45), main("ex_db_bench", 3, 10, 18, 75), main("ex_db_row", 3, 10, 20, 75), main("ex_db_ohp", 3, 10, 14, 75), { ex: "ex_plank", section: "main", sets: 3, duration: 45, rest: 45 }, main("ex_hanging_knee_raise", 3, 12, 0, 60), cool("ex_treadmill", 600)] },
  fullA: { title: "Full body A", slots: [warm("ex_cat_cow", 60), main("ex_goblet_squat", 3, 10, 12, 75), main("ex_db_bench", 3, 10, 10, 75), main("ex_db_row", 3, 10, 10, 75), { ex: "ex_plank", section: "main", sets: 3, duration: 30, rest: 45 }, cool("ex_hip_flexor_stretch", 60)] },
  fullB: { title: "Full body B", slots: [warm("ex_arm_circles", 45), main("ex_leg_press", 3, 12, 60, 75), main("ex_db_ohp", 3, 10, 8, 75), main("ex_lat_pulldown", 3, 10, 30, 75), main("ex_cable_crunch", 3, 12, 20, 60), cool("ex_chest_stretch", 60)] },
};

const half = (n: number) => Math.round(n * 2) / 2;


/** Weeks a lift stays at one load before it goes up: 2, 3 or 4, different for each exercise so records don’t all land in one week. */
const weeksPerStep = (exerciseId: string): number => 2 + (hash(exerciseId) % 3);
/** The jump: 2.5 kg on the bench press, about 6% of the starting load (at least 1 kg) elsewhere. */
const stepKg = (slot: Slot): number => (slot.ex === "ex_bench_press" ? 2.5 : Math.max(1, half(slot.base! * 0.06)));

/**
 * Loads rise in steps with plateaus between them: a lift holds its load for two to four weeks, then goes up one step. The first
 * session at a new load is a personal record, so each main lift sets one every two to four weeks, not every session.
 */
function loadFor(slot: Slot, weekNo: number): number | undefined {
  if (!slot.base) return undefined;
  return half(slot.base + stepKg(slot) * Math.floor(weekNo / weeksPerStep(slot.ex)));
}

export function buildDays(pattern: Array<[number, Template]>, weeks: number, firstWeekNo: number): PlanDay[] {
  const days: PlanDay[] = [];
  for (let w = 0; w < weeks; w++) {
    pattern.forEach(([offset, tpl], dayIndex) => {
      const t = TEMPLATES[tpl];
      days.push({
        dayOffset: w * 7 + offset, weekIndex: w, dayIndex, title: t.title, canceled: false,
        prescriptions: t.slots.map((slot, order): Prescription => ({
          exerciseId: slot.ex, order, section: slot.section, sets: slot.sets, reps: slot.reps, loadKg: loadFor(slot, firstWeekNo + w),
          durationSec: slot.duration, restSec: slot.rest, cues: slot.cue,
        })),
      });
    });
  }
  return days;
}

export interface TrainingInput {
  today: string;
  members: Member[];
  memberships: Membership[];
  trainerAssignments: TrainerAssignment[];
  consents: Consent[];
  /** The sample members’ check-ins, for the badge that counts them. */
  checkIns: CheckIn[];
}

export interface TrainingSeed {
  exercises: typeof EXERCISES;
  programTemplates: ReturnType<typeof buildTemplates>;
  workoutPlanVersions: WorkoutPlanVersion[];
  workoutLogs: WorkoutLog[];
  goals: Goal[];
  measurements: Measurement[];
  trainerReviews: TrainerReview[];
  memberSettings: MemberSettings[];
  badgeAwards: BadgeAward[];
  assessments: Assessment[];
}

export function buildTraining(input: TrainingInput): TrainingSeed {
  const { today, memberships, checkIns } = input;
  const at = (date: string, time: string) => istDateTime(date, time);
  const out: TrainingSeed = { exercises: EXERCISES, programTemplates: buildTemplates(today, (d) => `${d}T04:30:00.000Z`), workoutPlanVersions: [], workoutLogs: [], goals: [], measurements: [], trainerReviews: [], memberSettings: [], badgeAwards: [], assessments: [] };

  for (const persona of PERSONAS) {
    const { current } = personaMemberships(persona, memberships);
    const memberUser = persona.userId;
    const t = rng(hash(`training${persona.memberId}`));
    const versions = (PERSONA_VERSIONS[persona.memberId] ?? []).map((s) => personaVersion(persona, s, today, buildDays(s.pattern, s.weeks, s.firstWeekNo)));
    out.workoutPlanVersions.push(...versions);

    // ── Workout logs ────────────────────────────────────────────────────────────────────────────────
    const freeze = current.freezes[0];
    const lastDay = freeze ? addDays(freeze.from, -1) : addDays(today, -1);
    const scheduled = versions.length ? scheduledBetween(versions, versions[0]!.startsOn, lastDay) : [];
    const logs: WorkoutLog[] = [];
    const heaviest = new Map<string, number>();
    const outline = new Map(personaOutline(persona, memberships, today).map((o) => [o.date, o]));

    for (const s of scheduled) {
      const o = outline.get(s.date);
      if (!o) continue;
      const status: WorkoutLog["status"] = o.status;
      const evening = o.evening;

      const rx = s.day.prescriptions;
      const doneUpTo = status === "partial" ? Math.ceil(rx.length * 0.6) : status === "skipped" ? 0 : rx.length;
      // About one session in ten is a lighter day: every main load drops by a tenth. The session that would set a record is never one.
      const setsRecord = rx.some((p) => p.section === "main" && p.loadKg !== undefined && p.loadKg > (heaviest.get(p.exerciseId) ?? Infinity));
      const lighter = status === "completed" && !setsRecord && hash(`${persona.memberId}${s.date}`) % 10 === 0;
      const entries = rx.map((p, idx) => {
        const alt = t.next() < 0.06 && p.section === "main" ? (DEMO_SUBS[p.exerciseId] ?? undefined) : undefined;
        return {
          exerciseId: alt ?? p.exerciseId,
          substitutionFor: alt ? p.exerciseId : undefined,
          sets: Array.from({ length: p.sets }, (_, i) => {
            if (idx >= doneUpTo) return { setNumber: i + 1, skipped: true };
            const short = p.section === "main" && p.reps !== undefined && i === p.sets - 1 && t.next() < 0.18;
            const reps = typeof p.reps === "number" ? (short ? Math.max(1, p.reps - t.int(1, 2)) : p.reps) : undefined;
            return { setNumber: i + 1, reps, loadKg: p.loadKg ? (alt || lighter ? half(p.loadKg * 0.9) : p.loadKg) : undefined, durationSec: p.durationSec, skipped: false, asPrescribed: !short && !alt && !lighter };
          }),
        };
      });
      for (const e of entries) for (const set of e.sets) if (!set.skipped && set.loadKg !== undefined && !e.substitutionFor) heaviest.set(e.exerciseId, Math.max(heaviest.get(e.exerciseId) ?? 0, set.loadKg));
      const effortRoll = t.int(6, 9);
      const noteRoll = t.next();
      const byTrainer = t.next() < 0.08;
      logs.push({
        id: `wl_${persona.memberId}_${s.date}`, tenantId: TENANT_ID, memberId: persona.memberId, planVersionId: s.version.id, weekIndex: s.day.weekIndex, dayIndex: s.day.dayIndex, scheduledOn: s.date,
        status: status as WorkoutLog["status"], startedAt: status === "skipped" ? undefined : at(s.date, evening ? "18:30" : "06:45"),
        completedAt: status === "skipped" ? undefined : at(s.date, evening ? "19:25" : "07:40"), entries,
        effort: status === "skipped" ? undefined : lighter ? effortRoll - 3 : effortRoll,
        notes: status === "skipped" ? "Away for work." : lighter ? "Light day, slept badly." : noteRoll < 0.1 ? "Felt strong today." : undefined,
        enteredBy: byTrainer ? persona.trainerId! : memberUser, enteredByRole: byTrainer ? "trainer" : "member", corrections: [], idempotencyKey: `seed-log-${persona.memberId}-${s.date}`,
      });
    }
    out.workoutLogs.push(...logs);


    // ── Measurements and goals ──────────────────────────────────────────────────────────────────────
    const weightStart = persona.memberId === "mem_arjun" ? 82.4 : persona.memberId === "mem_priya" ? 64.8 : 91.2;
    const weeksOfWeights = persona.memberId === "mem_arjun" ? 12 : 4;
    const meas = (kind: Measurement["kind"], date: string, value: number | undefined, unit: string | undefined, byTrainerId: string | null, extra: Partial<Measurement> = {}): Measurement => ({
      id: `ms_${persona.memberId}_${kind}_${date}`, tenantId: TENANT_ID, memberId: persona.memberId, kind, value, unit, measuredOn: date, source: byTrainerId ? "trainer" : "member",
      recordedBy: byTrainerId ?? memberUser, createdAt: at(date, "08:00"), ...extra,
    });
    for (let i = 0; i <= weeksOfWeights; i++) {
      const date = addDays(today, -7 * (weeksOfWeights - i) - 1);
      const value = Math.round((weightStart - 0.27 * i + (t.next() - 0.5) * 0.3) * 10) / 10;
      out.measurements.push(meas("weight", date, value, "kg", i % 4 === 0 ? persona.trainerId! : null));
    }
    if (persona.memberId === "mem_arjun") {
      [[-85, 90], [-57, 89], [-29, 87.5], [-1, 86]].forEach(([d, v]) => out.measurements.push(meas("waist", addDays(today, d!), v, "cm", persona.trainerId!)));
      out.measurements.push(meas("body_fat", addDays(today, -85), 24.5, "%", persona.trainerId!, { method: "Skinfold calipers" }), meas("body_fat", addDays(today, -1), 22.1, "%", persona.trainerId!, { method: "Skinfold calipers" }));
      out.measurements.push(meas("strength_benchmark", addDays(today, -85), 40, "kg", persona.trainerId!, { exerciseId: "ex_bench_press" }), meas("strength_benchmark", addDays(today, -29), 47.5, "kg", persona.trainerId!, { exerciseId: "ex_bench_press" }));
    }

    const goals: Goal[] = [];
    const goal = (n: number, g: Omit<Goal, "id" | "tenantId" | "memberId" | "createdBy" | "createdAt">, createdOn: string): void => {
      goals.push({ id: `goal_${persona.memberId}_${n}`, tenantId: TENANT_ID, memberId: persona.memberId, createdBy: persona.trainerId!, createdAt: at(createdOn, "10:00"), ...g });
    };
    if (persona.memberId === "mem_arjun") {
      goal(1, { title: "Reach 78 kg", metric: "weight", unit: "kg", baseline: 82.4, target: 78, targetDate: addDays(today, 49), reviewEveryDays: 28, status: "active", history: [{ at: at(addDays(today, -84), "10:00"), by: persona.trainerId!, note: "Goal set at the first assessment." }] }, addDays(today, -84));
      goal(2, { title: "Bench press 50 kg for three sets of ten", metric: "bench_press", unit: "kg", baseline: 40, target: 50, targetDate: addDays(today, -10), reviewEveryDays: 28, status: "achieved", history: [{ at: at(addDays(today, -84), "10:00"), by: persona.trainerId!, note: "Goal set at the first assessment." }, { at: at(addDays(today, -12), "19:30"), by: persona.trainerId!, note: "Achieved: 50 kg for 3 × 10." }] }, addDays(today, -84));
    } else if (persona.memberId === "mem_priya") {
      goal(1, { title: "Train three times a week", metric: "sessions_per_week", unit: "sessions", baseline: 1, target: 3, targetDate: addDays(today, 60), reviewEveryDays: 28, status: "active", history: [{ at: at(addDays(today, -29), "10:00"), by: persona.trainerId!, note: "Goal set." }] }, addDays(today, -29));
    } else if (persona.memberId === "mem_rahul") {
      goal(1, { title: "Reach 86 kg", metric: "weight", unit: "kg", baseline: 91.2, target: 86, targetDate: addDays(today, 90), reviewEveryDays: 28, status: "active", history: [{ at: at(addDays(today, -60), "10:00"), by: persona.trainerId!, note: "Goal set." }] }, addDays(today, -60));
    }
    out.goals.push(...goals);

    // ── Assessments (Arjun twice, Rahul once; Rahul has since withdrawn the consent, so his is hidden) ──
    const assess = (n: number, daysAgo: number, a: Pick<Assessment, "experience" | "yearsTraining" | "availability" | "preferences" | "restrictions" | "baseline">) =>
      out.assessments.push({ id: `as_${persona.memberId}_${n}`, tenantId: TENANT_ID, memberId: persona.memberId, recordedBy: persona.trainerId!, recordedOn: addDays(today, -daysAgo), createdAt: at(addDays(today, -daysAgo), "11:00"), ...a });
    if (persona.memberId === "mem_arjun") {
      assess(1, 84, { experience: "some", yearsTraining: 1.5, availability: { days: [1, 3, 5, 6], time: "evening" }, preferences: "Likes free weights. Dislikes the treadmill.", restrictions: "Left shoulder gets tight on overhead work.", baseline: { weightKg: 82.4, bodyFatPct: 24.5, waistCm: 90, restingHr: 68 } });
      assess(2, 28, { experience: "some", yearsTraining: 1.5, availability: { days: [1, 3, 5, 6], time: "evening" }, preferences: "Likes free weights. Happy to add a short cardio finisher.", restrictions: "Shoulder is fine now. Still warms up before pressing.", baseline: { weightKg: 80.6, bodyFatPct: 23.2, waistCm: 87.5, restingHr: 64 } });
    } else if (persona.memberId === "mem_rahul") {
      assess(1, 59, { experience: "new", availability: { days: [1, 3, 5], time: "morning" }, preferences: "Prefers machines to barbells.", restrictions: "Mild lower back pain after long flights.", baseline: { weightKg: 91.2, waistCm: 102, restingHr: 76 } });
    }

    // ── Reviews and settings ────────────────────────────────────────────────────────────────────────
    const review = (n: number, kind: TrainerReview["kind"], daysAgo: number, body: string, extra: Partial<TrainerReview> = {}) => {
      const date = addDays(today, -daysAgo);
      out.trainerReviews.push({ id: `rv_${persona.memberId}_${n}`, tenantId: TENANT_ID, memberId: persona.memberId, kind, authorId: persona.trainerId!, body, createdAt: at(date, "18:00"), ...extra });
    };
    if (persona.memberId === "mem_arjun") {
      review(1, "shared_review", 10, "Strong block. Your bench press is up 10 kg since we started, and you have not missed a week. Keep your elbows tucked on the way down.", { readByMemberAt: at(addDays(today, -9), "07:10"), followUpOn: addDays(today, -1) });
      review(2, "shared_review", 1, `New plan is live from ${formatDayMonth(addDays(today, -13))}. You hit at least three of four sessions every week, so I have raised the loads on the main lifts. Tell me how the heavier squats feel.`, {});
      review(3, "private_note", 12, "Left shoulder a little tight on overhead press. Watch it. Maybe swap in dumbbells if it flares up.");
      out.trainerReviews.push({ id: "rv_mem_arjun_4", tenantId: TENANT_ID, memberId: "mem_arjun", kind: "member_checkin", authorId: memberUser, body: "Good week.", effort: 7, recovery: 4, obstacles: "Work travel on Thursday.", createdAt: at(addDays(today, -6), "21:00") });
    } else if (persona.memberId === "mem_priya") {
      review(1, "shared_review", 20, "Nice start. Three sessions a week is the goal, and you are close. Let us look again in a month.", { readByMemberAt: at(addDays(today, -19), "08:00") });
    }
    out.memberSettings.push({
      id: `set_${persona.memberId}`, tenantId: TENANT_ID, memberId: persona.memberId, email: { bookingReminders: true, workoutUpdates: true, renewalReminders: true, inactivityPrompts: true }, soundOn: false, hapticsOn: true, updatedAt: at(addDays(today, -30), "10:00"),
    });

    // ── Badges: exactly what the rules say this member has earned, so nothing celebrates twice ──────
    const sorted = [...logs].sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));
    let prs = 0;
    sorted.forEach((l, i) => {
      if (l.status !== "skipped") prs += detectPRs(sorted.slice(0, i), l).length;
    });
    const stats = weekStats(versions, logs, current.freezes, versions[0]?.startsOn ?? today, today);
    const facts = {
      completedWorkouts: logs.filter((l) => l.status === "completed").length, personalRecords: prs, streakWeeks: streakWeeks(stats, 75, weekStart(today)),
      goalsAchieved: goals.filter((g) => g.status === "achieved").length, checkIns: checkIns.filter((c) => c.memberId === persona.memberId).length,
    };
    for (const badge of earnedBadges(facts)) out.badgeAwards.push({ id: `bd_${persona.memberId}_${badge}`, tenantId: TENANT_ID, memberId: persona.memberId, badge, awardedAt: at(addDays(today, -2), "08:00") });

  }

  buildRosterTraining(input, out);
  return out;
}

/** The trainers’ clients (M2): a plan, coach-led logs, a review, a goal and sometimes an assessment, for each client who has a plan. */
function buildRosterTraining(input: TrainingInput, out: TrainingSeed): void {
  const { today, consents } = input;
  const at = (date: string, time: string) => istDateTime(date, time);
  const assessmentConsent = new Set(consents.filter((c) => c.scope === "assessments" && !c.withdrawnAt).map((c) => c.memberId));
  const yesterday = addDays(today, -1);
  for (const { assignment: a, member, profile } of rosterClients(input)) {
    const ms = input.memberships.find((m) => m.memberId === member.id && m.status === "active")!;
    const startsOn = weekStart(ms.startsOn > addDays(weekStart(today), -28) ? ms.startsOn : addDays(weekStart(today), -28));
    const version: WorkoutPlanVersion = {
      id: `wpv_${member.id}_1`, tenantId: TENANT_ID, memberId: member.id, programId: `prog_${member.id}`, versionNumber: 1, name: "Getting started", status: "published", startsOn,
      publishedAt: at(addDays(startsOn, -1), "17:00"), authorId: a.trainerId, notes: "Three full-body days a week.", days: buildDays(ROSTER_PATTERN, 6, 0),
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
  }
}

/** The exercise a member may swap to, for seeded substitutions. */
const DEMO_SUBS: Record<string, string> = { ex_bench_press: "ex_db_bench", ex_barbell_row: "ex_db_row", ex_ohp: "ex_db_ohp", ex_back_squat: "ex_goblet_squat", ex_lat_pulldown: "ex_pullup" };
