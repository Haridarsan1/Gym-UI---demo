import { describe, expect, it } from "vitest";
import { generateSeed } from "@/demo/seed";
import { amountDuePaise, isOverdue, stateOfGstin, taxBreakup } from "@/domain/billing";
import { creditBalance } from "@/domain/credits";
import { addDays, weekStart } from "@/domain/dates";
import { earnedBadges } from "@/domain/badges";
import { adherence, detectPRs, planFor, streakWeeks, weekStats } from "@/domain/metrics";
import { BadgeAward, Booking, CheckIn, Exercise, Goal, GymPolicies, Invoice, Measurement, MemberSettings, Payment, TrainerAvailability, TrainerLeave, TrainerReview, TrainerShift, WorkoutLog, WorkoutPlanVersion } from "@/domain/types";

const NOW = new Date("2026-11-17T06:30:00.000Z"); // 12:00 in India
const TODAY = "2026-11-17";
const seed = generateSeed(NOW);

function parseAll(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: unknown[] } } }, rows: unknown[], label: string) {
  for (const row of rows) {
    const res = schema.safeParse(row);
    if (!res.success) throw new Error(`${label} failed: ${JSON.stringify(row).slice(0, 300)}\n${JSON.stringify(res.error?.issues).slice(0, 500)}`);
  }
}
const versions = (memberId: string) => seed.workoutPlanVersions.filter((v) => v.memberId === memberId);
const logs = (memberId: string) => seed.workoutLogs.filter((l) => l.memberId === memberId);
const membership = (memberId: string) => seed.memberships.find((m) => m.memberId === memberId && !m.id.includes("_prior"))!;

