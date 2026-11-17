import { db } from "@/demo/db";
import { SEED_VERSION } from "@/demo/version";
import { ApiError } from "@/api/errors";
import { buildAuditEvent, type AuditInput } from "@/domain/audit";
import type { Principal } from "@/domain/permissions";

const SEED_KEY = "seedVersion";
let seeding: Promise<void> | null = null;

async function writeSeed(): Promise<void> {
  performance.mark("demo-seed-start");
  // Loaded only now: a device that already has the demo gym never downloads the generator.
  const { generateSeed } = await import("@/demo/seed");
  const data = generateSeed();
  await db.transaction("rw", db.tables, async () => {
    const current = await db.meta.get(SEED_KEY);
    if (current?.value === SEED_VERSION) return; // another tab got there first
    await Promise.all(db.tables.map((t) => t.clear()));
    await Promise.all([
      db.tenants.bulkAdd(data.tenants), db.saasPlans.bulkAdd(data.saasPlans), db.branches.bulkAdd(data.branches), db.users.bulkAdd(data.users),
      db.staffRoles.bulkAdd(data.staffRoles), db.members.bulkAdd(data.members), db.trainerAssignments.bulkAdd(data.trainerAssignments),
      db.membershipPlans.bulkAdd(data.membershipPlans), db.memberships.bulkAdd(data.memberships), db.creditLedger.bulkAdd(data.creditLedger),
      db.consents.bulkAdd(data.consents), db.exercises.bulkAdd(data.exercises), db.workoutPlanVersions.bulkAdd(data.workoutPlanVersions),
      db.workoutLogs.bulkAdd(data.workoutLogs), db.goals.bulkAdd(data.goals), db.measurements.bulkAdd(data.measurements), db.bookings.bulkAdd(data.bookings),
      db.checkIns.bulkAdd(data.checkIns), db.invoices.bulkAdd(data.invoices), db.payments.bulkAdd(data.payments), db.trainerReviews.bulkAdd(data.trainerReviews),
      db.memberSettings.bulkAdd(data.memberSettings), db.badgeAwards.bulkAdd(data.badgeAwards), db.trainerAvailability.bulkAdd(data.trainerAvailability),
      db.gymPolicies.bulkAdd(data.gymPolicies),
    ]);
    await db.meta.bulkPut([{ key: SEED_KEY, value: SEED_VERSION }, { key: "seededAt", value: new Date().toISOString() }]);
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

/** Wipes the demo and builds it again, so a demo can start from a known state. */
export async function resetDemo(): Promise<void> {
  seeding = null;
  await db.meta.delete(SEED_KEY);
  await ensureSeeded();
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
