import { expect, test } from "@playwright/test";
import { a01Journey } from "./a01";
import { doWorkout, hasHorizontalScroll, readStore, signInAs } from "./helpers";
import { checkInJourney, dashboardJourney } from "./trainer-journeys";

/**
 * Safari (WebKit) at 390 px (an iPhone) and 1440 px (a Mac): the four journeys a gym would try first. A01 end to end, the member’s workout, check-in at the desk and the owner’s dashboard.
 * Only the `webkit-phone` and `webkit-desktop` projects run this file. Run it with `npm run e2e:webkit`.
 */

function watch(page: import("@playwright/test").Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console error: ${m.text()}`); });
  return problems;
}

test("A01: register, pay, check in, assign a trainer, publish, log as the member, review the trend, renew, switching roles", async ({ page }) => {
  test.setTimeout(150_000);
  const problems = watch(page);
  await signInAs(page, "u_desk_andheri", "/desk");
  await a01Journey(page);
  expect(problems).toEqual([]);
});

test("member workout: log every set, finish, and the log is saved as completed", async ({ page }) => {
  test.setTimeout(90_000);
  const problems = watch(page);
  await doWorkout(page);
  await page.getByRole("dialog", { name: "Finish workout" }).getByRole("button", { name: "Finish workout" }).click();
  await expect(page.locator('[data-stage="done"]')).toBeVisible({ timeout: 8000 });
  const log = (await readStore(page, "workoutLogs")).find((l) => l.memberId === "mem_arjun" && l.scheduledOn === "2026-11-17")!;
  expect(log.status).toBe("completed");
  expect(await hasHorizontalScroll(page)).toBe(false);
  expect(problems).toEqual([]);
});

test("desk check-in: search, allowed, repeat, dues, grace, turned away and an override with a reason", async ({ page }) => {
  test.setTimeout(90_000);
  const problems = watch(page);
  await signInAs(page, "u_desk_andheri", "/desk");
  await checkInJourney(page);
  expect(problems).toEqual([]);
});

test("owner dashboard: figures, charts, alerts, a branch and a range, and a branch manager’s own branch only", async ({ page }) => {
  test.setTimeout(90_000);
  const problems = watch(page);
  await signInAs(page, "u_owner", "/owner");
  await dashboardJourney(page, (id, path) => signInAs(page, id, path));
  expect(problems).toEqual([]);
});