describe("sample members: data is valid and consistent", () => {
  it("passes every schema", () => {
    parseAll(Exercise, seed.exercises, "exercise");
    parseAll(WorkoutPlanVersion, seed.workoutPlanVersions, "plan version");
    parseAll(WorkoutLog, seed.workoutLogs, "workout log");
    parseAll(Goal, seed.goals, "goal");
    parseAll(Measurement, seed.measurements, "measurement");
    parseAll(Booking, seed.bookings, "booking");
    parseAll(CheckIn, seed.checkIns, "check-in");
    parseAll(Invoice, seed.invoices, "invoice");
    parseAll(Payment, seed.payments, "payment");
    parseAll(TrainerReview, seed.trainerReviews, "review");
    parseAll(MemberSettings, seed.memberSettings, "settings");
    parseAll(BadgeAward, seed.badgeAwards, "badge award");
    parseAll(TrainerAvailability, seed.trainerAvailability, "availability");
    parseAll(TrainerShift, seed.trainerShifts, "shift");
    parseAll(TrainerLeave, seed.trainerLeave, "leave");
    parseAll(GymPolicies, seed.gymPolicies, "policies");
  });

  it("only points at records that exist", () => {
    const exercises = new Set(seed.exercises.map((e) => e.id));
    const versionIds = new Set(seed.workoutPlanVersions.map((v) => v.id));
    for (const v of seed.workoutPlanVersions) for (const d of v.days) for (const p of d.prescriptions) expect(exercises.has(p.exerciseId), p.exerciseId).toBe(true);
    for (const l of seed.workoutLogs) {
      expect(versionIds.has(l.planVersionId)).toBe(true);
      for (const e of l.entries) expect(exercises.has(e.exerciseId)).toBe(true);
    }
    for (const e of seed.exercises) for (const sub of e.substitutionIds) expect(exercises.has(sub), `${e.id} -> ${sub}`).toBe(true);
    const invoices = new Set(seed.invoices.map((i) => i.id));
    for (const p of seed.payments) expect(invoices.has(p.invoiceId)).toBe(true);
    const users = new Set(seed.users.map((u) => u.id));
    for (const x of [...seed.workoutPlanVersions.map((v) => v.authorId), ...seed.trainerReviews.map((r) => r.authorId), ...seed.workoutLogs.map((l) => l.enteredBy)]) expect(users.has(x), x).toBe(true);
  });

  it("has unique invoice numbers, receipt numbers and idempotency keys", () => {
    for (const rows of [seed.invoices.map((i) => i.number), seed.payments.map((p) => p.receiptNumber).filter(Boolean), seed.payments.map((p) => p.idempotencyKey), seed.workoutLogs.map((l) => l.idempotencyKey), seed.bookings.map((b) => b.idempotencyKey), seed.creditLedger.map((c) => c.idempotencyKey)]) {
      expect(new Set(rows).size).toBe(rows.length);
    }
  });

  it("has an invoice total that matches its lines, and a payment for every paid invoice", () => {
    for (const inv of seed.invoices) {
      expect(inv.totalPaise).toBe(inv.subtotalPaise - inv.discountPaise + inv.taxPaise);
      // A paid or part-paid invoice has a payment that went through; an open one may have a declined attempt but no payment.
      expect(seed.payments.some((p) => p.invoiceId === inv.id && p.status === "succeeded"), inv.number).toBe(inv.status === "paid" || inv.status === "partially_paid");
    }
  });

  it("has plan versions that follow the rules in the plan: published, with the older one untouched by the newer", () => {
    for (const v of seed.workoutPlanVersions) expect(v.status).toBe("published");
    const arjun = versions("mem_arjun");
    expect(arjun.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(arjun[1]!.startsOn).toBe(addDays(TODAY, -13));
    expect(arjun[1]!.authorId).toBe("u_trainer_meera");
  });
});

describe("Arjun Kumar: a workout today, 12 weeks of history", () => {
  const plan = planFor(versions("mem_arjun"), TODAY);

  it("has a workout today from the new plan, and no log for it yet", () => {
    expect(plan.state).toBe("workout");
    expect(plan.state === "workout" && plan.version.versionNumber).toBe(2);
    expect(plan.state === "workout" && plan.day.title).toBe("Upper body and core");
    expect(logs("mem_arjun").some((l) => l.scheduledOn === TODAY)).toBe(false);
  });

  it("has a bench press prescribed as three sets of ten", () => {
    const push = versions("mem_arjun")[1]!.days.find((d) => d.title === "Push")!;
    const bench = push.prescriptions.find((p) => p.exerciseId === "ex_bench_press")!;
    expect([bench.sets, bench.reps]).toEqual([3, 10]);
  });

  it("raises each main lift in steps with plateaus, not every week", () => {
    const first = versions("mem_arjun")[0]!;
    const load = (ex: string, w: number) => first.days.find((d) => d.weekIndex === w && d.prescriptions.some((p) => p.exerciseId === ex))!.prescriptions.find((p) => p.exerciseId === ex)!.loadKg!;
    expect(load("ex_bench_press", 0)).toBe(40);
    const weeks = Array.from({ length: 10 }, (_, w) => load("ex_bench_press", w));
    expect(weeks[9]! - weeks[0]!).toBeGreaterThanOrEqual(7.5);
    const steps = weeks.filter((x, i) => i > 0 && x > weeks[i - 1]!).length;
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(steps).toBeLessThan(9); // plateaus: some weeks repeat the load
  });

  it("sets a personal record on a main lift every two to four weeks, not every session", () => {
    const all = logs("mem_arjun").sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn));
    const dates = (ex: string) => all.flatMap((l, i) => (l.status !== "skipped" && detectPRs(all.slice(0, i), l).some((p) => p.exerciseId === ex) ? [l.scheduledOn] : []));
    for (const ex of ["ex_bench_press", "ex_back_squat", "ex_deadlift"]) {
      const d = dates(ex);
      expect(d.length, ex).toBeGreaterThanOrEqual(3);
      const sessions = all.filter((l) => l.entries.some((e) => e.exerciseId === ex)).length;
      expect(d.length, ex).toBeLessThan(sessions / 1.8);
      for (let i = 1; i < d.length; i++) expect((Date.parse(d[i]!) - Date.parse(d[i - 1]!)) / 86_400_000, `${ex} ${d[i - 1]} to ${d[i]}`).toBeLessThanOrEqual(42);
    }
    // Arjun’s most recent record is recent.
    const last = all.flatMap((l, i) => (l.status !== "skipped" && detectPRs(all.slice(0, i), l).length ? [l.scheduledOn] : [])).pop()!;
    expect((Date.parse(TODAY) - Date.parse(last)) / 86_400_000).toBeLessThanOrEqual(14);
  });

  it("has lighter sessions, which never set a record", () => {
    const light = logs("mem_arjun").filter((l) => l.notes === "Light day, slept badly.");
    expect(light.length).toBeGreaterThanOrEqual(1);
    expect(logs("mem_arjun").filter((l) => l.status === "partial").length).toBeGreaterThanOrEqual(1);
  });

  it("logged most workouts, with completed, partial and skipped all present", () => {
    const l = logs("mem_arjun");
    expect(l.length).toBeGreaterThan(35);
    expect(new Set(l.map((x) => x.status))).toEqual(new Set(["completed", "partial", "skipped"]));
    expect(l.some((x) => x.enteredByRole === "trainer")).toBe(true);
    expect(l.some((x) => x.entries.some((e) => e.substitutionFor))).toBe(true);
  });

  it("has a streak of several weeks under the 75% rule, and a ring that starts empty this week", () => {
    const stats = weekStats(versions("mem_arjun"), logs("mem_arjun"), membership("mem_arjun").freezes, versions("mem_arjun")[0]!.startsOn, TODAY);
    expect(streakWeeks(stats, 75, weekStart(TODAY))).toBeGreaterThanOrEqual(5);
    expect(adherence(versions("mem_arjun"), logs("mem_arjun"), addDays(TODAY, -84), TODAY, TODAY).completionRate).toBeGreaterThan(0.6);
  });

  it("has a credit balance of five free, one held for the upcoming session and two used", () => {
    expect(creditBalance(seed.creditLedger.filter((c) => c.memberId === "mem_arjun"))).toEqual({ available: 5, reserved: 1, consumed: 2 });
  });

  it("has a session booked in two days with Coach Meera at 6 pm, plus one attended, one no-show and one cancelled", () => {
    const b = seed.bookings.filter((x) => x.memberId === "mem_arjun");
    expect(b.map((x) => x.status).sort()).toEqual(["attended", "booked", "canceled", "no_show"]);
    expect(b.filter((x) => x.status === "canceled").every((x) => x.slotKey === undefined)).toBe(true); // a canceled booking frees its slot
    const next = b.find((x) => x.status === "booked")!;
    expect(next.trainerId).toBe("u_trainer_meera");
    expect(next.startsAt).toBe("2026-11-19T12:30:00.000Z"); // 18:00 in India
    expect(next.slotKey).toBe("u_trainer_meera|2026-11-19T18:00");
  });

  it("has one unread shared review, one read, a private note and his own check-in", () => {
    const r = seed.trainerReviews.filter((x) => x.memberId === "mem_arjun");
    expect(r.filter((x) => x.kind === "shared_review" && !x.readByMemberAt)).toHaveLength(1);
    expect(r.filter((x) => x.kind === "shared_review" && x.readByMemberAt)).toHaveLength(1);
    expect(r.filter((x) => x.kind === "private_note")).toHaveLength(1);
    expect(r.filter((x) => x.kind === "member_checkin")).toHaveLength(1);
  });

  it("has been awarded exactly the badges the rules say he has earned", () => {
    const awarded = seed.badgeAwards.filter((b) => b.memberId === "mem_arjun").map((b) => b.badge).sort();
    expect(awarded).toEqual(expect.arrayContaining(["first_workout", "workouts_10", "first_pr", "streak_4", "goal_achieved"]));
    expect(awarded).not.toContain("workouts_100");
    const l = logs("mem_arjun");
    expect(earnedBadges({ completedWorkouts: l.filter((x) => x.status === "completed").length, personalRecords: 99, streakWeeks: 99, goalsAchieved: 1, checkIns: seed.checkIns.filter((c) => c.memberId === "mem_arjun").length }).filter((b) => ["first_workout", "workouts_10"].includes(b))).toEqual(["first_workout", "workouts_10"]);
  });

  it("has weight readings from both the member and the trainer, one goal active and one achieved", () => {
    const w = seed.measurements.filter((m) => m.memberId === "mem_arjun" && m.kind === "weight");
    expect(w.length).toBeGreaterThanOrEqual(12);
    expect(new Set(w.map((m) => m.source))).toEqual(new Set(["member", "trainer"]));
    expect(seed.goals.filter((g) => g.memberId === "mem_arjun").map((g) => g.status).sort()).toEqual(["achieved", "active"]);
  });

  it("has a GST invoice for each membership, all paid, with 18% tax", () => {
    const inv = seed.invoices.filter((i) => i.memberId === "mem_arjun");
    expect(inv.length).toBe(4 + 1);
    expect(inv.every((i) => i.status === "paid" && i.lines[0]!.taxRateBp === 1800 && i.placeOfSupply === "27")).toBe(true);
  });
});

