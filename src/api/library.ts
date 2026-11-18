import { z } from "zod";
import { db } from "@/demo/db";
import { assertCan, open } from "@/api/context";
import { ApiError } from "@/api/errors";
import { can } from "@/domain/permissions";
import type { Exercise } from "@/domain/types";
import type { Session } from "@/app/session";

/**
 * The exercise library (W01). Every signed-in person at a gym reads the exercises that ship with Ember and the gym’s own.
 * Owners and trainers add the gym’s own, edit them and archive them. An archived exercise leaves the pickers but stays
 * readable, because plans and logs that used it still point at it. Exercises that ship with Ember can’t be changed; copy
 * one to make your own.
 */

export interface ExerciseRow {
  id: string;
  name: string;
  category: Exercise["category"];
  muscleGroups: string[];
  equipment: string[];
  archived: boolean;
  /** True for the gym’s own, false for the ones that ship with Ember. */
  own: boolean;
}
export interface Facet {
  value: string;
  count: number;
}
export interface LibraryData {
  rows: ExerciseRow[];
  /** Counted over everything the person may see, before the filters, so the numbers beside each filter don’t jump around. */
  facets: { categories: Facet[]; muscles: Facet[]; equipment: Facet[] };
  total: number;
  canWrite: boolean;
}
export interface LibraryParams {
  search?: string;
  category?: Exercise["category"];
  muscle?: string;
  equipment?: string;
  archived?: boolean;
}

const tally = (values: string[]): Facet[] => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

const visible = async (tenantId: string) => (await db.exercises.toArray()).filter((e) => e.tenantId === null || e.tenantId === tenantId);

/** W01: search and filter the library by name, category, muscle group and equipment. */
export async function listExercises(session: Session | null, params: LibraryParams = {}): Promise<LibraryData> {
  const { principal } = await open(session);
  assertCan(principal, "exercise.read");
  const all = await visible(principal.tenantId!);
  const live = all.filter((e) => params.archived || !e.archived);
  const q = params.search?.trim().toLowerCase() ?? "";
  const rows = live
    .filter((e) => (!q || e.name.toLowerCase().includes(q) || e.muscleGroups.some((m) => m.includes(q)) || e.equipment.some((m) => m.includes(q))) && (!params.category || e.category === params.category) && (!params.muscle || e.muscleGroups.includes(params.muscle)) && (!params.equipment || e.equipment.includes(params.equipment)))
    .map((e): ExerciseRow => ({ id: e.id, name: e.name, category: e.category, muscleGroups: e.muscleGroups, equipment: e.equipment, archived: e.archived, own: e.tenantId !== null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    rows,
    facets: { categories: tally(live.map((e) => e.category)), muscles: tally(live.flatMap((e) => e.muscleGroups)), equipment: tally(live.flatMap((e) => e.equipment)) },
    total: live.length,
    canWrite: can(principal, "exercise.write"),
  };
}

export interface ExerciseDetail extends ExerciseRow {
  instructions: string;
  substitutions: Array<{ id: string; name: string; archived: boolean }>;
  /** Programs (published or draft, for any client) and templates that prescribe it. */
  usedInPrograms: number;
  usedInTemplates: number;
  createdByName?: string;
}

export async function getExercise(session: Session | null, id: string): Promise<ExerciseDetail> {
  const { principal } = await open(session);
  assertCan(principal, "exercise.read");
  const all = await visible(principal.tenantId!);
  const e = all.find((x) => x.id === id);
  if (!e) throw new ApiError("not_found", "We couldn’t find this exercise.");
  const [versions, templates, author] = await Promise.all([db.workoutPlanVersions.where("tenantId").equals(principal.tenantId!).toArray(), db.programTemplates.where("tenantId").equals(principal.tenantId!).toArray(), e.createdBy ? db.users.get(e.createdBy) : undefined]);
  const uses = (days: Array<{ prescriptions: Array<{ exerciseId: string }> }>) => days.some((d) => d.prescriptions.some((p) => p.exerciseId === id));
  const byId = new Map(all.map((x) => [x.id, x]));
  return {
    id: e.id, name: e.name, category: e.category, muscleGroups: e.muscleGroups, equipment: e.equipment, archived: e.archived, own: e.tenantId !== null, instructions: e.instructions,
    substitutions: e.substitutionIds.flatMap((s) => (byId.has(s) ? [{ id: s, name: byId.get(s)!.name, archived: byId.get(s)!.archived }] : [])),
    usedInPrograms: versions.filter((v) => uses(v.days)).length, usedInTemplates: templates.filter((t) => uses(t.days)).length, createdByName: author?.name,
  };
}

export const ExerciseInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Give the exercise a name.").max(80, "Keep the name under 80 characters."),
  category: z.enum(["strength", "cardio", "mobility", "core", "conditioning", "warmup"]),
  muscleGroups: z.array(z.string().trim().min(1)).min(1, "Add at least one muscle group.").max(8),
  equipment: z.array(z.string().trim().min(1)).max(8),
  instructions: z.string().trim().min(10, "Describe how to do it in a sentence or two.").max(1200, "Keep the instructions under 1,200 characters."),
  substitutionIds: z.array(z.string()).max(6, "Choose at most six substitutes."),
});
export type ExerciseInput = z.infer<typeof ExerciseInput>;

/** Adds a new exercise to the gym’s library, or edits one of the gym’s own. */
export async function saveExercise(session: Session | null, raw: ExerciseInput): Promise<string> {
  const parsed = ExerciseInput.safeParse(raw);
  if (!parsed.success) throw new ApiError("invalid", parsed.error.issues[0]?.message ?? "Check the exercise and try again.");
  const input = parsed.data;
  const { principal } = await open(session);
  assertCan(principal, "exercise.write");
  const tenantId = principal.tenantId!;
  const all = await visible(tenantId);
  const clash = all.find((e) => e.id !== input.id && e.name.toLowerCase() === input.name.toLowerCase());
  if (clash) throw new ApiError("conflict", `There is already an exercise called “${clash.name}”.`);
  const known = new Set(all.map((e) => e.id));
  if (input.substitutionIds.some((s) => s === input.id || !known.has(s))) throw new ApiError("invalid", "A substitute isn’t in the library.");
  const fields = { name: input.name, category: input.category, muscleGroups: input.muscleGroups.map((m) => m.toLowerCase()), equipment: input.equipment.map((m) => m.toLowerCase()), instructions: input.instructions, substitutionIds: input.substitutionIds };
  if (input.id) {
    const existing = await db.exercises.get(input.id);
    if (!existing || existing.tenantId !== tenantId) throw new ApiError("forbidden", "Exercises that come with Ember can’t be changed. Make a copy to adjust it for your gym.");
    await db.exercises.update(input.id, fields);
    return input.id;
  }
  const id = `ex_${crypto.randomUUID().slice(0, 12)}`;
  await db.exercises.add({ id, tenantId, ...fields, archived: false, createdBy: principal.userId });
  return id;
}

/** Hides an exercise from the pickers, or brings it back. Plans and logs that used it keep working. */
export async function setExerciseArchived(session: Session | null, input: { id: string; archived: boolean }): Promise<void> {
  const { principal } = await open(session);
  assertCan(principal, "exercise.write");
  const e = await db.exercises.get(input.id);
  if (!e || e.tenantId !== principal.tenantId) throw new ApiError("forbidden", "Exercises that come with Ember can’t be archived.");
  await db.exercises.update(input.id, { archived: input.archived });
}
