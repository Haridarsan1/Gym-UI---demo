import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getTemplate, listTemplates, saveTemplate, setTemplateArchived, setTemplateShared } from "@/api/templates";
import { resetDemo } from "@/demo";
import { toPlanDays } from "@/domain/program";

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
const days = toPlanDays({ weeks: [{ key: "w", days: [{ key: "d", title: "Full body", weekday: 1, items: [{ key: "r", exerciseId: "ex_goblet_squat", section: "main", sets: 3, reps: "10" }] }] }] });
const tpl = (over = {}) => ({ name: "Two day starter", description: "Easy.", shared: false, days, ...over });

beforeAll(() => setNow(new Date("2026-11-17T06:30:00.000Z")));
afterAll(() => setNow(null));
beforeEach(async () => {
  await resetDemo();
});

describe("Templates", () => {
  it("shows a trainer their own and the shared ones, never another trainer’s private one; the owner sees everything", async () => {
    const meera = await listTemplates(as("u_trainer_meera"));
    expect(meera.map((t) => t.id).sort()).toEqual(["tpl_full3", "tpl_ppl", "tpl_upper_lower"]);
    expect(meera.find((t) => t.id === "tpl_full3")).toMatchObject({ mine: true, canEdit: true, shared: true, ownerName: "Meera Joshi", summary: { weeks: 8, workouts: 24, workoutsPerWeek: 3 } });
    expect(meera.find((t) => t.id === "tpl_ppl")).toMatchObject({ mine: false, canEdit: false, ownerName: "Neha Kulkarni" });
    expect(meera[0]!.mine).toBe(true); // yours first
    expect((await listTemplates(as("u_trainer_aditya"))).map((t) => t.id).sort()).toEqual(["tpl_aditya_base", "tpl_full3", "tpl_ppl"]);
    expect((await listTemplates(as("u_owner"))).map((t) => t.id).sort()).toEqual(["tpl_aditya_base", "tpl_full3", "tpl_ppl", "tpl_upper_lower"]);
    expect(await code(getTemplate(as("u_trainer_meera"), "tpl_aditya_base"))).toMatch(/^not_found/);
  });

  it("saves a new template as yours, private until you share it, and refuses one that isn’t a sound program", async () => {
    const id = await saveTemplate(as("u_trainer_meera"), tpl());
    expect(await getTemplate(as("u_trainer_meera"), id)).toMatchObject({ name: "Two day starter", mine: true, shared: false, summary: { weeks: 1, workouts: 1 } });
    expect((await listTemplates(as("u_trainer_aditya"))).some((t) => t.id === id)).toBe(false);
    await setTemplateShared(as("u_trainer_meera"), { id, shared: true });
    expect((await listTemplates(as("u_trainer_aditya"))).some((t) => t.id === id)).toBe(true);
    expect(await code(saveTemplate(as("u_trainer_meera"), tpl({ name: " " })))).toMatch(/^invalid:Give the template a name/);
    expect(await code(saveTemplate(as("u_trainer_meera"), tpl({ days: [] })))).toMatch(/^invalid:Add at least one workout day/);
  });

  it("lets you change and archive your own only; the owner can change any", async () => {
    expect(await code(saveTemplate(as("u_trainer_meera"), { ...tpl(), id: "tpl_ppl" }))).toMatch(/^forbidden/);
    expect(await code(setTemplateArchived(as("u_trainer_meera"), { id: "tpl_ppl", archived: true }))).toMatch(/^forbidden/);
    await saveTemplate(as("u_trainer_meera"), { ...tpl({ name: "Full body, three days (new)" }), id: "tpl_full3" });
    expect((await getTemplate(as("u_trainer_meera"), "tpl_full3")).name).toBe("Full body, three days (new)");
    await saveTemplate(as("u_owner"), { ...tpl({ name: "Owner edit" }), id: "tpl_aditya_base" });
    await setTemplateArchived(as("u_trainer_meera"), { id: "tpl_upper_lower", archived: true });
    expect((await listTemplates(as("u_trainer_meera"))).some((t) => t.id === "tpl_upper_lower")).toBe(false);
    expect((await listTemplates(as("u_trainer_meera"), { archived: true })).find((t) => t.id === "tpl_upper_lower")).toMatchObject({ archived: true });
  });

  it("is for owners and trainers", async () => {
    expect(await code(listTemplates(as("u_member_arjun")))).toMatch(/^forbidden/);
    expect(await code(listTemplates(as("u_desk_andheri")))).toMatch(/^forbidden/);
  });
});
