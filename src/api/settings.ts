import { z } from "zod";
import { db } from "@/demo/db";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { openOwner } from "@/api/owner";
import { buildAuditEvent } from "@/domain/audit";
import { STATE_NAMES } from "@/domain/billing";
import { gstinState, validateProfile } from "@/domain/settings";
import type { Session } from "@/app/session";

/** The gym’s profile (R02), owner only: its name, registered name, address, GSTIN and logo. Receipts, the header and the sidebar read them, so a change shows everywhere at once. */
export interface SettingsView { name: string; legalName: string; gstin: string; address: string; logoUrl?: string; currency: string; timeZone: string; stateName?: string; branchStates: string[] }

export async function getSettings(session: Session | null): Promise<SettingsView> {
  const c = await openOwner(session, "settings.manage");
  const [t, branches] = await Promise.all([db.tenants.get(c.tenantId), db.branches.where("tenantId").equals(c.tenantId).toArray()]);
  if (!t) throw new ApiError("not_found", "We couldn’t find the gym.");
  return { name: t.name, legalName: t.legalName ?? "", gstin: t.gstin ?? "", address: t.address ?? "", logoUrl: t.logoUrl, currency: t.currency, timeZone: t.timeZone, stateName: t.gstin ? gstinState(t.gstin) : undefined, branchStates: [...new Set(branches.map((b) => STATE_NAMES[b.stateCode] ?? b.stateCode))] };
}

const Input = z.object({
  key: z.string().min(8), name: z.string(), legalName: z.string(), gstin: z.string(), address: z.string(),
  /** A new logo as a data URL, `null` to remove it, absent to keep the one it has. */
  logo: z.string().nullable().optional(),
});
export type SaveSettingsInput = z.input<typeof Input>;

export async function saveSettings(session: Session | null, raw: SaveSettingsInput): Promise<{ changes: string[]; repeated: boolean }> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", "Check the details and try again.");
  const input = parsed.data;
  const c = await openOwner(session, "settings.manage");
  const errors = validateProfile(input, input.logo);
  const first = Object.values(errors)[0];
  if (first) throw new ApiError("invalid", first, { errors });
  return db.transaction("rw", db.tables, async () => {
    const auditId = `ae_settings_${input.key}`;
    if (await db.auditEvents.get(auditId)) return { changes: [], repeated: true };
    const t = (await db.tenants.get(c.tenantId))!;
    const next = { ...t, name: input.name.trim(), legalName: input.legalName.trim() || undefined, gstin: input.gstin.trim().toUpperCase() || undefined, address: input.address.trim() || undefined };
    if (input.logo === null) delete (next as { logoUrl?: string }).logoUrl;
    else if (input.logo) next.logoUrl = input.logo;
    const changes: string[] = [];
    const say = (label: string, a: string | undefined, b: string | undefined) => { if ((a ?? "") !== (b ?? "")) changes.push(`${label}: ${a || "none"} to ${b || "none"}`); };
    say("Name", t.name, next.name); say("Registered name", t.legalName, next.legalName); say("GSTIN", t.gstin, next.gstin); say("Address", t.address, next.address);
    if ((t.logoUrl ?? "") !== (next.logoUrl ?? "")) changes.push(`Logo: ${!t.logoUrl ? "added" : !next.logoUrl ? "removed" : "replaced"}`);
    if (changes.length === 0) return { changes, repeated: false };
    await db.tenants.put(next);
    await db.auditEvents.add(buildAuditEvent(c.principal, { action: "settings.change", entityType: "settings", entityId: c.tenantId, details: { changes } }, auditId, now()));
    return { changes, repeated: false };
  });
}
