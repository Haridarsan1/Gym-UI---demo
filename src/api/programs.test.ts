import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getToday } from "@/api/member";
import { discardProgramDraft, getProgramSource, publishProgram, saveProgramDraft, type ProgramInput } from "@/api/programs";
import { getTrainerToday } from "@/api/trainer";
import { db } from "@/demo/db";
import { resetDemo } from "@/demo";
import { planFor } from "@/domain/metrics";
import { toPlanDays, type EditorDoc } from "@/domain/program";

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
const doc = (over: Partial<EditorDoc> = {}): EditorDoc => ({
  name: "Strength block 2", notes: "Heavier compounds.",
  weeks: [{ key: "w", days: [
    { key: "a", title: "Push", weekday: 0, items: [{ key: "1", exerciseId: "ex_bench_press", section: "main", sets: 4, reps: "6-8", loadKg: 50, restSec: 120 }, { key: "2", exerciseId: "ex_plank", section: "main", sets: 3, reps: "", durationSec: 45 }] },
    { key: "b", title: "Pull", weekday: 2, items: [{ key: "3", exerciseId: "ex_barbell_row", section: "main", sets: 4, reps: "8", loadKg: 45 }] },
  ] }],
  ...over,
});
const input = (memberId: string, startsOn: string, over: Partial<EditorDoc> = {}): ProgramInput => {
  const d = doc(over);
  return { memberId, name: d.name, notes: d.notes, startsOn, days: toPlanDays(d) };
};

beforeAll(() => setNow(new Date("2026-11-17T06:30:00.000Z")));
afterAll(() => setNow(null));
beforeEach(async () => {
  await resetDemo();
});

