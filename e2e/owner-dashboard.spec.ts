import { test } from "@playwright/test";
import { signInAs } from "./helpers";
import { dashboardJourney } from "./trainer-journeys";

/** The owner’s dashboard (O06, O07) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Dashboard on a phone", () => {
  test("figures, charts, alerts, a branch and a range, and a branch manager’s own branch only", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_owner", "/owner");
    await dashboardJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });
});
