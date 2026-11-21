import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript module shared with the pre-commit hook
import { problems, REQUIRED } from "../scripts/check-docs.mjs";

describe("the project’s instructions and plan are intact", () => {
  it("CLAUDE.md, docs/PLAN.md, docs/REQUIREMENTS.md and the milestone files exist, are not near-empty and keep their key headings", () => {
    expect(problems((f: string) => readFileSync(f, "utf8"))).toEqual([]);
  });

  it("the check itself catches a missing file, an empty file and a lost heading", () => {
    const good = (f: string) => readFileSync(f, "utf8");
    expect(problems((f: string) => (f === "CLAUDE.md" ? "" : good(f)))[0]).toMatch(/CLAUDE.md is 0 bytes/);
    expect(problems((f: string) => (f === "docs/PLAN.md" ? null : good(f)))).toEqual(["docs/PLAN.md is missing."]);
    expect(problems((f: string) => (f === "docs/REQUIREMENTS.md" ? good(f).split("A01").join("") : good(f)))[0]).toMatch(/no longer contains/);
    expect(problems((f: string) => (f === "docs/milestones/M4.md" ? "# M4 · x" : good(f)))[0]).toMatch(/docs\/milestones\/M4.md is \d+ bytes/);
    expect(problems((f: string) => (f === "docs/milestones/M2.md" ? null : good(f)))).toEqual(["docs/milestones/M2.md is missing."]);
    expect(REQUIRED).toHaveLength(10);
  });
});
