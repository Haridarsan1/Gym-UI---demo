import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Screenshots of the trainer app for M2 Checkpoint 2: clients, assessment and goals, the library, templates and the program
 * builder. Skipped in normal runs; `npm run m2:shots2` runs it at 390, 768 and 1440 px and puts the pictures on sheets.
 */
const WIDTH = Number(process.env.SHOT_WIDTH ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const OUT = process.env.SHOT_OUT ?? `docs/checkpoints/m2-2/${WIDTH}/screens`;
const SHOTS: Array<{ key: string; caption: string }> = JSON.parse(readFileSync("e2e/m2-2-shots.json", "utf8"));
const WIDE = WIDTH >= 1280;

test.skip(!process.env.M2_SHOTS, "Only runs for npm run m2:shots2");
test.use({ reducedMotion: "reduce", viewport: { width: WIDTH, height: HEIGHT }, isMobile: WIDTH < 640, hasTouch: WIDTH < 1024 });

/** Closes any toast, so none sits over the picture or over the next button. */
async function clearToasts(page: Page) {
  for (const b of await page.getByRole("button", { name: "Dismiss" }).all()) await b.click({ timeout: 800 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

async function shot(page: Page, key: string, target?: Locator) {
  const i = SHOTS.findIndex((s) => s.key === key);
  if (i < 0) throw new Error(`No shot named ${key} in e2e/m2-2-shots.json`);
  mkdirSync(OUT, { recursive: true });
  await clearToasts(page);
  if (target) {
    await page.evaluate(() => (document.body.style.paddingBottom = "100vh"));
    await target.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate((dy) => window.scrollBy(0, dy), WIDTH < 640 ? -76 : -24);
  } else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, "0")}-${key}.png` });
}

const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const h1 = (page: Page, name: string | RegExp) => expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
const items = (page: Page) => page.getByRole("list", { name: "Exercises in this workout" }).getByRole("listitem");

test("Clients, assessment and goals", async ({ page }) => {
  await signInAs(page, "u_trainer_meera", "/t/clients");
  await h1(page, "Clients");
  await expect(page.getByRole("list", { name: "Your clients" }).getByRole("listitem").first()).toBeVisible();
  await shot(page, "clients-list");
  await page.goto("/t/clients/mem_arjun");
  await h1(page, "Arjun Kumar");
  await shot(page, "client-overview");
  await page.getByRole("tab", { name: "Workouts" }).click();
  await expect(page.getByRole("list", { name: "Recent workouts" })).toBeVisible();
  await shot(page, "client-workouts", WIDTH < 768 ? page.getByRole("tablist") : undefined);
  await page.getByRole("tab", { name: "Notes and reviews" }).click();
  await page.getByRole("textbox", { name: "Private note" }).fill("Shoulder fine on the heavier bench. Keep warming up.");
  await shot(page, "client-notes", WIDTH < 768 ? page.getByRole("tablist") : undefined);

  await page.goto("/t/clients/mem_arjun/assessment");
  await h1(page, "Assessment and goals");
  await shot(page, "assessment");
  await shot(page, "assessment-goals", page.getByRole("region", { name: "Goals", exact: true }));
  await page.getByRole("button", { name: "Add a goal" }).click();
  const g = dialog(page, "Add a goal");
  await g.getByLabel("Goal", { exact: true }).fill("Squat 80 kg");
  await g.getByLabel("What it measures").selectOption("squat");
  await g.getByLabel("Target", { exact: true }).fill("80");
  await g.getByLabel("Review every").fill("14");
  await page.waitForTimeout(200);
  await shot(page, "goal-sheet");
  await page.keyboard.press("Escape");

  await signInAs(page, "u_trainer_farah", "/t");
  await page.goto("/t/clients/mem_rahul/assessment");
  await h1(page, "Assessment and goals");
  await expect(page.getByText("Assessment consent withdrawn").first()).toBeVisible();
  await shot(page, "assessment-withdrawn");
});

test("Library and templates", async ({ page }) => {
  await signInAs(page, "u_trainer_meera", "/t/library");
  await h1(page, "Exercises");
  await expect(page.getByRole("list", { name: "Exercise list" }).getByRole("listitem").first()).toBeVisible();
  await shot(page, "library");
  await page.goto("/t/library?ex=ex_bench_press");
  await expect(page.getByRole("article", { name: "Barbell bench press" })).toBeVisible();
  await shot(page, "library-exercise", WIDTH < 768 ? undefined : undefined);
  await page.getByRole("button", { name: "Make a copy for your gym" }).click();
  await expect(dialog(page, "Add an exercise")).toBeVisible();
  await page.waitForTimeout(200);
  await shot(page, "library-add");
  await page.keyboard.press("Escape");
  await page.goto("/t/library/templates?t=tpl_full3");
  await expect(page.getByRole("article", { name: "Full body, three days" })).toBeVisible();
  await shot(page, "templates");
});

test("Program builder", async ({ page }) => {
  // Revising version 2 for Arjun, and the drag in the middle of a move.
  await signInAs(page, "u_trainer_meera", "/t");
  await page.goto("/t/library/programs?member=mem_arjun");
  await h1(page, "Program for Arjun Kumar");
  await expect(items(page).first()).toBeVisible();
  await shot(page, "builder-revise");

  // A program being built: a first program for Sneha from a template, renamed and tuned.
  await page.goto("/t/library/programs?member=mem_sneha");
  await h1(page, "Program for Sneha Patil");
  await page.getByRole("button", { name: "Use a template" }).click();
  await dialog(page, "Choose a template").getByRole("button", { name: "Use Full body, three days" }).click();
  await expect(page.getByText("Started from Full body, three days")).toBeVisible();
  await page.getByLabel("Program name").fill("Getting started");
  await page.getByLabel("Notes for the client").fill("Three full-body days to build the habit.");
  await items(page).nth(1).getByLabel("Load (kg)").fill("10");
  await items(page).nth(1).getByLabel("Reps", { exact: true }).fill("8-12");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await clearToasts(page);
  await shot(page, "builder-building");

  // The library: a zone of its own on a wide screen, a side panel or sheet below that.
  if (WIDE) await shot(page, "builder-library", page.getByRole("region", { name: "Add an exercise" }));
  else {
    await page.getByRole("button", { name: "Add exercise" }).click();
    await expect(dialog(page, "Add an exercise")).toBeVisible();
    await dialog(page, "Add an exercise").getByRole("searchbox").fill("row");
    await page.waitForTimeout(250);
    await shot(page, "builder-library");
    await page.keyboard.press("Escape");
  }

  // Drag the fourth exercise up, and take the picture before it is dropped.
  await clearToasts(page);
  const last = items(page).nth(3);
  await last.evaluate((el, keep) => window.scrollBy(0, el.getBoundingClientRect().top - keep), Math.min(HEIGHT * 0.55, 480));
  const handle = last.getByRole("button", { name: /^Drag to reorder/ });
  const hb = (await handle.boundingBox())!;
  const above = (await items(page).nth(1).boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - 20, { steps: 4 });
  await page.mouse.move(hb.x + hb.width / 2 + 6, above.y + above.height / 2, { steps: 12 });
  await page.waitForTimeout(250);
  await expect(last).toHaveAttribute("data-dragging", "true");
  await page.screenshot({ path: `${OUT}/${String(SHOTS.findIndex((s) => s.key === "builder-drag") + 1).padStart(2, "0")}-builder-drag.png` });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await clearToasts(page);
  await page.getByRole("button", { name: "Use a template" }).click();
  await expect(dialog(page, "Choose a template").getByRole("list", { name: "Templates" })).toBeVisible();
  await page.waitForTimeout(200);
  await shot(page, "builder-templates");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Preview as member" }).click();
  await expect(dialog(page, "Preview as member").getByRole("article", { name: "Workout preview" })).toBeVisible();
  await page.waitForTimeout(200);
  await shot(page, "builder-preview");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Publish version 1" }).click();
  await expect(dialog(page, "Publish program")).toBeVisible();
  await page.waitForTimeout(200);
  await shot(page, "builder-confirm");
  await dialog(page, "Publish program").getByRole("button", { name: "Publish version 1" }).click();
  await expect(dialog(page, "Version published")).toBeVisible();
  await page.waitForTimeout(200);
  await shot(page, "builder-published");
});
