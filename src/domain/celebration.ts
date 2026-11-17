import type { PersonalRecord } from "@/domain/metrics";

/** The whole celebration lasts under four seconds, however much there is to show. */
export const CELEBRATION_BUDGET_MS = 3800;
const MIN_STEP_MS = 350;
const MAX_STEP_MS = 1100;

export type StageKind = "result" | "volume" | "record" | "week" | "badge";

export interface Stage {
  kind: StageKind;
  /** Which record or badge, for stages that repeat. */
  index: number;
  ms: number;
}

const WEIGHT: Record<StageKind, number> = { result: 1, volume: 1.5, record: 1.2, week: 1.4, badge: 1.2 };

/**
 * The order of the celebration and how long each part stays: the result, the volume counting up, each personal record one
 * by one, the week ring and streak, then each badge. Parts with nothing to show are left out. Time is shared out by weight
 * and never exceeds the budget; when there is a lot to show, the last records and badges are folded into the final summary.
 */
export function planStages(input: { hasVolume: boolean; records: number; showWeek: boolean; badges: number }): Stage[] {
  const maxSteps = Math.floor(CELEBRATION_BUDGET_MS / MIN_STEP_MS);
  const wanted: Array<Pick<Stage, "kind" | "index">> = [{ kind: "result", index: 0 }];
  if (input.hasVolume) wanted.push({ kind: "volume", index: 0 });
  const fixed = wanted.length + (input.showWeek ? 1 : 0);
  const room = Math.max(0, maxSteps - fixed);
  const records = Math.min(input.records, Math.min(3, room));
  const badges = Math.min(input.badges, Math.min(2, Math.max(0, room - records)));
  for (let i = 0; i < records; i++) wanted.push({ kind: "record", index: i });
  if (input.showWeek) wanted.push({ kind: "week", index: 0 });
  for (let i = 0; i < badges; i++) wanted.push({ kind: "badge", index: i });
  const totalWeight = wanted.reduce((n, s) => n + WEIGHT[s.kind], 0);
  const unit = Math.min(MAX_STEP_MS, CELEBRATION_BUDGET_MS / totalWeight);
  return wanted.map((s) => ({ ...s, ms: Math.max(MIN_STEP_MS, Math.floor(unit * WEIGHT[s.kind])) }));
}

export const totalMs = (stages: Stage[]): number => stages.reduce((n, s) => n + s.ms, 0);

/** 6,420 with Indian grouping. */
export const kgText = (kg: number): string => Math.round(kg).toLocaleString("en-IN");

/**
 * The plain-text line the Share button sends: “Push day done: 6,420 kg moved, new dumbbell bench press PR 25 kg”. A partly
 * done workout says how many sets were done, kindly. No names, no link, nothing private.
 */
export function shareText(s: { title: string; status: "completed" | "partial" | "skipped"; setsDone: number; setsTotal: number; volumeKg: number; records: Array<Pick<PersonalRecord, "loadKg"> & { name: string }> }): string {
  const head = s.status === "completed" ? `${s.title} done` : `${s.title}: ${s.setsDone} of ${s.setsTotal} sets done`;
  const parts: string[] = [];
  if (s.volumeKg > 0) parts.push(`${kgText(s.volumeKg)} kg moved`);
  const [first, ...rest] = s.records;
  if (first) parts.push(`new ${first.name.toLowerCase()} PR ${first.loadKg} kg${rest.length ? ` and ${rest.length} more` : ""}`);
  return parts.length ? `${head}${s.status === "completed" ? ":" : ","} ${parts.join(", ")}` : head;
}
