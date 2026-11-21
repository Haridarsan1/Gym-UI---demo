import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { exportAuditLog, getAuditLog } from "@/api/audit";
import { getBranches } from "@/api/branches";
import { getCommunications } from "@/api/communications";
import { getDashboard } from "@/api/dashboard";
import { getDeskReceipt } from "@/api/payments";
import { isApiError } from "@/api/errors";
import { createExport, getFinanceList } from "@/api/finance";
import { getMe } from "@/api/me";
import { getMember, listMembers } from "@/api/members";
import { getMemberProfile } from "@/api/memberProfile";
import { getPlans } from "@/api/plans";
import { addProgressPhoto, getPhotos } from "@/api/progress";
import { exportReport, getReport, REPORT_IDS } from "@/api/reports";
import { viewSensitive } from "@/api/sensitive";
import { getSettings } from "@/api/settings";
import { getStaff } from "@/api/staff";
import { enterSupport, requestSupportAccess } from "@/api/platform";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";

/**
 * A05 acceptance: one gym never sees another’s records, reports, exports, media or direct links; a branch stays inside its branch; a progress photo opens only with the member’s consent and the right
 * role; exports carry only what the role may see. Backup restore cannot be shown in demo mode and is on the M6 list.
 */
const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? e.code : "other"; } return "resolved"; };
const DENIED = ["forbidden", "not_found"];
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const owner = as("u_owner"), lotusOwner = as("u_lotus_owner");
const T0 = new Date("2026-11-17T06:30:00.000Z");
beforeEach(async () => { setNow(T0); await resetDemo({ secondGym: true }); });
afterAll(() => setNow(null));

const text = (v: unknown) => JSON.stringify(v);

