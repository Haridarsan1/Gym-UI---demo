import { addDays, todayIST } from "@/domain/dates";
import { ALL_BRANCHES, BRANCH, DEMO_ACCOUNTS, TENANT_ID } from "@/app/demoAccounts";
import type {
  AuditEvent, Booking, Branch, CheckIn, Consent, CreditLedgerEntry, Exercise, GymClass, Goal, Invoice, Measurement, Member,
  Membership, MembershipPlan, Payment, Refund, SaasPlan, StaffRole, Tenant, TrainerAssignment, User, WorkoutLog, WorkoutPlanVersion,
} from "@/domain/types";

/** Bump when the seed shape changes. The app re-seeds once when the stored version is older. */
export const SEED_VERSION = 1;

export interface SeedData {
  tenants: Tenant[];
  saasPlans: SaasPlan[];
  branches: Branch[];
  users: User[];
  staffRoles: StaffRole[];
  members: Member[];
  trainerAssignments: TrainerAssignment[];
  membershipPlans: MembershipPlan[];
  memberships: Membership[];
  invoices: Invoice[];
  payments: Payment[];
  refunds: Refund[];
  creditLedger: CreditLedgerEntry[];
  classes: GymClass[];
  bookings: Booking[];
  checkIns: CheckIn[];
  exercises: Exercise[];
  workoutPlanVersions: WorkoutPlanVersion[];
  workoutLogs: WorkoutLog[];
  goals: Goal[];
  measurements: Measurement[];
  consents: Consent[];
  auditEvents: AuditEvent[];
}

/** Small seeded random numbers, so the same seed always gives the same gym. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
  const shuffle = <T,>(list: readonly T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  const weighted = <T,>(items: ReadonlyArray<readonly [T, number]>): T => {
    const total = items.reduce((n, [, w]) => n + w, 0);
    let r = next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r < 0) return item;
    }
    return items[items.length - 1]![0];
  };
  return { next, int, pick, shuffle, weighted };
}

const FIRST = ["Aarav", "Aditi", "Aisha", "Akash", "Ananya", "Anil", "Anjali", "Arnav", "Bhavna", "Chirag", "Deepak", "Diya", "Farhan", "Gauri", "Harsh", "Ishaan", "Isha", "Jaya", "Karthik", "Kiran", "Lakshmi", "Manish", "Meghna", "Mohit", "Nikhil", "Nisha", "Omkar", "Pallavi", "Pranav", "Rachna", "Rajat", "Riya", "Rohan", "Sahil", "Sakshi", "Shreya", "Siddharth", "Tanvi", "Uday", "Varun", "Vidya", "Yash", "Zoya"];
const LAST = ["Agarwal", "Banerjee", "Bhatt", "Chopra", "Deshmukh", "Fernandes", "Gupta", "Iyer", "Jain", "Kapoor", "Khan", "Kulkarni", "Malhotra", "Menon", "Nair", "Pillai", "Reddy", "Saxena", "Shah", "Shetty", "Sinha", "Thakur", "Verma", "Wagh"];
const FREEZE_REASONS = ["Travel", "Injury recovery", "Exam season", "Work trip"];
const CANCEL_REASONS = ["Moving to another city", "Joined a gym closer to home", "Cost", "Health reasons"];

type Status = Membership["status"];

/**
 * Builds the demo gym: Pulse Fitness with three branches, six trainers, desk and finance staff, a plan catalogue and
 * 150 members across every membership state. Later milestones add invoices, bookings, workouts and so on.
 */
