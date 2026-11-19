import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { memberInScope, openDesk } from "@/api/desk";
import { buildAuditEvent } from "@/domain/audit";
import { creditBalance, type CreditBalance } from "@/domain/credits";
import type { CreditLedgerEntry } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * A manual correction to a member’s training credits (M06): add or remove, with a reason, written to the ledger as an `adjustment` and to the audit log.
 * Ledger entries are never edited. Removing can’t take the available balance below zero. Owners and branch managers only (`credits.adjust`).
 */
const Input = z.object({ memberId: z.string().min(1), direction: z.enum(["add", "remove"]), credits: z.number().int().min(1, "Enter how many credits.").max(100), reason: z.string().trim().min(3, "Say why the credits are being adjusted. The reason is kept and audited."), key: z.string().min(8) });
export type AdjustInput = z.input<typeof Input>;

export async function adjustCredits(session: Session | null, raw: AdjustInput): Promise<{ balance: CreditBalance; repeated: boolean }> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the adjustment and try again.");
  const input = parsed.data;
  const c = await openDesk(session, "credits.adjust");
  return db.transaction("rw", db.tables, async () => {
    const member = await memberInScope(c, "credits.adjust", input.memberId);
    const ledger = await db.creditLedger.where("memberId").equals(member.id).toArray();
    const id = `cr_adj_${input.key}`;
    if (ledger.some((e) => e.id === id)) return { balance: creditBalance(ledger), repeated: true };
    const balance = creditBalance(ledger);
    if (input.direction === "remove" && input.credits > balance.available) throw new ApiError("invalid", `${member.name.split(" ")[0]} has ${balance.available} available, so at most ${balance.available} can be removed.`);
    const entry: CreditLedgerEntry = { id, tenantId: c.tenantId, memberId: member.id, kind: "adjustment", direction: input.direction, credits: input.credits, reason: input.reason, createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `adj:${input.key}` };
    await db.creditLedger.add(entry);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "credits.adjust", reason: input.reason, entityType: "credit_ledger", entityId: id, memberId: member.id, details: { direction: input.direction, credits: input.credits } }, `ae_${crypto.randomUUID()}`, now()));
    return { balance: creditBalance([...ledger, entry]), repeated: false };
  });
}
