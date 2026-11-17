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
 * Every successful view writes an audit event, including repeat views and views by the member. A refused view writes
 * nothing and returns “forbidden”. Screens fetch the actual content after this call succeeds.
 * (Assessments get a record to check against when the assessment model is built in M2. Photos are checked now.)
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

  await writeAudit(principal, { action: view.kind === "photo" ? "photo.view" : "assessment.view", entityType: view.kind, entityId: view.entityId, memberId: view.memberId });
  return view;
}
