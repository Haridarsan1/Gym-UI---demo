import { addDays } from "@/domain/dates";
import type { SaasInvoice, SaasPlan, Tenant } from "@/domain/types";

/** Ember’s software invoices to the demo gyms (S02): a gym that is paid up has three months paid and the next one open; a gym on trial has none yet. GST at 18%. */
export function buildSaasInvoices(tenants: Tenant[], plans: SaasPlan[]): SaasInvoice[] {
  const out: SaasInvoice[] = [];
  let n = 0;
  for (const t of tenants) {
    const plan = plans.find((p) => p.id === t.subscription.saasPlanId);
    if (!plan?.monthlyPaise || t.subscription.state !== "paid" || !t.subscription.renewsOn) continue;
    const tax = Math.round((plan.monthlyPaise * 18) / 100);
    for (let k = 3; k >= 0; k--) {
      // The open invoice (k = 0) is for the period that starts on the renewal date; each one before it is a month earlier.
      const periodFrom = addDays(t.subscription.renewsOn, -30 * k);
      const periodTo = addDays(periodFrom, 29);
      const issuedOn = addDays(periodFrom, -5);
      n += 1;
      out.push({
        id: `si_${t.id}_${k}`, tenantId: t.id, number: `EMB/26-27/${String(n).padStart(4, "0")}`, issuedOn, dueOn: periodFrom, periodFrom, periodTo, planId: plan.id, description: `${plan.name} plan, ${periodFrom} to ${periodTo}`,
        amountPaise: plan.monthlyPaise + tax, taxPaise: tax, status: k === 0 ? "open" : "paid", paidOn: k === 0 ? undefined : addDays(periodFrom, -2),
      });
    }
  }
  return out;
}
