import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { acceptStaffInvite, listNewStaffLogins } from "@/api/demoLogins";
import { isApiError } from "@/api/errors";
import { getWizardOptions } from "@/api/newMember";
import { getStaff, inviteStaff, resendInvite, setStaffActive, updateStaff, type InviteStaffInput } from "@/api/staff";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import type { StaffLimits } from "@/domain/permissions";
import { defaultLimits } from "@/domain/staffRules";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message, details: e.details } : { code: "other", message: String(e), details: undefined }; } return { code: "resolved", message: "", details: undefined }; };
const owner = as("u_owner");
const bm = as("u_bm_bandra");
let n = 0;
const key = () => `staff-key-${++n}-${Math.random().toString(36).slice(2)}`;
const person = (over: Partial<InviteStaffInput> = {}): InviteStaffInput => ({ key: key(), name: "Ritu Verma", email: "ritu.verma@pulsefitness.in", phone: "98200 55001", role: "front_desk", branchIds: ["br_bandra"], limits: defaultLimits("front_desk"), ...over });
/** Gives Rohit the owner’s permission to manage front desk and trainers, the way the owner does on the Staff screen. */
const grantRohit = async () => {
  const r = (await getStaff(owner)).staff.find((s) => s.userId === "u_bm_bandra")!;
  await updateStaff(owner, { key: key(), userId: r.userId, name: r.name, email: r.email ?? "", phone: r.phone ?? "", role: "branch_manager", branchIds: r.branchIds, limits: { ...r.limits, canManageFrontline: true } });
};

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("the staff list", () => {
  it("shows the owner everyone, in role order, with what each can do in words", async () => {
    const v = await getStaff(owner);
    expect(v.authority.scope).toBe("all");
    expect(v.staff.map((s) => s.role)).toEqual(["owner", "branch_manager", "front_desk", "front_desk", "front_desk", "finance", "trainer", "trainer", "trainer", "trainer", "trainer", "trainer"]);
    const rohit = v.staff.find((s) => s.userId === "u_bm_bandra")!;
    expect(rohit).toMatchObject({ name: "Rohit Sethi", status: "active", branchNames: ["Bandra"], manage: { ok: true } });
    expect(rohit.summary).toContain("Can approve refunds up to ₹50,000.");
    expect(rohit.summary).toContain("Can’t invite or change staff.");
    expect(v.staff.find((s) => s.you)).toMatchObject({ userId: "u_owner", manage: { ok: false, reason: "That is you. Another owner changes your access." } });
    expect(v.staff.find((s) => s.userId === "u_trainer_aditya")!.clients).toBeGreaterThan(5);
    expect(v.staff.find((s) => s.userId === "u_desk_powai")!.summary).toContain("Can let a member in by override, with a reason, 2 a day.");
  });

  it("shows a branch manager only the staff at their own branches, read only until the owner allows more", async () => {
    const v = await getStaff(bm);
    expect(v.authority.scope).toBe("none");
    expect(v.staff.map((s) => s.name).sort()).toEqual(["Deepa Menon", "Farah Khan", "Imran Qureshi", "Meera Joshi", "Neha Kulkarni", "Rohit Sethi", "Sanjay Patil"]);
    expect(v.staff.every((s) => !s.manage.ok)).toBe(true);
    expect(v.staff.find((s) => s.name === "Imran Qureshi")!.manage.reason).toBe("Only the owner can invite or change staff. Ask them to allow you to manage front desk and trainers.");
    expect(v.branches.map((b) => b.name)).toEqual(["Bandra"]);
  });

  it("with the owner’s permission a branch manager can change front desk and trainers at their own branches, and nobody else", async () => {
    await grantRohit();
    const v = await getStaff(bm);
    expect(v.authority.scope).toBe("frontline");
    const can = (name: string) => v.staff.find((s) => s.name === name)!.manage;
    expect(can("Imran Qureshi").ok).toBe(true);
    expect(can("Farah Khan").ok).toBe(true);
    expect(can("Meera Joshi")).toEqual({ ok: false, reason: "They also work at a branch you don’t manage. Ask the owner to change them." });
    expect(can("Sanjay Patil").ok).toBe(false);
    expect(can("Deepa Menon")).toEqual({ ok: false, reason: "Only the owner can change a finance." });
    expect(can("Neha Kulkarni").ok).toBe(false);
  });

  it("is for the owner and branch managers", async () => {
    for (const id of ["u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun", "u_admin"]) expect((await err(getStaff(as(id)))).code, id).toBe("forbidden");
  });
});

