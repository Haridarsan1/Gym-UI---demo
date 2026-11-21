import { now } from "@/api/clock";
import { db } from "@/demo/db";
import { SEED_VERSION } from "@/demo/version";
import { todayIST } from "@/domain/dates";
import { ApiError } from "@/api/errors";
import { buildAuditEvent, type AuditInput } from "@/domain/audit";
import type { Principal } from "@/domain/permissions";

const SEED_KEY = "seedVersion";
const SEED_TODAY_KEY = "seedToday";
const SEED_MEMBERS_KEY = "seedMembers";
const TRAINING_KEY = "trainingVersion";
let seeding: Promise<void> | null = null;
/** Set by `second.ts` the first time it is used, so a reset can forget what it built. */
const onReset: Array<() => void> = [];
export function whenReset(fn: () => void): void { onReset.push(fn); }

async function writeSeed(): Promise<void> {
  performance.mark("demo-seed-start");
  // Loaded only now: a device that already has the demo gym never downloads the generator.
  const { generateSeed } = await import("@/demo/seed");
  const data = generateSeed(now());
  await db.transaction("rw", db.tables, async () => {
    const current = await db.meta.get(SEED_KEY);
    if (current?.value === SEED_VERSION) return; // another tab got there first
    await Promise.all(db.tables.map((t) => t.clear()));
    await Promise.all([
      db.tenants.bulkAdd(data.tenants), db.saasPlans.bulkAdd(data.saasPlans), db.branches.bulkAdd(data.branches), db.users.bulkAdd(data.users),
      db.staffRoles.bulkAdd(data.staffRoles), db.members.bulkAdd(data.members), db.trainerAssignments.bulkAdd(data.trainerAssignments),
      db.membershipPlans.bulkAdd(data.membershipPlans), db.memberships.bulkAdd(data.memberships), db.creditLedger.bulkAdd(data.creditLedger),
      db.consents.bulkAdd(data.consents), db.bookings.bulkAdd(data.bookings),
      db.checkIns.bulkAdd(data.checkIns), db.invoices.bulkAdd(data.invoices), db.payments.bulkAdd(data.payments), db.trainerAvailability.bulkAdd(data.trainerAvailability), db.trainerShifts.bulkAdd(data.trainerShifts), db.numberSeries.bulkAdd(data.numberSeries), db.refunds.bulkAdd(data.refunds), db.refundRequests.bulkAdd(data.refundRequests), db.trainerLeave.bulkAdd(data.trainerLeave), db.gatewayEvents.bulkAdd(data.gatewayEvents), db.gatewaySettlements.bulkAdd(data.gatewaySettlements),
      db.gymPolicies.bulkAdd(data.gymPolicies),
    ]);
    await db.meta.bulkPut([{ key: SEED_KEY, value: SEED_VERSION }, { key: "seededAt", value: new Date().toISOString() }, { key: SEED_TODAY_KEY, value: todayIST(now()) }, { key: SEED_MEMBERS_KEY, value: data.members.map((m) => m.id) }]);
  });
  // The first-open budget is 1 second on a mid-range phone. The e2e test reads this measure.
  performance.measure("demo-seed", "demo-seed-start");
}

/**
 * Makes sure the demo gym exists. The first call on a device builds it; later calls return at once.
 * Only the app calls this, never the marketing pages.
 */
export function ensureSeeded(): Promise<void> {
  seeding ??= (async () => {
    try {
      const current = await db.meta.get(SEED_KEY);
      if (current?.value !== SEED_VERSION) await writeSeed();
    } catch (e) {
      console.error("Demo database failed to open", e);
      seeding = null;
      throw new ApiError("unavailable", "This browser can’t store the demo data. Open Ember in a normal window, not a private one, and try again.");
    }
  })();
  return seeding;
}

let trainingReady: Promise<void> | null = null;

