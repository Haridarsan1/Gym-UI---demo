import { db } from "@/demo/db";
import { writeAudit } from "@/demo";
import { assertCan, open } from "@/api/context";
import { ApiError } from "@/api/errors";
import { todayIST } from "@/domain/dates";
import { assignmentOn } from "@/domain/membership";
import type { Resource } from "@/domain/permissions";
import type { Session } from "@/app/session";

export type SensitiveKind = "assessment" | "photo";

export interface SensitiveView {
  kind: SensitiveKind;
  memberId: string;
  entityId: string;
}

/**
 * The one door to a client’s assessments and progress photos. Whatever screen shows that data gets it through here, so
 * the permission checks (assigned trainer, the member themselves, or an owner or branch manager who has been given
 * “Can view client health and progress photos”), photo consent, and the audit entry cannot be skipped.
 *
 * Every successful view by staff or a trainer writes an audit event, repeat views included. A member looking at their own
 * records is not audited. A refused view writes nothing and returns “forbidden”. Screens fetch the actual content after this call succeeds.
 * Assessments are checked against the member’s consent too (M2).
 */
export async function viewSensitive(session: Session | null, view: SensitiveView): Promise<SensitiveView> {
  const { principal } = await open(session);
  const member = await db.members.get(view.memberId);
  if (!member || member.tenantId !== principal.tenantId) throw new ApiError("not_found", "We couldn’t find this member. They may have been removed.");

  if (view.kind === "photo") {
    const photo = await db.measurements.get(view.entityId);
    if (!photo || photo.kind !== "progress_photo" || photo.memberId !== view.memberId) throw new ApiError("not_found", "We couldn’t find this photo. It may have been removed.");
  }

  const [assignments, consents] = await Promise.all([
    db.trainerAssignments.where("memberId").equals(view.memberId).toArray(),
    db.consents.where("memberId").equals(view.memberId).toArray(),
  ]);
  const resource: Resource = {
    tenantId: member.tenantId,
    branchId: member.homeBranchId,
    memberId: member.id,
    assignedTrainerId: assignmentOn(assignments, todayIST())?.trainerId,
    photoConsent: consents.some((c) => c.scope === "photos" && !c.withdrawnAt),
  };
  assertCan(principal, view.kind === "photo" ? "photo.read" : "assessment.read", resource);

  // Assessments need the member’s consent. Withdrawing it hides every existing assessment from all staff, the assigned
  // trainer included, who are told so. The member can always read their own.
  if (view.kind === "assessment" && principal.role !== "member") {
    const latest = consents.filter((c) => c.scope === "assessments").sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))[0];
    if (!latest) throw new ApiError("forbidden", "This member hasn’t agreed to assessments.", { reason: "none" });
    if (latest.withdrawnAt) throw new ApiError("forbidden", "Assessment consent withdrawn.", { reason: "withdrawn", on: latest.withdrawnAt.slice(0, 10) });
  }

  if (principal.role !== "member") {
    await writeAudit(principal, { action: view.kind === "photo" ? "photo.view" : "assessment.view", entityType: view.kind, entityId: view.entityId, memberId: view.memberId });
  }
  return view;
}
