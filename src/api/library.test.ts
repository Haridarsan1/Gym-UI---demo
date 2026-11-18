import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getExercise, listExercises, saveExercise, setExerciseArchived, type ExerciseInput } from "@/api/library";
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
const input = (over: Partial<ExerciseInput> = {}): ExerciseInput => ({ name: "Sled push", category: "conditioning", muscleGroups: ["legs", "glutes"], equipment: ["sled"], instructions: "Lean in, drive through your legs, keep your arms straight.", substitutionIds: ["ex_lunge"], ...over });

beforeAll(() => setNow(new Date("2026-11-17T06:30:00.000Z")));
afterAll(() => setNow(null));
beforeEach(async () => {
  await resetDemo();
});

describe("Exercise library: reading", () => {
  it("lists every exercise by name with facets, for owners, trainers and members, not the front desk", async () => {
    const lib = await listExercises(as("u_trainer_meera"));
    expect(lib.total).toBe(lib.rows.length);
    expect(lib.rows.length).toBeGreaterThanOrEqual(30);
    expect(lib.rows.map((r) => r.name)).toEqual([...lib.rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));
    expect(lib.canWrite).toBe(true);
    expect(lib.facets.categories.map((c) => c.value)).toContain("strength");
    expect(lib.facets.muscles.find((m) => m.value === "chest")!.count).toBeGreaterThan(3);
    expect((await listExercises(as("u_member_arjun"))).canWrite).toBe(false);
    expect(await code(listExercises(as("u_desk_andheri")))).toMatch(/^forbidden/);
  });

  it("searches by name, muscle or equipment and filters by category, muscle and equipment together", async () => {
    expect((await listExercises(as("u_trainer_meera"), { search: "bench" })).rows.map((r) => r.id)).toEqual(expect.arrayContaining(["ex_bench_press", "ex_db_bench"]));
    expect((await listExercises(as("u_trainer_meera"), { search: "triceps" })).rows.length).toBeGreaterThan(2);
    const both = await listExercises(as("u_trainer_meera"), { category: "strength", muscle: "chest", equipment: "dumbbells" });
    expect(both.rows.map((r) => r.id).sort()).toEqual(["ex_db_bench", "ex_incline_db"]);
    expect((await listExercises(as("u_trainer_meera"), { search: "zzz" })).rows).toEqual([]);
  });

  it("shows an exercise with its substitutes and where it is used", async () => {
    const e = await getExercise(as("u_trainer_meera"), "ex_bench_press");
    expect(e).toMatchObject({ name: "Barbell bench press", own: false, category: "strength" });
    expect(e.substitutions.map((s) => s.name)).toEqual(["Dumbbell bench press", "Push-up"]);
    expect(e.usedInPrograms).toBeGreaterThan(0);
    expect(await code(getExercise(as("u_trainer_meera"), "ex_nope"))).toMatch(/^not_found/);
  });
});

describe("Exercise library: adding, editing, archiving", () => {
  it("adds the gym’s own exercise, which every trainer then sees as the gym’s own", async () => {
    const id = await saveExercise(as("u_trainer_meera"), input({ muscleGroups: ["Legs", "Glutes"], equipment: ["Sled"] }));
    const e = await getExercise(as("u_trainer_aditya"), id);
    expect(e).toMatchObject({ name: "Sled push", own: true, muscleGroups: ["legs", "glutes"], equipment: ["sled"], createdByName: "Meera Joshi" });
    expect((await listExercises(as("u_trainer_aditya"), { search: "sled" })).rows).toHaveLength(1);
  });

  it("edits an exercise of the gym’s own, and refuses to change one that ships with Ember", async () => {
    const id = await saveExercise(as("u_trainer_meera"), input());
    await saveExercise(as("u_trainer_meera"), input({ id, instructions: "Drive hard through your legs and keep your back flat." }));
    expect((await getExercise(as("u_trainer_meera"), id)).instructions).toContain("keep your back flat");
    expect(await code(saveExercise(as("u_trainer_meera"), input({ id: "ex_bench_press", name: "Bench press 2" })))).toMatch(/^forbidden:Exercises that come with Ember/);
  });

  it("checks what is entered, including a name that is already taken", async () => {
    expect(await code(saveExercise(as("u_trainer_meera"), input({ name: " " })))).toMatch(/^invalid:Give the exercise a name/);
    expect(await code(saveExercise(as("u_trainer_meera"), input({ muscleGroups: [] })))).toMatch(/^invalid:Add at least one muscle group/);
    expect(await code(saveExercise(as("u_trainer_meera"), input({ instructions: "Push." })))).toMatch(/^invalid:Describe how to do it/);
    expect(await code(saveExercise(as("u_trainer_meera"), input({ name: "plank" })))).toMatch(/^conflict:There is already an exercise called “Plank”/);
    expect(await code(saveExercise(as("u_trainer_meera"), input({ substitutionIds: ["ex_nope"] })))).toMatch(/^invalid:A substitute isn’t in the library/);
  });

  it("archives and restores: gone from the list and pickers, still readable, and the use stays visible", async () => {
    const id = await saveExercise(as("u_trainer_meera"), input());
    await setExerciseArchived(as("u_trainer_meera"), { id, archived: true });
    expect((await listExercises(as("u_trainer_meera"), { search: "sled" })).rows).toEqual([]);
    expect((await listExercises(as("u_trainer_meera"), { search: "sled", archived: true })).rows[0]).toMatchObject({ archived: true });
    expect((await getExercise(as("u_trainer_meera"), id)).archived).toBe(true);
    await setExerciseArchived(as("u_trainer_meera"), { id, archived: false });
    expect((await listExercises(as("u_trainer_meera"), { search: "sled" })).rows).toHaveLength(1);
    expect(await code(setExerciseArchived(as("u_trainer_meera"), { id: "ex_plank", archived: true }))).toMatch(/^forbidden/);
  });

  it("is for trainers and owners to change", async () => {
    expect(await code(saveExercise(as("u_member_arjun"), input()))).toMatch(/^forbidden/);
    expect(await code(saveExercise(as("u_desk_andheri"), input()))).toMatch(/^forbidden/);
    expect(await code(saveExercise(as("u_owner"), input()))).toBe("resolved");
    expect(await code(listExercises(null))).toMatch(/^unauthenticated/);
  });
});