describe("two gyms, nothing shared", () => {
  it("the second gym really is a different gym, with its own people and money", async () => {
    const [pm, lm] = await Promise.all([db.members.where("tenantId").equals("t_pulse").count(), db.members.where("tenantId").equals("t_lotus").count()]);
    expect(pm).toBeGreaterThan(lm);
    expect(lm).toBeGreaterThan(10);
    expect((await db.branches.where("tenantId").equals("t_lotus").toArray()).map((b) => b.name)).not.toContain("Bandra");
    const ids = [...(await db.members.toArray())].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("direct links by id: every record of the other gym is refused, in both directions", async () => {
    const lotusMember = (await db.members.where("tenantId").equals("t_lotus").first())!;
    const lotusInvoice = (await db.invoices.where("tenantId").equals("t_lotus").first())!;
    const pulseMember = (await db.members.where("tenantId").equals("t_pulse").first())!;
    const pulseInvoice = (await db.invoices.where("tenantId").equals("t_pulse").first())!;
    for (const who of ["u_owner", "u_desk_andheri", "u_finance"]) {
      expect(DENIED, `${who} profile`).toContain(await code(getMemberProfile(as(who), lotusMember.id)));
      expect(DENIED, `${who} member`).toContain(await code(getMember(as(who), lotusMember.id)));
      expect(DENIED, `${who} receipt`).toContain(await code(getDeskReceipt(as(who), lotusInvoice.id)));
      expect(DENIED, `${who} health`).toContain(await code(viewSensitive(as(who), { kind: "assessment", memberId: lotusMember.id, entityId: "x" })));
    }
    for (const who of ["u_lotus_owner", "u_lotus_desk"]) {
      expect(DENIED, `${who} profile`).toContain(await code(getMemberProfile(as(who), pulseMember.id)));
      expect(DENIED, `${who} member`).toContain(await code(getMember(as(who), pulseMember.id)));
      expect(DENIED, `${who} receipt`).toContain(await code(getDeskReceipt(as(who), pulseInvoice.id)));
    }
    // And a gym can read its own.
    expect(await code(getMemberProfile(owner, pulseMember.id))).toBe("resolved");
    expect(await code(getMemberProfile(lotusOwner, lotusMember.id))).toBe("resolved");
  });

  it("every list, screen and report holds only the asking gym’s records", async () => {
    const lotusNames = (await db.members.where("tenantId").equals("t_lotus").toArray()).map((m) => m.name);
    const pulseNames = (await db.members.where("tenantId").equals("t_pulse").toArray()).map((m) => m.name);
    const pulseOnly = pulseNames.filter((n) => !lotusNames.includes(n));
    const lotusOnly = lotusNames.filter((n) => !pulseNames.includes(n));
    const views = async (s: Session) => ({
      members: await listMembers(s, { pageSize: 500 }), finance: await getFinanceList(s, { view: "invoices" } as never), payments: await getFinanceList(s, { view: "payments" } as never),
      dashboard: await getDashboard(s), staff: await getStaff(s), plans: await getPlans(s), branches: await getBranches(s), settings: await getSettings(s), comms: await getCommunications(s), audit: await getAuditLog(s),
      reports: await Promise.all(REPORT_IDS.map((r) => getReport(s, { report: r, from: "2026-01-01", to: "2026-11-17" }))),
    });
    const p = text(await views(owner)), l = text(await views(lotusOwner));
    for (const n of lotusOnly.slice(0, 30)) expect(p, `Pulse’s screens show ${n}`).not.toContain(n);
    for (const n of pulseOnly.slice(0, 30)) expect(l, `Lotus’s screens show ${n}`).not.toContain(n);
    expect(p).not.toContain("Lotus Strength Club");
    const lv = await views(lotusOwner);
    for (const [k, v] of Object.entries(lv)) expect(text(v), `Lotus’s ${k} mention Pulse Fitness`).not.toContain("Pulse Fitness");
    expect((await listMembers(owner, { pageSize: 500 })).total).toBe(pulseNames.length - (await db.members.where("tenantId").equals("t_pulse").filter((m) => !!m.archivedAt).count()));
  });

  it("exports carry only the asking gym’s rows", async () => {
    const pulseOnly = new Set((await db.members.where("tenantId").equals("t_pulse").toArray()).map((m) => m.name));
    for (const m of await db.members.where("tenantId").equals("t_lotus").toArray()) pulseOnly.delete(m.name);
    const lotusOnly = new Set((await db.members.where("tenantId").equals("t_lotus").toArray()).map((m) => m.name));
    for (const m of await db.members.where("tenantId").equals("t_pulse").toArray()) lotusOnly.delete(m.name);
    for (const r of REPORT_IDS) {
      const f = await exportReport(owner, { report: r, from: "2026-01-01", to: "2026-11-17" });
      for (const n of lotusOnly) expect(f.csv, `${r} export has ${n}`).not.toContain(n);
      const g = await exportReport(lotusOwner, { report: r, from: "2026-01-01", to: "2026-11-17" });
      for (const n of pulseOnly) expect(g.csv, `${r} export (Lotus) has ${n}`).not.toContain(n);
    }
    for (const kind of ["invoices", "payments", "refunds", "credit_notes", "dues"] as const) {
      const f = await createExport(owner, { kind });
      for (const n of lotusOnly) expect(f.csv).not.toContain(n);
      const g = await createExport(lotusOwner, { kind });
      for (const n of pulseOnly) expect(g.csv).not.toContain(n);
    }
    const a = await exportAuditLog(owner), b = await exportAuditLog(lotusOwner);
    expect(a.csv).not.toContain("Anita Desai");
    expect(b.csv).not.toContain("Neha Kulkarni");
  });

  it("a platform administrator has no way into either gym’s records without a support session", async () => {
    const admin = as("u_admin");
    const m = (await db.members.where("tenantId").equals("t_pulse").first())!;
    for (const call of [() => getMemberProfile(admin, m.id), () => listMembers(admin), () => getDashboard(admin), () => getFinanceList(admin, { view: "invoices" } as never), () => exportReport(admin, { report: REPORT_IDS[0]! }), () => getAuditLog(admin), () => getStaff(admin)]) {
      expect(DENIED).toContain(await code(call()));
    }
  });
});

describe("media: logos and photos stay with their gym", () => {
  it("each gym shows its own logo on its screens and nobody else’s", async () => {
    const [p, l] = await Promise.all([getMe(owner), getMe(lotusOwner)]);
    expect(p.tenant?.logoUrl).toBeTruthy();
    expect(l.tenant?.logoUrl).toBeTruthy();
    expect(p.tenant!.logoUrl).not.toBe(l.tenant!.logoUrl);
    expect(text(await getSettings(owner))).not.toContain(l.tenant!.logoUrl!);
    expect(text(await getSettings(lotusOwner))).not.toContain(p.tenant!.logoUrl!);
    const pm = await getMe(as("u_member_arjun")), lm = await getMe(as("u_lotus_member"));
    expect(pm.tenant?.logoUrl).toBe(p.tenant!.logoUrl);
    expect(lm.tenant?.logoUrl).toBe(l.tenant!.logoUrl);
  });

  it("a progress photo belongs to its member: another gym, another member and a lookalike id all get nothing", async () => {
    const nisha = as("u_lotus_member"), arjun = as("u_member_arjun");
    await db.consents.add({ id: "cn_a05_nisha", tenantId: "t_lotus", memberId: "mem_lotus_001", scope: "photos", grantedAt: "2026-11-01T00:00:00.000Z", noticeVersion: "2026-01", recordedBy: "u_lotus_member" });
    const photo = await addProgressPhoto(nisha, { dataUrl: PNG });
    expect((await getPhotos(nisha)).photos.map((x) => x.id)).toEqual([photo.id]);
    expect((await getPhotos(arjun)).photos.map((x) => x.id)).not.toContain(photo.id);
    for (const who of ["u_owner", "u_bm_bandra", "u_trainer_meera", "u_desk_andheri", "u_finance"]) {
      expect(DENIED, who).toContain(await code(viewSensitive(as(who), { kind: "photo", memberId: "mem_lotus_001", entityId: photo.id })));
    }
    // Even when a Pulse person is given the health switch, Lotus’s photo is not theirs.
    await db.staffRoles.where("userId").equals("u_owner").modify((r) => void (r.limits.canViewClientHealth = true));
    expect(DENIED).toContain(await code(viewSensitive(owner, { kind: "photo", memberId: "mem_lotus_001", entityId: photo.id })));
    // A Pulse photo id used with a Lotus member is refused as well.
    await db.consents.add({ id: "cn_a05_arjun", tenantId: "t_pulse", memberId: "mem_arjun", scope: "photos", grantedAt: "2026-11-01T00:00:00.000Z", noticeVersion: "2026-01", recordedBy: "u_member_arjun" });
    const mine = await addProgressPhoto(arjun, { dataUrl: PNG });
    expect(DENIED).toContain(await code(viewSensitive(lotusOwner, { kind: "photo", memberId: "mem_arjun", entityId: mine.id })));
    expect(DENIED).toContain(await code(viewSensitive(owner, { kind: "photo", memberId: "mem_lotus_001", entityId: mine.id })));
  });
});

describe("consent-restricted photo access", () => {
  const setHealth = (userId: string, on: boolean) => db.staffRoles.where("userId").equals(userId).modify((r) => void (r.limits.canViewClientHealth = on));
  const setup = async () => {
    await db.consents.where("memberId").equals("mem_arjun").filter((c) => c.scope === "photos").delete();
    await db.consents.add({ id: "cn_a05_p", tenantId: "t_pulse", memberId: "mem_arjun", scope: "photos", grantedAt: "2026-11-01T00:00:00.000Z", noticeVersion: "2026-01", recordedBy: "u_member_arjun" });
    return addProgressPhoto(as("u_member_arjun"), { dataUrl: PNG });
  };
  const trainerOf = async () => (await db.trainerAssignments.where("memberId").equals("mem_arjun").filter((a) => !a.effectiveTo).first())!.trainerId;

  it("the assigned trainer sees it with consent, an unassigned trainer never, and withdrawing consent closes it for everyone but the member", async () => {
    const photo = await setup();
    const assigned = await trainerOf();
    const other = (await db.users.where("role").equals("trainer").filter((u) => u.tenantId === "t_pulse" && u.id !== assigned).first())!;
    const view = { kind: "photo" as const, memberId: "mem_arjun", entityId: photo.id };
    await viewSensitive(as(assigned), view);
    expect(await code(viewSensitive(as(other.id), view))).toBe("forbidden");
    await db.consents.where("memberId").equals("mem_arjun").filter((c) => c.scope === "photos").modify({ withdrawnAt: "2026-11-10T00:00:00.000Z" });
    expect(await code(viewSensitive(as(assigned), view))).toBe("forbidden");
    await setHealth("u_owner", true);
    expect(await code(viewSensitive(owner, view))).toBe("forbidden");
    expect((await getPhotos(as("u_member_arjun"))).photos).toEqual([]);
  });

  it("an owner needs the health switch as well as consent, a branch manager only for their own branch, and desk and finance never", async () => {
    const photo = await setup();
    const view = { kind: "photo" as const, memberId: "mem_arjun", entityId: photo.id };
    expect(await code(viewSensitive(owner, view))).toBe("forbidden");
    await setHealth("u_owner", true);
    expect(await code(viewSensitive(owner, view))).toBe("resolved");
    await setHealth("u_bm_bandra", true);
    expect(await code(viewSensitive(as("u_bm_bandra"), view))).toBe("forbidden"); // Arjun is at Andheri
    for (const u of ["u_desk_andheri", "u_finance"]) { await setHealth(u, true); expect(await code(viewSensitive(as(u), view)), u).toBe("forbidden"); }
    const seen = await db.auditEvents.where("action").equals("photo.view").toArray();
    expect(seen.filter((e) => e.actorId === "u_owner")).toHaveLength(1);
    expect(seen.some((e) => ["u_bm_bandra", "u_desk_andheri", "u_finance"].includes(e.actorId))).toBe(false);
  });
});

describe("role-scoped exports", () => {
  it("only the roles that may export can, and the file holds the branches that role may see", async () => {
    expect(DENIED).toContain(await code(exportReport(as("u_desk_andheri"), { report: REPORT_IDS[0]! })));
    expect(DENIED).toContain(await code(exportReport(as("u_trainer_meera"), { report: REPORT_IDS[0]! })));
    expect(DENIED).toContain(await code(exportReport(as("u_member_arjun"), { report: REPORT_IDS[0]! })));
    expect(DENIED).toContain(await code(exportAuditLog(as("u_desk_andheri"))));
    expect(DENIED).toContain(await code(exportAuditLog(as("u_finance"))));
    expect(DENIED).toContain(await code(createExport(as("u_member_arjun"), { kind: "invoices" })));
    expect(DENIED).toContain(await code(createExport(as("u_trainer_meera"), { kind: "invoices" })));
    const all = await createExport(owner, { kind: "invoices" });
    const bandra = await createExport(as("u_bm_bandra"), { kind: "invoices" });
    expect(bandra.rows).toBeLessThan(all.rows);
    expect(bandra.branchNames).toEqual(["Bandra"]);
    expect(bandra.csv).not.toContain("Andheri");
    expect(bandra.csv).not.toContain("Powai");
    // A branch manager asking for another branch is refused, not silently given their own.
    expect(DENIED).toContain(await code(createExport(as("u_bm_bandra"), { kind: "invoices", branchId: "br_andheri" })));
    // The file never carries contact details or health records.
    for (const f of [all, bandra]) { expect(f.csv).not.toMatch(/@|\b9\d{9}\b/); expect(f.csv.toLowerCase()).not.toMatch(/assessment|progress photo|body fat/); }
  });

  it("each export, and each refused attempt, is on the record: the first is audited, the second writes nothing", async () => {
    const before = await db.auditEvents.where("action").equals("export.create").count();
    await createExport(owner, { kind: "invoices" });
    expect(await db.auditEvents.where("action").equals("export.create").count()).toBe(before + 1);
    await code(createExport(as("u_desk_andheri"), { kind: "invoices" }));
    expect(await db.auditEvents.where("action").equals("export.create").count()).toBe(before + 1);
  });
});

describe("support access stays inside the gym that was named", () => {
  it("a session on one gym opens that gym’s owner views and not the other’s, and sees no more than an owner may", async () => {
    const admin = as("u_admin");
    const req = await requestSupportAccess(admin, { key: "a05-support-key-1", tenantId: "t_pulse", reason: "Help the owner fix the import", minutes: 30 });
    const s = await enterSupport(admin, { sessionId: req.id });
    const lotusMember = (await db.members.where("tenantId").equals("t_lotus").first())!;
    expect(await code(getDashboard(s))).toBe("resolved");
    expect(DENIED).toContain(await code(getMemberProfile(s, lotusMember.id)));
    expect(DENIED).toContain(await code(viewSensitive(s, { kind: "photo", memberId: lotusMember.id, entityId: "x" })));
  });
});
