import { ALL_BRANCHES, BRANCH, DEMO_ACCOUNTS, TENANT_ID } from "@/app/demoAccounts";
import { addDays, todayIST, weekStart } from "@/domain/dates";
import type {
  AuditEvent, BadgeAward, Booking, Assessment, Branch, CheckIn, Consent, CreditLedgerEntry, Exercise, GatewayEvent, GatewaySettlement, GymClass, GymPolicies, Goal, Invoice, Measurement, Member, MemberSettings,
  Membership, MembershipPlan, NumberSeries, Payment, ProgramTemplate, Refund, SaasPlan, StaffRole, Tenant, TrainerAssignment, RefundRequest, TrainerAvailability, TrainerLeave, TrainerReview, TrainerShift, User, WorkoutLog, WorkoutPlanVersion,
} from "@/domain/types";
import { rng } from "@/demo/rng";
import { financialYear, formatNumber, seriesKey } from "@/domain/numbering";
import { invoiceTotals, placeOfSupplyFor } from "@/domain/billing";
import { hash } from "@/demo/seedMember";
import { PERSONAS } from "@/demo/personas";
import { TRAINER_POLICY_DEFAULTS } from "@/domain/trainerToday";
import { buildFinanceSeed } from "@/demo/seedFinance";
import { buildRoster } from "@/demo/seedTrainer";
import { buildTemplates } from "@/demo/seedTemplates";
import { buildMemberData } from "@/demo/seedMember";
import { EXERCISES } from "@/demo/exercises";

