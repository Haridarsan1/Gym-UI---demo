import { expect, test, type Page } from "@playwright/test";
import { doWorkout, hasHorizontalScroll } from "./helpers";

/** Records when each celebration part appears, so order and length can be checked. */
const watchStages = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __stages: Array<[string, number]> };
    w.__stages = [];
    new MutationObserver(() => {
      const v = document.querySelector("[data-stage]")?.getAttribute("data-stage");
      const last = w.__stages.at(-1);
      if (v && (!last || last[0] !== v)) w.__stages.push([v, performance.now()]);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-stage"] });
  });
const stages = (page: Page) => page.evaluate(() => (window as unknown as { __stages: Array<[string, number]> }).__stages);

const finishSheet = (page: Page) => page.getByRole("dialog", { name: "Finish workout" });
const done = (page: Page) => page.locator('[data-stage="done"]');

test.describe("Workout complete", () => {
  test("celebrates in order, in under four seconds: result, volume, records, week and streak, badges", async ({ page }) => {
    await doWorkout(page, { heavyBench: true });
    await watchStages(page);
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByRole("heading", { name: "Workout done" })).toBeVisible();
    await expect(done(page)).toBeVisible({ timeout: 6000 });
    const seen = await stages(page);
    const kinds = seen.map(([s]) => s.replace(/-\d+$/, ""));
    const order = ["result", "volume", "record", "week", "badge", "done"];
    expect(kinds[0]).toBe("result");
    expect(kinds).toEqual(expect.arrayContaining(["result", "volume", "record", "week", "done"]));
    expect(kinds.map((k) => order.indexOf(k))).toEqual([...kinds.map((k) => order.indexOf(k))].sort((a, b) => a - b));
    const first = seen.find(([s]) => s === "result")![1];
    const last = seen.find(([s]) => s === "done")![1];
    expect(last - first).toBeLessThan(4000);
    expect(last - first).toBeGreaterThan(1500);
  });

  test("shows the volume, each record with the old and new weight, the week ring and the streak", async ({ page }) => {
    await doWorkout(page, { heavyBench: true });
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(done(page)).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole("img", { name: /^[\d,]+ kilograms moved$/ })).toBeVisible();
    const record = page.getByRole("region", { name: "Personal record" }).filter({ hasText: "Dumbbell bench press" });
    await expect(record).toContainText("200 kg, up from");
    await expect(page.getByRole("region", { name: "This week" }).getByRole("img", { name: /^1 of 4 workouts done this week$/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "This week" }).getByRole("img", { name: /-week streak$/ })).toBeVisible();
  });

  test("a tap moves to the next part, and Skip goes straight to the end", async ({ page }) => {
    await doWorkout(page, { heavyBench: true });
    await watchStages(page);
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    const result = page.getByRole("heading", { name: "Workout done" });
    await expect(result).toBeVisible();
    // Three quick taps get past the result, the volume and the first record, which the timers alone would take over a second to do.
    const started = await page.evaluate(() => performance.now());
    for (let i = 0; i < 3; i++) await result.click();
    const seen = await stages(page);
    const kinds = seen.map(([s]) => s.replace(/-\d+$/, ""));
    expect(kinds).toContain("record");
    const record = seen.find(([s]) => s.startsWith("record"))!;
    expect(record[1] - started).toBeLessThan(1200);
    const skip = page.getByRole("button", { name: "Skip the celebration" });
    if (await skip.count()) await skip.click({ timeout: 1000 }).catch(() => undefined);
    await expect(done(page)).toBeVisible({ timeout: 800 });
    await expect(page.getByRole("region", { name: "Personal record" }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "This week" })).toBeVisible();
  });

  test("Skip goes straight to the end, with everything shown", async ({ page }) => {
    await doWorkout(page, { heavyBench: true });
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await page.getByRole("button", { name: "Skip the celebration" }).click();
    await expect(done(page)).toBeVisible({ timeout: 800 });
    await expect(page.getByRole("region", { name: "Volume" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Personal record" }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "This week" })).toBeVisible();
    await expect(page.getByRole("region", { name: "How did it feel?" })).toBeVisible();
  });

  test("a record and a new badge throw a short confetti burst, loaded only then", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => r.url().includes("confetti") && requests.push(r.url()));
    await doWorkout(page, { heavyBench: true });
    expect(requests).toHaveLength(0); // nothing is downloaded until there is something to celebrate
    await page.evaluate(() => {
      const w = window as unknown as { __confetti: Array<{ added: number; removed?: number }> };
      w.__confetti = [];
      new MutationObserver((records) => {
        for (const r of records) {
          r.addedNodes.forEach((n) => n instanceof HTMLCanvasElement && n.hasAttribute("data-confetti") && w.__confetti.push({ added: performance.now() }));
          r.removedNodes.forEach((n) => {
            if (n instanceof HTMLCanvasElement && n.hasAttribute("data-confetti")) w.__confetti.find((c) => c.removed === undefined)!.removed = performance.now();
          });
        }
      }).observe(document.body, { childList: true });
    });
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(done(page)).toBeVisible({ timeout: 6000 });
    await expect(page.locator("canvas[data-confetti]")).toHaveCount(0, { timeout: 2000 });
    const bursts = await page.evaluate(() => (window as unknown as { __confetti: Array<{ added: number; removed?: number }> }).__confetti);
    expect(requests.length).toBeGreaterThan(0);
    expect(bursts.length).toBeGreaterThanOrEqual(1);
    for (const b of bursts) expect(b.removed! - b.added).toBeLessThan(1100);
  });

  test("with reduced motion there is no confetti, and nothing is downloaded for it", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => r.url().includes("confetti") && requests.push(r.url()));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await doWorkout(page, { heavyBench: true });
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(done(page)).toBeVisible({ timeout: 800 });
    await page.waitForTimeout(500);
    await expect(page.locator("canvas[data-confetti]")).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });

  test("with reduced motion everything appears at once, with no animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await doWorkout(page, { heavyBench: true });
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(done(page)).toBeVisible({ timeout: 800 });
    await expect(page.getByRole("region", { name: "Volume" })).toBeVisible();
    await expect(page.getByRole("region", { name: "This week" })).toBeVisible();
    await expect(page.locator(".pop-in")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Skip the celebration" })).toHaveCount(0);
  });

  test("a partly done workout is celebrated by the sets done, never as a failure", async ({ page }) => {
    await doWorkout(page, { exercises: 2 });
    await finishSheet(page).getByRole("button", { name: "Save partly done workout" }).click();
    await expect(page.getByRole("heading", { name: /^\d+ of 15 sets done$/ })).toBeVisible();
    await expect(page.getByText("Every session counts.")).toBeVisible();
    await expect(done(page)).toBeVisible({ timeout: 6000 });
    await expect(page.locator("main")).not.toContainText(/fail|missed|incomplete|only /i);
    await expect(page.getByRole("region", { name: "This week" })).toBeVisible();
  });

  test("asks how hard and how recovered in two optional taps, each saved on its own", async ({ page }) => {
    await doWorkout(page);
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(done(page)).toBeVisible({ timeout: 6000 });
    const feedback = page.getByRole("region", { name: "How did it feel?" });
    await expect(feedback).toContainText("Optional");
    await feedback.getByRole("button", { name: "Effort 7 of 10" }).click();
    await expect(feedback.getByText("Saved")).toBeVisible();
    await feedback.getByRole("button", { name: "Good" }).click();
    await expect(feedback.getByText("Saved")).toBeVisible();
    await expect(feedback.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
    // Opened again later, the answers are still there.
    await page.reload();
    const again = page.getByRole("region", { name: "How did it feel?" });
    await expect(again.getByRole("button", { name: "Effort 7 of 10" })).toHaveAttribute("aria-pressed", "true");
    await expect(again.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
    // A tap on the chosen answer clears it, since the question is optional.
    await again.getByRole("button", { name: "Effort 7 of 10" }).click();
    await expect(again.getByRole("button", { name: "Effort 7 of 10" })).toHaveAttribute("aria-pressed", "false");
  });

  test("Share sends a plain-text summary through the share sheet", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shared: unknown[] }).__shared = [];
      Object.defineProperty(navigator, "share", { configurable: true, value: (data: unknown) => ((window as unknown as { __shared: unknown[] }).__shared.push(data), Promise.resolve()) });
    });
    await doWorkout(page, { heavyBench: true });
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(done(page)).toBeVisible({ timeout: 6000 });
    await page.getByRole("button", { name: "Share" }).click();
    const shared = (await page.evaluate(() => (window as unknown as { __shared: Array<{ text: string }> }).__shared))[0]!;
    expect(shared.text).toMatch(/^Upper body and core done: [\d,]+ kg moved, new dumbbell bench press PR 200 kg( and \d+ more)?$/);
    expect(Object.keys(shared).sort()).toEqual(["text", "title"]);
  });

  test("Share is left out where the browser can’t share", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
    await doWorkout(page);
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(done(page)).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole("link", { name: "Done" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
  });

  test("opening the summary later from Today shows everything at once, with no replay", async ({ page }) => {
    await doWorkout(page, { heavyBench: true });
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(done(page)).toBeVisible({ timeout: 6000 });
    await page.getByRole("link", { name: "Done" }).click();
    await page.getByRole("link", { name: "See summary" }).click();
    await expect(done(page)).toBeVisible({ timeout: 800 });
    await expect(page.locator(".pop-in")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Volume" })).toBeVisible();
  });

  test("fits a phone: no sideways scroll and big buttons", async ({ page }) => {
    await doWorkout(page, { heavyBench: true });
    await finishSheet(page).getByRole("button", { name: "Finish workout" }).click();
    await expect(done(page)).toBeVisible({ timeout: 6000 });
    expect(await hasHorizontalScroll(page)).toBe(false);
    for (const name of ["Effort 7 of 10", "Good"]) expect((await page.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.getByRole("link", { name: "Done" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("a skipped day gets a calm note, with no sequence, feedback or Share", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: () => Promise.resolve() }));
    await doWorkout(page, { exercises: 0 });
    await finishSheet(page).getByRole("button", { name: "Skip workout" }).click();
    await expect(page.getByRole("heading", { name: "Skipped today" })).toBeVisible();
    await expect(done(page)).toBeVisible({ timeout: 1000 });
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "How did it feel?" })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(/fail|missed/i);
  });

  test("a day with no finished workout says so", async ({ page }) => {
    await doWorkout(page, { exercises: 1 });
    await page.goto("/m/workout/2026-01-05/complete");
    await expect(page.getByRole("heading", { name: "No finished workout here yet" })).toBeVisible();
  });
});