export function generateSeed(now: Date = new Date(), seed = 20261117): SeedData {
  const r = rng(seed);
  const today = todayIST(now);
  const createdAt = (date: string) => `${date}T04:30:00.000Z`;

  const saasPlans: SaasPlan[] = [
    { id: "sp_starter", name: "Starter", monthlyPaise: 249_900, limits: { branches: 1, staff: 5, activeMembers: 75 }, features: ["memberships", "invoices", "qr_checkin", "workouts"] },
    { id: "sp_growth", name: "Growth", monthlyPaise: 449_900, limits: { branches: 3, staff: 20, activeMembers: 250 }, features: ["memberships", "invoices", "qr_checkin", "workouts", "pt_credits", "reports"] },
    { id: "sp_pro", name: "Pro", monthlyPaise: 799_900, limits: { branches: null, staff: 60, activeMembers: 500 }, features: ["memberships", "invoices", "qr_checkin", "workouts", "pt_credits", "reports", "analytics", "branch_permissions"] },
    { id: "sp_enterprise", name: "Enterprise", monthlyPaise: null, limits: { branches: null, staff: null, activeMembers: null }, features: ["everything"] },
  ];

  const tenants: Tenant[] = [
    {
      id: TENANT_ID, name: "Pulse Fitness", slug: "pulse-fitness", gstin: "27AABCP1234F1Z5", currency: "INR", timeZone: "Asia/Kolkata",
      subscription: { state: "trial", saasPlanId: "sp_growth", trialEndsAt: createdAt(addDays(today, 12)), renewsOn: addDays(today, 12) },
      createdAt: createdAt(addDays(today, -2)),
    },
  ];

  const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, open: "05:30", close: "22:30" }));
  const hours = [...week, { weekday: 6, open: "06:00", close: "20:00" }, { weekday: 0, open: "07:00", close: "13:00" }];
  const branches: Branch[] = [
    { id: BRANCH.andheri, tenantId: TENANT_ID, name: "Andheri", city: "Mumbai", address: "Veera Desai Road, Andheri West", hours, rooms: [{ id: "rm_andheri_a", name: "Studio A", capacity: 20 }, { id: "rm_andheri_b", name: "Studio B", capacity: 15 }], active: true },
    { id: BRANCH.bandra, tenantId: TENANT_ID, name: "Bandra", city: "Mumbai", address: "Hill Road, Bandra West", hours, rooms: [{ id: "rm_bandra_a", name: "Studio A", capacity: 18 }], active: true },
    { id: BRANCH.powai, tenantId: TENANT_ID, name: "Powai", city: "Mumbai", address: "Hiranandani Gardens, Powai", hours, rooms: [{ id: "rm_powai_a", name: "Studio A", capacity: 25 }, { id: "rm_powai_b", name: "Cycle room", capacity: 12 }], active: true },
  ];

  const users: User[] = DEMO_ACCOUNTS.map((a) => ({
    id: a.userId, tenantId: a.tenantId, name: a.name, email: a.email, phone: a.phone, role: a.role, status: "active", mfaEnabled: a.role === "owner" || a.role === "platform_admin", memberId: a.memberId, createdAt: createdAt(addDays(today, -60)),
  }));

  const staffRoles: StaffRole[] = DEMO_ACCOUNTS.flatMap((a) =>
    a.tenantId && a.role !== "member" && a.role !== "platform_admin" && a.limits
      ? [{ id: `sr_${a.userId}`, tenantId: TENANT_ID, userId: a.userId, role: a.role, branchIds: a.branchIds, limits: a.limits } satisfies StaffRole]
      : [],
  );

  const terms = (p: MembershipPlan): Membership["terms"] => ({
    name: p.name, kind: p.kind, pricePaise: p.pricePaise, taxRateBp: p.taxRateBp, durationDays: p.durationDays, visits: p.visits, branchIds: p.branchIds, classEntitlements: p.classEntitlements, ptCredits: p.ptCredits,
  });
  const plan = (id: string, name: string, kind: MembershipPlan["kind"], pricePaise: number, extra: Partial<MembershipPlan>): MembershipPlan => ({
    id, tenantId: TENANT_ID, name, kind, pricePaise, taxRateBp: 1800, branchIds: ALL_BRANCHES, effectiveFrom: "2026-01-01", active: true, ...extra,
  });
  const membershipPlans: MembershipPlan[] = [
    plan("pl_trial", "3-day trial", "trial", 0, { durationDays: 3 }),
    plan("pl_monthly", "Monthly", "time", 250_000, { durationDays: 30 }),
    plan("pl_monthly_plus", "Monthly Plus", "time", 350_000, { durationDays: 30, ptCredits: 2, classEntitlements: 8 }),
    plan("pl_quarterly", "Quarterly", "time", 650_000, { durationDays: 90 }),
    plan("pl_half", "Half-yearly", "time", 1_100_000, { durationDays: 180 }),
    plan("pl_annual", "Annual", "time", 1_900_000, { durationDays: 365 }),
    plan("pl_annual_pt", "Annual with training", "time", 2_800_000, { durationDays: 365, ptCredits: 8, classEntitlements: 24 }),
    plan("pl_visit10", "10-visit pass", "visit", 300_000, { visits: 10, durationDays: 60 }),
    plan("pl_visit20", "20-visit pass", "visit", 520_000, { visits: 20, durationDays: 90, branchIds: [BRANCH.andheri, BRANCH.powai] }),
  ];
  const planById = new Map(membershipPlans.map((p) => [p.id, p]));
  const planWeights: Array<readonly [string, number]> = [["pl_monthly", 25], ["pl_monthly_plus", 15], ["pl_quarterly", 20], ["pl_half", 8], ["pl_annual", 15], ["pl_annual_pt", 5], ["pl_visit10", 8], ["pl_visit20", 4]];

  /** How many members are in each membership state (150 in all). */
  const statuses: Status[] = r.shuffle([
    ...Array<Status>(100).fill("active"), ...Array<Status>(9).fill("frozen"), ...Array<Status>(21).fill("expired"),
    ...Array<Status>(8).fill("canceled"), ...Array<Status>(6).fill("scheduled"), ...Array<Status>(6).fill("pending"),
  ]);
  const arjunAt = statuses.indexOf("active");
  [statuses[0], statuses[arjunAt]] = [statuses[arjunAt]!, statuses[0]!];

  const trainerAccounts = DEMO_ACCOUNTS.filter((a) => a.role === "trainer");
  const trainersAt = (branchId: string) => trainerAccounts.filter((t) => t.branchIds.includes(branchId));
  const deskFor = (branchId: string) => DEMO_ACCOUNTS.find((a) => a.role === "front_desk" && a.branchIds.includes(branchId))?.userId ?? "u_owner";

  const members: Member[] = [];
  const memberships: Membership[] = [];
  const trainerAssignments: TrainerAssignment[] = [];
  const consents: Consent[] = [];
  const creditLedger: CreditLedgerEntry[] = [];
  const usedNames = new Set<string>(["Arjun Kumar"]);

  for (let i = 0; i < 150; i++) {
    const isArjun = i === 0;
    const status = statuses[i]!;
    const branchId = isArjun ? BRANCH.andheri : r.weighted([[BRANCH.andheri, 55], [BRANCH.bandra, 50], [BRANCH.powai, 45]]);
    let name = "Arjun Kumar";
    if (!isArjun) {
      do name = `${r.pick(FIRST)} ${r.pick(LAST)}`;
      while (usedNames.has(name));
      usedNames.add(name);
    }

    let planId = isArjun ? "pl_monthly_plus" : r.weighted(planWeights);
    if (planId === "pl_visit20" && branchId === BRANCH.bandra) planId = "pl_visit10";
    if (status === "active" && !isArjun && r.next() < 0.03) planId = "pl_trial";
    const p = planById.get(planId)!;
    const duration = p.durationDays ?? 30;

    let startsOn: string;
    let endsOn: string;
    const extra: Partial<Membership> = {};
    switch (status) {
      case "active":
      case "frozen": {
        const elapsed = isArjun ? 9 : r.int(1, Math.max(1, duration - 6));
        startsOn = addDays(today, -elapsed);
        endsOn = addDays(startsOn, duration);
        if (status === "frozen") extra.freezes = [{ from: addDays(today, -r.int(1, 8)), to: addDays(today, r.int(4, 20)), reason: r.pick(FREEZE_REASONS) }];
        break;
      }
      case "expired":
        endsOn = addDays(today, -r.int(1, 60));
        startsOn = addDays(endsOn, -duration);
        break;
      case "canceled":
        startsOn = addDays(today, -r.int(10, Math.max(11, duration - 2)));
        endsOn = addDays(startsOn, duration);
        extra.canceledEffectiveOn = addDays(today, -r.int(1, 8));
        extra.cancelReason = r.pick(CANCEL_REASONS);
        break;
      case "scheduled":
        startsOn = addDays(today, r.int(2, 20));
        endsOn = addDays(startsOn, duration);
        break;
      case "pending":
        startsOn = today;
        endsOn = addDays(today, duration);
        break;
    }

    const visits = p.visits ?? 10;
    const visitsRemaining =
      p.kind !== "visit" ? null : status === "active" || status === "frozen" ? (isArjun ? 0 : Math.max(0, visits - r.int(0, visits - 1))) : status === "expired" ? r.int(0, 3) : visits;

    const memberId = isArjun ? "mem_arjun" : `mem_${String(i).padStart(3, "0")}`;
    const membershipId = `ms_${memberId}`;
    let earliest = startsOn;

    // Some members renewed: an earlier, finished membership sits behind the current one.
    if (!isArjun && (status === "active" || status === "frozen") && r.next() < 0.2) {
      const priorEnd = addDays(startsOn, -1);
      const priorStart = addDays(priorEnd, -duration);
      earliest = priorStart;
      memberships.push({
        id: `${membershipId}_prior`, tenantId: TENANT_ID, memberId, planId, terms: terms(p), status: "expired", startsOn: priorStart, endsOn: priorEnd,
        visitsRemaining: p.kind === "visit" ? 0 : null, freezes: [], autoRenew: false, createdAt: createdAt(priorStart),
      });
      extra.renewsMembershipId = `${membershipId}_prior`;
    }

    memberships.push({
      id: membershipId, tenantId: TENANT_ID, memberId, planId, terms: terms(p), status, startsOn, endsOn, visitsRemaining, freezes: [], autoRenew: !isArjun && status === "active" && r.next() < 0.25,
      createdAt: status === "scheduled" ? createdAt(addDays(today, -r.int(1, 5))) : createdAt(startsOn), ...extra,
    });

    const joinedOn = addDays(earliest, -r.int(0, 3));
    members.push({
      id: memberId, tenantId: TENANT_ID, userId: isArjun ? "u_member_arjun" : undefined, name,
      phone: isArjun ? "9820022002" : String(9_100_000_000 + i * 3719 + r.int(0, 3000)),
      email: isArjun ? "arjun.kumar@example.in" : r.next() < 0.7 ? `${name.toLowerCase().replace(/\s+/g, ".")}@example.in` : undefined,
      dateOfBirth: `${r.int(1975, 2005)}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`,
      gender: r.pick(["female", "male", "male", "female", "undisclosed"] as const), homeBranchId: branchId, joinedOn, qrToken: `qr-${memberId}-${r.int(100000, 999999)}`,
      leadSource: r.pick(["Walk-in", "Instagram", "Referral", "Google", "Society tie-up"]),
    });

    // Training credits come with some plans.
    if (p.ptCredits && (status === "active" || status === "frozen")) {
      creditLedger.push({
        id: `cr_${memberId}`, tenantId: TENANT_ID, memberId, membershipId, kind: "purchase", credits: p.ptCredits, expiresOn: endsOn, createdBy: deskFor(branchId), createdAt: createdAt(startsOn), idempotencyKey: `seed-credit-${memberId}`,
      });
    }

    // Trainers: about seven in ten members have one. Arjun trains with Coach Meera.
    const candidates = trainersAt(branchId);
    if (isArjun || (candidates.length > 0 && status !== "pending" && r.next() < 0.7)) {
      const trainer = isArjun ? trainerAccounts[0]! : r.pick(candidates);
      const reassigned = !isArjun && candidates.length > 1 && (status === "active" || status === "frozen") && r.next() < 0.06;
      if (reassigned) {
        const previous = r.pick(candidates.filter((t) => t.userId !== trainer.userId));
        const switchedOn = addDays(today, -r.int(10, 40));
        trainerAssignments.push(
          { id: `ta_${memberId}_1`, tenantId: TENANT_ID, memberId, trainerId: previous.userId, effectiveFrom: joinedOn, effectiveTo: addDays(switchedOn, -1), assignedBy: deskFor(branchId) },
          { id: `ta_${memberId}_2`, tenantId: TENANT_ID, memberId, trainerId: trainer.userId, effectiveFrom: switchedOn, assignedBy: "u_owner", reason: "Trainer changed at the member’s request" },
        );
      } else {
        trainerAssignments.push({ id: `ta_${memberId}_1`, tenantId: TENANT_ID, memberId, trainerId: trainer.userId, effectiveFrom: joinedOn, assignedBy: deskFor(branchId) });
      }
    }

    // Consent: everyone agrees to data processing. The rest are optional.
    const grant = (scope: Consent["scope"], chance: number) => {
      if (isArjun || chance >= 1 || r.next() < chance)
        consents.push({ id: `cn_${memberId}_${scope}`, tenantId: TENANT_ID, memberId, scope, grantedAt: createdAt(joinedOn), noticeVersion: "2026-01", recordedBy: deskFor(branchId) });
    };
    grant("data_processing", 1);
    grant("assessments", 0.6);
    grant("photos", 0.4);
    grant("marketing", 0.5);
  }

  return {
    tenants, saasPlans, branches, users, staffRoles, members, trainerAssignments, membershipPlans, memberships, creditLedger, consents,
    invoices: [], payments: [], refunds: [], classes: [], bookings: [], checkIns: [], exercises: [], workoutPlanVersions: [], workoutLogs: [], goals: [], measurements: [], auditEvents: [],
  };
}
