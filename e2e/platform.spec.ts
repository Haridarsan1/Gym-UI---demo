import { test } from "@playwright/test";
import { signInAs } from "./helpers";
import { saasPlansJourney, supportJourney, tenantsJourney } from "./platform-journeys";

/** The platform admin’s console on a phone (M5). Wider layouts run the same journeys in desktop-flows.spec.ts. */
test.describe("Platform admin on a phone", () => {
  const run = async (page: import("@playwright/test").Page, journey: typeof tenantsJourney) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await journey(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  };
  test("tenants: health and set-up, a new gym, suspending one, and the gym’s read-only view and reactivation", async ({ page }) => { test.setTimeout(120_000); await run(page, tenantsJourney); });
  test("support access: asked for with a reason, announced in the gym, read-only inside, ended early or by itself, and audited", async ({ page }) => { test.setTimeout(120_000); await run(page, supportJourney); });
  test("SaaS plans: limits edited and enforced, an upgrade asked for and approved, a new plan, a plan with gyms that can’t be withdrawn", async ({ page }) => { test.setTimeout(120_000); await run(page, saasPlansJourney); });
});