describe("Program source", () => {
  it("for a client on a plan: the current version, the next number and tomorrow as the earliest start", async () => {
    const s = await getProgramSource(as("u_trainer_meera"), "mem_arjun");
    expect(s).toMatchObject({ memberName: "Arjun Kumar", earliestStart: "2026-11-18", nextVersion: 3, programId: "prog_mem_arjun" });
    expect(s.current).toMatchObject({ versionNumber: 2, name: "Strength and size block", authorName: "Meera Joshi" });
    expect(s.versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(s.draft).toBeUndefined();
  });
  it("for a client with no plan: version 1, starting today", async () => {
    const s = await getProgramSource(as("u_trainer_meera"), "mem_sneha");
    expect(s).toMatchObject({ earliestStart: "2026-11-17", nextVersion: 1, programId: "prog_mem_sneha", current: undefined });
  });
  it("only for the client’s own trainer", async () => {
    expect(await code(getProgramSource(as("u_trainer_kavya"), "mem_arjun"))).toMatch(/^not_found/);
    expect(await code(getProgramSource(as("u_member_arjun"), "mem_arjun"))).toMatch(/^forbidden/);
  });
});

describe("Drafts", () => {
  it("are saved once per client, replaced on each save, and can be discarded", async () => {
    await saveProgramDraft(as("u_trainer_meera"), input("mem_arjun", "2026-11-23"));
    await saveProgramDraft(as("u_trainer_meera"), { ...input("mem_arjun", "2026-11-24"), name: "" });
    const rows = (await db.workoutPlanVersions.where("memberId").equals("mem_arjun").toArray()).filter((v) => v.status === "draft");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Untitled program", versionNumber: 3, startsOn: "2026-11-24" });
    const s = await getProgramSource(as("u_trainer_meera"), "mem_arjun");
    expect(s.draft).toMatchObject({ name: "Untitled program", startsOn: "2026-11-24" });
    expect(s.versions.map((v) => v.versionNumber)).toEqual([1, 2]); // a draft is not a version
    await discardProgramDraft(as("u_trainer_meera"), "mem_arjun");
    expect((await getProgramSource(as("u_trainer_meera"), "mem_arjun")).draft).toBeUndefined();
  });
  it("never reach the member: today’s plan and the program they see are unchanged", async () => {
    const before = await getToday(as("u_member_arjun"));
    await saveProgramDraft(as("u_trainer_meera"), input("mem_arjun", "2026-11-18"));
    const after = await getToday(as("u_member_arjun"));
    expect(after.plan).toEqual(before.plan);
    expect(planFor(await db.workoutPlanVersions.where("memberId").equals("mem_arjun").toArray(), "2026-11-20")).toMatchObject({ version: { versionNumber: 2 } });
  });
});

describe("Publishing", () => {
  it("makes the next version from the start date, and leaves earlier versions and every log exactly as they were", async () => {
    const versionsBefore = await db.workoutPlanVersions.where("memberId").equals("mem_arjun").toArray();
    const logsBefore = await db.workoutLogs.where("memberId").equals("mem_arjun").toArray();
    await saveProgramDraft(as("u_trainer_meera"), input("mem_arjun", "2026-11-18"));
    const r = await publishProgram(as("u_trainer_meera"), { ...input("mem_arjun", "2026-11-18"), key: "k1" });
    expect(r).toMatchObject({ versionNumber: 3, name: "Strength block 2", startsOn: "2026-11-18", summary: { weeks: 1, workouts: 2, exercises: 3 } });
    expect(r.previous).toEqual({ versionNumber: 2, name: "Strength and size block", startsOn: "2026-11-04", endsOn: "2026-11-17" });
    expect(r.changes!.added + r.changes!.changed + r.changes!.same).toBe(2);

    const after = await db.workoutPlanVersions.where("memberId").equals("mem_arjun").toArray();
    expect(after.filter((v) => v.status === "published").map((v) => v.versionNumber).sort()).toEqual([1, 2, 3]);
    expect(after.some((v) => v.status === "draft")).toBe(false); // the draft went with the publish
    for (const old of versionsBefore) expect(after.find((v) => v.id === old.id)).toEqual(old);
    expect(await db.workoutLogs.where("memberId").equals("mem_arjun").toArray()).toEqual(logsBefore);
    // Today’s workout is still the old version’s; tomorrow is the new one’s.
    expect(planFor(after, "2026-11-17")).toMatchObject({ version: { versionNumber: 2 } });
    expect(planFor(after, "2026-11-18")).toMatchObject({ version: { versionNumber: 3 } });
    expect((await getToday(as("u_member_arjun"))).plan).toMatchObject({ versionNumber: 2 });
    expect((await db.auditEvents.toArray()).some((a) => a.entityType === "plan_version" && a.entityId === "wpv_mem_arjun_3")).toBe(true);
  });

  it("repeating the same publish makes one version", async () => {
    const a = await publishProgram(as("u_trainer_meera"), { ...input("mem_arjun", "2026-11-18"), key: "same" });
    const b = await publishProgram(as("u_trainer_meera"), { ...input("mem_arjun", "2026-11-18"), key: "same" });
    expect(b).toEqual(a);
    expect((await db.workoutPlanVersions.where("memberId").equals("mem_arjun").toArray()).filter((v) => v.status === "published")).toHaveLength(3);
  });

  it("gives a client with no plan their first, from today, and Today stops listing them as waiting", async () => {
    expect((await getTrainerToday(as("u_trainer_meera"))).awaitingPlan.some((a) => a.memberId === "mem_sneha")).toBe(true);
    const r = await publishProgram(as("u_trainer_meera"), { ...input("mem_sneha", "2026-11-17"), key: "first" });
    expect(r).toMatchObject({ versionNumber: 1, previous: undefined, changes: undefined });
    expect((await getTrainerToday(as("u_trainer_meera"))).awaitingPlan.some((a) => a.memberId === "mem_sneha")).toBe(false);
    expect((await getToday(as("u_member_sneha"))).plan.state).not.toBe("no_plan");
  });

  it("refuses a program that isn’t sound, saying what is wrong", async () => {
    const bad = (over: Partial<EditorDoc>) => publishProgram(as("u_trainer_meera"), { ...input("mem_arjun", "2026-11-18", over), key: `bad-${Math.random()}` });
    expect(await code(bad({ name: " " }))).toMatch(/^invalid:Give the program a name/);
    expect(await code(bad({ weeks: [{ key: "w", days: [] }] }))).toMatch(/^invalid:Add at least one workout day/);
    await db.exercises.update("ex_plank", { archived: true });
    expect(await code(bad({}))).toMatch(/^invalid:Week 1, Wed: Plank is archived/);
  });

  it("checks the start date: not today for a client on a plan, not before the last version began", async () => {
    expect(await code(publishProgram(as("u_trainer_meera"), { ...input("mem_arjun", "2026-11-17"), key: "t" }))).toMatch(/^invalid:A new version starts tomorrow at the earliest/);
    expect(await code(publishProgram(as("u_trainer_meera"), { ...input("mem_sneha", "2026-11-16"), key: "p" }))).toMatch(/^invalid:The program can’t start in the past/);
    await publishProgram(as("u_trainer_meera"), { ...input("mem_arjun", "2026-11-20"), key: "v3" });
    expect(await code(publishProgram(as("u_trainer_meera"), { ...input("mem_arjun", "2026-11-19"), key: "v4" }))).toMatch(/^invalid:It must start after version 3/);
  });

  it("is for the client’s own trainer only", async () => {
    expect(await code(publishProgram(as("u_trainer_kavya"), { ...input("mem_arjun", "2026-11-18"), key: "x" }))).toMatch(/^forbidden|not_found/);
    expect(await code(publishProgram(as("u_member_arjun"), { ...input("mem_arjun", "2026-11-18"), key: "x" }))).toMatch(/^forbidden/);
  });
});
