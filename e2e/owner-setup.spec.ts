import { test } from "@playwright/test";
import { signInAs } from "./helpers";
import { accountJourney, branchesJourney, communicationsJourney, importJourney, plansJourney, policiesJourney, scopeJourney, staffJourney } from "./owner-journeys";

/** The owner’s set-up screens on a phone (M4 steps 3 to 5). Wider layouts run the same journeys in desktop-flows.spec.ts. */
test.describe("Owner set-up on a phone", () => {
  test("plans and pricing: make, change and stop a plan, session pricing, and a branch manager’s read-only view", async ({ page }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await plansJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });

  test("policies: an example under every value, a review and an audited change, a membership’s own grace period, and a branch manager’s read-only view", async ({ page }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await policiesJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });

  test("staff: the invitation and what it allows, limits and their audit, switching off, and a branch manager reading then managing front desk and trainers at their own branch", async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await staffJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });

  test("branches: hours and rooms, a room with sessions that can’t be removed, and a branch manager’s own branch only", async ({ page }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await branchesJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });

  test("communications: wording with a preview, an offer that respects consent, a failed email and its retry", async ({ page }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await communicationsJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });

  test("import: a checked file, a shared-number row, an unticked row, an import that can be sent twice, and the same file refused", async ({ page }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await importJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });

  test("subscription, settings with a logo that shows on the sidebar and a receipt, and the audit log", async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await accountJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });

  test("a branch manager sees Bandra only: dashboard, report and its file, and read-only set-up screens; the owner’s screens are not theirs", async ({ page }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await scopeJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });
});
