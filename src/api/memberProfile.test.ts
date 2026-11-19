import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getMemberProfile } from "@/api/memberProfile";
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

beforeAll(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("the member profile for the desk and finance", () => {
  it("gives the membership, what can be done, billing, credits, check-ins, messages and the trainer", async () => {
    const p = await getMemberProfile(as("u_desk_andheri"), "mem_arjun");
    expect(p.member).toMatchObject({ name: "Arjun Kumar", branchName: "Andheri", sharing: [] });
    expect(p.membership).toMatchObject({ planName: "Monthly Plus", status: "active", kind: "time" });
    expect(p.actions.freeze.allowed).toBe(true);
    expect(p.actions.unfreeze).toMatchObject({ allowed: false });
    expect(p.actions.changePlan.allowed).toBe(true);
    expect(p.invoices.length).toBeGreaterThan(0);
    expect(p.invoices[0]!.number).toMatch(/^PFAND\/26-27\/\d{4}$/);
    expect(p.credits.balance.available).toBe(5);
    expect(p.trainer.current).toMatchObject({ name: "Meera Joshi" });
    expect(p.rules).toMatchObject({ freezeMinDays: 7, freezeMaxDays: 30 });
  });

  it("shows who shares a phone number, and an open renewal invoice that holds back a plan change", async () => {
    const meena = await getMemberProfile(as("u_desk_andheri"), "mem_040");
    expect(meena.member.sharing).toEqual([{ id: "mem_041", name: "Aarav Ramaswamy" }]);
    const priya = await getMemberProfile(as("u_desk_andheri"), "mem_priya");
    expect(priya.dues.totalPaise).toBeGreaterThan(0);
    expect(priya.actions.changePlan).toMatchObject({ allowed: false });
  });

  it("holds no health information at all", async () => {
    const p = await getMemberProfile(as("u_desk_andheri"), "mem_arjun");
    expect(JSON.stringify(p)).not.toMatch(/assessment|photo|restriction|private_note|bodyFat|restingHr/i);
  });

  it("finance sees any branch; the desk only its own; members and trainers none", async () => {
    expect((await getMemberProfile(as("u_finance"), "mem_rahul")).member.branchName).toBe("Bandra");
    expect(await code(getMemberProfile(as("u_desk_andheri"), "mem_rahul"))).toBe("not_found");
    expect(await code(getMemberProfile(as("u_member_arjun"), "mem_arjun"))).toBe("forbidden");
    expect(await code(getMemberProfile(as("u_trainer_meera"), "mem_arjun"))).toBe("forbidden");
  });
});
