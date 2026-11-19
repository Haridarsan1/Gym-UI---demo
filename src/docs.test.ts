import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript module shared with the pre-commit hook
import { problems, REQUIRED } from "../scripts/check-docs.mjs";

describe("the project’s instructions and plan are intact", () => {
  it("CLAUDE.md, docs/PLAN.md and docs/REQUIREMENTS.md exist, are not near-empty and keep their key headings", () => {
    expect(problems((f: string) => readFileSync(f, "utf8"))).toEqual([]);
  });

  it("the check itself catches a missing file, an empty file and a lost heading", () => {
    const good = (f: string) => readFileSync(f, "utf8");
    expect(problems((f: string) => (f === "CLAUDE.md" ? "" : good(f)))[0]).toMatch(/CLAUDE.md is 0 bytes/);
    expect(problems((f: string) => (f === "docs/PLAN.md" ? null : good(f)))).toEqual(["docs/PLAN.md is missing."]);
    expect(problems((f: string) => (f === "docs/REQUIREMENTS.md" ? good(f).split("A01").join("") : good(f)))[0]).toMatch(/no longer contains/);
    expect(REQUIRED).toHaveLength(3);
  });
});
