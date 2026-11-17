import { describe, expect, it } from "vitest";
import { CELEBRATION_BUDGET_MS, kgText, planStages, shareText, totalMs } from "@/domain/celebration";

describe("celebration order", () => {
  it("goes result, volume, records one by one, week, badges", () => {
    const kinds = planStages({ hasVolume: true, records: 2, showWeek: true, badges: 1 }).map((s) => `${s.kind}${s.kind === "record" ? s.index : ""}`);
    expect(kinds).toEqual(["result", "volume", "record0", "record1", "week", "badge"]);
  });
  it("leaves out what there is nothing to show for", () => {
    expect(planStages({ hasVolume: false, records: 0, showWeek: true, badges: 0 }).map((s) => s.kind)).toEqual(["result", "week"]);
    expect(planStages({ hasVolume: false, records: 0, showWeek: false, badges: 0 }).map((s) => s.kind)).toEqual(["result"]);
  });
  it("lasts under four seconds in every case", () => {
    for (const records of [0, 1, 3, 8]) for (const badges of [0, 1, 4]) for (const hasVolume of [true, false]) {
      const total = totalMs(planStages({ hasVolume, records, showWeek: true, badges }));
      expect(total, `${records} records, ${badges} badges`).toBeLessThan(4000);
      expect(total).toBeLessThanOrEqual(CELEBRATION_BUDGET_MS);
    }
  });
  it("gives every part enough time to read", () => {
    for (const s of planStages({ hasVolume: true, records: 9, showWeek: true, badges: 9 })) expect(s.ms).toBeGreaterThanOrEqual(350);
  });
  it("folds the extra records and badges into the summary instead of running long", () => {
    const stages = planStages({ hasVolume: true, records: 9, showWeek: true, badges: 9 });
    expect(stages.filter((s) => s.kind === "record").length).toBeLessThanOrEqual(3);
    expect(stages.filter((s) => s.kind === "badge").length).toBeLessThanOrEqual(2);
  });
});

describe("share text", () => {
  const base = { title: "Push day", status: "completed" as const, setsDone: 15, setsTotal: 15, volumeKg: 6420, records: [{ name: "Bench press", loadKg: 82.5 }] };
  it("is a plain line with the volume and the record", () => {
    expect(shareText(base)).toBe("Push day done: 6,420 kg moved, new bench press PR 82.5 kg");
  });
  it("says sets done for a partly done workout, without any failure words", () => {
    const t = shareText({ ...base, status: "partial", setsDone: 8, setsTotal: 9, records: [] });
    expect(t).toBe("Push day: 8 of 9 sets done, 6,420 kg moved");
    expect(t).not.toMatch(/fail|miss|only|incomplete/i);
  });
  it("counts extra records and drops a zero volume", () => {
    expect(shareText({ ...base, volumeKg: 0, records: [{ name: "Squat", loadKg: 100 }, { name: "Row", loadKg: 60 }] })).toBe("Push day done: new squat PR 100 kg and 1 more");
    expect(shareText({ ...base, volumeKg: 0, records: [] })).toBe("Push day done");
  });
  it("groups thousands the Indian way", () => {
    expect(kgText(6420)).toBe("6,420");
    expect(kgText(125000)).toBe("1,25,000");
  });
});