describe("inviting staff", () => {
  it("makes an account that can’t sign in yet, with its role, branches and limits, an invitation email in the log, and an audit entry", async () => {
    const r = await inviteStaff(owner, person());
    expect(r).toMatchObject({ name: "Ritu Verma", status: "invited", role: "front_desk", branchNames: ["Bandra"] });
    expect(r.summary).toEqual(["Front desk at Bandra.", "Can give discounts up to 5%.", "Can let a member in by override, with a reason, 3 a day."]);
    expect(await db.users.get(r.userId)).toMatchObject({ status: "invited", role: "front_desk", phone: "9820055001", email: "ritu.verma@pulsefitness.in", mfaEnabled: false });
    expect(await db.staffRoles.where("userId").equals(r.userId).first()).toMatchObject({ role: "front_desk", branchIds: ["br_bandra"], limits: { refundLimitPaise: 0, maxDiscountBp: 500, canOverrideCheckIn: true, maxOverridesPerDay: 3 } });
    const mail = (await db.emailLog.toArray()).filter((e) => e.template === "staff_invite");
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ userId: r.userId, to: "ritu.verma@pulsefitness.in", status: "sent", subject: "Neha Kulkarni has invited you to Pulse Fitness" });
    expect(mail[0]!.body).toContain("front desk at Bandra");
    const e = (await db.auditEvents.where("action").equals("staff.change").toArray())[0]!;
    expect(e).toMatchObject({ actorId: "u_owner", entityId: r.userId, details: { change: "invited", name: "Ritu Verma", role: "front_desk", branches: ["Bandra"] } });
    // Until they accept, nothing they ask for is answered.
    expect((await err(getStaff({ userId: r.userId, name: r.name, role: "front_desk", tenantId: "t_pulse", branchIds: ["br_bandra"] }))).message).toBe("You haven’t accepted your invitation yet. Open the link in the email we sent you.");
  });

  it("accepting the invitation makes them active at their own branch and no other, and they appear in the demo role switcher", async () => {
    const r = await inviteStaff(owner, person());
    expect((await listNewStaffLogins(owner))[0]).toMatchObject({ userId: r.userId, role: "front_desk", branchIds: ["br_bandra"], status: "invited" });
    await acceptStaffInvite(r.userId);
    expect((await db.users.get(r.userId))!.status).toBe("active");
    const ritu: Session = { userId: r.userId, name: r.name, role: "front_desk", tenantId: "t_pulse", branchIds: ["br_bandra"] };
    expect((await getWizardOptions(ritu, "br_bandra")).maxDiscountBp).toBe(500);
    expect((await err(getWizardOptions(ritu, "br_andheri"))).code).toBe("forbidden");
    expect((await db.auditEvents.toArray()).find((e) => e.id === `ae_accept_${r.userId}`)).toMatchObject({ actorId: r.userId, details: { change: "accepted the invitation" } });
  });

  it("the same form sent twice is one invitation, and an address already in use is refused", async () => {
    const p = person();
    await inviteStaff(owner, p);
    await inviteStaff(owner, p);
    expect((await db.users.toArray()).filter((u) => u.name === "Ritu Verma")).toHaveLength(1);
    expect((await db.emailLog.toArray()).filter((e) => e.template === "staff_invite")).toHaveLength(1);
    expect(await db.auditEvents.where("action").equals("staff.change").count()).toBe(1);
    const dup = await err(inviteStaff(owner, person({ name: "Another Person", email: "RITU.verma@pulsefitness.in" })));
    expect(dup).toMatchObject({ code: "invalid", message: "Someone at this gym already has this email. Use another, or open their account." });
    expect((await err(inviteStaff(owner, person({ name: "X", email: "pooja.nair@pulsefitness.in" })))).code).toBe("invalid");
  });

  it("says what is wrong, field by field, and writes nothing", async () => {
    const r = await err(inviteStaff(owner, person({ name: "", email: "nope", branchIds: [] })));
    expect(r.message).toBe("Enter the person’s name.");
    expect((r.details as { errors: Record<string, string> }).errors).toMatchObject({ name: "Enter the person’s name.", email: "Enter an email like name@example.in. The invitation goes there.", branchIds: "Choose at least one branch." });
    expect((await db.users.toArray()).some((u) => u.id.startsWith("u_staff_"))).toBe(false);
    expect(await db.staffRoles.filter((r) => r.userId.startsWith("u_staff_")).count()).toBe(0);
    expect((await db.emailLog.toArray()).filter((e) => e.template === "staff_invite")).toHaveLength(0);
  });

  it("an owner can invite another owner, who is given every branch", async () => {
    const r = await inviteStaff(owner, person({ name: "Anil Kulkarni", email: "anil@pulsefitness.in", role: "owner", branchIds: [], limits: defaultLimits("owner") }));
    expect(r.branchNames).toEqual(["Andheri", "Bandra", "Powai"]);
    expect(r.summary[0]).toBe("Owner at every branch.");
  });

  it("a branch manager can’t invite anyone until the owner allows it; then only front desk and trainers at their own branches, within their own limits", async () => {
    expect((await err(inviteStaff(bm, person()))).message).toBe("Only the owner can invite or change staff. Ask them to allow you to manage front desk and trainers.");
    await grantRohit();
    expect((await inviteStaff(bm, person())).status).toBe("invited");
    expect((await err(inviteStaff(bm, person({ name: "Sunil", email: "sunil@x.in", branchIds: ["br_andheri"] })))).message).toBe("You can add people only at your own branches.");
    expect((await err(inviteStaff(bm, person({ name: "Sunil", email: "sunil@x.in", role: "finance", limits: defaultLimits("finance") })))).message).toBe("You can invite front desk and trainer accounts. Ask the owner for anything else.");
    expect((await err(inviteStaff(bm, person({ name: "Sunil", email: "sunil@x.in", limits: { ...defaultLimits("front_desk"), maxDiscountBp: 1500 } })))).message).toBe("You can give up to 10%, your own limit.");
    expect((await err(inviteStaff(bm, person({ name: "Sunil", email: "sunil@x.in", role: "branch_manager", limits: defaultLimits("branch_manager") })))).code).toBe("invalid");
    expect(await db.staffRoles.where("userId").startsWith("u_staff_").count()).toBe(1);
  });

  it("the invitation can be sent again to someone who hasn’t accepted, and not to someone who has", async () => {
    const r = await inviteStaff(owner, person());
    const k = key();
    expect(await resendInvite(owner, { userId: r.userId, key: k })).toMatchObject({ sentTo: "ritu.verma@pulsefitness.in", repeated: false });
    expect((await resendInvite(owner, { userId: r.userId, key: k })).repeated).toBe(true);
    const mail = (await db.emailLog.toArray()).filter((e) => e.template === "staff_invite");
    expect(mail).toHaveLength(2);
    expect(mail.map((m) => m.subject).sort()[1]).toBe("Reminder: Neha Kulkarni has invited you to Pulse Fitness");
    await acceptStaffInvite(r.userId);
    expect((await err(resendInvite(owner, { userId: r.userId, key: key() }))).message).toBe("Ritu has already accepted.");
  });
});

