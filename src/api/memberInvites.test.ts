import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { getCommunications, retryAllFailed } from "@/api/communications";
import { isApiError } from "@/api/errors";
import { completeJoin, getAppStatus, getInvite, inviteMembers } from "@/api/memberInvites";
import { getMemberProfile } from "@/api/memberProfile";
import { listImports, runMemberImport } from "@/api/memberImport";
import { getMe } from "@/api/me";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { configureSimulation } from "@/demo/simulate";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) }; } return { code: "resolved", message: "" }; };
const owner = as("u_owner");
let n = 0;
const key = () => `inv-key-${++n}-${Math.random().toString(36).slice(2)}`;
const FILE = ["name,phone,email,date_of_birth,gender,branch,plan,start_date,visits_left,pt_credits,lead_source", "Asha Menon,9820011122,asha@example.in,,female,Bandra,Monthly,2026-11-10,,,", "Vikram Shah,9820033344,,,male,Andheri,Monthly,2026-11-01,,,", "Tara Joshi,9820044466,tara@example.in,,female,Andheri,,,,,"].join("\r\n");
const imported = async () => { await runMemberImport(owner, { key: key(), csv: FILE, leaveOut: [], consentConfirmed: true }); return (await db.members.toArray()).filter((m) => m.importBatchId); };

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); configureSimulation({ emailFails: false }); await resetDemo(); });
afterAll(() => { setNow(null); configureSimulation({ emailFails: false }); });

describe("inviting imported members to the app", () => {
  it("sends the email through the delivery log to each member who has one, and says why for each who can’t be invited", async () => {
    const ms = await imported();
    const r = await inviteMembers(owner, { memberIds: ms.map((m) => m.id), key: key() });
    expect(r).toMatchObject({ sent: 2, failed: 0, repeated: false });
    expect(r.skipped).toEqual([{ memberId: ms.find((m) => m.name === "Vikram Shah")!.id, name: "Vikram Shah", reason: "No email address on file. Add one to the member’s profile to invite them." }]);
    const mail = (await db.emailLog.toArray()).filter((e) => e.template === "member_invite");
    expect(mail.filter((e) => e.status === "sent").map((e) => e.to).sort()).toEqual(["asha@example.in", "tara@example.in"]);
    expect(mail.find((e) => e.status === "skipped")!.detail).toMatch(/^No email address/);
    const sent = mail.find((e) => e.to === "asha@example.in")!;
    expect(sent.subject).toBe("Asha, set up your Pulse Fitness app");
    expect(sent.body).toMatch(/https:\/\/app\.ember\.example\/join\/inv_\w+/);
    expect((await getCommunications(owner, { limit: 200 })).rows.some((x) => x.template === "App invitation" && x.status === "sent")).toBe(true);
  });

  it("the same key twice sends nothing more; another invitation too soon is refused with the date", async () => {
    const ms = await imported();
    const k = key();
    await inviteMembers(owner, { memberIds: ms.map((m) => m.id), key: k });
    const total = await db.emailLog.count();
    expect((await inviteMembers(owner, { memberIds: ms.map((m) => m.id), key: k })).repeated).toBe(true);
    expect(await db.emailLog.count()).toBe(total);
    const again = await inviteMembers(owner, { memberIds: ms.map((m) => m.id), key: key() });
    expect(again.sent).toBe(0);
    expect(again.skipped.find((s) => s.name === "Asha Menon")!.reason).toBe("Invited on 2026-11-17. Another invitation can go from 2026-11-20.");
    setNow(new Date("2026-11-21T06:30:00.000Z"));
    expect((await inviteMembers(owner, { memberIds: ms.map((m) => m.id), key: key() })).sent).toBe(2);
  });

  it("a member who withdrew consent isn’t contacted, and a failed invitation can be retried from the delivery log", async () => {
    const ms = await imported();
    const asha = ms.find((m) => m.name === "Asha Menon")!;
    await db.consents.update(`cn_${asha.id}_data_processing`, { withdrawnAt: "2026-11-17T05:00:00.000Z" });
    configureSimulation({ emailFails: true });
    const r = await inviteMembers(owner, { memberIds: ms.map((m) => m.id), key: key() });
    expect(r).toMatchObject({ sent: 0, failed: 1 });
    expect(r.skipped.find((s) => s.name === "Asha Menon")!.reason).toBe("Asha withdrew consent for the gym to hold their details, so they aren’t contacted.");
    configureSimulation({ emailFails: false });
    expect((await retryAllFailed(owner)).sent).toBe(1);
  });

  it("is for the desk, managers and the owner, within their own branches", async () => {
    const ms = await imported();
    const bm = as("u_bm_bandra");
    const r = await inviteMembers(bm, { memberIds: ms.map((m) => m.id), key: key() });
    expect(r.sent + r.skipped.length).toBe(1); // only Asha is at Bandra
    expect((await err(inviteMembers(as("u_trainer_meera"), { memberIds: [ms[0]!.id], key: key() }))).code).toBe("forbidden");
    expect((await err(inviteMembers(as("u_desk_powai"), { memberIds: ms.map((m) => m.id), key: key() }))).code).toBe("not_found");
  });
});

