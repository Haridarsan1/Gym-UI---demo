import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan, open } from "@/api/context";
import { ApiError } from "@/api/errors";
import { fromPlanDays, summarize, validateProgram, type ProgramSummary } from "@/domain/program";
import { PlanDay as PlanDaySchema, type PlanDay, type ProgramTemplate } from "@/domain/types";
import type { Principal } from "@/domain/permissions";
import type { Session } from "@/app/session";

/**
 * Program templates (W02): a program a trainer can start a client from. A trainer sees their own and the ones shared with the
 * gym; the owner sees all. A trainer changes only their own; the owner changes any. Archived templates leave the picker.
 */

export interface TemplateRow {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  shared: boolean;
  archived: boolean;
  mine: boolean;
  /** The caller may edit, share and archive it. */
  canEdit: boolean;
  summary: ProgramSummary;
  updatedAt: string;
}
export interface TemplateDetail extends TemplateRow {
  days: PlanDay[];
}

const canSee = (p: Principal, t: ProgramTemplate) => t.tenantId === p.tenantId && (t.shared || t.ownerId === p.userId || p.role === "owner");
const canEdit = (p: Principal, t: ProgramTemplate) => t.tenantId === p.tenantId && (t.ownerId === p.userId || p.role === "owner");

async function rows(session: Session | null, archived = false) {
  const { principal } = await open(session);
  assertCan(principal, "template.manage");
  const [all, users] = await Promise.all([db.programTemplates.where("tenantId").equals(principal.tenantId!).toArray(), db.users.where("tenantId").equals(principal.tenantId!).toArray()]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const toRow = (t: ProgramTemplate): TemplateRow => ({
    id: t.id, name: t.name, description: t.description, ownerId: t.ownerId, ownerName: name.get(t.ownerId) ?? "A trainer", shared: t.shared, archived: t.archived, mine: t.ownerId === principal.userId,
    canEdit: canEdit(principal, t), summary: summarize(t.days), updatedAt: t.updatedAt,
  });
  return { principal, all, toRow, visible: all.filter((t) => canSee(principal, t) && (archived || !t.archived)) };
}

export async function listTemplates(session: Session | null, opts: { archived?: boolean } = {}): Promise<TemplateRow[]> {
  const { visible, toRow } = await rows(session, opts.archived);
  return visible.map(toRow).sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
}

export async function getTemplate(session: Session | null, id: string): Promise<TemplateDetail> {
  const { visible, toRow } = await rows(session, true);
  const t = visible.find((x) => x.id === id);
  if (!t) throw new ApiError("not_found", "We couldn’t find this template. It may be private to another trainer.");
  return { ...toRow(t), days: t.days };
}

const TemplateInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Give the template a name.").max(80, "Keep the name under 80 characters."),
  description: z.string().max(300, "Keep the description under 300 characters."),
  shared: z.boolean(),
  days: z.array(PlanDaySchema).max(52 * 7),
});
export type TemplateInput = z.infer<typeof TemplateInput>;

/** Saves a new template, or changes one of your own. It must be a sound program, because anyone who starts from it publishes it. */
export async function saveTemplate(session: Session | null, raw: TemplateInput): Promise<string> {
  const parsed = TemplateInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the template and try again.");
  const input = parsed.data;
  const { principal, all } = await rows(session);
  const library = await db.exercises.toArray();
  const exercises = new Map(library.filter((e) => e.tenantId === null || e.tenantId === principal.tenantId).map((e) => [e.id, { name: e.name, archived: e.archived }]));
  const issues = validateProgram({ name: input.name, notes: "", weeks: fromPlanDays(input.days) }, exercises);
  if (issues.length) throw new ApiError("invalid", issues[0]!.message, { issues: issues.map((i) => i.message) });
  const now = new Date().toISOString();
  const weeks = Math.max(1, ...input.days.map((d) => d.weekIndex + 1));
  if (input.id) {
    const t = all.find((x) => x.id === input.id);
    if (!t || !canEdit(principal, t)) throw new ApiError("forbidden", "You can only change your own templates.");
    await db.programTemplates.update(t.id, { name: input.name, description: input.description.trim(), shared: input.shared, days: input.days, weeks, updatedAt: now });
    return t.id;
  }
  const id = `tpl_${crypto.randomUUID().slice(0, 10)}`;
  await db.programTemplates.add({ id, tenantId: principal.tenantId!, name: input.name, description: input.description.trim(), ownerId: principal.userId, shared: input.shared, archived: false, weeks, days: input.days, createdAt: now, updatedAt: now });
  return id;
}

export async function setTemplateArchived(session: Session | null, input: { id: string; archived: boolean }): Promise<void> {
  const { principal, all } = await rows(session);
  const t = all.find((x) => x.id === input.id);
  if (!t || !canEdit(principal, t)) throw new ApiError("forbidden", "You can only archive your own templates.");
  await db.programTemplates.update(t.id, { archived: input.archived, updatedAt: new Date().toISOString() });
}

export async function setTemplateShared(session: Session | null, input: { id: string; shared: boolean }): Promise<void> {
  const { principal, all } = await rows(session);
  const t = all.find((x) => x.id === input.id);
  if (!t || !canEdit(principal, t)) throw new ApiError("forbidden", "You can only share your own templates.");
  await db.programTemplates.update(t.id, { shared: input.shared, updatedAt: new Date().toISOString() });
}
