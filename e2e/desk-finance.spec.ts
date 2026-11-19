import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";
import { financeJourney } from "./trainer-journeys";

/** Finance and the cash day close (M03, M04, O06) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Finance on a phone", () => {
  test("close the day with a variance, then invoices, reconciliation with a repeated event, and an export", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_desk_andheri", "/desk");
    await financeJourney(page, (id, path) => signInAs(page, id, path));
    expect(problems).toEqual([]);
  });
});
