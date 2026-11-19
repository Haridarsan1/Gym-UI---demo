import { test } from "@playwright/test";
import { signInAs } from "./helpers";
import { reportsJourney } from "./trainer-journeys";

/** The owner’s reports (O06, O07) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Reports on a phone", () => {
  test("every report, the CSV, the owner’s reopen of a cash day, and a branch manager’s own branch only", async ({ page }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await signInAs(page, "u_desk_andheri", "/desk");
    await reportsJourney(page, (id, path) => signInAs(page, id, path));
    test.expect(problems).toEqual([]);
  });
});
