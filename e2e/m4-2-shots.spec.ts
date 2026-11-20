import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Screenshots for M4 Checkpoint 2: plans and pricing with the plan editor’s “what the member pays”, the Policies screen with its examples, a policy change and its audit entry, the grace period at the
 * desk, staff and the invitation flow, branches, and a branch manager reading Policies and Staff and then, once the owner allows it, inviting at their own branch. Skipped in normal runs;
 * `npm run m4:shots2` runs it at 390, 768 and 1440 px.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? `docs/checkpoints/m4-2/${WIDTH}/screens`;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m4-2-shots.json", "utf8"));

test.skip(!process.env.M4_SHOTS, "Only runs for npm run m4:shots2");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024 });

async function clearToasts(page: Page) {
  for (const b of await page.getByRole("button", { name: "Dismiss" }).all()) await b.click({ timeout: 800 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

/** A screenshot named in e2e/m4-2-shots.json. `target` is scrolled to the top of the screen (or the middle of an open panel, where the window doesn’t scroll). */
async function shot(page: Page, key: string, target?: Locator, inPanel = false) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m4-2-shots.json`);
  mkdirSync(OUT, { recursive: true });
  await clearToasts(page);
  if (target && inPanel) await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  else if (target) {
    await page.evaluate(() => (document.body.style.paddingBottom = "100vh"));
    await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate((dy) => window.scrollBy(0, dy), WIDTH < 640 ? -76 : -24);
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}-${key}.png` });
  await page.evaluate(() => (document.body.style.paddingBottom = ""));
}

const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const rowOf = (page: Page, text: string) => page.locator("tr:visible, li:visible").filter({ hasText: text }).first();

