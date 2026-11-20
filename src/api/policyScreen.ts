import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { openOwner } from "@/api/owner";
import { buildAuditEvent } from "@/domain/audit";
import { can } from "@/domain/permissions";
import { POLICY_DEFAULTS, policyChanges, validatePolicies, withDefaults, type PolicyChange, type PolicyKey, type PolicyValues } from "@/domain/policies";
import type { Session } from "@/app/session";

/**
 * The Policies screen’s data and its save (M02, M05, T04, O02). Every API that applies a policy reads the stored row when it runs, so a change is in force from the moment it is saved. The owner
 * changes policies; a branch manager reads them. Each save is one audit entry that lists every setting it changed, as it was and as it became, with the owner’s reason if they gave one.
 */
export interface PolicyEntry { id: string; at: string; by: string; role: string; reason?: string; changes: PolicyChange[] }

export interface PoliciesView {
  today: string;
  canEdit: boolean;
  values: PolicyValues;
  defaults: PolicyValues;
  /** The latest changes, newest first. */
  history: PolicyEntry[];
}

export async function getPolicies(session: Session | null): Promise<PoliciesView> {
  const c = await openOwner(session, "policy.read");
  const [row, events, users] = await Promise.all([db.gymPolicies.where("tenantId").equals(c.tenantId).first(), db.auditEvents.where("action").equals("policy.change").filter((e) => e.tenantId === c.tenantId).toArray(), db.users.where("tenantId").equals(c.tenantId).toArray()]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  return {
    today: c.today, canEdit: can(c.principal, "policy.manage"), values: withDefaults(row), defaults: POLICY_DEFAULTS,
    history: events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12).map((e) => ({ id: e.id, at: e.at, by: name.get(e.actorId) ?? "Staff", role: e.actorRole, reason: e.reason, changes: ((e.details as { changes?: PolicyChange[] } | undefined)?.changes ?? []) })),
  };
}

const Value = z.union([z.number(), z.boolean()]);
const Input = z.object({ key: z.string().min(8), changes: z.record(z.string(), Value), reason: z.string().trim().max(300).optional() });
export type SavePoliciesInput = z.input<typeof Input>;

/** Saves the settings that differ from what is stored. Nothing is written when nothing differs, and the same key twice is one change. */
export async function savePolicies(session: Session | null, raw: SavePoliciesInput): Promise<{ changed: PolicyChange[]; repeated: boolean }> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check the settings and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "policy.manage");
  const known = new Set(Object.keys(POLICY_DEFAULTS));
  const unknown = Object.keys(input.changes).find((k) => !known.has(k));
  if (unknown) throw new ApiError("invalid", "That setting isn’t one this gym has.");
  return db.transaction("rw", db.tables, async () => {
    const auditId = `ae_policy_${input.key}`;
    const prior = await db.auditEvents.get(auditId);
    if (prior) return { changed: (prior.details as { changes?: PolicyChange[] } | undefined)?.changes ?? [], repeated: true };
    const row = await db.gymPolicies.where("tenantId").equals(c.tenantId).first();
    const before = withDefaults(row);
    const after = { ...before } as Record<PolicyKey, number | boolean>;
    for (const [k, v] of Object.entries(input.changes)) {
      if (typeof v !== typeof before[k as PolicyKey]) throw new ApiError("invalid", "Check the settings and try again.");
      after[k as PolicyKey] = v;
    }
    const errors = validatePolicies(after as PolicyValues);
    const first = Object.values(errors)[0];
    if (first) throw new ApiError("invalid", first, { errors });
    const changed = policyChanges(before, after as PolicyValues);
    if (changed.length === 0) return { changed, repeated: false };
    await db.gymPolicies.put({ ...(row ?? { id: `gp_${c.tenantId}`, tenantId: c.tenantId }), ...after } as NonNullable<typeof row>);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "policy.change", reason: input.reason, entityType: "policy", entityId: row?.id ?? `gp_${c.tenantId}`, details: { changes: changed } }, auditId, now()));
    return { changed, repeated: false };
  });
}
