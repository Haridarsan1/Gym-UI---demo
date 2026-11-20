import { db } from "@/demo/db";
import { DEFAULT_PT_PRICING, type PtPricing } from "@/domain/renewal";

/** What the gym charges for personal training and how long a pack lasts: the owner’s settings (Plans and pricing), or Ember’s defaults until they set them. */
export async function ptPricingFor(tenantId: string): Promise<PtPricing> {
  const t = await db.tenants.get(tenantId);
  return t?.ptPricing ? { ...t.ptPricing, packs: [...t.ptPricing.packs] } : { ...DEFAULT_PT_PRICING, packs: [...DEFAULT_PT_PRICING.packs] };
}
