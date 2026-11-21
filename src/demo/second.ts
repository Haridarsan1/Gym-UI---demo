import { now } from "@/api/clock";
import { db } from "@/demo/db";
import { ensureSeeded, whenReset } from "@/demo";
import { SEED_VERSION } from "@/demo/version";

const LOTUS_KEY = "lotusVersion";
const SAAS_INVOICES_KEY = "saasInvoices:";

/**
 * The second demo gym (Lotus Strength Club), built the first time anyone opens it: signing in as one of its people, or an Ember administrator opening the platform console. A member’s,
 * trainer’s or desk’s first visit to Pulse Fitness never downloads or builds it. Safe to call often and from several places at once.
 */
let lotusReady: Promise<void> | null = null;
export function ensureLotus(): Promise<void> {
  lotusReady ??= (async () => {
    try {
      await ensureSeeded();
      if ((await db.meta.get(LOTUS_KEY))?.value === SEED_VERSION) return;
      const l = (await import("@/demo/seedLotus")).generateLotus(now());
      // Everything that has to be loaded or built comes before the transaction: a transaction can’t wait on anything but the database.
      await db.transaction("rw", db.tables, async () => {
        if ((await db.meta.get(LOTUS_KEY))?.value === SEED_VERSION) return;
        await Promise.all([
          db.tenants.bulkPut(l.tenants), db.branches.bulkPut(l.branches), db.users.bulkPut(l.users), db.staffRoles.bulkPut(l.staffRoles), db.members.bulkPut(l.members), db.membershipPlans.bulkPut(l.membershipPlans), db.memberships.bulkPut(l.memberships),
          db.consents.bulkPut(l.consents), db.invoices.bulkPut(l.invoices), db.payments.bulkPut(l.payments), db.numberSeries.bulkPut(l.numberSeries), db.gymPolicies.bulkPut(l.gymPolicies), db.checkIns.bulkPut(l.checkIns),
          db.meta.put({ key: LOTUS_KEY, value: SEED_VERSION }),
        ]);
      });
    } catch (e) {
      lotusReady = null;
      throw e;
    }
  })();
  return lotusReady;
}

let saasInvoicesReady: Promise<void> | null = null;
whenReset(() => { lotusReady = null; saasInvoicesReady = null; });
/** Ember’s software invoices to each gym (S02), built the first time an owner or an Ember administrator needs them, once for each gym. */
export function ensureSaasInvoices(): Promise<void> {
  saasInvoicesReady ??= (async () => {
    try {
      await ensureSeeded();
      const [tenants, plans, marks] = await Promise.all([db.tenants.toArray(), db.saasPlans.toArray(), db.meta.where("key").startsWith(SAAS_INVOICES_KEY).toArray()]);
      const done = new Set(marks.filter((m) => m.value === SEED_VERSION).map((m) => m.key.slice(SAAS_INVOICES_KEY.length)));
      const todo = tenants.filter((t) => !done.has(t.id));
      if (todo.length === 0) return;
      const { buildSaasInvoices } = await import("@/demo/seedPlatform");
      const invoices = buildSaasInvoices(todo, plans);
      await db.transaction("rw", db.tables, async () => {
        await db.saasInvoices.bulkPut(invoices);
        await db.meta.bulkPut(todo.map((t) => ({ key: SAAS_INVOICES_KEY + t.id, value: SEED_VERSION })));
      });
    } catch (e) {
      saasInvoicesReady = null;
      throw e;
    }
  })();
  return saasInvoicesReady;
}
