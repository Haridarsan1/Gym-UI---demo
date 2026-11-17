import { describe, expect, it } from "vitest";
import { auditNeedsReason, buildAuditEvent } from "@/domain/audit";
import type { Principal } from "@/domain/permissions";

const actor: Principal = { userId: "u_finance", role: "finance", tenantId: "t1", branchIds: ["b1"] };
const NOW = new Date("2026-11-17T06:30:00.000Z");

describe("buildAuditEvent", () => {
  it("records actor, time, action, reason and record", () => {
    const e = buildAuditEvent(actor, { action: "refund.create", reason: "Duplicate charge", entityType: "refund", entityId: "r1", memberId: "m1" }, "ae_1", NOW);
    expect(e).toMatchObject({ id: "ae_1", tenantId: "t1", actorId: "u_finance", actorRole: "finance", at: "2026-11-17T06:30:00.000Z", action: "refund.create", reason: "Duplicate charge", entityType: "refund", entityId: "r1", memberId: "m1" });
  });
  it("refuses refunds, credit adjustments, overrides, cancellations and support access without a reason", () => {
    for (const action of ["refund.create", "credits.adjust", "checkin.override", "membership.cancel", "support.access.start"] as const) {
      expect(auditNeedsReason(action)).toBe(true);
      expect(() => buildAuditEvent(actor, { action, entityType: "x", entityId: "1" }, "ae_2", NOW)).toThrow(/reason is required/);
      expect(() => buildAuditEvent(actor, { action, reason: "   ", entityType: "x", entityId: "1" }, "ae_2", NOW)).toThrow(/reason is required/);
    }
  });
  it("does not need a reason for routine changes", () => {
    expect(() => buildAuditEvent(actor, { action: "membership.renew", entityType: "membership", entityId: "ms1" }, "ae_3", NOW)).not.toThrow();
  });
});