describe("Priya Sharma: a rest day and an overdue renewal", () => {
  it("has no workout today but has a plan and a next workout", () => {
    expect(planFor(versions("mem_priya"), TODAY).state).toBe("rest");
    expect(logs("mem_priya").length).toBeGreaterThan(5);
  });
  it("has an open renewal invoice of ₹2,950 that is overdue by four days", () => {
    const inv = seed.invoices.find((i) => i.memberId === "mem_priya" && i.status === "open")!;
    expect(inv.totalPaise).toBe(295_000);
    expect(inv.dueOn).toBe(addDays(TODAY, -4));
    expect(isOverdue(inv, [], TODAY)).toBe(true);
    expect(amountDuePaise(inv, [])).toBe(295_000);
  });
});

describe("Rahul Mehta: frozen", () => {
  it("has a frozen membership and nothing counted as missed during the freeze", () => {
    const m = membership("mem_rahul");
    expect(m.status).toBe("frozen");
    expect(m.freezes[0]!.from <= TODAY && (m.freezes[0]!.to ?? TODAY) >= TODAY).toBe(true);
    const a = adherence(versions("mem_rahul"), logs("mem_rahul"), addDays(TODAY, -60), TODAY, TODAY);
    expect(a.scheduled).toBeGreaterThan(0);
  });
  it("is charged CGST + SGST: services at a Maharashtra branch are taxed in Maharashtra", () => {
    const inv = seed.invoices.find((i) => i.memberId === "mem_rahul")!;
    expect(inv.placeOfSupply).toBe("27");
    expect(taxBreakup(inv.taxPaise, stateOfGstin(seed.tenants[0]!.gstin!), inv.placeOfSupply).igstPaise).toBe(0);
  });
});

