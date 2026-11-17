import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getToday } from "@/api/member";
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

// 12:00 noon in India on 17 Nov 2026, a Tuesday.
beforeAll(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("Today: Arjun Kumar (a workout today)", () => {
  it("shows today’s workout from the new plan, with a streak, a ring and credits", async () => {
    const t = await getToday(as("u_member_arjun"));
    expect(t).toMatchObject({ firstName: "Arjun", gymName: "Pulse Fitness", today: "2026-11-17", trainerName: "Meera Joshi" });
    expect(t.plan).toMatchObject({ state: "workout", title: "Upper body and core", versionNumber: 2, versionName: "Strength and size block", newPlan: true, weekNumber: 2, exerciseCount: 5 });
    expect(t.plan.state === "workout" && t.plan.logStatus).toBeUndefined();
    expect(t.plan.state === "workout" && t.plan.minutes).toBeGreaterThanOrEqual(25);
    expect(t.streakWeeks).toBeGreaterThanOrEqual(5);
    expect(t.streakPaused).toBe(false);
    expect(t.week).toEqual({ planned: 4, done: 0 });
    expect(t.credits).toEqual({ available: 5, reserved: 1, consumed: 2 });
  });

  it("shows the membership: active Monthly Plus with days left", async () => {
    const t = await getToday(as("u_member_arjun"));
    expect(t.membership).toMatchObject({ status: "active", planName: "Monthly Plus", daysLeft: 21, visitsRemaining: null });
  });

  it("shows the next booking with the exact free-cancellation deadline", async () => {
    const t = await getToday(as("u_member_arjun"));
    expect(t.nextBooking).toMatchObject({ trainerName: "Meera Joshi", branchName: "Andheri", startsAt: "2026-11-19T12:30:00.000Z", freeUntil: "2026-11-19T00:30:00.000Z", lateConsumesCredit: true });
  });

  it("shows the unread review, and no dues", async () => {
    const t = await getToday(as("u_member_arjun"));
    expect(t.newReview?.trainerName).toBe("Meera Joshi");
    expect(t.newReview?.excerpt).toMatch(/^New plan is live from/);
    expect(t.dues).toBeUndefined();
  });

  it("stops showing the review once it has been read", async () => {
    const r = await db.trainerReviews.filter((x) => x.memberId === "mem_arjun" && x.kind === "shared_review" && !x.readByMemberAt).first();
    await db.trainerReviews.update(r!.id, { readByMemberAt: "2026-11-17T06:00:00.000Z" });
    expect((await getToday(as("u_member_arjun"))).newReview).toBeUndefined();
    await db.trainerReviews.update(r!.id, { readByMemberAt: undefined });
  });

  it("reports a started workout as a draft, and a finished one by its status", async () => {
    const base = { id: "wl_mem_arjun_2026-11-17", tenantId: "t_pulse", memberId: "mem_arjun", planVersionId: "wpv_mem_arjun_2", weekIndex: 1, dayIndex: 3, scheduledOn: "2026-11-17", entries: [], enteredBy: "u_member_arjun", enteredByRole: "member" as const, corrections: [], idempotencyKey: "draft-key-1234" };
    await db.workoutLogs.put({ ...base, status: "draft" });
    expect((await getToday(as("u_member_arjun"))).plan).toMatchObject({ state: "workout", logStatus: "draft" });
    await db.workoutLogs.put({ ...base, status: "completed" });
    const t = await getToday(as("u_member_arjun"));
    expect(t.plan).toMatchObject({ logStatus: "completed" });
    expect(t.week.done).toBe(1);
    await db.workoutLogs.delete(base.id);
  });
});

describe("Today: other states", () => {
  it("Priya: a rest day with the next workout named, and an overdue invoice", async () => {
    const t = await getToday(as("u_member_priya"));
    expect(t.plan).toMatchObject({ state: "rest", versionName: "Getting started" });
    expect(t.plan.state === "rest" && t.plan.next?.date).toBe("2026-11-18");
    expect(t.dues).toMatchObject({ totalPaise: 295_000, overdue: true, overdueDays: 4 });
    expect(t.newReview).toBeUndefined();
  });

  it("Rahul: a frozen membership with the date it ends, and the streak paused", async () => {
    const t = await getToday(as("u_member_rahul"));
    expect(t.membership).toMatchObject({ status: "frozen", frozenUntil: "2026-11-29" });
    expect(t.streakPaused).toBe(true);
  });

  it("Sneha: a trainer but no plan, and visits left on a visit pass", async () => {
    const t = await getToday(as("u_member_sneha"));
    expect(t.plan).toEqual({ state: "no_plan" });
    expect(t.trainerName).toBe("Meera Joshi");
    expect(t.membership).toMatchObject({ planName: "10-visit pass", visitsRemaining: 4 });
    expect(t.streakWeeks).toBe(0);
    expect(t.week).toEqual({ planned: 0, done: 0 });
    expect(t.credits).toEqual({ available: 0, reserved: 0, consumed: 0 });
  });

  it("an expired membership still opens, with its status", async () => {
    await db.memberships.update("ms_mem_sneha", { status: "expired", endsOn: "2026-11-10" });
    expect((await getToday(as("u_member_sneha"))).membership).toMatchObject({ status: "expired", daysLeft: -7 });
  });
});

describe("Today: who may ask", () => {
  it("refuses staff and signed-out callers, and a forged member id gives only the caller’s own data", async () => {
    expect(await code(getToday(as("u_owner")))).toBe("forbidden");
    expect(await code(getToday(as("u_trainer_meera")))).toBe("forbidden");
    expect(await code(getToday(null))).toBe("unauthenticated");
    const forged: Session = { ...as("u_member_priya"), memberId: "mem_arjun" };
    expect((await getToday(forged)).firstName).toBe("Priya");
  });
});
