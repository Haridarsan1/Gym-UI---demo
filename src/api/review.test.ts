import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { confirmGoalAchieved } from "@/api/assessments";
import { listClients } from "@/api/clients";
import { getReviews } from "@/api/progress";
import { getReview, saveReview } from "@/api/review";
import { getTrainerToday } from "@/api/trainer";
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
    return isApiError(e) ? e.code : "other";
  }
  return "resolved";
};
const meera = as("u_trainer_meera");
const farah = as("u_trainer_farah");
const arjun = as("u_member_arjun");

beforeAll(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("the review", () => {
  it("gives adherence, trends, the member’s latest check-in, goals and the review that is due", async () => {
    const r = await getReview(meera, "mem_arjun");
    expect(r).toMatchObject({ name: "Arjun Kumar", firstName: "Arjun", today: "2026-11-17" });
    expect(r.adherence.scheduled).toBeGreaterThan(0);
    expect(r.weeks.length).toBeGreaterThan(3);
    // Arjun has twelve weeks of weigh-ins and lifts.
    const weight = r.trends.find((t) => t.key === "weight")!;
    expect(weight.unit).toBe("kg");
    expect(weight.points.length).toBeGreaterThan(5);
    expect(weight.summary!.latest.date >= weight.summary!.baseline.date).toBe(true);
    expect(r.trends.some((t) => t.key.startsWith("lift-"))).toBe(true);
    expect(r.checkin).toMatchObject({ effort: 7, recovery: 4, obstacles: "Work travel on Thursday." });
    expect(r.goals.length).toBeGreaterThan(0);
    expect(r.history.every((n) => n.kind !== "member_checkin")).toBe(true);
  });

  it("only the client’s own trainer can open it", async () => {
    expect(await code(getReview(farah, "mem_arjun"))).toBe("not_found");
    expect(await code(getReview(arjun, "mem_arjun"))).toBe("forbidden");
    expect(await code(getReview(as("u_desk_andheri"), "mem_arjun"))).toBe("forbidden");
  });
});

describe("shared feedback and private notes", () => {
  it("shared feedback reaches the client; a private note never does", async () => {
    const shared = await saveReview(meera, { memberId: "mem_arjun", kind: "shared_review", body: "Bench is moving well. Keep the same loads this week.", key: "rev-shared-1" });
    const priv = await saveReview(meera, { memberId: "mem_arjun", kind: "private_note", body: "Mention his shoulder at the next session.", key: "rev-private-1" });
    expect(shared.repeated).toBe(false);
    const seen = await getReviews(arjun);
    expect(seen.reviews.map((r) => r.id)).toContain(shared.id);
    expect(seen.reviews.find((r) => r.id === shared.id)).toMatchObject({ unread: true, trainerName: "Meera Joshi" });
    expect(seen.reviews.map((r) => r.id)).not.toContain(priv.id);
    expect(JSON.stringify(seen)).not.toContain("shoulder");
    // The trainer sees both in the history.
    const r = await getReview(meera, "mem_arjun");
    expect(r.history.map((n) => n.id)).toEqual(expect.arrayContaining([shared.id, priv.id]));
    expect(r.history.find((n) => n.id === priv.id)!.kind).toBe("private_note");
  });

  it("writing it twice with the same key makes one", async () => {
    const a = await saveReview(meera, { memberId: "mem_arjun", kind: "shared_review", body: "Same text", key: "rev-twice-1" });
    const b = await saveReview(meera, { memberId: "mem_arjun", kind: "shared_review", body: "Same text", key: "rev-twice-1" });
    expect(b).toMatchObject({ id: a.id, repeated: true });
    expect((await db.trainerReviews.where("memberId").equals("mem_arjun").toArray()).filter((r) => r.id === a.id)).toHaveLength(1);
  });

  it("checks the text and the follow-up date, and says what is wrong", async () => {
    expect(await code(saveReview(meera, { memberId: "mem_arjun", kind: "shared_review", body: " ", key: "rev-bad-0001" }))).toBe("invalid");
    expect(await code(saveReview(meera, { memberId: "mem_arjun", kind: "shared_review", body: "ok then", followUpOn: "2026-11-17", key: "rev-bad-0002" }))).toBe("invalid");
    expect(await code(saveReview(meera, { memberId: "mem_arjun", kind: "shared_review", body: "ok then", followUpOn: "2028-01-01", key: "rev-bad-0003" }))).toBe("invalid");
    expect(await code(saveReview(meera, { memberId: "mem_arjun", kind: "private_note", body: "ok then", followUpOn: "2026-12-01", key: "rev-bad-0004" }))).toBe("invalid");
  });

  it("another trainer cannot review someone else’s client, and a member cannot write one", async () => {
    expect(await code(saveReview(farah, { memberId: "mem_arjun", kind: "shared_review", body: "Hello there", key: "rev-other-01" }))).toBe("not_found");
    expect(await code(saveReview(arjun, { memberId: "mem_arjun", kind: "shared_review", body: "Hello there", key: "rev-other-02" }))).toBe("forbidden");
  });

  it("a follow-up date becomes the next review date and clears the overdue flag until then", async () => {
    const overdue = (await getTrainerToday(meera)).overdueReviews[0]!;
    expect(overdue.daysOver).toBeGreaterThan(0);
    const before = await getReview(meera, overdue.memberId);
    expect(before.due?.overdue).toBe(true);
    await saveReview(meera, { memberId: overdue.memberId, kind: "shared_review", body: "Let’s look again in ten days.", followUpOn: "2026-11-27", key: "rev-follow-01" });
    const after = await getReview(meera, overdue.memberId);
    expect(after.due).toMatchObject({ overdue: false, dueOn: "2026-11-27", reason: "Follow-up date has passed" });
    expect(after.lastShared).toMatchObject({ followUpOn: "2026-11-27" });
    expect((await getTrainerToday(meera)).overdueReviews.map((r) => r.memberId)).not.toContain(overdue.memberId);
    // A private note is not a review: it does not move the date.
    await saveReview(meera, { memberId: overdue.memberId, kind: "private_note", body: "Quiet note.", key: "rev-follow-02" });
    expect((await getReview(meera, overdue.memberId)).due?.dueOn).toBe("2026-11-27");
  });
});

describe("confirming a goal", () => {
  async function reachedClient() {
    for (const c of await listClients(meera)) {
      const r = await getReview(meera, c.memberId);
      const g = r.goals.find((x) => x.canConfirm);
      if (g) return { memberId: c.memberId, goal: g };
    }
    throw new Error("No client with a reached goal in the demo");
  }

  it("only goals showing Target reached can be confirmed, and the member cannot confirm", async () => {
    const { memberId, goal } = await reachedClient();
    expect(goal).toMatchObject({ status: "active", targetReached: true, canConfirm: true });
    expect(await code(confirmGoalAchieved(as("u_member_arjun"), { memberId, goalId: goal.id }))).toBe("forbidden");
    // A goal that is not at its target is not offered.
    const r = await getReview(meera, memberId);
    for (const g of r.goals) expect(g.canConfirm).toBe(g.status === "active" && g.targetReached);
  });

  it("awards the Goal achieved badge once, however many times it is confirmed, and audits it", async () => {
    const { memberId, goal } = await reachedClient();
    await confirmGoalAchieved(meera, { memberId, goalId: goal.id, note: "Seen it in the gym." });
    await confirmGoalAchieved(meera, { memberId, goalId: goal.id });
    const badges = (await db.badgeAwards.where("memberId").equals(memberId).toArray()).filter((b) => b.badge === "goal_achieved");
    expect(badges).toHaveLength(1);
    const g = (await db.goals.get(goal.id))!;
    expect(g.status).toBe("achieved");
    expect(g.history.filter((h) => h.note.startsWith("Achieved"))).toHaveLength(1);
    const events = (await db.auditEvents.where("action").equals("goal.confirm").toArray()).filter((e) => e.entityId === goal.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: "u_trainer_meera", memberId, details: { badgeAwarded: true } });
    // The review no longer offers it.
    expect((await getReview(meera, memberId)).goals.find((x) => x.id === goal.id)).toMatchObject({ status: "achieved", canConfirm: false });
  });

  it("a second achieved goal for the same client does not award a second badge", async () => {
    // The client confirmed above already has the badge; a second goal of theirs, confirmed, must not award another.
    const have = (await db.badgeAwards.toArray()).filter((b) => b.badge === "goal_achieved").map((b) => b.memberId);
    const target = have[0]!;
    await db.goals.add({ id: "goal_extra_1", tenantId: "t_pulse", memberId: target, title: "Extra goal", metric: "sessions_per_week", unit: "sessions", baseline: 1, target: 3, targetDate: "2027-01-31", reviewEveryDays: 28, status: "active", history: [], createdBy: "u_trainer_meera", createdAt: "2026-11-17T00:00:00.000Z" });
    await confirmGoalAchieved(meera, { memberId: target, goalId: "goal_extra_1" });
    expect((await db.badgeAwards.where("memberId").equals(target).toArray()).filter((b) => b.badge === "goal_achieved")).toHaveLength(1);
  });
});
