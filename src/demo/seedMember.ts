import { BRANCH, TENANT_ID } from "@/app/demoAccounts";
import { earnedBadges } from "@/domain/badges";
import { invoiceTotals, placeOfSupplyFor } from "@/domain/billing";
import { addDays, istDateTime, weekStart } from "@/domain/dates";
import { detectPRs, scheduledBetween, streakWeeks, weekStats } from "@/domain/metrics";
import type {
  BadgeAward, Booking, Branch, CheckIn, CreditLedgerEntry, Goal, Invoice, Measurement, Member, MemberSettings, Membership, MembershipPlan, Payment, PlanDay,
  Prescription, TrainerReview, WorkoutLog, WorkoutPlanVersion,
} from "@/domain/types";
import { PERSONAS, type Persona } from "@/demo/personas";
import type { Rng } from "@/demo/rng";
import { formatDayMonth } from "@/lib/when";

/**
 * Training, billing and activity for the four sample members. Everything is relative to today, so the sample gym always
 * looks current: Arjun always has a workout today, a plan that changed 13 days ago, and a booking tomorrow.
 */

type Template = "push" | "pull" | "legs" | "upper" | "fullA" | "fullB";
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

const TEMPLATES: Record<Template, { title: string; slots: Slot[] }> = {
  push: { title: "Push", slots: [warm("ex_cat_cow", 60), warm("ex_arm_circles", 45), main("ex_bench_press", 3, 10, 40, 90, "Pause the bar on your chest for a beat."), main("ex_incline_db", 3, 10, 14, 75), main("ex_ohp", 3, 8, 25, 90), main("ex_lateral_raise", 3, 12, 6, 60), main("ex_tricep_pushdown", 3, 12, 25, 60), cool("ex_chest_stretch", 60)] },
  pull: { title: "Pull", slots: [warm("ex_foam_roll", 60), main("ex_deadlift", 3, 5, 70, 120, "Keep the bar close to your legs."), main("ex_barbell_row", 3, 10, 45, 90), main("ex_lat_pulldown", 3, 10, 45, 75), main("ex_face_pull", 3, 15, 15, 60), main("ex_bicep_curl", 3, 12, 10, 60), cool("ex_chest_stretch", 60)] },
  legs: { title: "Legs", slots: [warm("ex_cat_cow", 60), main("ex_back_squat", 3, 8, 60, 120, "Knees track over your toes."), main("ex_leg_press", 3, 12, 100, 90), main("ex_rdl", 3, 10, 50, 90), main("ex_lunge", 3, 10, 12, 60), main("ex_calf_raise", 3, 15, 40, 45), cool("ex_hip_flexor_stretch", 60)] },
  upper: { title: "Upper body and core", slots: [warm("ex_arm_circles", 45), main("ex_db_bench", 3, 10, 18, 75), main("ex_db_row", 3, 10, 20, 75), main("ex_db_ohp", 3, 10, 14, 75), { ex: "ex_plank", section: "main", sets: 3, duration: 45, rest: 45 }, main("ex_hanging_knee_raise", 3, 12, 0, 60), cool("ex_treadmill", 600)] },
  fullA: { title: "Full body A", slots: [warm("ex_cat_cow", 60), main("ex_goblet_squat", 3, 10, 12, 75), main("ex_db_bench", 3, 10, 10, 75), main("ex_db_row", 3, 10, 10, 75), { ex: "ex_plank", section: "main", sets: 3, duration: 30, rest: 45 }, cool("ex_hip_flexor_stretch", 60)] },
  fullB: { title: "Full body B", slots: [warm("ex_arm_circles", 45), main("ex_leg_press", 3, 12, 60, 75), main("ex_db_ohp", 3, 10, 8, 75), main("ex_lat_pulldown", 3, 10, 30, 75), main("ex_cable_crunch", 3, 12, 20, 60), cool("ex_chest_stretch", 60)] },
};

const half = (n: number) => Math.round(n * 2) / 2;

