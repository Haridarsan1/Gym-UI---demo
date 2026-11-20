import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { checkInMember } from "@/api/checkin";
import { freezeMembership, setMembershipGrace } from "@/api/lifecycle";
import { getMemberProfile } from "@/api/memberProfile";
import { getPolicies, savePolicies } from "@/api/policyScreen";
import { getPlans, savePlan } from "@/api/plans";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { POLICY_DEFAULTS } from "@/domain/policies";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message, details: e.details } : { code: "other", message: String(e), details: undefined }; } return { code: "resolved", message: "", details: undefined }; };
const owner = as("u_owner");
const bm = as("u_bm_bandra");
const desk = as("u_desk_andheri");
let n = 0;
const key = () => `pol-key-${++n}-${Math.random().toString(36).slice(2)}`;
const stored = async () => (await db.gymPolicies.toArray())[0]!;

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("reading the policies", () => {
  it("gives the owner every value, the starting values and no history yet", async () => {
    const v = await getPolicies(owner);
    expect(v).toMatchObject({ canEdit: true, history: [], defaults: POLICY_DEFAULTS });
    expect(v.values).toEqual(POLICY_DEFAULTS);
    expect(Object.keys(v.values)).toHaveLength(Object.keys(await stored()).filter((k) => k !== "id" && k !== "tenantId").length);
  });

  it("a branch manager reads them and cannot change them; nobody else reads them", async () => {
    expect((await getPolicies(bm)).canEdit).toBe(false);
    expect((await err(savePolicies(bm, { key: key(), changes: { cancellationCutoffHours: 24 } }))).code).toBe("forbidden");
    expect((await stored()).cancellationCutoffHours).toBe(12);
    for (const id of ["u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun", "u_admin"]) expect((await err(getPolicies(as(id)))).code, id).toBe("forbidden");
  });

  it("a stored row that predates a setting reads as the gym’s starting value", async () => {
    const row = await stored();
    const { graceDays: _g, reminderGapDays: _r, ...old } = row;
    await db.gymPolicies.put(old as typeof row);
    expect((await getPolicies(owner)).values).toMatchObject({ graceDays: 0, reminderGapDays: 3 });
  });
});

