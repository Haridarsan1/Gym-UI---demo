import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";
import { bookingsJourney } from "./trainer-journeys";

/** The front desk’s bookings calendar (T04, O01, A03) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Bookings on a phone", () => {
  test("book a session, then move one that clashes with a trainer’s leave", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_desk_andheri", "/desk");
    await bookingsJourney(page, false);
    expect(problems).toEqual([]);
  });
});