/**
 * The training half of the gym (exercise library, templates, the sample members’ plans, workouts, goals, reviews and badges, and the trainers’ clients), built from the gym that is
 * already stored the first time a member or a trainer makes a call. The front desk, finance, the owner and the admin never download or build it. The same function that builds the
 * rest of the gym on the same day gives the same result, because `seedToday` is kept. Safe to call often and from several places at once.
 */
export function ensureTraining(): Promise<void> {
  trainingReady ??= (async () => {
    try {
      if ((await db.meta.get(TRAINING_KEY))?.value === SEED_VERSION) return;
      const { buildTraining } = await import("@/demo/seedTraining");
      const today = ((await db.meta.get(SEED_TODAY_KEY))?.value as string | undefined) ?? todayIST(now());
      // Only the members the gym began with: someone registered since then has no history to build.
      const original = new Set(((await db.meta.get(SEED_MEMBERS_KEY))?.value as string[] | undefined) ?? []);
      const [members, memberships, trainerAssignments, consents, checkIns] = await Promise.all([db.members.toArray(), db.memberships.toArray(), db.trainerAssignments.toArray(), db.consents.toArray(), db.checkIns.toArray()]);
      const t = buildTraining({
        today, members: members.filter((m) => original.has(m.id)), memberships: memberships.filter((m) => original.has(m.memberId)), trainerAssignments: trainerAssignments.filter((a) => original.has(a.memberId)),
        consents: consents.filter((c) => original.has(c.memberId)), checkIns: checkIns.filter((c) => original.has(c.memberId)),
      });
      await db.transaction("rw", db.tables, async () => {
        if ((await db.meta.get(TRAINING_KEY))?.value === SEED_VERSION) return;
        await Promise.all([db.exercises.clear(), db.programTemplates.clear(), db.workoutPlanVersions.clear(), db.workoutLogs.clear(), db.goals.clear(), db.measurements.clear(), db.trainerReviews.clear(), db.memberSettings.clear(), db.badgeAwards.clear(), db.assessments.clear()]);
        await Promise.all([
          db.exercises.bulkAdd(t.exercises), db.programTemplates.bulkAdd(t.programTemplates), db.workoutPlanVersions.bulkAdd(t.workoutPlanVersions), db.workoutLogs.bulkAdd(t.workoutLogs), db.goals.bulkAdd(t.goals),
          db.measurements.bulkAdd(t.measurements), db.trainerReviews.bulkAdd(t.trainerReviews), db.memberSettings.bulkAdd(t.memberSettings), db.badgeAwards.bulkAdd(t.badgeAwards), db.assessments.bulkAdd(t.assessments),
          db.meta.put({ key: TRAINING_KEY, value: SEED_VERSION }),
        ]);
      });
    } catch (e) {
      trainingReady = null;
      throw e;
    }
  })();
  return trainingReady;
}

/** Wipes the demo and builds it again, so a demo can start from a known state. The training half and the second gym come back the next time someone needs them, unless asked for now (tests). */
export async function resetDemo(options: { training?: boolean; secondGym?: boolean } = {}): Promise<void> {
  seeding = null;
  trainingReady = null;
  onReset.forEach((fn) => fn());
  await db.meta.delete(SEED_KEY);
  await ensureSeeded();
  if (options.secondGym) await (await import("@/demo/second")).ensureLotus();
  if (options.training ?? true) await ensureTraining();
}

export async function writeAudit(actor: Principal, input: AuditInput): Promise<void> {
  await db.auditEvents.add(buildAuditEvent(actor, input, `ae_${crypto.randomUUID()}`, new Date()));
}

/**
 * Runs an action once per key. Repeating the key returns the first result and changes nothing (payments, workout
 * submissions, gateway events, imports). `fn` must only touch the database, because a transaction cannot wait on
 * anything else.
 */
export async function runOnce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return db.transaction("rw", db.tables, async () => {
    const done = await db.idempotency.get(key);
    if (done) return done.result as T;
    const result = await fn();
    await db.idempotency.put({ key, result, at: new Date().toISOString() });
    return result;
  });
}
