import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { openOwner, type OwnerContext } from "@/api/owner";
import { ptPricingFor } from "@/api/ptPricing";
import { buildAuditEvent } from "@/domain/audit";
import { addDays } from "@/domain/dates";
import { MAX_ROWS, previewImport, type Preview, type PreviewRow } from "@/domain/memberImport";
import type { Consent, CreditLedgerEntry, ImportBatch, Member, Membership } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Importing members (S01), owner only. `previewMemberImport` reads the file and says, row by row, what would happen, writing nothing. `runMemberImport` does it in one transaction: every member
 * and their plan and balances, or nothing. Each run has a key; the people it makes have ids made from that key and the row, and the run is recorded, so sending the same run twice (a retried
 * request, a double press) makes nobody twice. Running the same file again with a new key is refused row by row, because those people are now members.
 */
export interface ImportPreview extends Preview {
  /** The member limit of the gym’s Ember plan, how many active members there are, and how many more it allows (null: no limit). */
  limit: number | null;
  active: number;
  capacityLeft: number | null;
  branches: string[];
}

const hash = (text: string) => [...text].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7).toString(36);

async function context(c: OwnerContext) {
  const [branches, plans, members, memberships, tenant, saas] = await Promise.all([
    db.branches.where("tenantId").equals(c.tenantId).toArray(), db.membershipPlans.where("tenantId").equals(c.tenantId).toArray(), db.members.where("tenantId").equals(c.tenantId).filter((m) => !m.archivedAt).toArray(),
    db.memberships.where("tenantId").equals(c.tenantId).toArray(), db.tenants.get(c.tenantId), db.saasPlans.toArray(),
  ]);
  const limit = saas.find((p) => p.id === tenant?.subscription.saasPlanId)?.limits.activeMembers ?? null;
  const active = new Set(memberships.filter((m) => m.status === "active" || m.status === "frozen").map((m) => m.memberId)).size;
  const capacityLeft = limit === null ? null : Math.max(0, limit - active);
  return { branches, plans, members, limit, active, capacityLeft, tenant };
}

export async function previewMemberImport(session: Session | null, input: { csv: string }): Promise<ImportPreview> {
  if (typeof input.csv !== "string") throw new ApiError("invalid", "Choose a file.");
  if (input.csv.length > 2_000_000) throw new ApiError("invalid", "That file is too big. Import up to 500 members at a time.");
  const c = await openOwner(session, "import.run");
  const x = await context(c);
  const p = previewImport(input.csv, {
    today: c.today, branches: x.branches.map((b) => ({ id: b.id, name: b.name })), plans: x.plans.map((p) => ({ id: p.id, name: p.name, kind: p.kind, branchIds: p.branchIds, visits: p.visits, active: p.active, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo, pricePaise: p.pricePaise })),
    members: x.members.map((m) => ({ id: m.id, name: m.name, phone: m.phone, email: m.email })), capacityLeft: x.capacityLeft,
  });
  return { ...p, limit: x.limit, active: x.active, capacityLeft: x.capacityLeft, branches: x.branches.map((b) => b.name) };
}

const RunInput = z.object({ key: z.string().min(8), csv: z.string(), /** Lines of the file the owner chose to leave out. */ leaveOut: z.array(z.number().int()).max(MAX_ROWS), fileName: z.string().max(200).optional(), consentConfirmed: z.literal(true, { message: "Confirm that these members agreed to the gym keeping their details." }) });
export type RunImportInput = z.input<typeof RunInput>;
export interface ImportResult { batchId: string; created: number; leftOut: number; withProblems: number; shared: number; memberships: number; credits: number; repeated: boolean }

const summary = (b: ImportBatch, repeated: boolean): ImportResult => ({ batchId: b.id, created: b.created.length, leftOut: b.leftOut, withProblems: b.withProblems, shared: b.shared, memberships: b.memberships, credits: b.credits, repeated });

