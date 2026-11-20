import { test } from "@playwright/test";
import { signInAs } from "./helpers";
import { plansJourney, policiesJourney } from "./owner-journeys";

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
});
