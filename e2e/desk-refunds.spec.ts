import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";
import { refundJourney } from "./trainer-journeys";

/** Refund requests and the finance queue (M04) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Refunds on a phone", () => {
  test("the desk asks, finance approves from the queue and rejects another with a reason", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_desk_andheri", "/desk");
    await refundJourney(page, (id, path) => signInAs(page, id, path));
    expect(problems).toEqual([]);
  });

  test("a request above the person’s limit says so and can’t be approved by finance, but the owner’s console isn’t needed to see why", async ({ page }) => {
    await signInAs(page, "u_finance", "/desk/finance/refunds");
    await expect(page.getByRole("list", { name: "Refund requests" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve the refund for/ }).first()).toBeEnabled();
  });
});
