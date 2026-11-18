import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getTrainerToday } from "@/api/trainer";
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

describe("Trainer Today: Coach Meera", () => {
  it("greets by first name and counts her active and frozen clients", async () => {
    const t = await getTrainerToday(as("u_trainer_meera"));
    expect(t).toMatchObject({ firstName: "Meera", gymName: "Pulse Fitness", today: "2026-11-17" });
    expect(t.clients).toBeGreaterThanOrEqual(10);
  });

  it("lists her four sessions today in order, one done, with the next marked", async () => {
    const t = await getTrainerToday(as("u_trainer_meera"));
    expect(t.sessions.map((s) => s.phase)).toEqual(["done", "next", "later", "later"]);
    expect(t.sessions.map((s) => s.status)).toEqual(["attended", "booked", "booked", "booked"]);
    expect(t.sessions.map((s) => s.startsAt)).toEqual([...t.sessions.map((s) => s.startsAt)].sort());
    expect(new Set(t.sessions.map((s) => s.memberId)).size).toBe(4);
    for (const s of t.sessions) expect(s.name).toMatch(/\w+ \w+/);
  });

  it("flags overdue reviews with the longest wait first, each with a reason", async () => {
    const t = await getTrainerToday(as("u_trainer_meera"));
    expect(t.overdueReviews.length).toBeGreaterThan(0);
    const days = t.overdueReviews.map((r) => r.daysOver);
    expect(days).toEqual([...days].sort((a, b) => b - a));
    for (const r of t.overdueReviews) {
      expect(r.daysOver).toBeGreaterThan(0);
      expect(["Follow-up date has passed", "Four weeks since the last review", "No review yet"]).toContain(r.reason);
    }
  });

  it("lists clients who missed two or more workouts in the last week, and nobody who is only a little behind", async () => {
    const t = await getTrainerToday(as("u_trainer_meera"));
    expect(t.missed.length).toBeGreaterThan(0);
    for (const m of t.missed) {
      expect(m.missed).toBeGreaterThanOrEqual(2);
      expect(m.lastMissedOn! < t.today).toBe(true);
    }
  });

  it("lists active clients with no plan yet as awaiting a plan, Sneha among them, and never a client who has one", async () => {
    const t = await getTrainerToday(as("u_trainer_meera"));
    const sneha = t.awaitingPlan.find((a) => a.name === "Sneha Patil");
    expect(sneha).toMatchObject({ planName: "10-visit pass" });
    expect(t.awaitingPlan.some((a) => a.name === "Arjun Kumar")).toBe(false);
    expect(t.awaitingPlan.some((a) => t.missed.some((m) => m.memberId === a.memberId))).toBe(false);
  });

  it("shows Arjun as on track: a plan, a review from yesterday, and nothing missed", async () => {
    const t = await getTrainerToday(as("u_trainer_meera"));
    const arjun = "mem_arjun";
    expect(t.overdueReviews.some((r) => r.memberId === arjun)).toBe(false);
    expect(t.missed.some((r) => r.memberId === arjun)).toBe(false);
    expect(t.awaitingPlan.some((r) => r.memberId === arjun)).toBe(false);
  });

  it("shows only the caller’s own clients: another trainer gets a different list", async () => {
    const meera = await getTrainerToday(as("u_trainer_meera"));
    const kavya = await getTrainerToday(as("u_trainer_kavya"));
    const ids = (t: typeof meera) => new Set([...t.sessions, ...t.overdueReviews, ...t.missed, ...t.awaitingPlan, ...t.expiring].map((x) => x.memberId));
    for (const id of ids(kavya)) expect(ids(meera).has(id)).toBe(false);
  });

  it("only offers the dashboard to trainers", async () => {
    expect(await code(getTrainerToday(as("u_member_arjun")))).toBe("forbidden");
    expect(await code(getTrainerToday(as("u_desk_andheri")))).toBe("forbidden");
    expect(await code(getTrainerToday(as("u_owner")))).toBe("forbidden");
    expect(await code(getTrainerToday(null))).toBe("unauthenticated");
  });
});
