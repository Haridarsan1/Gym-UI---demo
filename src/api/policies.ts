import { db } from "@/demo/db";
import type { GymPolicies } from "@/domain/types";

/** The values used when a gym’s stored policies predate a setting. They are the values the gym had before the setting existed, so nothing changes until someone changes it. */
export const POLICY_FALLBACKS = { repeatScanWindowMinutes: 10, graceDays: 0, reminderGapDays: 3 } as const;

/** The gym’s policies, with a fallback for any setting the stored row doesn’t have yet. */
export async function policiesFor(tenantId: string): Promise<Pick<GymPolicies, "repeatScanWindowMinutes" | "graceDays" | "reminderGapDays"> & Partial<GymPolicies>> {
  const row = await db.gymPolicies.where("tenantId").equals(tenantId).first();
  return { ...POLICY_FALLBACKS, ...row };
}
