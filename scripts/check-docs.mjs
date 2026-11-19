/**
 * The project’s instructions and plan must never go missing or empty without anyone noticing (CLAUDE.md was once committed empty by a
 * routine commit). Fails if CLAUDE.md, docs/PLAN.md or docs/REQUIREMENTS.md is missing, near-empty, or lost its key headings.
 *   node scripts/check-docs.mjs            checks the files on disk
 *   node scripts/check-docs.mjs --staged   checks what is about to be committed (the pre-commit hook)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export const REQUIRED = [
  { file: "CLAUDE.md", minBytes: 4000, mustContain: ["Definition of done", "Architecture rules"] },
  { file: "docs/PLAN.md", minBytes: 20000, mustContain: ["## 7. Milestones", "## 8. Decisions"] },
  { file: "docs/REQUIREMENTS.md", minBytes: 8000, mustContain: ["A01"] },
];

export function problems(read) {
  const out = [];
  for (const { file, minBytes, mustContain } of REQUIRED) {
    const text = read(file);
    if (text === null) out.push(`${file} is missing.`);
    else if (Buffer.byteLength(text) < minBytes) out.push(`${file} is ${Buffer.byteLength(text)} bytes; it should be at least ${minBytes}. Was it emptied by mistake?`);
    else for (const m of mustContain) if (!text.includes(m)) out.push(`${file} no longer contains “${m}”.`);
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const staged = process.argv.includes("--staged");
  const read = (file) => {
    if (!staged) return existsSync(file) ? readFileSync(file, "utf8") : null;
    // The version in the index, so a good file on disk can’t hide a bad one that is about to be committed.
    try {
      return execFileSync("git", ["show", `:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
  };
  const found = problems(read);
  if (found.length) {
    console.error(`Docs check failed:\n- ${found.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Docs check passed.");
}