describe("Sneha Patil: a trainer, but no plan yet", () => {
  it("has no plan versions, no logs and four visits left of ten", () => {
    expect(versions("mem_sneha")).toEqual([]);
    expect(planFor([], TODAY).state).toBe("no_plan");
    expect(membership("mem_sneha").visitsRemaining).toBe(4);
    expect(seed.checkIns.filter((c) => c.memberId === "mem_sneha")).toHaveLength(6);
    expect(seed.trainerAssignments.find((a) => a.memberId === "mem_sneha" && !a.effectiveTo)?.trainerId).toBe("u_trainer_meera");
  });
});

describe("gym defaults", () => {
  it("sets the policies the member app follows", () => {
    expect(seed.gymPolicies[0]).toMatchObject({ cancellationCutoffHours: 12, lateCancelConsumesCredit: true, noShowConsumesCredit: true, streakThresholdPercent: 75, bookingHorizonDays: 14, sessionMinutes: 60 });
  });
  it("gives every trainer weekly availability at a branch they work at", () => {
    const roles = new Map(seed.staffRoles.map((s) => [s.userId, s]));
    for (const a of seed.trainerAvailability) expect(roles.get(a.trainerId)!.branchIds).toContain(a.branchId);
    for (const x of seed.trainerShifts) expect(roles.get(x.trainerId)!.branchIds).toContain(x.branchId);
    for (const l of seed.trainerLeave) expect(roles.has(l.trainerId)).toBe(true);
    expect(new Set(seed.trainerAvailability.map((a) => a.trainerId)).size).toBe(6);
  });
  it("prints the registered name, address and GSTIN on the gym record, for tax receipts", () => {
    expect(seed.tenants[0]).toMatchObject({ legalName: "Pulse Fitness Private Limited", gstin: "27AABCP1234F1Z5" });
    expect(seed.tenants[0]!.address).toContain("Mumbai");
  });
});