describe("changing someone’s access", () => {
  /** Changes one person as the Staff screen does: everything as it is, except what is given. `limits` are changes to the limits they have. */
  const edit = async (who: Session, userId: string, over: Partial<Omit<InviteStaffInput, "limits">> & { limits?: Partial<StaffLimits>; reason?: string } = {}) => {
    const r = (await getStaff(owner)).staff.find((s) => s.userId === userId)!;
    const { limits, ...rest } = over;
    return updateStaff(who, { key: key(), userId, name: r.name, email: r.email ?? "", phone: r.phone ?? "", role: r.role, branchIds: r.branchIds, limits: { ...r.limits, ...limits }, ...rest });
  };

  it("changes a limit from the next thing the person does, and writes a permission change with from and to", async () => {
    const pooja = as("u_desk_andheri");
    expect((await getWizardOptions(pooja, "br_andheri")).maxDiscountBp).toBe(500);
    const r = await edit(owner, "u_desk_andheri", { limits: { maxDiscountBp: 200, maxOverridesPerDay: 1 }, reason: "Too many discounts last month" });
    expect(r.changes).toEqual([{ field: "Discount limit", from: "5%", to: "2%" }, { field: "Overrides a day", from: "No limit", to: "1 a day" }]);
    expect((await getWizardOptions(pooja, "br_andheri")).maxDiscountBp).toBe(200);
    const e = (await db.auditEvents.where("action").equals("permission.change").toArray())[0]!;
    expect(e).toMatchObject({ actorId: "u_owner", entityId: "u_desk_andheri", reason: "Too many discounts last month", details: { change: "access", changes: r.changes } });
  });

  it("changes a role and branches, and clears what the new role can’t carry", async () => {
    // A refund limit is not something a front desk person has, so it is cleared, not kept.
    const r = await edit(owner, "u_trainer_aditya", { role: "front_desk", branchIds: ["br_andheri", "br_powai"], limits: { refundLimitPaise: 9_999_999, canOverrideCheckIn: true, maxDiscountBp: 500 } });
    expect(r.changes.map((c) => c.field)).toEqual(["Role", "Branches", "Discount limit", "Can override a check-in"]);
    expect(await db.staffRoles.where("userId").equals("u_trainer_aditya").first()).toMatchObject({ role: "front_desk", branchIds: ["br_andheri", "br_powai"], limits: { refundLimitPaise: 0, canViewClientHealth: false, canOverrideCheckIn: true, maxDiscountBp: 500 } });
    expect((await db.users.get("u_trainer_aditya"))!.role).toBe("front_desk");
  });

  it("the health-data switch and the staff-management switch are the owner’s alone, and only for the roles they apply to", async () => {
    await edit(owner, "u_bm_bandra", { limits: { canViewClientHealth: true } });
    expect((await db.staffRoles.where("userId").equals("u_bm_bandra").first())!.limits.canViewClientHealth).toBe(true);
    expect((await err(edit(owner, "u_desk_andheri", { limits: { canViewClientHealth: true } }))).message).toBe("Only an owner or a branch manager can be given access to client health and progress photos.");
    expect((await err(edit(owner, "u_finance", { limits: { canViewClientHealth: true } }))).code).toBe("invalid");
    expect((await err(edit(owner, "u_desk_andheri", { limits: { canManageFrontline: true } }))).message).toBe("Only a branch manager can be allowed to manage front desk and trainers.");
    const ev = (await db.auditEvents.where("action").equals("permission.change").toArray()).find((x) => (x.details as { changes: Array<{ field: string }> }).changes.some((c) => c.field.startsWith("Can view client health")));
    expect(ev).toBeDefined();
  });

  it("nobody changes their own access, but anyone can fix their own name or phone", async () => {
    expect((await err(edit(owner, "u_owner", { branchIds: ["br_andheri"], role: "finance" }))).message).toBe("You can’t change your own role or access. Ask another owner.");
    expect((await edit(owner, "u_owner", { phone: "9820099999" })).changes).toEqual([]);
    expect((await db.users.get("u_owner"))!.phone).toBe("9820099999");
    expect((await db.auditEvents.where("action").equals("staff.change").toArray())[0]).toMatchObject({ details: { change: "details" } });
  });

  it("an allowed branch manager changes front desk and trainers at their own branch, never above their own limits, never others", async () => {
    await grantRohit();
    expect((await edit(bm, "u_desk_bandra", { limits: { maxDiscountBp: 800 } })).changes).toEqual([{ field: "Discount limit", from: "5%", to: "8%" }]);
    expect((await err(edit(bm, "u_desk_bandra", { limits: { maxDiscountBp: 1500 } }))).message).toBe("You can give up to 10%, your own limit.");
    expect((await err(edit(bm, "u_trainer_meera", { phone: "9820011999" }))).message).toBe("They also work at a branch you don’t manage. Ask the owner to change them.");
    expect((await err(edit(bm, "u_finance", { phone: "9820011999" }))).message).toBe("Only the owner can change a finance.");
    expect((await err(edit(bm, "u_desk_bandra", { role: "branch_manager", limits: defaultLimits("branch_manager") }))).message).toBe("You can invite front desk and trainer accounts. Ask the owner for anything else.");
    expect((await err(edit(bm, "u_desk_andheri", { phone: "9820011998" }))).code).toBe("forbidden");
    // Without the permission, nothing.
    await edit(owner, "u_bm_bandra", { limits: { canManageFrontline: false } });
    expect((await err(edit(bm, "u_desk_bandra", { phone: "9820011997" }))).code).toBe("forbidden");
  });

  it("the same change sent twice is one change", async () => {
    const r = (await getStaff(owner)).staff.find((s) => s.userId === "u_desk_bandra")!;
    const input = { key: key(), userId: r.userId, name: r.name, email: r.email ?? "", phone: r.phone ?? "", role: r.role, branchIds: r.branchIds, limits: { ...r.limits, maxDiscountBp: 300 } };
    await updateStaff(owner, input);
    expect((await updateStaff(owner, input)).repeated).toBe(true);
    expect(await db.auditEvents.where("action").equals("permission.change").count()).toBe(1);
  });
});