describe("the link, and who has joined", () => {
  const tokenOf = async (name: string) => (await db.members.toArray()).find((m) => m.name === name)!.appInvite!.token;

  it("opens a page for that member only, and sets up their login with a code or a password", async () => {
    const ms = await imported();
    await inviteMembers(owner, { memberIds: ms.map((m) => m.id), key: key() });
    const t = await tokenOf("Asha Menon");
    expect(await getInvite(t)).toMatchObject({ valid: true, firstName: "Asha", gymName: "Pulse Fitness", phoneEnding: "1122", email: "asha@example.in" });
    expect((await getInvite("inv_nope")).valid).toBe(false);
    expect((await err(completeJoin({ token: t, method: "phone_otp", code: "111111", password: "", confirm: "" }))).message).toBe("That code isn’t right. Check it and try again.");
    expect((await err(completeJoin({ token: t, method: "email_password", code: "", password: "short", confirm: "short" }))).message).toBe("Use at least 8 characters.");
    expect((await err(completeJoin({ token: t, method: "email_password", code: "", password: "longenough1", confirm: "different1" }))).message).toBe("The two passwords are different.");
    const j = await completeJoin({ token: t, method: "phone_otp", code: "246810", password: "", confirm: "" });
    expect(j).toMatchObject({ name: "Asha Menon", tenantId: "t_pulse", branchIds: ["br_bandra"] });
    expect(await db.users.get(j.userId)).toMatchObject({ role: "member", status: "active", login: { method: "phone_otp" } });
    expect((await getMe({ userId: j.userId, name: j.name, role: "member", tenantId: j.tenantId, branchIds: j.branchIds, memberId: j.memberId }))).toMatchObject({ role: "member", tenant: { name: "Pulse Fitness" } });
    expect((await getInvite(t)).valid).toBe(false);
    expect((await err(completeJoin({ token: t, method: "phone_otp", code: "246810", password: "", confirm: "" }))).code).toBe("conflict");
    expect((await db.auditEvents.where("action").equals("member.join").toArray())).toHaveLength(1);
  });

  it("shows who has joined, who is invited and who isn’t, on the import and on the member’s profile", async () => {
    const ms = await imported();
    await inviteMembers(owner, { memberIds: ms.map((m) => m.id), key: key() });
    await completeJoin({ token: await tokenOf("Asha Menon"), method: "email_password", code: "", password: "longenough1", confirm: "longenough1" });
    const [row] = await listImports(owner);
    expect(row).toMatchObject({ created: 3, joined: 1, invited: 1, notInvited: 1, canInvite: 0 });
    const s = await getAppStatus(owner, { importBatchId: (await db.importBatches.toArray())[0]!.id });
    expect(s.counts).toEqual({ joined: 1, invited: 1, not_invited: 1 });
    expect(s.rows.map((r) => [r.name, r.status])).toEqual([["Asha Menon", "joined"], ["Tara Joshi", "invited"], ["Vikram Shah", "not_invited"]]);
    const profile = await getMemberProfile(owner, ms.find((m) => m.name === "Tara Joshi")!.id);
    expect(profile.app).toMatchObject({ status: "invited", invitedOn: "2026-11-17", email: "tara@example.in" });
  });
});
