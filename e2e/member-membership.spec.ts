import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, readStore, signInAs } from "./helpers";

const sheet = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const demo = (page: Page) => page.getByRole("region", { name: "Demo controls" });

/** Fills nothing: the demo gateway form is pre-filled, so paying is Continue, then Pay. */
async function renewSamePlan(page: Page) {
  const d = sheet(page, "Renew your membership");
  await expect(d.getByRole("radio", { name: /Monthly Plus/ })).toHaveAttribute("aria-checked", "true");
  await d.getByRole("button", { name: "Continue to payment" }).click();
  await d.getByRole("button", { name: /^Pay ₹4,130$/ }).click();
  return d;
}

test.describe("Membership: Arjun", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/membership");
    await expect(page.getByRole("heading", { name: "Membership", level: 1 })).toBeVisible();
  });

  test("shows the plan, status, validity, what it includes, and the agreed price", async ({ page }) => {
    const plan = page.getByRole("region", { name: "Monthly Plus" });
    await expect(plan).toContainText("Active");
    await expect(plan).toContainText("Valid until 8 Dec 2026 (21 days left)");
    await expect(plan.getByRole("list", { name: "What your plan includes" }).getByRole("listitem")).toHaveText(["Unlimited visits for 30 days", "Every branch", "2 personal-training sessions", "8 classes"]);
    await expect(plan).toContainText("Agreed when you joined: ₹3,500 plus 18% GST");
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("renews the same plan: shows the new dates and price first, then a stamp, a receipt and one scheduled membership", async ({ page }) => {
    await page.getByRole("button", { name: "Renew membership" }).click();
    const d = sheet(page, "Renew your membership");
    await expect(d.getByRole("region", { name: "What you will get" })).toContainText("New period: 9 Dec 2026 to 8 Jan 2027");
    await expect(d.getByRole("region", { name: "What you will get" })).toContainText("₹4,130");
    await expect(d.getByRole("region", { name: "What you will get" })).toContainText("₹3,500 plus ₹630 GST");
    await d.getByRole("button", { name: "Continue to payment" }).click();
    await expect(d.getByRole("region", { name: "Summary" })).toContainText("To pay₹4,130");
    await d.getByRole("button", { name: /^Pay ₹4,130$/ }).click();
    await expect(d.getByRole("status")).toContainText("Renewed");
    await expect(d.getByRole("status")).toContainText("Monthly Plus runs 9 Dec 2026 to 8 Jan 2027");
    await expect(d.getByRole("status")).toContainText(/Receipt RCP-2026-\d{4}/);
    expect(await d.locator(".stamp").count()).toBe(1);
    await d.getByRole("button", { name: "Done" }).click();
    const rows = await readStore(page, "memberships");
    const renewals = rows.filter((m) => m.memberId === "mem_arjun" && m.invoiceId);
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ status: "scheduled", startsOn: "2026-12-09", endsOn: "2027-01-08" });
    await expect(page.getByText("Renewed: Monthly Plus starts 9 Dec 2026 and runs until 8 Jan 2027.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Renew membership" })).toBeDisabled();
  });

  test("an upgrade is marked, with its own dates and price, and the sheet remembers nothing between openings", async ({ page }) => {
    await page.goto("/m/membership?renew=1");
    const d = sheet(page, "Renew your membership");
    const quarterly = d.getByRole("radio", { name: /Quarterly/ });
    await expect(quarterly).toContainText("Upgrade");
    await quarterly.click();
    await expect(d.getByRole("region", { name: "What you will get" })).toContainText("New period: 9 Dec 2026 to 9 Mar 2027");
    await expect(d.getByRole("region", { name: "What you will get" })).toContainText("The upgrade starts when your current period ends.");
    await expect(d.getByRole("radio", { name: /Monthly Plus/ })).toContainText("Your plan");
    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();
    await expect(page).not.toHaveURL(/renew=/);
  });

  test("a card with a wrong number is told what to fix, and nothing is sent", async ({ page }) => {
    await page.goto("/m/membership?renew=1");
    const d = sheet(page, "Renew your membership");
    await d.getByRole("button", { name: "Continue to payment" }).click();
    await d.getByRole("radio", { name: "Card" }).click();
    await d.getByLabel("Card number").fill("4242 4242 4242 4243");
    await d.getByRole("button", { name: /^Pay ₹4,130$/ }).click();
    await expect(d.getByText("Enter the 16-digit card number printed on your card.")).toBeVisible();
    await d.getByRole("radio", { name: "UPI" }).click();
    await d.getByLabel("UPI ID").fill("nobody");
    await d.getByRole("button", { name: /^Pay ₹4,130$/ }).click();
    await expect(d.getByText("Enter a valid UPI ID, like name@okbank.")).toBeVisible();
    expect((await readStore(page, "payments")).filter((p) => p.memberId === "mem_arjun")).toHaveLength(5);
  });

  test("a failed payment says what happened, activates nothing, and can be tried again", async ({ page }) => {
    await demo(page).getByRole("switch", { name: "Make payments fail" }).click();
    await expect(demo(page).getByRole("switch", { name: "Make payments fail" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Renew membership" }).click();
    const d = await renewSamePlan(page);
    await expect(d.getByRole("alert")).toContainText("The payment didn’t go through, and no money was taken.");
    await expect(d.getByRole("heading", { name: "Payment didn’t go through" })).toBeVisible();
    await expect(d.locator(".stamp")).toHaveCount(0);
    expect((await readStore(page, "memberships")).filter((m) => m.memberId === "mem_arjun" && m.invoiceId)).toHaveLength(0);
    const payments = (await readStore(page, "payments")).filter((p) => p.memberId === "mem_arjun" && p.status === "failed");
    expect(payments).toHaveLength(1);
    // The gateway comes back and the member tries again.
    await page.keyboard.press("Escape");
    await demo(page).getByRole("switch", { name: "Make payments fail" }).click();
    await expect(demo(page).getByRole("switch", { name: "Make payments fail" })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "Renew membership" }).click();
    const again = await renewSamePlan(page);
    await expect(again.getByRole("status")).toContainText("Renewed");
    expect((await readStore(page, "memberships")).filter((m) => m.memberId === "mem_arjun" && m.invoiceId)).toHaveLength(1);
    await again.getByRole("button", { name: "Done" }).click();
    await page.getByRole("radio", { name: /^Payments/ }).click();
    await expect(page.getByRole("list", { name: "Payments" })).toContainText("Didn’t go through");
    await expect(page.getByRole("list", { name: "Payments" })).toContainText("Paid");
  });

  test("replaying the payment event makes no second payment and no second renewal, and shows it", async ({ page }) => {
    await page.getByRole("button", { name: "Renew membership" }).click();
    const d = await renewSamePlan(page);
    await expect(d.getByRole("status")).toContainText("Renewed");
    await d.getByRole("button", { name: "Done" }).click();
    const tiles = demo(page).getByRole("group", { name: "What this event has made" });
    await expect(tiles).toContainText("1Times sent");
    await expect(tiles).toContainText("1Payments made");
    await expect(tiles).toContainText("1Renewals made");
    await demo(page).getByRole("button", { name: "Send this event again" }).click();
    await expect(demo(page).getByText(/Sent again\. The gateway’s event id was recognised as a repeat/)).toContainText("still 1 payment and 1 renewal");
    await expect(tiles).toContainText("2Times sent");
    await demo(page).getByRole("button", { name: "Send this event again" }).click();
    await expect(tiles).toContainText("3Times sent");
    await expect(tiles).toContainText("1Payments made");
    await expect(tiles).toContainText("1Renewals made");
    const own = (await readStore(page, "payments")).filter((p) => p.memberId === "mem_arjun" && !String(p.idempotencyKey).startsWith("seed-"));
    expect(own).toHaveLength(1);
    expect((await readStore(page, "memberships")).filter((m) => m.memberId === "mem_arjun" && m.invoiceId)).toHaveLength(1);
  });

  test("buys more sessions: the balance grows only after the payment succeeds", async ({ page }) => {
    await page.getByRole("button", { name: "Buy more sessions" }).click();
    const d = sheet(page, "Buy more sessions");
    await d.getByRole("radio", { name: /^4 sessions/ }).click();
    await d.getByRole("button", { name: "Continue to payment" }).click();
    await expect(d.getByRole("region", { name: "Summary" })).toContainText("Personal training: 4 sessions");
    await d.getByRole("button", { name: /^Pay ₹3,776$/ }).click();
    await expect(d.getByRole("status")).toContainText("Sessions added");
    await expect(d.getByRole("status")).toContainText("You now have 9 to book.");
    await d.getByRole("button", { name: "Done" }).click();
    await page.goto("/m/bookings");
    await expect(page.getByRole("region", { name: "Training sessions" })).toContainText("9 sessions left");
  });

  test("auto-renew is opt-in and says when, how much and how to stop before it asks for anything", async ({ page }) => {
    await expect(page.getByRole("region", { name: "Auto-renew" })).toContainText("Off.");
    await page.getByRole("button", { name: "Set up auto-renew" }).click();
    const d = sheet(page, "Turn on auto-renew");
    const when = d.getByRole("region", { name: "When you are charged" });
    await expect(when).toContainText("On 8 Dec 2026, the last day of your membership, we charge ₹4,130");
    await expect(when).toContainText("from 9 Dec 2026 to 8 Jan 2027");
    await expect(when).toContainText("We email you on 5 Dec 2026");
    await expect(when).toContainText("Turn it off any time before 8 Dec 2026 and nothing is charged.");
    await d.getByRole("button", { name: "Turn on auto-renew" }).click();
    await expect(page.getByRole("region", { name: "Auto-renew" })).toContainText("On. We will charge ₹4,130 on 8 Dec 2026");
    await page.getByRole("button", { name: "Turn off auto-renew" }).click();
    await expect(page.getByRole("region", { name: "Auto-renew" })).toContainText("Off.");
    const audit = (await readStore(page, "auditEvents")).filter((a) => a.action === "membership.autorenew");
    expect(audit).toHaveLength(2);
  });

  test("lists invoices with outlined pills, and each opens an Indian tax receipt that can be saved as PDF", async ({ page }) => {
    const list = page.getByRole("list", { name: "Invoices" });
    await expect(list.getByRole("listitem")).toHaveCount(5);
    const pill = list.getByText("Paid", { exact: true }).first();
    expect(await pill.evaluate((el) => getComputedStyle(el).borderTopWidth)).not.toBe("0px"); // outlined, not filled
    expect(await page.getByText("Active", { exact: true }).first().evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px"); // membership is filled
    await list.getByRole("listitem").first().getByRole("link").click();
    await expect(page.getByRole("heading", { name: "Tax invoice and receipt", level: 1 })).toBeVisible();
    const receipt = page.getByRole("article");
    await expect(receipt).toContainText("Pulse Fitness Private Limited");
    await expect(receipt).toContainText("GSTIN 27AABCP1234F1Z5, Maharashtra (27)");
    await expect(receipt).toContainText("Place of supply");
    await expect(receipt).toContainText("Maharashtra (27)");
    await expect(receipt).toContainText("CGST 9%");
    await expect(receipt).toContainText("SGST 9%");
    await expect(receipt).not.toContainText("IGST");
    await expect(receipt).toContainText("999723");
    await expect(receipt).toContainText(/Rupees .* Only/);
    await expect(receipt).toContainText("Paid in full");
    expect(await hasHorizontalScroll(page)).toBe(false);
    // Save as PDF opens the print window; printed, only the receipt is left.
    await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
    await page.getByRole("button", { name: "Save as PDF" }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Save as PDF" })).toBeHidden();
    await expect(receipt).toBeVisible();
  });

  test("someone else’s invoice can’t be opened", async ({ page }) => {
    const priya = (await readStore(page, "invoices")).find((i) => i.memberId === "mem_priya" && i.status === "open")!;
    await page.goto(`/m/membership/invoices/${priya.id}`);
    await expect(page.getByText("We couldn’t find that invoice.")).toBeVisible();
    await expect(page.getByText("Pulse Fitness Private Limited")).toHaveCount(0);
  });
});

test.describe("Membership: other members", () => {
  test("Priya pays the overdue invoice from Today’s Pay button, and Today stops asking", async ({ page }) => {
    await signInAs(page, "u_member_priya", "/m");
    await page.getByRole("link", { name: "Pay ₹2,950" }).click();
    await expect(page).toHaveURL(/\/m\/membership\?pay=inv_/);
    const d = sheet(page, "Pay invoice");
    await expect(d.getByRole("region", { name: "Summary" })).toContainText("To pay₹2,950");
    await expect(d.getByRole("region", { name: "Summary" })).toContainText("Monthly runs 21 Nov 2026 to 21 Dec 2026.");
    await d.getByRole("radio", { name: "Net banking" }).click();
    await d.getByRole("button", { name: /^Pay ₹2,950$/ }).click();
    await expect(d.getByText("Choose your bank.")).toBeVisible();
    await d.getByLabel("Your bank").selectOption("HDFC Bank");
    await d.getByRole("button", { name: /^Pay ₹2,950$/ }).click();
    await expect(d.getByRole("status")).toContainText("Renewed");
    await d.getByRole("button", { name: "Done" }).click();
    await page.goto("/m");
    await expect(page.getByRole("complementary", { name: "Payment due" })).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Membership ending soon" })).toHaveCount(0); // already renewed
    await expect(page.getByText("Renewed: your next period starts 21 Nov 2026.")).toBeVisible();
  });

  test("Rahul is frozen: freeze details are shown and renewal says why it is closed", async ({ page }) => {
    await signInAs(page, "u_member_rahul", "/m/membership");
    await expect(page.getByText("Frozen from 12 Nov 2026 until 29 Nov 2026")).toBeVisible();
    await expect(page.getByText("Reason: Travel.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Renew membership" })).toBeDisabled();
    await expect(page.getByText("Your membership is frozen. You can renew once the freeze ends.")).toBeVisible();
  });

  test("Sneha’s visit pass shows visits left", async ({ page }) => {
    await signInAs(page, "u_member_sneha", "/m/membership");
    await expect(page.getByRole("region", { name: "10-visit pass" })).toContainText("4 visits left of 10");
  });
});
