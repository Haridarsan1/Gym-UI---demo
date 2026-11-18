import { db } from "@/demo/db";
import { writeAudit } from "@/demo";
import { assertCan, open } from "@/api/context";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { addDays, todayIST } from "@/domain/dates";
import { assignmentOn } from "@/domain/membership";
import type { Resource } from "@/domain/permissions";
import type { TrainerAssignment } from "@/domain/types";
import type { Session } from "@/app/session";

export interface TransferInput {
  memberId: string;
  toTrainerId: string;
  /** The first day the new trainer has the client. Defaults to today. */
  effectiveOn?: string;
  reason?: string;
}

/**
 * A02: move a client to another trainer. The old assignment closes the day before, a new one opens, and nothing the old
 * trainer wrote is touched: plans, logs and shared reviews keep their author. What changes is who can open the client. The
 * new trainer sees the history with its authors, but a private note stays with the trainer who wrote it (the old trainer
 * can no longer open the client at all). Owners, branch managers and front desk assign trainers (`trainer.assign`).
 */
export async function transferTrainer(session: Session | null, input: TransferInput): Promise<TrainerAssignment> {
  const { principal } = await open(session);
  const member = await db.members.get(input.memberId);
  if (!member || member.tenantId !== principal.tenantId) throw new ApiError("not_found", "We couldn’t find this member.");
  const resource: Resource = { tenantId: member.tenantId, branchId: member.homeBranchId, memberId: member.id };
  assertCan(principal, "trainer.assign", resource);
  const trainerRole = await db.staffRoles.where("userId").equals(input.toTrainerId).first();
  if (!trainerRole || trainerRole.role !== "trainer" || trainerRole.tenantId !== member.tenantId) throw new ApiError("invalid", "Choose one of the gym’s trainers.");

  const clock = now();
  const today = todayIST(clock);
  const effectiveOn = input.effectiveOn ?? today;
  if (effectiveOn < today) throw new ApiError("invalid", "A trainer change can’t start in the past.");

  return db.transaction("rw", [db.trainerAssignments, db.auditEvents], async () => {
    const all = await db.trainerAssignments.where("memberId").equals(member.id).toArray();
    const current = assignmentOn(all, today);
    if (current?.trainerId === input.toTrainerId) throw new ApiError("conflict", "That trainer already has this client.");
    if (current) await db.trainerAssignments.update(current.id, { effectiveTo: addDays(effectiveOn, -1) });
    const row: TrainerAssignment = {
      id: `ta_${member.id}_${all.length + 1}_${crypto.randomUUID().slice(0, 8)}`, tenantId: member.tenantId, memberId: member.id, trainerId: input.toTrainerId, effectiveFrom: effectiveOn,
      assignedBy: principal.userId, reason: input.reason?.trim() || undefined,
    };
    await db.trainerAssignments.add(row);
    await writeAudit(principal, { action: "record.edit", entityType: "trainer_assignment", entityId: row.id, memberId: member.id, reason: input.reason, details: { from: current?.trainerId ?? null, to: input.toTrainerId, effectiveOn } });
    return row;
  });
}
