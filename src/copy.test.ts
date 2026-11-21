import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { RULES } from "@/copyRules";

/**
 * The writing rules (CLAUDE.md) as a test, over every sentence in the app’s source: no exclamation marks, the curly apostrophe, and nothing internal on the screen (milestone names,
 * requirement IDs, record ids, or words like “seed” and “stub”). A sentence is any string or piece of JSX text with a space and two letters in a row; class names, paths and
 * code-like attributes are skipped. The marketing pages and their components are not checked here (they are finished and covered by their own tests). `e2e/copy.spec.ts` checks the
 * same rules against what is really on each screen, which also covers text built from data.
 */

const ROOT = "src";
const SKIP_DIRS = [join(ROOT, "pages", "home"), join(ROOT, "pages", "signup"), join(ROOT, "components")];
const CODE_ATTRS = /^(className|d|viewBox|href|to|type|role|id|htmlFor|key|style|fill|stroke|width|height|xmlns|points|transform|autoComplete|inputMode|pattern|accept|name|value|target|rel|loading|decoding|preload|as|crossOrigin|data-[\w-]+|aria-(controls|labelledby|describedby|live|haspopup|current|sort|orientation|expanded|selected|checked|pressed|hidden|modal))$/;

/** Allowed exceptions, each with the reason. Keep this empty if you can. */
const ALLOWED: Array<{ file: string; text: RegExp; why: string }> = [];


function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.includes(p)) sourceFiles(p, out); }
    else if (/\.(ts|tsx)$/.test(f) && !/\.(test|spec)\.|\.d\.ts$/.test(f) && f !== "copyRules.ts" && !p.startsWith(join(ROOT, "test"))) out.push(p);
  }
  return out;
}

function sentences(file: string): Array<{ line: number; text: string }> {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Array<{ line: number; text: string }> = [];
  const visit = (n: ts.Node) => {
    let raw: string | null = null;
    if (ts.isJsxText(n)) raw = n.getText();
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) raw = n.text;
    if (raw !== null) {
      const text = raw.replace(/\s+/g, " ").trim();
      const p = n.parent;
      const skip = ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || (ts.isJsxAttribute(p) && CODE_ATTRS.test(p.name.getText())) || (ts.isCallExpression(p) && /^(import|require|getByRole|getByLabel|querySelector\w*)$/.test(p.expression.getText()));
      if (!skip && !text.startsWith("<") && text.includes(" ") && /[A-Za-z]{2}/.test(text)) found.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe("the writing rules hold in every sentence of the app", () => {
  it("finds no exclamation marks, straight apostrophes or internal terms", () => {
    const problems: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      for (const { line, text } of sentences(file)) {
        for (const [rule, bad] of RULES) {
          if (bad(text) && !ALLOWED.some((a) => file.endsWith(a.file) && a.text.test(text))) problems.push(`${file}:${line} ${rule}: ${text.slice(0, 120)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("the rules catch what they are for", () => {
    const hit = (t: string) => RULES.filter(([, bad]) => bad(t)).map(([r]) => r);
    expect(hit("You’re done!")).toEqual(["exclamation mark"]);
    expect(hit("You don't have access")).toEqual(["straight apostrophe (use ’)"]);
    expect(hit("This arrives in M7")).toEqual(["milestone name"]);
    expect(hit("See A05 for details")).toEqual(["requirement ID"]);
    expect(hit("Open mem_arjun now")).toEqual(["record id"]);
    expect(hit("The seed was built")).toEqual(["internal word"]);
    expect(hit("Enter a 10-digit mobile number.")).toEqual([]);
    expect(hit("px-4 !py-2 flex")).toEqual([]);
  });
});