describe("changing a policy", () => {
  it("saves what changed, writes one audit entry that says from and to, and shows it in the history", async () => {
    const r = await savePolicies(owner, { key: key(), changes: { cancellationCutoffHours: 24, noShowConsumesCredit: false, cancellationFeePaise: 100_000 }, reason: "Members asked for a day’s notice" });
    expect(r.changed.map((c) => [c.label, c.from, c.to])).toEqual([["Free cancellation until", "12 hours", "24 hours"], ["A no-show uses the credit", "Uses the credit", "Gives it back"], ["Cancellation fee", "₹500", "₹1,000"]]);
    expect(await stored()).toMatchObject({ cancellationCutoffHours: 24, noShowConsumesCredit: false, cancellationFeePaise: 100_000, sessionMinutes: 60 });
    const events = await db.auditEvents.where("action").equals("policy.change").toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: "u_owner", actorRole: "owner", reason: "Members asked for a day’s notice", entityType: "policy" });
    const v = await getPolicies(owner);
    expect(v.values.cancellationCutoffHours).toBe(24);
    expect(v.history).toHaveLength(1);
    expect(v.history[0]).toMatchObject({ by: DEMO_ACCOUNTS.find((a) => a.userId === "u_owner")!.name, role: "owner", reason: "Members asked for a day’s notice" });
    expect(v.history[0]!.changes).toHaveLength(3);
    // The branch manager sees the same history.
    expect((await getPolicies(bm)).history).toHaveLength(1);
  });

  it("the same form sent twice, or with nothing changed, writes nothing more", async () => {
    const k = key();
    await savePolicies(owner, { key: k, changes: { graceDays: 3 } });
    const again = await savePolicies(owner, { key: k, changes: { graceDays: 3 } });
    expect(again.repeated).toBe(true);
    expect(again.changed).toHaveLength(1);
    const same = await savePolicies(owner, { key: key(), changes: { graceDays: 3, sessionMinutes: 60 } });
    expect(same.changed).toEqual([]);
    expect(await db.auditEvents.where("action").equals("policy.change").count()).toBe(1);
  });

  it("refuses what is out of range or contradicts itself, in the setting’s own words, and changes nothing", async () => {
    expect((await err(savePolicies(owner, { key: key(), changes: { bookingHorizonDays: 90 } }))).message).toBe("Enter 1 to 60 days.");
    expect((await err(savePolicies(owner, { key: key(), changes: { graceDays: 2.5 } }))).message).toBe("Enter a whole number of days.");
    const clash = await err(savePolicies(owner, { key: key(), changes: { freezeMinDays: 40 } }));
    expect(clash.message).toBe("The shortest freeze can’t be longer than the longest. Lower this or raise the longest freeze.");
    expect((clash.details as { errors: Record<string, string> }).errors).toHaveProperty("freezeMinDays");
    expect((await err(savePolicies(owner, { key: key(), changes: { notASetting: 1 } }))).message).toBe("That setting isn’t one this gym has.");
    expect((await err(savePolicies(owner, { key: key(), changes: { partialPaymentsEnabled: 1 } }))).code).toBe("invalid");
    expect(await stored()).toMatchObject(POLICY_DEFAULTS);
    expect(await db.auditEvents.where("action").equals("policy.change").count()).toBe(0);
  });

  it("is in force the moment it is saved: the freeze limit the desk is held to follows it", async () => {
    const freeze = (to: string) => freezeMembership(desk, { memberId: "mem_arjun", from: "2026-11-17", to, reason: "Travel", key: key() });
    expect((await err(freeze("2026-12-31"))).message).toMatch(/at most 30 days/);
    await savePolicies(owner, { key: key(), changes: { freezeMaxDays: 60 } });
    expect((await err(freeze("2026-12-31"))).code).toBe("resolved");
  });
});

