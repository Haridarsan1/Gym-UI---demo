import type { Principal } from "@/domain/permissions";
import type { AuditEvent } from "@/domain/types";

type Action = AuditEvent["action"];

/** These actions are refused without a reason (S05). */
const NEEDS_REASON: ReadonlySet<Action> = new Set<Action>(["refund.create", "credits.adjust", "checkin.override", "membership.cancel", "support.access.start"]);

export const auditNeedsReason = (action: Action): boolean => NEEDS_REASON.has(action);

export interface AuditInput {
  action: Action;
  reason?: string;
  entityType: string;
  entityId: string;
  memberId?: string;
  details?: Record<string, unknown>;
}

/** Builds an audit event: who did what, when, why, and to which record. */
export function buildAuditEvent(actor: Principal, input: AuditInput, id: string, now: Date): AuditEvent {
  const reason = input.reason?.trim();
  if (auditNeedsReason(input.action) && !reason) throw new Error(`A reason is required for ${input.action}.`);
  return {
    id,
    tenantId: actor.tenantId,
    actorId: actor.userId,
    actorRole: actor.role,
    at: now.toISOString(),
    action: input.action,
    reason: reason || undefined,
    entityType: input.entityType,
    entityId: input.entityId,
    memberId: input.memberId,
    details: input.details,
  };
}
