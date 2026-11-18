import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { closeGoal, confirmGoalAchieved, createGoal, getAssessment, reviseGoal, saveAssessment, type AssessmentInput } from "@/api/assessments";
import { isApiError } from "@/api/errors";
import { viewSensitive } from "@/api/sensitive";
import { db } from "@/demo/db";
import { resetDemo } from "@/demo";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? `${e.code}:${e.message}` : "other";
  }
  return "resolved";
};
const input = (memberId: string, over: Partial<AssessmentInput> = {}): AssessmentInput => ({
  memberId, experience: "new", availability: { days: [1, 3], time: "morning" }, preferences: "Short sessions.", restrictions: "", baseline: { weightKg: 70 }, ...over,
});

beforeAll(() => setNow(new Date("2026-11-17T06:30:00.000Z")));
afterAll(() => setNow(null));
beforeEach(async () => {
  await resetDemo();
});

describe("Assessment", () => {
  it("shows Arjun’s two assessments, newest first, with who recorded them, and audits the view", async () => {
    const v = await getAssessment(as("u_trainer_meera"), "mem_arjun");
    expect(v.state).toBe("recorded");
    expect(v.assessments.map((a) => a.recordedOn)).toEqual(["2026-10-20", "2026-08-25"]);
    expect(v.assessments[0]).toMatchObject({ recordedByName: "Meera Joshi", experience: "some", baseline: { weightKg: 80.6 } });
    const audit = (await db.auditEvents.toArray()).filter((a) => a.action === "assessment.view" && a.memberId === "mem_arjun");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: "u_trainer_meera", entityType: "assessment" });
    await getAssessment(as("u_trainer_meera"), "mem_arjun");
    expect((await db.auditEvents.toArray()).filter((a) => a.action === "assessment.view")).toHaveLength(2); // repeat views are audited too
  });

  it("says there is none yet when the member has agreed but nothing is recorded (Sneha)", async () => {
    const v = await getAssessment(as("u_trainer_meera"), "mem_sneha");
    expect(v).toMatchObject({ state: "none", assessments: [] });
  });

  it("records a new assessment, keeps the older ones, and audits it", async () => {
    const saved = await saveAssessment(as("u_trainer_meera"), input("mem_sneha", { experience: "some", yearsTraining: 2, restrictions: "Tight hamstrings.", baseline: { weightKg: 61.5, waistCm: 74 } }));
    expect(saved).toMatchObject({ memberId: "mem_sneha", recordedOn: "2026-11-17", recordedByName: "Meera Joshi", restrictions: "Tight hamstrings." });
    const again = await saveAssessment(as("u_trainer_meera"), input("mem_arjun", { experience: "experienced" }));
    const v = await getAssessment(as("u_trainer_meera"), "mem_arjun");
    expect(v.assessments).toHaveLength(3);
    expect(v.assessments[0]!.id).toBe(again.id);
    expect((await db.auditEvents.toArray()).some((a) => a.entityType === "assessment" && a.action === "record.edit")).toBe(true);
  });

  it("checks what is entered", async () => {
    expect(await code(saveAssessment(as("u_trainer_meera"), input("mem_sneha", { availability: { days: [], time: "any" } })))).toMatch(/^invalid:Choose at least one day/);
    expect(await code(saveAssessment(as("u_trainer_meera"), input("mem_sneha", { baseline: { bodyFatPct: 90 } })))).toMatch(/^invalid:Body fat looks too high/);
    expect(await code(saveAssessment(as("u_trainer_meera"), input("mem_sneha", { yearsTraining: -1 })))).toMatch(/^invalid:Years can’t be negative/);
  });

  it("hides every assessment and refuses a new one once the member withdraws consent, for the trainer too", async () => {
    // Farah trains Rahul, whose consent was withdrawn nine days ago.
    const v = await getAssessment(as("u_trainer_farah"), "mem_rahul");
    expect(v).toMatchObject({ state: "consent_withdrawn", consentChangedOn: "2026-11-08", assessments: [] });
    expect(await db.assessments.where("memberId").equals("mem_rahul").count()).toBe(1); // kept, not deleted
    expect(await code(saveAssessment(as("u_trainer_farah"), input("mem_rahul")))).toMatch(/^forbidden:Assessment consent withdrawn/);
    expect(await code(viewSensitive(as("u_trainer_farah"), { kind: "assessment", memberId: "mem_rahul", entityId: "as_mem_rahul_1" }))).toMatch(/^forbidden:Assessment consent withdrawn/);
    // Nothing was audited as a view.
    expect((await db.auditEvents.toArray()).some((a) => a.action === "assessment.view" && a.memberId === "mem_rahul")).toBe(false);
    // The member can still read their own.
    await viewSensitive(as("u_member_rahul"), { kind: "assessment", memberId: "mem_rahul", entityId: "as_mem_rahul_1" });
  });

  it("follows the consent as it changes: withdraw, then agree again", async () => {
    await db.consents.update("cn_mem_arjun_assessments", { withdrawnAt: "2026-11-17T05:00:00.000Z" });
    expect((await getAssessment(as("u_trainer_meera"), "mem_arjun")).state).toBe("consent_withdrawn");
    await db.consents.add({ id: "cn_again", tenantId: "t_pulse", memberId: "mem_arjun", scope: "assessments", grantedAt: "2026-11-17T06:00:00.000Z", noticeVersion: "2026-01", recordedBy: "u_member_arjun" });
    const back = await getAssessment(as("u_trainer_meera"), "mem_arjun");
    expect(back.state).toBe("recorded");
    expect(back.assessments).toHaveLength(2);
  });

  it("refuses when the member never agreed", async () => {
    const consents = await db.consents.where("memberId").equals("mem_sneha").toArray();
    await db.consents.bulkDelete(consents.filter((c) => c.scope === "assessments").map((c) => c.id));
    expect((await getAssessment(as("u_trainer_meera"), "mem_sneha")).state).toBe("no_consent");
    expect(await code(saveAssessment(as("u_trainer_meera"), input("mem_sneha")))).toMatch(/^forbidden:This member hasn’t agreed/);
  });

  it("only the assigned trainer can read or write one", async () => {
    expect(await code(getAssessment(as("u_trainer_kavya"), "mem_arjun"))).toMatch(/^not_found/);
    expect(await code(saveAssessment(as("u_trainer_kavya"), input("mem_arjun")))).toMatch(/^forbidden|not_found/);
    expect(await code(getAssessment(as("u_member_arjun"), "mem_arjun"))).toMatch(/^forbidden/);
    expect(await code(getAssessment(as("u_desk_andheri"), "mem_arjun"))).toMatch(/^forbidden/);
  });
});

