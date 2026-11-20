import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { branchScope, openOwner } from "@/api/owner";
import { buildAuditEvent } from "@/domain/audit";
import { STATE_NAMES } from "@/domain/billing";
import { hasBranchErrors, validateBranch, weekSummary, withinHours, type BranchDraft, type BranchErrors, type DayHours } from "@/domain/branchRules";
import type { Branch } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * Branches (O01): each branch’s address, opening hours and rooms. The owner edits any branch; a branch manager edits their own. Hours decide when sessions can be booked; rooms are what a session
 * can be put in. Changing hours never cancels a booked session, and says how many fall outside the new hours so someone can move them. A room with sessions still to come can’t be removed.
 * The GST state and the invoice prefix are not edited here: they decide how tax and numbers work, and the accountant sets them (docs/PLAN.md, Decisions).
 */
export interface BranchRow {
  id: string;
  name: string;
  city: string;
  address?: string;
  stateCode: string;
  stateName: string;
  invoicePrefix: string;
  active: boolean;
  hours: DayHours[];
  week: string[];
  rooms: Array<{ id: string; name: string; capacity: number; /** Booked sessions still to come in this room. */ upcoming: number }>;
  /** Staff who work here, so the owner sees the size of the branch. */
  staff: number;
  members: number;
}

export interface BranchesView { today: string; branches: BranchRow[]; canAdd: boolean }

export async function getBranches(session: Session | null): Promise<BranchesView> {
  const c = await openOwner(session, "branch.manage");
  const [branches, roles, members, bookings] = await Promise.all([
    db.branches.where("tenantId").equals(c.tenantId).toArray(), db.staffRoles.where("tenantId").equals(c.tenantId).toArray(),
    db.members.where("tenantId").equals(c.tenantId).filter((m) => !m.archivedAt).toArray(), db.bookings.where("tenantId").equals(c.tenantId).filter((b) => b.status === "booked" && !!b.roomId && b.startsAt >= c.nowIso).toArray(),
  ]);
  return {
    today: c.today, canAdd: false,
    branches: branches.filter((b) => c.branchIds.includes(b.id)).sort((a, b) => a.name.localeCompare(b.name)).map((b): BranchRow => ({
      id: b.id, name: b.name, city: b.city, address: b.address, stateCode: b.stateCode, stateName: STATE_NAMES[b.stateCode] ?? b.stateCode, invoicePrefix: b.invoicePrefix, active: b.active, hours: b.hours, week: weekSummary(b.hours),
      rooms: b.rooms.map((r) => ({ ...r, upcoming: bookings.filter((x) => x.roomId === r.id).length })), staff: roles.filter((r) => r.role === "owner" || r.branchIds.includes(b.id)).length, members: members.filter((m) => m.homeBranchId === b.id).length,
    })),
  };
}

const SaveInput = z.object({
  key: z.string().min(8),
  branchId: z.string().min(1),
  address: z.string(),
  hours: z.array(z.object({ weekday: z.number(), open: z.string(), close: z.string() })),
  rooms: z.array(z.object({ id: z.string().optional(), name: z.string(), capacity: z.number().nullable() })),
});
export type SaveBranchInput = z.input<typeof SaveInput>;

const hashOf = (text: string) => [...text].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7).toString(36);

/** Saves a branch’s address, hours and rooms. What changed is one audit entry, from and to. */
export async function saveBranch(session: Session | null, raw: SaveBranchInput): Promise<{ branch: Branch; changes: string[]; outsideHours: number; repeated: boolean }> {
  const parsed = SaveInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check the hours and rooms and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "branch.manage");
  branchScope(c, input.branchId);
  return db.transaction("rw", db.tables, async () => {
    const before = await db.branches.get(input.branchId);
    if (!before || before.tenantId !== c.tenantId) throw new ApiError("not_found", "We couldn’t find that branch.");
    const auditId = `ae_branch_${input.key}`;
    if (await db.auditEvents.get(auditId)) return { branch: before, changes: [], outsideHours: 0, repeated: true };
    const draft: BranchDraft = { address: input.address.trim(), hours: input.hours, rooms: input.rooms };
    const errors: BranchErrors = validateBranch(draft);
    if (hasBranchErrors(errors)) {
      const first = errors.address ?? errors.hours ?? errors.rooms ?? Object.values(errors.days)[0] ?? Object.values(errors.roomRows).map((r) => r.name ?? r.capacity)[0] ?? "Check the hours and rooms and try again.";
      throw new ApiError("invalid", first, { errors });
    }
    const bookings = await db.bookings.where("tenantId").equals(c.tenantId).filter((b) => b.branchId === before.id && b.status === "booked" && b.startsAt >= c.nowIso).toArray();
    const rooms = input.rooms.map((r) => ({ id: r.id && before.rooms.some((x) => x.id === r.id) ? r.id : `rm_${before.id.slice(3)}_${hashOf(`${input.key}${r.name}`)}`, name: r.name.trim().replace(/\s+/g, " "), capacity: r.capacity! }));
    for (const gone of before.rooms.filter((r) => !rooms.some((x) => x.id === r.id))) {
      const n = bookings.filter((b) => b.roomId === gone.id).length;
      if (n > 0) throw new ApiError("conflict", `${gone.name} has ${n} ${n === 1 ? "session" : "sessions"} booked. Move ${n === 1 ? "it" : "them"} to another room first.`);
    }
    const hours = [...input.hours].sort((a, b) => a.weekday - b.weekday);
    const next: Branch = { ...before, address: draft.address || undefined, hours, rooms };
    const changes: string[] = [];
    if ((before.address ?? "") !== (next.address ?? "")) changes.push(`Address: ${before.address ?? "none"} to ${next.address ?? "none"}`);
    const was = weekSummary(before.hours).join("; ");
    const will = weekSummary(hours).join("; ");
    if (was !== will) changes.push(`Opening hours: ${was} to ${will}`);
    for (const r of rooms) {
      const old = before.rooms.find((x) => x.id === r.id);
      if (!old) changes.push(`Room added: ${r.name}, holds ${r.capacity}`);
      else if (old.name !== r.name || old.capacity !== r.capacity) changes.push(`Room changed: ${old.name}, holds ${old.capacity} to ${r.name}, holds ${r.capacity}`);
    }
    for (const r of before.rooms.filter((x) => !rooms.some((y) => y.id === x.id))) changes.push(`Room removed: ${r.name}`);
    const outsideHours = hours.length ? bookings.filter((b) => !withinHours(hours, b.startsAt, 0) || !withinHours(hours, b.startsAt, (Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000)).length : bookings.length;
    if (changes.length === 0) return { branch: before, changes, outsideHours: 0, repeated: false };
    await db.branches.put(next);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "branch.change", entityType: "branch", entityId: before.id, details: { name: before.name, changes, ...(outsideHours > 0 ? { sessionsOutsideNewHours: outsideHours } : {}) } }, auditId, now()));
    return { branch: next, changes, outsideHours: changes.some((x) => x.startsWith("Opening hours")) ? outsideHours : 0, repeated: false };
  });
}