export { SEED_VERSION } from "@/demo/version";

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
  trainerReviews: TrainerReview[];
  memberSettings: MemberSettings[];
  badgeAwards: BadgeAward[];
  trainerAvailability: TrainerAvailability[];
  trainerShifts: TrainerShift[];
  refundRequests: RefundRequest[];
  gatewayEvents: GatewayEvent[];
  gatewaySettlements: GatewaySettlement[];
  numberSeries: NumberSeries[];
  trainerLeave: TrainerLeave[];
  gymPolicies: GymPolicies[];
  assessments: Assessment[];
  programTemplates: ProgramTemplate[];
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
      id: TENANT_ID, name: "Pulse Fitness", slug: "pulse-fitness", gstin: "27AABCP1234F1Z5", legalName: "Pulse Fitness Private Limited", address: "Ground floor, Veera Desai Road, Andheri West, Mumbai 400053, Maharashtra", currency: "INR", timeZone: "Asia/Kolkata",
      subscription: { state: "trial", saasPlanId: "sp_growth", trialEndsAt: createdAt(addDays(today, 12)), renewsOn: addDays(today, 12) },
      createdAt: createdAt(addDays(today, -2)),
    },
  ];

  const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, open: "05:30", close: "22:30" }));
  const hours = [...week, { weekday: 6, open: "06:00", close: "20:00" }, { weekday: 0, open: "07:00", close: "13:00" }];
  const branches: Branch[] = [
    { id: BRANCH.andheri, tenantId: TENANT_ID, invoicePrefix: "PFAND", name: "Andheri", city: "Mumbai", address: "Veera Desai Road, Andheri West", stateCode: "27", hours, rooms: [{ id: "rm_andheri_a", name: "Studio A", capacity: 20 }, { id: "rm_andheri_b", name: "Studio B", capacity: 15 }], active: true },
    { id: BRANCH.bandra, tenantId: TENANT_ID, invoicePrefix: "PFBAN", name: "Bandra", city: "Mumbai", address: "Hill Road, Bandra West", stateCode: "27", hours, rooms: [{ id: "rm_bandra_a", name: "Studio A", capacity: 18 }], active: true },
    { id: BRANCH.powai, tenantId: TENANT_ID, invoicePrefix: "PFPOW", name: "Powai", city: "Mumbai", address: "Hiranandani Gardens, Powai", stateCode: "27", hours, rooms: [{ id: "rm_powai_a", name: "Studio A", capacity: 25 }, { id: "rm_powai_b", name: "Cycle room", capacity: 12 }], active: true },
  ];

  const policies: GymPolicies = {
    id: `pol_${TENANT_ID}`, tenantId: TENANT_ID, cancellationCutoffHours: 12, lateCancelConsumesCredit: true, noShowConsumesCredit: true,
    streakThresholdPercent: 75, bookingHorizonDays: 14, sessionMinutes: 60, membersMayChooseTrainer: false, partialPaymentsEnabled: false, freezeMinDays: 7, freezeMaxDays: 30, maxFreezesPerMembership: 2, cancellationFeePaise: 50_000, ...TRAINER_POLICY_DEFAULTS,
  };

  // Trainers take sessions 6 to 11 am and 5 to 9 pm. With two branches they alternate: first on Mon, Wed, Fri, second on Tue, Thu, Sat.
  const availability: TrainerAvailability[] = [];
  for (const t of DEMO_ACCOUNTS.filter((a) => a.role === "trainer")) {
    for (let weekday = 1; weekday <= 6; weekday++) {
      const branchId = t.branchIds.length > 1 && weekday % 2 === 0 ? t.branchIds[1]! : t.branchIds[0]!;
      for (const [start, end] of [["06:00", "11:00"], ["17:00", "21:00"]] as const) {
        availability.push({ id: `av_${t.userId}_${weekday}_${start.slice(0, 2)}`, tenantId: TENANT_ID, trainerId: t.userId, branchId, weekday, start, end });
      }
    }
  }

  // Meera covers a Sunday at Andheri; Farah is away for three days in December; Meera has a year-end break (beyond the booking window).
  const shifts: TrainerShift[] = [
    { id: "sh_meera_sunday", tenantId: TENANT_ID, trainerId: "u_trainer_meera", branchId: BRANCH.andheri, date: addDays(weekStart(today), 6), start: "08:00", end: "12:00", note: "Sunday cover", createdAt: createdAt(addDays(today, -10)) },
  ];
  const leave: TrainerLeave[] = [
    { id: "lv_farah_dec", tenantId: TENANT_ID, trainerId: "u_trainer_farah", from: addDays(today, 20), to: addDays(today, 22), reason: "Family event", createdBy: "u_trainer_farah", createdAt: createdAt(addDays(today, -12)) },
    { id: "lv_meera_yearend", tenantId: TENANT_ID, trainerId: "u_trainer_meera", from: addDays(today, 40), to: addDays(today, 44), reason: "Year-end break", createdBy: "u_trainer_meera", createdAt: createdAt(addDays(today, -5)) },
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
  // The first four members are the sample people with logins. Swapping keeps the counts of each state the same.
  PERSONAS.forEach((persona, k) => {
    const at = statuses.findIndex((st, j) => j >= PERSONAS.length && st === persona.status);
    [statuses[k], statuses[at]] = [statuses[at]!, statuses[k]!];
  });

  // The shared-number family (a parent and a teenager) are two ordinary generated members made active, so there are no more rich personas.
  const FAMILY = DEMO_ACCOUNTS.filter((a) => a.memberId && !PERSONAS.some((p) => p.memberId === a.memberId));
  FAMILY.forEach((a) => {
    const k = Number(a.memberId!.slice(4));
    if (statuses[k] === "active") return;
    const at = statuses.findIndex((st, j) => j >= PERSONAS.length && st === "active" && !FAMILY.some((f) => Number(f.memberId!.slice(4)) === j));
    [statuses[k], statuses[at]] = [statuses[at]!, statuses[k]!];
  });

  const trainerAccounts = DEMO_ACCOUNTS.filter((a) => a.role === "trainer");
  const trainersAt = (branchId: string) => trainerAccounts.filter((t) => t.branchIds.includes(branchId));
  const deskFor = (branchId: string) => DEMO_ACCOUNTS.find((a) => a.role === "front_desk" && a.branchIds.includes(branchId))?.userId ?? "u_owner";

  const members: Member[] = [];
  const memberships: Membership[] = [];
  const trainerAssignments: TrainerAssignment[] = [];
  const consents: Consent[] = [];
  const creditLedger: CreditLedgerEntry[] = [];
  const usedNames = new Set<string>(PERSONAS.map((p) => p.name));

  for (let i = 0; i < 150; i++) {
    const persona = PERSONAS[i];
    const family = FAMILY.find((a) => a.memberId === `mem_${String(i).padStart(3, "0")}`);
    const status = statuses[i]!;
    // The family members draw exactly what any generated member draws and then take their own values, so every other member is unchanged.
    const drawnBranch = persona ? undefined : r.weighted([[BRANCH.andheri, 55], [BRANCH.bandra, 50], [BRANCH.powai, 45]]);
    const branchId = persona?.branchId ?? family?.branchIds[0] ?? drawnBranch!;
    let name = persona?.name ?? "";
    if (!persona) {
      do name = `${r.pick(FIRST)} ${r.pick(LAST)}`;
      while (usedNames.has(name));
      usedNames.add(name);
      if (family) name = family.name;
    }

    let planId = persona?.planId ?? r.weighted(planWeights);
    if (planId === "pl_visit20" && branchId === BRANCH.bandra) planId = "pl_visit10";
    if (status === "active" && !persona && r.next() < 0.03) planId = "pl_trial";
    const p = planById.get(planId)!;
    const duration = p.durationDays ?? 30;

    let startsOn: string;
    let endsOn: string;
    const extra: Partial<Membership> = {};
    switch (status) {
      case "active":
      case "frozen": {
        const elapsed = persona?.elapsed ?? r.int(1, Math.max(1, duration - 6));
        startsOn = addDays(today, -elapsed);
        endsOn = addDays(startsOn, duration);
        if (status === "frozen") extra.freezes = persona ? [{ from: addDays(today, -5), to: addDays(today, 12), reason: "Travel" }] : [{ from: addDays(today, -r.int(1, 8)), to: addDays(today, r.int(4, 20)), reason: r.pick(FREEZE_REASONS) }];
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
      p.kind !== "visit" ? null : status === "active" || status === "frozen" ? (persona?.visitsRemaining ?? Math.max(0, visits - r.int(0, visits - 1))) : status === "expired" ? r.int(0, 3) : visits;

    const memberId = persona?.memberId ?? `mem_${String(i).padStart(3, "0")}`;
    const membershipId = `ms_${memberId}`;
    let earliest = startsOn;

    // Some members renewed: earlier, finished memberships sit behind the current one, each renewing the one before.
    const priors = persona ? persona.priors : (status === "active" || status === "frozen") && r.next() < 0.2 ? 1 : 0;
    let renews = startsOn;
    let renewedBy: Partial<Membership> = extra;
    for (let k = 1; k <= priors; k++) {
      const priorEnd = addDays(renews, -1);
      const priorStart = addDays(priorEnd, -duration);
      const priorId = `${membershipId}_prior${k > 1 ? k : ""}`;
      renewedBy.renewsMembershipId = priorId;
      const prior: Membership = {
        id: priorId, tenantId: TENANT_ID, memberId, planId, terms: terms(p), status: "expired", startsOn: priorStart, endsOn: priorEnd,
        visitsRemaining: p.kind === "visit" ? 0 : null, freezes: [], autoRenew: false, createdAt: createdAt(priorStart),
      };
      memberships.push(prior);
      renewedBy = prior;
      renews = priorStart;
      earliest = priorStart;
    }

    memberships.push({
      id: membershipId, tenantId: TENANT_ID, memberId, planId, terms: terms(p), status, startsOn, endsOn, visitsRemaining, freezes: [], autoRenew: !persona && status === "active" && r.next() < 0.25,
      createdAt: status === "scheduled" ? createdAt(addDays(today, -r.int(1, 5))) : createdAt(startsOn), ...extra,
    });

    const joinedOn = addDays(earliest, -r.int(0, 3));
    const drawnPhone = persona ? undefined : String(9_100_000_000 + i * 3719 + r.int(0, 3000));
    const drawnEmail = persona ? persona.email : r.next() < 0.7 ? `${name.toLowerCase().replace(/\s+/g, ".")}@example.in` : undefined;
    members.push({
      id: memberId, tenantId: TENANT_ID, userId: persona?.userId ?? family?.userId, name,
      phone: persona?.phone ?? family?.phone ?? drawnPhone!,
      email: family ? family.email : drawnEmail,
      dateOfBirth: ((): string => { const d = `${r.int(1975, 2005)}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`; return family?.userId === "u_member_aarav" ? "2010-03-14" : family ? "1982-09-02" : d; })(),
      gender: r.pick(["female", "male", "male", "female", "undisclosed"] as const), homeBranchId: branchId, joinedOn, qrToken: `qr-${memberId}-${r.int(100000, 999999)}`,
      leadSource: r.pick(["Walk-in", "Instagram", "Referral", "Google", "Society tie-up"]),
    });

    // Training credits come with some plans.
    if (p.ptCredits && !persona && (status === "active" || status === "frozen")) {
      creditLedger.push({
        id: `cr_${memberId}`, tenantId: TENANT_ID, memberId, membershipId, kind: "purchase", credits: p.ptCredits, expiresOn: endsOn, createdBy: deskFor(branchId), createdAt: createdAt(startsOn), idempotencyKey: `seed-credit-${memberId}`,
      });
    }

    // Trainers: about seven in ten members have one. Arjun trains with Coach Meera.
    const candidates = trainersAt(branchId);
    if (persona ? !!persona.trainerId : candidates.length > 0 && status !== "pending" && r.next() < 0.7) {
      const trainer = persona ? trainerAccounts.find((t) => t.userId === persona.trainerId)! : r.pick(candidates);
      const reassigned = !persona && candidates.length > 1 && (status === "active" || status === "frozen") && r.next() < 0.06;
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
      if (persona || chance >= 1 || r.next() < chance)
        consents.push({ id: `cn_${memberId}_${scope}`, tenantId: TENANT_ID, memberId, scope, grantedAt: createdAt(joinedOn), noticeVersion: "2026-01", recordedBy: deskFor(branchId) });
    };
    grant("data_processing", 1);
    grant("assessments", 0.6);
    grant("photos", 0.4);
    grant("marketing", 0.5);
  }

  // Training, billing and activity for the sample members. Everyone else gets this in the milestone that first shows it.
  const memberData = buildMemberData({ today, r, branches, members, memberships, membershipPlans, deskFor });

  // Dues for the desk and finance to work on (M3): some members with a renewal invoice unpaid for a while, a part payment, and a few declined online payments.
  // Chosen by a hash of the member id, so they are the same every time and every other record is untouched.
  {
    const current = new Map(memberships.filter((m) => m.status === "active").map((m) => [m.memberId, m]));
    const stateOf = new Map(branches.map((b) => [b.id, b.stateCode]));
    const owing = members.filter((m) => !PERSONAS.some((p) => p.memberId === m.id) && current.has(m.id) && hash(`${m.id}dues`) % 9 === 0).slice(0, 12);
    owing.forEach((m, k) => {
      const ms = current.get(m.id)!;
      const issuedOn = addDays(today, -(3 + ((hash(m.id) % 18))));
      const lines = [{ description: `${ms.terms.name} renewal`, quantity: 1, unitPaise: ms.terms.pricePaise, taxRateBp: ms.terms.taxRateBp }];
      const totals = invoiceTotals(lines);
      const id = `inv_due_${m.id}`;
      const part = k % 4 === 1;
      memberData.invoices.push({ id, tenantId: TENANT_ID, number: "", memberId: m.id, branchId: m.homeBranchId, placeOfSupply: placeOfSupplyFor(stateOf.get(m.homeBranchId)!), issuedOn, dueOn: addDays(issuedOn, 7), lines, ...totals, status: part ? "partially_paid" : "open", purpose: { kind: "renewal", planId: ms.planId }, createdAt: createdAt(issuedOn) });
      if (part) memberData.payments.push({ id: `pay_due_${m.id}`, tenantId: TENANT_ID, invoiceId: id, memberId: m.id, branchId: m.homeBranchId, method: "cash", amountPaise: Math.round(totals.totalPaise * 0.4), status: "succeeded", receivedAt: createdAt(addDays(issuedOn, 2)), receivedBy: deskFor(m.homeBranchId), receiptNumber: `RCP-2026-${String(9000 + k).padStart(4, "0")}`, idempotencyKey: `seed-due-${m.id}`, reconciliation: { status: "unmatched" } });
      if (k % 5 === 2) memberData.payments.push({ id: `pay_fail_${m.id}`, tenantId: TENANT_ID, invoiceId: id, memberId: m.id, branchId: m.homeBranchId, method: "upi", amountPaise: totals.totalPaise, status: "failed", receivedAt: createdAt(addDays(today, -2)), failureReason: "The payment didn’t go through, and no money was taken.", idempotencyKey: `seed-fail-${m.id}`, reconciliation: { status: "unmatched" } });
    });
  }

  // Personal-training sessions take a room: a deterministic one at the branch where it happens (the room is only conflict-checked when set).
  const roomFor = (b: { id: string; branchId: string }): string | undefined => {
    const rooms = branches.find((x) => x.id === b.branchId)?.rooms ?? [];
    return rooms.length ? rooms[hash(b.id) % rooms.length]!.id : undefined;
  };

  // Refunds for finance to work on (M4): one request from the desk waiting for approval, one approved and paid back last week, one rejected.
  const refundSeed = (() => {
    const paidOnce = memberData.invoices
      .filter((i) => i.status === "paid" && ["mem_priya", "mem_rahul", "mem_sneha"].includes(i.memberId) && !i.purpose)
      .map((i) => ({ i, pay: memberData.payments.find((p) => p.invoiceId === i.id && p.status === "succeeded") }))
      .filter((x): x is { i: typeof x.i; pay: NonNullable<typeof x.pay> } => !!x.pay);
    const pick = (k: number) => paidOnce[k % paidOnce.length]!;
    const [a, b, c] = [pick(1), pick(2), pick(3)];
    const refunds: Refund[] = [];
    const requests: RefundRequest[] = [];
    const base = (x: typeof a, id: string, pct: number, reason: string, ageDays: number) => ({ id, tenantId: TENANT_ID, memberId: x.i.memberId, branchId: x.i.branchId, invoiceId: x.i.id, amountPaise: Math.round((x.i.totalPaise * pct) / 100), reason, source: "manual" as const, requestedBy: deskFor(x.i.branchId), requestedAt: createdAt(addDays(today, -ageDays)), idempotencyKey: `seed-${id}` });
    requests.push({ ...base(a, "rq_seed_pending", 25, "Member relocated and asked for part of the plan back", 1), status: "pending" });
    const done = base(b, "rq_seed_approved", 15, "Charged twice at the desk, one by card and one in cash", 8);
    refunds.push({ id: "rf_seed_1", tenantId: TENANT_ID, paymentId: b.pay.id, invoiceId: b.i.id, amountPaise: done.amountPaise, reason: done.reason, status: "completed", requestedBy: done.requestedBy, approvedBy: "u_finance", creditsReversed: 0, createdAt: createdAt(addDays(today, -7)), idempotencyKey: "seed-rf-1" });
    requests.push({ ...done, status: "approved", decidedBy: "u_finance", decidedAt: createdAt(addDays(today, -7)), refundId: "rf_seed_1" });
    requests.push({ ...base(c, "rq_seed_rejected", 60, "Wants most of the plan back after using it for three weeks", 5), status: "rejected", decidedBy: "u_finance", decidedAt: createdAt(addDays(today, -4)), decisionNote: "Outside the policy: the plan was mostly used." });
    return { refunds, requests };
  })();

  // GST numbers: consecutive within each branch and financial year, in the order the invoices were issued. A void invoice keeps its number.
  const numbered = (() => {
    const prefix = new Map(branches.map((b) => [b.id, b.invoicePrefix]));
    const last = new Map<string, NumberSeries>();
    const invoices = [...memberData.invoices].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.id.localeCompare(b.id)).map((inv) => {
      const p = prefix.get(inv.branchId)!;
      const fy = financialYear(inv.issuedOn);
      const key = seriesKey(TENANT_ID, p, fy);
      const row = last.get(key) ?? { id: key, tenantId: TENANT_ID, prefix: p, financialYear: fy, last: 0 };
      row.last += 1;
      last.set(key, row);
      return { ...inv, number: formatNumber(p, fy, row.last) };
    });
    return { invoices, series: [...last.values()] };
  })();

  // The trainers’ books of clients (M2): plans, logs, reviews and today’s sessions for everyone else with a trainer.
  // Rahul has withdrawn his assessment consent since his assessment, so Coach Farah sees “Assessment consent withdrawn”.
  const rahulConsent = consents.find((c) => c.id === "cn_mem_rahul_assessments");
  if (rahulConsent) rahulConsent.withdrawnAt = createdAt(addDays(today, -9));
  const assessmentConsent = new Set(consents.filter((c) => c.scope === "assessments" && !c.withdrawnAt).map((c) => c.memberId));
  const roster = buildRoster({ today, members, memberships, trainerAssignments, availability, deskFor, assessmentConsent });

  const finance = buildFinanceSeed(memberData.payments, today);

  return {
    gatewayEvents: finance.gatewayEvents, gatewaySettlements: finance.gatewaySettlements,
    tenants, saasPlans, branches, users, staffRoles, members, trainerAssignments, membershipPlans, memberships, consents,
    creditLedger: [...creditLedger, ...memberData.creditLedger, ...roster.creditLedger],
    invoices: numbered.invoices, numberSeries: numbered.series, payments: finance.payments, refunds: refundSeed.refunds, refundRequests: refundSeed.requests, classes: [], bookings: [...memberData.bookings, ...roster.bookings].map((b) => (b.kind === "pt_session" && b.status !== "canceled" ? { ...b, roomId: roomFor(b) } : b)), checkIns: memberData.checkIns,
    exercises: EXERCISES, workoutPlanVersions: [...memberData.workoutPlanVersions, ...roster.workoutPlanVersions], workoutLogs: [...memberData.workoutLogs, ...roster.workoutLogs], goals: [...memberData.goals, ...roster.goals], assessments: [...memberData.assessments, ...roster.assessments], programTemplates: buildTemplates(today, createdAt),
    measurements: memberData.measurements, auditEvents: [], trainerReviews: [...memberData.trainerReviews, ...roster.trainerReviews], memberSettings: memberData.memberSettings,
    badgeAwards: memberData.badgeAwards, trainerAvailability: availability, trainerShifts: shifts, trainerLeave: leave, gymPolicies: [policies],
  };
}
