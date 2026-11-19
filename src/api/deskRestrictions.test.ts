import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import { deskScreens } from "@/app/screens/desk";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { assertInBranch, memberInScope, openDesk } from "@/api/desk";
import { getAssessment } from "@/api/assessments";
import { getClient } from "@/api/clients";
import { getCoachDays } from "@/api/coachLog";
import { getReview } from "@/api/review";
import { getProgress, getPhotos } from "@/api/progress";
import { viewSensitive } from "@/api/sensitive";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { ACTIONS, can, type Action, type Principal } from "@/domain/permissions";

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
const desk = as("u_desk_andheri");
const finance = as("u_finance");

beforeAll(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});

/** Everything about a person’s health, training and a trainer’s private work. The front desk and finance get none of it, anywhere. */
const HEALTH: Action[] = ["assessment.read", "assessment.exists", "assessment.write", "photo.read", "photo.write", "goal.read", "goal.write", "measurement.read", "measurement.write", "workoutplan.read", "workoutplan.write", "workoutlog.read", "workoutlog.write", "progress.read", "review.read", "review.write", "note.private", "feedback.write"];

describe("the desk and finance never reach health or training records", () => {
  it("the permission map refuses every health and training action to front desk and finance, for any record", () => {
    for (const role of ["front_desk", "finance"] as const) {
      const p: Principal = { userId: "x", role, tenantId: "t_pulse", branchIds: ["br_andheri", "br_bandra", "br_powai"] };
      for (const a of HEALTH) {
        expect(can(p, a), `${role} ${a}`).toBe(false);
        expect(can(p, a, { tenantId: "t_pulse", branchId: "br_andheri", memberId: "mem_arjun", assignedTrainerId: "x", photoConsent: true }), `${role} ${a} on a record`).toBe(false);
      }
    }
    expect(HEALTH.every((a) => ACTIONS.includes(a))).toBe(true);
  });

  it("no desk screen is behind a health action or named for one", () => {
    for (const s of deskScreens) {
      expect(HEALTH.includes(s.action as Action), s.title).toBe(false);
      expect(`${s.id} ${s.path} ${s.title}`).not.toMatch(/assessment|photo|progress|goal|private/i);
    }
  });

  it("the sensitive door refuses them, and writes no view", async () => {
    const before = await db.auditEvents.count();
    for (const s of [desk, finance]) {
      expect(await code(viewSensitive(s, { kind: "assessment", memberId: "mem_arjun", entityId: "x" }))).toBe("forbidden");
      expect(await code(viewSensitive(s, { kind: "photo", memberId: "mem_arjun", entityId: "x" }))).not.toBe("resolved");
    }
    expect(await db.auditEvents.count()).toBe(before);
  });

  it("the trainer and member APIs refuse them too", async () => {
    for (const s of [desk, finance, as("u_owner"), as("u_bm_bandra")]) {
      expect(await code(getAssessment(s, "mem_arjun")), "assessment").toBe("forbidden");
      expect(await code(getClient(s, "mem_arjun")), "client").toBe("forbidden");
      expect(await code(getCoachDays(s, "mem_arjun")), "coach days").toBe("forbidden");
      expect(await code(getReview(s, "mem_arjun")), "review").toBe("forbidden");
      expect(await code(getProgress(s)), "progress").toBe("forbidden");
      expect(await code(getPhotos(s)), "photos").toBe("forbidden");
    }
  });
});

describe("desk context and branch scope", () => {
  it("opens for desk, finance, branch managers and owners, and not for members, trainers or admins", async () => {
    expect((await openDesk(desk, "checkin.record")).branchIds).toEqual(["br_andheri"]);
    expect((await openDesk(as("u_owner"), "report.view")).branchIds.sort()).toEqual(["br_andheri", "br_bandra", "br_powai"]);
    expect(await code(openDesk(as("u_member_arjun"), "checkin.read"))).toBe("forbidden");
    expect(await code(openDesk(as("u_trainer_meera"), "checkin.read"))).toBe("forbidden");
    expect(await code(openDesk(as("u_admin"), "checkin.read"))).toBe("forbidden");
  });

  it("finance can’t check members in (no door for it), and the desk can’t refund", async () => {
    expect(await code(openDesk(finance, "checkin.record"))).toBe("forbidden");
    expect(await code(openDesk(desk, "refund.create"))).toBe("forbidden");
    expect(await code(openDesk(desk, "reconciliation.manage"))).toBe("forbidden");
  });

  it("a branch outside the person’s own is refused, and a member there is not found", async () => {
    const c = await openDesk(desk, "member.read");
    expect(() => assertInBranch(c, "member.read", "br_andheri")).not.toThrow();
    expect(() => assertInBranch(c, "member.read", "br_bandra")).toThrow();
    const bandra = (await db.members.where("homeBranchId").equals("br_bandra").first())!;
    expect(await code(memberInScope(c, "member.read", bandra.id))).toBe("not_found");
    expect((await memberInScope(c, "member.read", "mem_arjun")).id).toBe("mem_arjun");
  });
});
