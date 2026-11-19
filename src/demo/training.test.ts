import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { listClients } from "@/api/clients";
import { getRefunds } from "@/api/refunds";
import { getToday } from "@/api/member";
import { getCalendar } from "@/api/deskBookings";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { generateFullSeed } from "@/demo/fullSeed";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const NOW = new Date("2026-11-17T06:30:00.000Z");
const TABLES = ["exercises", "programTemplates", "workoutPlanVersions", "workoutLogs", "goals", "measurements", "trainerReviews", "memberSettings", "badgeAwards", "assessments"] as const;
const counts = async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await db.table(t).count()])));

beforeEach(async () => { setNow(NOW); await resetDemo({ training: false }); });
afterAll(() => setNow(null));

describe("the training half of the gym is built for the people who read it", () => {
  it("the front desk and finance work all day without any of it being built", async () => {
    await getRefunds(as("u_finance"));
    await getCalendar(as("u_desk_andheri"), { branchId: "br_andheri", date: "2026-11-19" });
    expect(Object.values(await counts()).every((n) => n === 0)).toBe(true);
    // The desk still sees everything it needs: PT bookings, credits and check-ins come with the main seed.
    expect(await db.bookings.count()).toBeGreaterThan(0);
    expect(await db.checkIns.count()).toBeGreaterThan(0);
  });

  it("a trainer’s first call builds it once, and a member’s call finds it there", async () => {
    await listClients(as("u_trainer_meera"));
    const first = await counts();
    expect(first.exercises).toBeGreaterThan(20);
    expect(first.workoutLogs).toBeGreaterThan(100);
    await getToday(as("u_member_arjun"));
    expect(await counts()).toEqual(first);
  });

  it("built apart it is the same gym as the whole seed in one piece, on the same day", async () => {
    await listClients(as("u_trainer_meera"));
    const whole = generateFullSeed(NOW);
    for (const t of TABLES) {
      const stored = (await db.table(t).toArray()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const expected = [...(whole as unknown as Record<string, Array<{ id: string }>>)[t]!].sort((a, b) => a.id.localeCompare(b.id));
      expect(stored, t).toEqual(expected);
    }
  });

  it("the check-ins the desk sees line up with the workouts the member logged", async () => {
    await getToday(as("u_member_arjun"));
    const logs = (await db.workoutLogs.where("memberId").equals("mem_arjun").toArray()).filter((l) => l.status !== "skipped");
    const dates = new Set((await db.checkIns.where("memberId").equals("mem_arjun").toArray()).map((c) => c.at));
    for (const l of logs) expect(dates.has(new Date(Date.parse(l.startedAt!) - 8 * 60_000).toISOString()), l.scheduledOn).toBe(true);
  });
});

describe("members registered after the demo began", () => {
  it("get no history made up for them when the training half is built later", async () => {
    const { registerMember } = await import("@/api/newMember");
    const r = await registerMember(as("u_desk_andheri"), { key: "train-late-1", branchId: "br_andheri", member: { name: "Late Joiner", phone: "9876509999" }, consents: { photos: false, assessments: true, marketing: false, dataProcessing: true }, planId: "pl_monthly_plus", payment: { method: "cash", amountPaise: 413_000 }, trainer: { trainerId: "u_trainer_meera", effectiveOn: "2026-11-17" } });
    await listClients(as("u_trainer_meera"));
    for (const t of ["workoutPlanVersions", "workoutLogs", "goals", "trainerReviews", "assessments"] as const) expect((await db.table(t).toArray()).filter((x) => x.memberId === r.memberId), t).toHaveLength(0);
    expect(await db.users.get(`u_${r.memberId}`)).toMatchObject({ role: "member", memberId: r.memberId, status: "active" });
  });
});