export async function runMemberImport(session: Session | null, raw: RunImportInput): Promise<ImportResult> {
  const parsed = RunInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the import and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "import.run");
  const batchId = `imp_${input.key}`;
  return db.transaction("rw", db.tables, async () => {
    const prior = await db.importBatches.get(batchId);
    if (prior) return summary(prior, true);
    const x = await context(c);
    const p = previewImport(input.csv, {
      today: c.today, branches: x.branches.map((b) => ({ id: b.id, name: b.name })), plans: x.plans.map((q) => ({ id: q.id, name: q.name, kind: q.kind, branchIds: q.branchIds, visits: q.visits, active: q.active, effectiveFrom: q.effectiveFrom, effectiveTo: q.effectiveTo, pricePaise: q.pricePaise })),
      members: x.members.map((m) => ({ id: m.id, name: m.name, phone: m.phone, email: m.email })), capacityLeft: x.capacityLeft,
    });
    if (p.fileErrors.length) throw new ApiError("invalid", p.fileErrors[0]!, { fileErrors: p.fileErrors });
    const leave = new Set(input.leaveOut);
    const chosen = p.rows.filter((r) => r.status !== "error" && !leave.has(r.line));
    if (chosen.length === 0) throw new ApiError("conflict", "No row is left to import. Tick the rows you want, or fix the ones with problems.");
    const idFor = (line: number) => `mem_imp_${hash(input.key)}_${line}`;
    const pt = await ptPricingFor(c.tenantId);
    const created: string[] = [];
    let memberships = 0, credits = 0;
    for (const r of chosen) {
      const memberId = idFor(r.line);
      const sharesWith = [...r.sharedWith.filter((s) => s.source === "existing").map((s) => s.id!), ...r.sharedWith.filter((s) => s.source === "file" && chosen.some((o) => o.line === s.line)).map((s) => idFor(s.line!))];
      // Someone later in the file who shares with this row.
      const laterSharing = chosen.filter((o) => o.line > r.line && o.sharedWith.some((s) => s.source === "file" && s.line === r.line)).map((o) => idFor(o.line));
      const links = [...new Set([...sharesWith, ...laterSharing])];
      const joined = r.startsOn ?? c.today;
      const member: Member = {
        id: memberId, tenantId: c.tenantId, name: r.name, phone: r.phone, email: r.email, dateOfBirth: r.dateOfBirth, gender: r.gender, homeBranchId: r.branchId!, joinedOn: joined > c.today ? c.today : joined, qrToken: `qr-${memberId}-${hash(`${memberId}qr`)}`,
        leadSource: r.leadSource ?? "Imported", sharesContactWith: links.length ? links : undefined, importBatchId: batchId,
      };
      await db.members.add(member);
      await db.consents.add({ id: `cn_${memberId}_data_processing`, tenantId: c.tenantId, memberId, scope: "data_processing", grantedAt: c.nowIso, noticeVersion: "import", recordedBy: c.principal.userId } satisfies Consent);
      let ms: Membership | undefined;
      const plan = r.planId ? x.plans.find((q) => q.id === r.planId) : undefined;
      if (plan) {
        const startsOn = r.startsOn ?? c.today;
        const endsOn = addDays(startsOn, plan.durationDays ?? 30);
        ms = {
          id: `ms_${memberId}_1`, tenantId: c.tenantId, memberId, planId: plan.id,
          terms: { name: plan.name, kind: plan.kind, pricePaise: plan.pricePaise, taxRateBp: plan.taxRateBp, durationDays: plan.durationDays, visits: plan.visits, branchIds: plan.branchIds, classEntitlements: plan.classEntitlements, ptCredits: plan.ptCredits, graceDays: plan.graceDays },
          status: startsOn > c.today ? "scheduled" : endsOn < c.today ? "expired" : "active", startsOn, endsOn, visitsRemaining: plan.kind === "visit" ? (r.visitsLeft ?? plan.visits ?? 0) : null, freezes: [], autoRenew: false, createdAt: c.nowIso,
        };
        await db.memberships.add(ms);
        memberships++;
      }
      if (r.ptCredits) {
        const entry: CreditLedgerEntry = { id: `cr_${memberId}_import`, tenantId: c.tenantId, memberId, membershipId: ms?.id, kind: "purchase", credits: r.ptCredits, expiresOn: ms && ms.status !== "expired" && ms.endsOn ? ms.endsOn : addDays(c.today, pt.expiryDays), createdBy: c.principal.userId, createdAt: c.nowIso, idempotencyKey: `import:${batchId}:${r.line}:credits`, reason: "Imported balance" };
        await db.creditLedger.add(entry);
        credits++;
      }
      created.push(memberId);
    }
    const batch: ImportBatch = {
      id: batchId, tenantId: c.tenantId, at: c.nowIso, by: c.principal.userId, fileName: input.fileName, rows: p.rows.length, created, leftOut: p.rows.filter((r) => r.status !== "error" && leave.has(r.line)).length, withProblems: p.counts.error,
      shared: chosen.filter((r) => r.status === "shared").length, memberships, credits,
    };
    await db.importBatches.add(batch);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "import.run", entityType: "import", entityId: batchId, details: { file: input.fileName ?? null, rows: batch.rows, created: created.length, leftOut: batch.leftOut, withProblems: batch.withProblems, shared: batch.shared, memberships, credits } }, `ae_${batchId}`, now()));
    return summary(batch, false);
  });
}

export type { PreviewRow };
