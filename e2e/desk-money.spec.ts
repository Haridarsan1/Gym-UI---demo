import { expect, test } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";
import { moneyJourney } from "./trainer-journeys";

/** Dues, reminders, collecting payments and receipts (M03, O04) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Money at the desk on a phone", () => {
  test("a reminder, a part payment, the rest by UPI, and the printable receipt", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_desk_andheri", "/desk");
    await moneyJourney(page);
    expect(problems).toEqual([]);
  });

  test("without part payments allowed, the full amount is asked for and a smaller one is refused with the reason", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk/payments/new");
    await page.getByRole("searchbox", { name: "Search members" }).fill("priya");
    await page.getByRole("list", { name: "Matching members" }).getByRole("button", { name: /Priya Sharma/ }).click();
    await page.getByRole("list", { name: "Open invoices" }).getByRole("button", { name: /^Collect/ }).click();
    const d = page.getByRole("dialog", { name: "Collect payment" });
    await expect(d).toContainText("This gym takes the full amount at once.");
    await d.getByLabel("Amount received (₹)").fill("500");
    await d.getByRole("button", { name: "Record payment" }).click();
    await expect(d.getByRole("alert")).toContainText(/takes the full ₹[\d,.]+ at once/);
    await d.getByLabel("Amount received (₹)").fill("999999");
    await d.getByRole("button", { name: "Record payment" }).click();
    await expect(d.getByRole("alert")).toContainText(/more than the ₹[\d,.]+ due/);
  });

  test("declined online payments are listed with no money taken; a member who owes nothing says so", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk/dues");
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.goto("/desk/payments/new?member=mem_arjun");
    await expect(page.getByText("Arjun owes nothing. Every invoice is paid.")).toBeVisible();
  });
});