describe("grace after a membership ends", () => {
  /** Esha-like: a member whose membership has ended, checked at the desk the day after and a few days later. */
  const lapsed = async (planId: string, branchId = "br_andheri") => {
    const members = await db.members.where("homeBranchId").equals(branchId).toArray();
    for (const m of members) {
      const ms = (await db.memberships.where("memberId").equals(m.id).toArray()).find((x) => x.planId === planId && x.status === "active" && !x.id.includes("prior") && m.id !== "mem_arjun" && m.id !== "mem_priya");
      if (ms) return { member: m, ms };
    }
    throw new Error(`No member on ${planId}`);
  };
  const endedOn = async (id: string, endsOn: string) => db.memberships.update(id, { endsOn, graceUntil: undefined });
  const enter = (memberId: string, branchId = "br_andheri") => checkInMember(desk, { memberId, branchId, method: "desk", key: key() });

  it("the gym’s days, then the plan’s days as sold, then days set for one membership, each wins over the one before", async () => {
    const { member, ms } = await lapsed("pl_monthly");
    await endedOn(ms.id, "2026-11-10");
    // No grace: the day after it ended is turned away.
    expect((await enter(member.id)).reason).toBe("expired");
    // The gym gives 10 days: the 7th day after is in, and the profile says where it comes from.
    await savePolicies(owner, { key: key(), changes: { graceDays: 10 } });
    expect((await enter(member.id)).result).toBe("allowed");
    expect((await getMemberProfile(desk, member.id)).membership!.grace).toMatchObject({ days: 10, source: "gym", endsOn: "2026-11-20", gymDays: 10 });
    // This membership has 3 days (set at the desk): the 7th day after is now outside it.
    const r = await setMembershipGrace(desk, { memberId: member.id, graceDays: 3, reason: "Away on work", key: key() });
    expect(r).toMatchObject({ graceDays: 3, graceEndsOn: "2026-11-13", repeated: false });
    setNow(new Date("2026-11-18T06:30:00.000Z"));
    expect((await enter(member.id)).reason).toBe("expired");
    setNow(new Date("2026-11-13T06:30:00.000Z"));
    expect((await enter(member.id)).result).toBe("allowed");
    expect((await getMemberProfile(desk, member.id)).membership!.grace).toMatchObject({ days: 3, source: "membership", override: 3 });
    // Back to the usual: the gym’s 10 days again.
    await setMembershipGrace(desk, { memberId: member.id, graceDays: null, reason: "Back to normal", key: key() });
    expect((await getMemberProfile(desk, member.id)).membership!.grace).toMatchObject({ days: 10, source: "gym" });
  });

  it("a plan’s grace days are sold with the membership, so a later edit of the plan changes nobody who already bought", async () => {
    const annual = await lapsed("pl_annual");
    expect(annual.ms.terms.graceDays).toBe(7);
    await endedOn(annual.ms.id, "2026-11-10");
    setNow(new Date("2026-11-17T06:30:00.000Z"));
    expect((await enter(annual.member.id)).result).toBe("allowed");
    expect((await getMemberProfile(desk, annual.member.id)).membership!.grace).toMatchObject({ days: 7, source: "plan", planDays: 7, endsOn: "2026-11-17" });
    setNow(new Date("2026-11-18T06:30:00.000Z"));
    expect((await enter(annual.member.id)).reason).toBe("expired");
    // The owner lengthens the plan’s grace to 14. The membership already sold still has the 7 it was sold with.
    const plan = (await getPlans(owner)).plans.find((p) => p.id === "pl_annual")!;
    await savePlan(owner, { ...plan, planId: plan.id, key: key(), effectiveTo: null, graceDays: 14 });
    expect((await db.memberships.get(annual.ms.id))!.terms.graceDays).toBe(7);
    expect((await enter(annual.member.id)).reason).toBe("expired");
  });

  it("a new membership sold on a plan with grace days carries them", async () => {
    const { plan } = await savePlan(owner, { key: key(), name: "Quarterly with grace", kind: "time", pricePaise: 600_000, taxRateBp: 1800, durationDays: 90, graceDays: 5, branchIds: ["br_andheri"], effectiveFrom: "2026-11-17" });
    expect(plan.graceDays).toBe(5);
    const { registerMember } = await import("@/api/newMember");
    const r = await registerMember(desk, { key: key(), branchId: "br_andheri", member: { name: "Kabir Anand", phone: "98765 43210", gender: "male" }, consents: { photos: false, assessments: false, marketing: false, dataProcessing: true }, planId: plan.id });
    const ms = (await db.memberships.where("memberId").equals(r.memberId).toArray())[0]!;
    expect(ms.terms.graceDays).toBe(5);
  });

  it("changing one membership’s grace needs a reason, is audited, is once per key, and only the desk, managers and owner can", async () => {
    const { member, ms } = await lapsed("pl_monthly");
    expect((await err(setMembershipGrace(desk, { memberId: member.id, graceDays: 3, reason: "", key: key() }))).message).toBe("Say why the grace period is being changed. The reason is kept and audited.");
    expect((await err(setMembershipGrace(desk, { memberId: member.id, graceDays: 31, reason: "Long trip", key: key() }))).message).toBe("Enter 0 to 30 days.");
    const k = key();
    await setMembershipGrace(desk, { memberId: member.id, graceDays: 4, reason: "Waiting for salary", key: k });
    expect((await setMembershipGrace(desk, { memberId: member.id, graceDays: 4, reason: "Waiting for salary", key: k })).repeated).toBe(true);
    const e = await db.auditEvents.where("action").equals("membership.grace").toArray();
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ actorId: "u_desk_andheri", memberId: member.id, entityId: ms.id, reason: "Waiting for salary", details: { from: { graceDays: null }, to: { graceDays: 4 } } });
    expect((await err(setMembershipGrace(as("u_finance"), { memberId: member.id, graceDays: 2, reason: "Because", key: key() }))).code).toBe("forbidden");
    expect((await err(setMembershipGrace(as("u_desk_powai"), { memberId: member.id, graceDays: 2, reason: "Because", key: key() }))).code).toBe("not_found");
  });
});
