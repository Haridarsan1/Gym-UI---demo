import { TENANT_ID } from "@/app/demoAccounts";
import { addDays } from "@/domain/dates";
import type { ProgramTemplate } from "@/domain/types";
import { buildDays } from "@/demo/seedTraining";
import type { Template } from "@/demo/seedPlans";

/**
 * The gym’s program templates (W02). Days sit on a Monday-start calendar, so applying one to a client only needs a start date.
 * Two are shared with every trainer; two belong to one trainer.
 */
type Pattern = Array<[number, Template]>;
const t = (id: string, name: string, description: string, ownerId: string, shared: boolean, pattern: Pattern, weeks: number, daysAgo: number, today: string, at: (d: string) => string): ProgramTemplate => ({
  id, tenantId: TENANT_ID, name, description, ownerId, shared, archived: false, weeks, days: buildDays(pattern, weeks, 0), createdAt: at(addDays(today, -daysAgo)), updatedAt: at(addDays(today, -daysAgo)),
});

export function buildTemplates(today: string, at: (date: string) => string): ProgramTemplate[] {
  return [
    t("tpl_full3", "Full body, three days", "Three full-body days a week. A good first program for someone new.", "u_trainer_meera", true, [[0, "fullA"], [2, "fullB"], [4, "fullA"]], 8, 70, today, at),
    t("tpl_ppl", "Push, pull, legs", "Push, pull and legs, then upper body and core. For clients with a year of training.", "u_owner", true, [[0, "push"], [1, "pull"], [3, "legs"], [5, "upper"]], 8, 50, today, at),
    t("tpl_upper_lower", "Upper and core, twice a week", "Short and simple, for busy weeks and returning clients.", "u_trainer_meera", false, [[1, "upper"], [4, "upper"]], 4, 20, today, at),
    t("tpl_aditya_base", "Base strength, four days", "Aditya’s starter block for clients who want size.", "u_trainer_aditya", false, [[0, "push"], [1, "pull"], [3, "legs"], [4, "upper"]], 6, 30, today, at),
  ];
}
