import { generateSeed, type SeedData } from "@/demo/seed";
import { buildTraining, type TrainingSeed } from "@/demo/seedTraining";
import { todayIST } from "@/domain/dates";

/** The whole gym in one object, core and training together. For tests and tools: the app builds the two halves apart (`ensureSeeded`, `ensureTraining`). */
export function generateFullSeed(now: Date = new Date()): SeedData & TrainingSeed {
  const core = generateSeed(now);
  const training = buildTraining({ today: todayIST(now), members: core.members, memberships: core.memberships, trainerAssignments: core.trainerAssignments, consents: core.consents, checkIns: core.checkIns });
  return { ...core, ...training };
}
