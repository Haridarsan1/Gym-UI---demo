import { appendFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { RULES } from "../src/copyRules";
import { ADMIN_SCREENS, DESK_SCREENS, FINANCE_SCREENS, MEMBER_SCREENS, OWNER_SCREENS, TRAINER_SCREENS } from "./screens";
import { signInAs } from "./helpers";

/**
 * The writing rules against what is really on each screen (at 1440 px, where everything shows): the page text, and the names, tooltips and placeholders that are only spoken or hovered.
 * It reads the same screen lists as the responsive and accessibility checks. `src/copy.test.ts` checks every sentence in the source; this also covers text built from data (names,
 * audit entries, delivery log, notes). Set COPY_DUMP=file to write everything it read, for a person to skim.
 */

const GROUPS: Array<[string, Array<{ path: string }> | Array<[string, unknown]>, string]> = [
  ["desk", DESK_SCREENS, "u_desk_andheri"], ["finance", FINANCE_SCREENS, "u_finance"], ["owner", OWNER_SCREENS, "u_owner"], ["admin", ADMIN_SCREENS, "u_admin"], ["trainer", TRAINER_SCREENS, "u_trainer_meera"], ["member", MEMBER_SCREENS, "u_member_arjun"],
];
const EXTRA: Array<[string, string]> = [["/login", ""], ["/demo", ""], ["/", ""]];

async function textOf(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    for (const line of document.body.innerText.split("\n")) if (line.trim()) out.add(line.trim());
    for (const el of document.querySelectorAll<HTMLElement>("[aria-label], [title], [placeholder], img[alt]")) {
      for (const a of ["aria-label", "title", "placeholder", "alt"]) { const v = el.getAttribute(a); if (v?.trim()) out.add(v.trim()); }
    }
    return [...out];
  });
}

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(240_000);

test("no screen shows an exclamation mark, a straight apostrophe or an internal term", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Read at 1440 px");
  const problems: string[] = [];
  const dump = process.env.COPY_DUMP;
  if (dump) writeFileSync(dump, "");
  const check = async (where: string) => {
    const lines = await textOf(page);
    if (dump) appendFileSync(dump, `\n### ${where}\n${lines.join("\n")}\n`);
    for (const line of lines) for (const [rule, bad] of RULES) if (bad(line)) problems.push(`${where} ${rule}: ${line.slice(0, 140)}`);
  };
  for (const [area, screens, user] of GROUPS) {
    for (const s of screens) {
      const path = Array.isArray(s) ? (s[0] as string) : (s as { path: string }).path;
      await signInAs(page, user, path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await check(`${area} ${path}`);
    }
  }
  for (const [path] of EXTRA) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await check(path);
  }
  expect([...new Set(problems)]).toEqual([]);
});