describe("Goals", () => {
  const goal = (over = {}) => ({ memberId: "mem_arjun", title: "Squat 80 kg", metric: "squat", baseline: 77.5, target: 80, targetDate: "2027-02-01", reviewEveryDays: 14, ...over });

  it("sets a goal with a target date and its own review cadence, which then drives the dashboard", async () => {
    const id = await createGoal(as("u_trainer_meera"), goal());
    const g = await db.goals.get(id);
    expect(g).toMatchObject({ title: "Squat 80 kg", unit: "kg", status: "active", reviewEveryDays: 14, createdBy: "u_trainer_meera" });
    expect(g!.history[0]!.note).toBe("Goal set.");
    const v = await getAssessment(as("u_trainer_meera"), "mem_arjun");
    expect(v.goals.map((x) => x.title)).toContain("Squat 80 kg");
    expect(v.readings.weight).toBe(79.1);
  });

  it("checks the goal: a name, a known metric, a future date, a sensible cadence", async () => {
    expect(await code(createGoal(as("u_trainer_meera"), goal({ title: " " })))).toMatch(/^invalid:Give the goal a name/);
    expect(await code(createGoal(as("u_trainer_meera"), goal({ metric: "vibes" })))).toMatch(/^invalid:Choose what the goal measures/);
    expect(await code(createGoal(as("u_trainer_meera"), goal({ targetDate: "2026-11-17" })))).toMatch(/^invalid:The target date must be after today/);
    expect(await code(createGoal(as("u_trainer_meera"), goal({ reviewEveryDays: 3 })))).toMatch(/^invalid/);
  });

  it("revises a goal by keeping the old one as Revised, with the reason, and starting a new active one", async () => {
    const old = (await db.goals.where("memberId").equals("mem_arjun").toArray()).find((g) => g.status === "active")!;
    const nextId = await reviseGoal(as("u_trainer_meera"), { ...goal({ title: "Reach 77 kg", metric: "weight", baseline: 82.4, target: 77, targetDate: "2027-03-01" }), goalId: old.id, reason: "He is ahead of plan" });
    const oldAfter = await db.goals.get(old.id);
    expect(oldAfter!.status).toBe("revised");
    expect(oldAfter!.history.at(-1)!.note).toBe("Revised: He is ahead of plan");
    const next = await db.goals.get(nextId);
    expect(next).toMatchObject({ status: "active", target: 77 });
    expect(next!.history[0]!.note).toContain(`Revised from “${old.title}”`);
    expect(await code(reviseGoal(as("u_trainer_meera"), { ...goal(), goalId: old.id, reason: "again" }))).toMatch(/^conflict/);
    expect(await code(reviseGoal(as("u_trainer_meera"), { ...goal(), goalId: nextId, reason: " " }))).toMatch(/^invalid:Say why/);
  });

  it("closes a goal with a reason, and keeps it", async () => {
    const id = await createGoal(as("u_trainer_meera"), goal());
    await closeGoal(as("u_trainer_meera"), { memberId: "mem_arjun", goalId: id, reason: "Changed focus" });
    expect((await db.goals.get(id))!.status).toBe("closed");
    expect(await code(closeGoal(as("u_trainer_meera"), { memberId: "mem_arjun", goalId: id, reason: "again" }))).toMatch(/^conflict/);
  });

  it("is confirmed as achieved only by the trainer, awards the badge once, and repeating changes nothing", async () => {
    const id = await createGoal(as("u_trainer_meera"), goal());
    expect((await db.badgeAwards.where("memberId").equals("mem_arjun").toArray()).some((b) => b.badge === "goal_achieved")).toBe(true); // Arjun already earned it from the seed
    await db.badgeAwards.where("memberId").equals("mem_arjun").filter((b) => b.badge === "goal_achieved").delete();
    await confirmGoalAchieved(as("u_trainer_meera"), { memberId: "mem_arjun", goalId: id, note: "80 kg for three sets" });
    const g = await db.goals.get(id);
    expect(g!.status).toBe("achieved");
    expect(g!.history.at(-1)!.note).toBe("Achieved: 80 kg for three sets");
    expect((await db.badgeAwards.where("memberId").equals("mem_arjun").toArray()).filter((b) => b.badge === "goal_achieved")).toHaveLength(1);
    await confirmGoalAchieved(as("u_trainer_meera"), { memberId: "mem_arjun", goalId: id });
    expect((await db.goals.get(id))!.history).toHaveLength(2);
    expect(await code(confirmGoalAchieved(as("u_member_arjun"), { memberId: "mem_arjun", goalId: id }))).toMatch(/^forbidden/);
  });

  it("is for the assigned trainer only", async () => {
    expect(await code(createGoal(as("u_trainer_kavya"), goal()))).toMatch(/^forbidden|not_found/);
    expect(await code(createGoal(as("u_member_arjun"), goal()))).toMatch(/^forbidden/);
  });
});