/** Loads climb every week. The bench press gains about 2 kg a week, which is 20.5 kg in ten weeks. */
function loadFor(slot: Slot, weekNo: number): number | undefined {
  if (!slot.base) return undefined;
  return slot.ex === "ex_bench_press" ? half(slot.base + 2.05 * weekNo) : half(slot.base * (1 + 0.025 * weekNo));
}

function buildDays(pattern: Array<[number, Template]>, weeks: number, firstWeekNo: number): PlanDay[] {
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

export interface MemberSeedInput {
  today: string;
  r: Rng;
  branches: Pick<Branch, "id" | "stateCode">[];
  members: Member[];
  memberships: Membership[];
  membershipPlans: MembershipPlan[];
  deskFor: (branchId: string) => string;
}

export interface MemberSeed {
  workoutPlanVersions: WorkoutPlanVersion[];
  workoutLogs: WorkoutLog[];
  goals: Goal[];
  measurements: Measurement[];
  trainerReviews: TrainerReview[];
  memberSettings: MemberSettings[];
  badgeAwards: BadgeAward[];
  bookings: Booking[];
  checkIns: CheckIn[];
  invoices: Invoice[];
  payments: Payment[];
  creditLedger: CreditLedgerEntry[];
}

export function buildMemberData(input: MemberSeedInput): MemberSeed {
  const { today, r, branches, memberships, membershipPlans, deskFor } = input;
  const at = (date: string, time: string) => istDateTime(date, time);
  const branchStates = new Map(branches.map((b) => [b.id, b.stateCode]));
  const planName = new Map(membershipPlans.map((p) => [p.id, p.name]));
  const out: MemberSeed = { workoutPlanVersions: [], workoutLogs: [], goals: [], measurements: [], trainerReviews: [], memberSettings: [], badgeAwards: [], bookings: [], checkIns: [], invoices: [], payments: [], creditLedger: [] };
  let invoiceNo = 1;

  const version = (persona: Persona, n: number, name: string, startsOn: string, pattern: Array<[number, Template]>, weeks: number, firstWeekNo: number, notes: string): WorkoutPlanVersion => ({
    id: `wpv_${persona.memberId}_${n}`, tenantId: TENANT_ID, memberId: persona.memberId, programId: `prog_${persona.memberId}`, versionNumber: n, name, status: "published", startsOn,
    publishedAt: at(addDays(startsOn, -1), "17:00"), authorId: persona.trainerId!, notes, days: buildDays(pattern, weeks, firstWeekNo),
  });

  const versionsOf: Record<string, WorkoutPlanVersion[]> = {
    mem_arjun: [
      version(PERSONAS[0]!, 1, "Foundation block", addDays(today, -84), [[0, "push"], [1, "pull"], [3, "legs"], [5, "upper"]], 10, 0, "Learn the lifts and build a base."),
      version(PERSONAS[0]!, 2, "Strength and size block", addDays(today, -13), [[0, "push"], [2, "pull"], [4, "legs"], [6, "upper"]], 8, 10, "Heavier compounds on the same four days."),
    ],
    mem_priya: [version(PERSONAS[1]!, 1, "Getting started", addDays(today, -29), [[0, "fullA"], [2, "fullB"], [4, "fullA"]], 8, 0, "Three full-body days to build the habit.")],
    mem_rahul: [version(PERSONAS[2]!, 1, "Base strength", addDays(today, -60), [[0, "fullA"], [2, "fullB"], [4, "fullA"]], 12, 0, "Three full-body days a week.")],
    mem_sneha: [],
  };
  for (const v of Object.values(versionsOf)) out.workoutPlanVersions.push(...v);

  for (const persona of PERSONAS) {
    const mine = memberships.filter((m) => m.memberId === persona.memberId).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    const current = mine.find((m) => m.status === persona.status && !m.id.includes("_prior"))!;
    const versions = versionsOf[persona.memberId]!;
    const memberUser = persona.userId;
    const desk = deskFor(persona.branchId);
    const freeze = current.freezes[0];

    // ── Workout logs ────────────────────────────────────────────────────────────────────────────────
    const lastDay = freeze ? addDays(freeze.from, -1) : addDays(today, -1);
    const scheduled = versions.length ? scheduledBetween(versions, versions[0]!.startsOn, lastDay) : [];
    const plannedPerWeek = new Map<string, number>();
    for (const s of scheduled) plannedPerWeek.set(weekStart(s.date), (plannedPerWeek.get(weekStart(s.date)) ?? 0) + 1);
    const badInWeek = new Map<string, number>();
    const recent = addDays(weekStart(today), -35);
    const logs: WorkoutLog[] = [];

    for (const s of scheduled) {
      const roll = r.next();
      let status: WorkoutLog["status"] | "missed" = roll < 0.07 ? "missed" : roll < 0.15 ? "skipped" : roll < 0.28 ? "partial" : "completed";
      // In the last six weeks, no week falls below 75%, so the streak is real.
      const ws = weekStart(s.date);
      if (s.date >= recent && status !== "completed") {
        const allowed = Math.floor((plannedPerWeek.get(ws) ?? 0) * 0.25);
        if ((badInWeek.get(ws) ?? 0) >= allowed || status === "missed") status = "completed";
        else if (status === "skipped") status = "partial";
        else badInWeek.set(ws, badInWeek.get(ws) ?? 0);
      }
      if (status === "missed") continue;

      const rx = s.day.prescriptions;
      const doneUpTo = status === "partial" ? Math.ceil(rx.length * 0.6) : status === "skipped" ? 0 : rx.length;
      const evening = r.next() < 0.5;
      const entries = rx.map((p, idx) => {
        const alt = r.next() < 0.06 && p.section === "main" ? (DEMO_SUBS[p.exerciseId] ?? undefined) : undefined;
        return {
          exerciseId: alt ?? p.exerciseId,
          substitutionFor: alt ? p.exerciseId : undefined,
          sets: Array.from({ length: p.sets }, (_, i) => {
            if (idx >= doneUpTo) return { setNumber: i + 1, skipped: true };
            const short = p.section === "main" && p.reps !== undefined && i === p.sets - 1 && r.next() < 0.18;
            const reps = typeof p.reps === "number" ? (short ? Math.max(1, p.reps - r.int(1, 2)) : p.reps) : undefined;
            return { setNumber: i + 1, reps, loadKg: p.loadKg ? (alt ? half(p.loadKg * 0.9) : p.loadKg) : undefined, durationSec: p.durationSec, skipped: false, asPrescribed: !short && !alt };
          }),
        };
      });
      const byTrainer = r.next() < 0.08;
      logs.push({
        id: `wl_${persona.memberId}_${s.date}`, tenantId: TENANT_ID, memberId: persona.memberId, planVersionId: s.version.id, weekIndex: s.day.weekIndex, dayIndex: s.day.dayIndex, scheduledOn: s.date,
        status: status as WorkoutLog["status"], startedAt: status === "skipped" ? undefined : at(s.date, evening ? "18:30" : "06:45"),
        completedAt: status === "skipped" ? undefined : at(s.date, evening ? "19:25" : "07:40"), entries,
        effort: status === "skipped" ? undefined : r.int(6, 9), notes: status === "skipped" ? "Away for work." : r.next() < 0.1 ? "Felt strong today." : undefined,
        enteredBy: byTrainer ? persona.trainerId! : memberUser, enteredByRole: byTrainer ? "trainer" : "member", corrections: [], idempotencyKey: `seed-log-${persona.memberId}-${s.date}`,
      });
    }
    out.workoutLogs.push(...logs);

    // ── Check-ins ───────────────────────────────────────────────────────────────────────────────────
    const coverFor = (date: string) => mine.find((m) => m.startsOn <= date && (m.endsOn ?? date) >= date) ?? current;
    const checkInDates = persona.memberId === "mem_sneha" ? [-30, -27, -22, -18, -9, -4].map((d) => addDays(today, d)) : logs.filter((l) => l.status !== "skipped").map((l) => l.scheduledOn);
    for (const date of checkInDates) {
      const log = logs.find((l) => l.scheduledOn === date);
      const m = coverFor(date);
      out.checkIns.push({
        id: `ci_${persona.memberId}_${date}`, tenantId: TENANT_ID, memberId: persona.memberId, branchId: persona.branchId, membershipId: m.id,
        at: log?.startedAt ? new Date(Date.parse(log.startedAt) - 8 * 60_000).toISOString() : at(date, "07:00"), method: "qr", result: "allowed", visitDebited: persona.memberId === "mem_sneha", recordedBy: desk,
      });
    }

    // ── Measurements and goals ──────────────────────────────────────────────────────────────────────
    const weightStart = persona.memberId === "mem_arjun" ? 82.4 : persona.memberId === "mem_priya" ? 64.8 : 91.2;
    const weeksOfWeights = persona.memberId === "mem_arjun" ? 12 : 4;
    const meas = (kind: Measurement["kind"], date: string, value: number | undefined, unit: string | undefined, byTrainerId: string | null, extra: Partial<Measurement> = {}): Measurement => ({
      id: `ms_${persona.memberId}_${kind}_${date}`, tenantId: TENANT_ID, memberId: persona.memberId, kind, value, unit, measuredOn: date, source: byTrainerId ? "trainer" : "member",
      recordedBy: byTrainerId ?? memberUser, createdAt: at(date, "08:00"), ...extra,
    });
    for (let i = 0; i <= weeksOfWeights; i++) {
      const date = addDays(today, -7 * (weeksOfWeights - i) - 1);
      const value = Math.round((weightStart - 0.27 * i + (r.next() - 0.5) * 0.3) * 10) / 10;
      out.measurements.push(meas("weight", date, value, "kg", i % 4 === 0 ? persona.trainerId! : null));
    }
    if (persona.memberId === "mem_arjun") {
      [[-85, 90], [-57, 89], [-29, 87.5], [-1, 86]].forEach(([d, v]) => out.measurements.push(meas("waist", addDays(today, d!), v, "cm", persona.trainerId!)));
      out.measurements.push(meas("body_fat", addDays(today, -85), 24.5, "%", persona.trainerId!, { method: "Skinfold calipers" }), meas("body_fat", addDays(today, -1), 22.1, "%", persona.trainerId!, { method: "Skinfold calipers" }));
      out.measurements.push(meas("strength_benchmark", addDays(today, -85), 50, "kg", persona.trainerId!, { exerciseId: "ex_bench_press" }), meas("strength_benchmark", addDays(today, -29), 62.5, "kg", persona.trainerId!, { exerciseId: "ex_bench_press" }));
    }

    const goals: Goal[] = [];
    const goal = (n: number, g: Omit<Goal, "id" | "tenantId" | "memberId" | "createdBy" | "createdAt">, createdOn: string): void => {
      goals.push({ id: `goal_${persona.memberId}_${n}`, tenantId: TENANT_ID, memberId: persona.memberId, createdBy: persona.trainerId!, createdAt: at(createdOn, "10:00"), ...g });
    };
    if (persona.memberId === "mem_arjun") {
      goal(1, { title: "Reach 78 kg", metric: "weight", unit: "kg", baseline: 82.4, target: 78, targetDate: addDays(today, 49), reviewEveryDays: 28, status: "active", history: [{ at: at(addDays(today, -84), "10:00"), by: persona.trainerId!, note: "Goal set at the first assessment." }] }, addDays(today, -84));
      goal(2, { title: "Bench press 60 kg for three sets of ten", metric: "bench_press", unit: "kg", baseline: 40, target: 60, targetDate: addDays(today, -10), reviewEveryDays: 28, status: "achieved", history: [{ at: at(addDays(today, -84), "10:00"), by: persona.trainerId!, note: "Goal set at the first assessment." }, { at: at(addDays(today, -12), "19:30"), by: persona.trainerId!, note: "Achieved: 60.5 kg for 3 × 10." }] }, addDays(today, -84));
    } else if (persona.memberId === "mem_priya") {
      goal(1, { title: "Train three times a week", metric: "sessions_per_week", unit: "sessions", baseline: 1, target: 3, targetDate: addDays(today, 60), reviewEveryDays: 28, status: "active", history: [{ at: at(addDays(today, -29), "10:00"), by: persona.trainerId!, note: "Goal set." }] }, addDays(today, -29));
    } else if (persona.memberId === "mem_rahul") {
      goal(1, { title: "Reach 86 kg", metric: "weight", unit: "kg", baseline: 91.2, target: 86, targetDate: addDays(today, 90), reviewEveryDays: 28, status: "active", history: [{ at: at(addDays(today, -60), "10:00"), by: persona.trainerId!, note: "Goal set." }] }, addDays(today, -60));
    }
    out.goals.push(...goals);

    // ── Reviews and settings ────────────────────────────────────────────────────────────────────────
    const review = (n: number, kind: TrainerReview["kind"], daysAgo: number, body: string, extra: Partial<TrainerReview> = {}) => {
      const date = addDays(today, -daysAgo);
      out.trainerReviews.push({ id: `rv_${persona.memberId}_${n}`, tenantId: TENANT_ID, memberId: persona.memberId, kind, authorId: persona.trainerId!, body, createdAt: at(date, "18:00"), ...extra });
    };
    if (persona.memberId === "mem_arjun") {
      review(1, "shared_review", 10, "Strong block. Your bench press is up about 20 kg since we started and you have not missed a week. Keep your elbows tucked on the way down.", { readByMemberAt: at(addDays(today, -9), "07:10"), followUpOn: addDays(today, -1) });
      review(2, "shared_review", 1, `New plan is live from ${formatDayMonth(addDays(today, -13))}. You hit at least three of four sessions every week, so I have raised the loads on the main lifts. Tell me how the heavier squats feel.`, {});
      review(3, "private_note", 12, "Left shoulder a little tight on overhead press. Watch it. Maybe swap in dumbbells if it flares up.");
      out.trainerReviews.push({ id: "rv_mem_arjun_4", tenantId: TENANT_ID, memberId: "mem_arjun", kind: "member_checkin", authorId: memberUser, body: "Good week.", effort: 7, recovery: 4, obstacles: "Work travel on Thursday.", createdAt: at(addDays(today, -6), "21:00") });
    } else if (persona.memberId === "mem_priya") {
      review(1, "shared_review", 20, "Nice start. Three sessions a week is the goal, and you are close. Let us look again in a month.", { readByMemberAt: at(addDays(today, -19), "08:00") });
    }
    out.memberSettings.push({
      id: `set_${persona.memberId}`, tenantId: TENANT_ID, memberId: persona.memberId, email: { bookingReminders: true, workoutUpdates: true, renewalReminders: true }, soundOn: false, hapticsOn: true, updatedAt: at(addDays(today, -30), "10:00"),
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
      goalsAchieved: goals.filter((g) => g.status === "achieved").length, checkIns: out.checkIns.filter((c) => c.memberId === persona.memberId).length,
    };
    for (const badge of earnedBadges(facts)) out.badgeAwards.push({ id: `bd_${persona.memberId}_${badge}`, tenantId: TENANT_ID, memberId: persona.memberId, badge, awardedAt: at(addDays(today, -2), "08:00") });

    // ── Invoices and payments: one per membership, paid, plus a few specials ────────────────────────
    const invoiceFor = (m: Membership | null, description: string, unitPaise: number, quantity: number, issuedOn: string, dueOn: string, opts: { place?: string; method?: Payment["method"]; paid?: boolean } = {}) => {
      const lines = [{ description, quantity, unitPaise, taxRateBp: 1800 }];
      const totals = invoiceTotals(lines);
      const n = invoiceNo++;
      const inv: Invoice = {
        id: `inv_${String(n).padStart(4, "0")}`, tenantId: TENANT_ID, number: `INV-2026-${String(n).padStart(4, "0")}`, memberId: persona.memberId, membershipId: m?.id, branchId: persona.branchId,
        placeOfSupply: placeOfSupplyFor(branchStates.get(persona.branchId)!), issuedOn, dueOn, lines, ...totals, status: opts.paid === false ? "open" : "paid", createdAt: at(issuedOn, "10:00"),
      };
      out.invoices.push(inv);
      if (opts.paid !== false) {
        const method = opts.method ?? "upi";
        out.payments.push({
          id: `pay_${String(n).padStart(4, "0")}`, tenantId: TENANT_ID, invoiceId: inv.id, memberId: persona.memberId, branchId: persona.branchId, method, amountPaise: totals.totalPaise, status: "succeeded",
          receivedAt: at(issuedOn, "10:15"), receivedBy: method === "upi" || method === "online" ? undefined : desk, receiptNumber: `RCP-2026-${String(n).padStart(4, "0")}`,
          reference: method === "upi" ? `UPI${r.int(100000000000, 999999999999)}` : undefined, gatewayEventId: method === "upi" ? `gw_evt_${persona.memberId}_${n}` : undefined,
          idempotencyKey: `seed-pay-${persona.memberId}-${n}`, reconciliation: { status: "matched" },
        });
      }
      return inv;
    };
    for (const m of mine) {
      invoiceFor(m, `${planName.get(m.planId)} membership`, m.terms.pricePaise, 1, m.startsOn, addDays(m.startsOn, 3), { method: persona.memberId === "mem_priya" && m !== current ? "cash" : "upi" });
    }
    if (persona.memberId === "mem_priya") {
      // The next month’s invoice has been sent and its due date has passed: ₹2,950 overdue by four days.
      invoiceFor(null, "Monthly membership renewal", 250_000, 1, addDays(today, -14), addDays(today, -4), { paid: false });
    }

    // ── Training credits and bookings (Arjun’s personal-training pack) ──────────────────────────────
    if (persona.memberId === "mem_arjun") {
      invoiceFor(current, "Personal training: 8 sessions", 80_000, 8, addDays(today, -35), addDays(today, -32), { method: "cash" });
      const entry = (id: string, kind: CreditLedgerEntry["kind"], date: string, extra: Partial<CreditLedgerEntry> = {}): void => {
        out.creditLedger.push({ id: `cr_arjun_${id}`, tenantId: TENANT_ID, memberId: "mem_arjun", membershipId: current.id, kind, credits: 1, createdBy: kind === "purchase" ? desk : memberUser, createdAt: at(date, "09:00"), idempotencyKey: `seed-credit-arjun-${id}`, ...extra });
      };
      out.creditLedger.push({ id: "cr_arjun_purchase", tenantId: TENANT_ID, memberId: "mem_arjun", membershipId: current.id, kind: "purchase", credits: 8, expiresOn: addDays(today, 150), createdBy: desk, createdAt: at(addDays(today, -35), "10:20"), idempotencyKey: "seed-credit-arjun-purchase" });
      const booking = (id: string, date: string, start: string, end: string, status: Booking["status"]): void => {
        const reservation = `cr_arjun_res_${id}`;
        out.bookings.push({
          id: `bk_arjun_${id}`, tenantId: TENANT_ID, memberId: "mem_arjun", branchId: BRANCH.andheri, kind: "pt_session", trainerId: "u_trainer_meera", startsAt: at(date, start), endsAt: at(date, end), status,
          creditEntryId: reservation, slotKey: `u_trainer_meera|${date}T${start}`, createdBy: memberUser, createdAt: at(addDays(date, -3), "09:00"), idempotencyKey: `seed-booking-arjun-${id}`,
        });
        entry(`res_${id}`, "reservation", addDays(date, -3), { bookingId: `bk_arjun_${id}` });
        if (status === "attended") entry(`con_${id}`, "consumption", date, { bookingId: `bk_arjun_${id}`, refEntryId: reservation, createdBy: "u_trainer_meera" });
      };
      booking("1", addDays(today, -20), "07:00", "08:00", "attended");
      booking("2", addDays(today, -6), "18:00", "19:00", "attended");
      booking("3", addDays(today, 2), "18:00", "19:00", "booked");
    }
    if (persona.memberId === "mem_sneha") invoiceFor(current, "10-visit pass", 300_000, 1, current.startsOn, addDays(current.startsOn, 3), { method: "upi" });
  }
  return out;
}

/** The exercise a member may swap to, for seeded substitutions. */
const DEMO_SUBS: Record<string, string> = { ex_bench_press: "ex_db_bench", ex_barbell_row: "ex_db_row", ex_ohp: "ex_db_ohp", ex_back_squat: "ex_goblet_squat", ex_lat_pulldown: "ex_pullup" };