test("Checkpoint 2: plans, policies, staff and branches", async ({ page }) => {
  test.setTimeout(240_000);

  // ── Plans and pricing ──
  await signInAs(page, "u_owner", "/owner/plans");
  await expect(page.getByRole("heading", { name: "Plans and pricing", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "plans");
  await page.getByRole("button", { name: "Edit Monthly Plus", exact: true }).click();
  const editor = dialog(page, "Plan: Monthly Plus");
  const bill = editor.getByRole("region", { name: "What the member pays" });
  await expect(bill).toContainText("₹4,130");
  await shot(page, "plan-editor", bill, true);
  await editor.getByLabel("Largest discount on this plan (%)").fill("5");
  await editor.getByLabel("Grace period after it ends (days)").fill("3");
  await expect(bill).toContainText("the member pays");
  await shot(page, "plan-discount", bill, true);
  await editor.getByRole("button", { name: "Cancel" }).click();
  await shot(page, "plans-pt", page.getByRole("region", { name: "Personal training sessions" }));

  // ── Policies ──
  await signInAs(page, "u_owner", "/owner/policies");
  await expect(page.getByRole("heading", { name: "Policies", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "policies");
  await shot(page, "policies-sessions", page.locator("section#sessions"));
  await page.getByLabel("Free cancellation until", { exact: true }).fill("24");
  await page.getByLabel("How far ahead members can book", { exact: true }).fill("90");
  await expect(page.getByText("Enter 1 to 60 days.")).toBeVisible();
  await shot(page, "policies-edit", page.locator("section#sessions"));
  await page.getByLabel("How far ahead members can book", { exact: true }).fill("21");
  await page.getByRole("switch", { name: "A no-show uses the credit" }).click();
  await page.getByLabel("Cancellation fee", { exact: true }).fill("1000");
  await page.getByLabel("Grace period after a membership ends", { exact: true }).fill("3");
  await shot(page, "policies-memberships", page.locator("section#memberships"));
  await page.getByRole("button", { name: "Review and save" }).click();
  const review = dialog(page, "Review policy changes");
  await review.getByLabel("Reason (optional)").fill("Members asked for a day’s notice");
  await shot(page, "policies-review");
  await review.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Policies saved")).toBeVisible();
  await shot(page, "policies-history", page.getByRole("region", { name: "Recent changes", exact: false }).first());

  // ── The grace period at the desk ──
  await signInAs(page, "u_desk_andheri", "/desk/members/mem_arjun");
  await page.getByRole("button", { name: "Grace period" }).click();
  const grace = dialog(page, "Grace period");
  await grace.getByLabel("Grace days for this membership").fill("10");
  await grace.getByLabel("Reason").fill("Away on work");
  await shot(page, "desk-grace");
  await grace.getByRole("button", { name: "Cancel" }).click();

  // ── Staff: the list, an invitation, a change of limits ──
  await signInAs(page, "u_owner", "/owner/staff");
  await expect(page.getByRole("heading", { name: "Staff and roles", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "staff");
  await page.getByRole("button", { name: "Invite staff" }).first().click();
  const invite = dialog(page, "Invite staff");
  await invite.getByLabel("Name", { exact: true }).fill("Ritu Verma");
  await invite.getByLabel("Email").fill("ritu.verma@pulsefitness.in");
  await invite.getByLabel("Mobile number").fill("98200 55001");
  await invite.getByRole("radio", { name: /^Front desk/ }).check();
  await invite.getByRole("checkbox", { name: "Bandra" }).check();
  await shot(page, "staff-invite", invite.getByRole("group", { name: "Role" }), true);
  await invite.getByLabel("Largest discount they can give (%)").fill("8");
  await shot(page, "staff-invite-about", invite.getByRole("region", { name: "What this person can do" }), true);
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();
  await expect(rowOf(page, "Ritu Verma")).toContainText("Invited");
  await shot(page, "staff-invited", rowOf(page, "Ritu Verma"));
  await page.getByRole("button", { name: "Edit Pooja Nair" }).click();
  const edit = dialog(page, "Staff: Pooja Nair");
  await edit.getByLabel("Largest discount they can give (%)").fill("2");
  await edit.getByLabel("Reason (optional)").fill("Too many discounts last month");
  await shot(page, "staff-edit", edit.getByRole("list", { name: "Changes" }), true);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Access changed")).toBeVisible();

  // ── A branch manager reads Policies and Staff, before and after the owner’s permission ──
  await signInAs(page, "u_bm_bandra", "/owner/staff");
  await expect(page.getByText("only the owner can invite or change staff", { exact: false }).first()).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "bm-staff");
  await page.getByRole("button", { name: "View Imran Qureshi" }).click();
  await expect(dialog(page, "Staff: Imran Qureshi")).toContainText("Only the owner can invite or change staff.");
  await shot(page, "bm-staff-view");
  await dialog(page, "Staff: Imran Qureshi").getByRole("button", { name: "Close" }).first().click();
  await page.goto("/owner/policies");
  await expect(page.getByText("Only the owner can change them.")).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "bm-policies");

  await signInAs(page, "u_owner", "/owner/staff?person=u_bm_bandra");
  const grant = dialog(page, "Staff: Rohit Sethi");
  await grant.getByRole("switch", { name: "Can invite and manage front desk and trainers" }).click();
  await shot(page, "staff-grant", grant.getByRole("region", { name: "What this person can do" }), true);
  await grant.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Access changed")).toBeVisible();

  await signInAs(page, "u_bm_bandra", "/owner/staff");
  await page.getByRole("button", { name: "Invite staff" }).first().click();
  const mine = dialog(page, "Invite staff");
  await mine.getByLabel("Name", { exact: true }).fill("Sunil Rane");
  await mine.getByLabel("Email").fill("sunil.rane@pulsefitness.in");
  await mine.getByRole("radio", { name: /^Front desk/ }).check();
  await mine.getByRole("checkbox", { name: "Bandra" }).check();
  await shot(page, "bm-invite", mine.getByRole("group", { name: "Role" }), true);
  await mine.getByLabel("Largest discount they can give (%)").fill("15");
  await mine.getByRole("button", { name: "Send invitation" }).click();
  await expect(mine.getByText("You can give up to 10%, your own limit.").first()).toBeVisible();
  await shot(page, "bm-invite-refused", mine.getByText("You can give up to 10%, your own limit.").first(), true);
  await mine.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "View Meera Joshi" }).click();
  await expect(dialog(page, "Staff: Meera Joshi")).toContainText("They also work at a branch you don’t manage.");
  await shot(page, "bm-staff-meera");

  // ── Branches ──
  await signInAs(page, "u_owner", "/owner/branches");
  await expect(page.getByRole("heading", { name: "Branches", level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "branches");
  await page.getByRole("button", { name: "Edit hours and rooms for Bandra" }).click();
  await expect(dialog(page, "Branch: Bandra")).toBeVisible();
  await shot(page, "branch-editor");
  await dialog(page, "Branch: Bandra").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Edit hours and rooms for Andheri" }).click();
  const busy = dialog(page, "Branch: Andheri").getByRole("list", { name: "Rooms" }).getByRole("listitem").filter({ hasText: /sessions? (is|are) booked here/ }).first();
  await shot(page, "branch-room-busy", busy, true);
});