describe("switching an account off and on", () => {
  it("a switched-off person can’t sign in or act, what they did stays, and their clients stay assigned until reassigned", async () => {
    const before = await db.trainerAssignments.where("trainerId").equals("u_trainer_aditya").filter((a) => a.effectiveTo === undefined).count();
    expect((await err(setStaffActive(owner, { key: key(), userId: "u_trainer_aditya", active: false, reason: "" }))).message).toBe("Say why the account is being switched off. The reason is kept and audited.");
    const r = await setStaffActive(owner, { key: key(), userId: "u_trainer_aditya", active: false, reason: "Left the gym" });
    expect(r).toMatchObject({ status: "disabled", clients: before, repeated: false });
    expect((await err(getStaff(as("u_trainer_aditya")))).message).toBe("This account is switched off. Ask your gym owner to turn it back on.");
    expect(await db.trainerAssignments.where("trainerId").equals("u_trainer_aditya").filter((a) => a.effectiveTo === undefined).count()).toBe(before);
    expect((await db.auditEvents.where("action").equals("staff.change").toArray())[0]).toMatchObject({ reason: "Left the gym", details: { change: "switched off", name: "Aditya Rao", clients: before } });
    expect((await setStaffActive(owner, { key: key(), userId: "u_trainer_aditya", active: true, reason: "" })).status).toBe("active");
    expect((await db.users.get("u_trainer_aditya"))!.status).toBe("active");
  });

  it("you can’t switch yourself off, and a branch manager can switch off only whom they may manage", async () => {
    expect((await err(setStaffActive(owner, { key: key(), userId: "u_owner", active: false, reason: "Testing" }))).message).toBe("You can’t switch off your own account.");
    await grantRohit();
    expect((await setStaffActive(bm, { key: key(), userId: "u_desk_bandra", active: false, reason: "Left" })).status).toBe("disabled");
    expect((await err(setStaffActive(bm, { key: key(), userId: "u_trainer_meera", active: false, reason: "Left" }))).code).toBe("forbidden");
    expect((await err(setStaffActive(bm, { key: key(), userId: "u_finance", active: false, reason: "Left" }))).code).toBe("forbidden");
  });
});
