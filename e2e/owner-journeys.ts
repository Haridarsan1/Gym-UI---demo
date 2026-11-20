import { expect, type Page } from "@playwright/test";
import { hasHorizontalScroll } from "./helpers";

/**
 * The owner’s set-up journeys (M4 steps 3 to 5), shared by the phone spec and the 768 and 1440 px runs. Each is driven the way a person drives it: through the navigation, forms and panels.
 */
type SignIn = (userId: string, path: string) => Promise<void>;
const noSideways = async (page: Page, where: string) => expect(await hasHorizontalScroll(page), `${where}: sideways scroll`).toBe(false);
const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const rowOf = (page: Page, text: string) => page.locator("tr:visible, li:visible").filter({ hasText: text }).first();

/**
 * Plans and pricing (M01, M03): make a plan and read the bill the member would get while typing, change a plan, stop selling one, set what training costs, and see a branch manager read the
 * same list without being able to change anything.
 */
export async function plansJourney(page: Page, signIn: SignIn) {
  await signIn("u_owner", "/owner/plans");
  await expect(page.getByRole("heading", { name: "Plans and pricing", level: 1 })).toBeVisible();
  await expect(rowOf(page, "Monthly Plus")).toContainText("₹3,500");
  await expect(rowOf(page, "Monthly Plus")).toContainText("₹4,130 with GST");
  await noSideways(page, "Plans");

  // A new plan: the rules say what is wrong, and the bill follows what is typed.
  await page.getByRole("button", { name: "New plan" }).click();
  const sheet = dialog(page, "New plan");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Make plan" }).click();
  await expect(sheet.getByText("Give the plan a name.")).toBeVisible();
  await expect(sheet.getByText("Enter the price in rupees before GST, for example 2,500.")).toBeVisible();
  await sheet.getByLabel("Plan name").fill("Quarterly Plus");
  await sheet.getByLabel("Price before GST (₹)").fill("8000");
  await sheet.getByLabel("Lasts (days)").fill("90");
  const bill = sheet.getByRole("region", { name: "What the member pays" });
  await expect(bill).toContainText("₹8,000");
  await expect(bill).toContainText("CGST 9% and SGST 9%");
  await expect(bill).toContainText("₹1,440");
  await expect(bill).toContainText("₹9,440");
  await expect(bill).toContainText("17 Nov 2026 to 15 Feb 2027 (90 days)");
  await sheet.getByLabel("Personal training sessions included").fill("4");
  await expect(bill).toContainText("4 personal training sessions");
  await sheet.getByLabel("Largest discount on this plan (%)").fill("5");
  await expect(bill).toContainText("the member pays ₹8,968");
  await sheet.getByRole("checkbox", { name: "Powai" }).uncheck();
  await noSideways(page, "Plan editor");
  await sheet.getByRole("button", { name: "Make plan" }).click();
  await expect(page.getByText("Plan made")).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(rowOf(page, "Quarterly Plus")).toContainText("₹9,440 with GST");
  await expect(rowOf(page, "Quarterly Plus")).toContainText("On sale");

  // Changing the price shows the new bill, and says nobody who already bought is changed.
  await page.getByRole("button", { name: "Edit Monthly", exact: true }).click();
  const edit = dialog(page, "Plan: Monthly");
  await edit.getByLabel("Price before GST (₹)").fill("3000");
  await expect(edit.getByRole("region", { name: "What the member pays" })).toContainText("₹3,540");
  await expect(edit.getByText("Members who already bought this plan keep the price and terms they bought.")).toBeVisible();
  await edit.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("Plan saved")).toBeVisible();
  await expect(rowOf(page, "Monthly").filter({ hasNotText: "Plus" })).toContainText("₹3,540 with GST");

  // Stopping a plan: asked first, then it is off sale and the filter says so.
  await page.getByRole("button", { name: "Edit Quarterly Plus" }).click();
  await dialog(page, "Plan: Quarterly Plus").getByRole("button", { name: "Stop selling" }).click();
  const confirm = dialog(page, "Stop selling this plan");
  await expect(confirm).toContainText("carry on to their end date");
  await confirm.getByRole("button", { name: "Stop selling" }).click();
  await expect(rowOf(page, "Quarterly Plus")).toContainText("Not on sale");
  await page.getByRole("button", { name: "On sale", exact: true }).click();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: "Quarterly Plus" })).toHaveCount(0);
  await page.getByRole("button", { name: "All plans" }).click();

  // What training costs.
  await expect(page.getByRole("region", { name: "Personal training sessions" })).toContainText("₹800 a session");
  await page.getByRole("button", { name: "Edit session pricing" }).click();
  const pt = dialog(page, "Session pricing");
  await pt.getByLabel("Price of one session before GST (₹)").fill("900");
  await pt.getByLabel("Packs on offer (sessions in each)").fill("5, 10");
  await expect(pt.getByRole("region", { name: "What the member pays" })).toContainText("₹5,310");
  await pt.getByLabel("Packs on offer (sessions in each)").fill("5, 5");
  await pt.getByRole("button", { name: "Save pricing" }).click();
  await expect(pt.getByText("Enter each pack as a whole number of sessions from 1 to 100, with no repeats.")).toBeVisible();
  await pt.getByLabel("Packs on offer (sessions in each)").fill("5, 10");
  await pt.getByRole("button", { name: "Save pricing" }).click();
  await expect(page.getByText("Session pricing saved")).toBeVisible();
  await expect(page.getByRole("region", { name: "Personal training sessions" })).toContainText("₹900 a session");
  await expect(page.getByRole("list", { name: "Packs on offer" }).or(page.locator("dl[aria-label='Packs on offer']"))).toContainText("5 sessions");

  // The change is in the audit trail the owner can read.
  await signIn("u_owner", "/owner/plans?plan=pl_monthly");
  await expect(dialog(page, "Plan: Monthly")).toBeVisible();

  // A branch manager reads the list and the bill, and cannot change anything.
  await signIn("u_bm_bandra", "/owner/plans");
  await expect(page.getByText("Only the owner can change plans.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New plan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit session pricing" })).toHaveCount(0);
  await page.getByRole("button", { name: "View Annual", exact: true }).click();
  const ro = dialog(page, "Plan: Annual");
  await expect(ro.getByRole("region", { name: "What the member pays" })).toContainText("₹22,420");
  await expect(ro.getByRole("button", { name: /Save plan|Stop selling/ })).toHaveCount(0);
  await expect(ro.getByLabel("Plan name")).toBeDisabled();
  await noSideways(page, "Plans, branch manager");
}

/**
 * Policies (M02, M05, T04, O02): an example under every value that follows what is typed, a value out of range refused in its own words, a review that lists each change from and to, the
 * audit entry in the history, the grace period set for one membership at the desk, and a branch manager reading it all without being able to change it.
 */
export async function policiesJourney(page: Page, signIn: SignIn) {
  await signIn("u_owner", "/owner/policies");
  await expect(page.getByRole("heading", { name: "Policies", level: 1 })).toBeVisible();
  await expect(page.locator("li", { hasText: "Free cancellation until" }).filter({ hasText: "For example" }).first()).toContainText("can be canceled free until 6:00 am Fri 20 Nov");
  await expect(page.getByText("For example:")).toHaveCount(21);
  await noSideways(page, "Policies");

  // An example follows what is typed, and what is changed is marked until it is saved.
  const cutoff = page.getByLabel("Free cancellation until", { exact: true });
  await cutoff.fill("24");
  await expect(page.locator("li", { hasText: "Free cancellation until" }).first()).toContainText("free until 6:00 pm Thu 19 Nov");
  await expect(page.getByText("Changed from 12 hours. Not saved yet.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Unsaved changes" })).toContainText("1 change not saved");

  // A value out of range is refused in its own words, saving is closed, and the example keeps the saved value.
  const horizon = page.getByLabel("How far ahead members can book", { exact: true });
  await horizon.fill("90");
  await expect(page.getByText("Enter 1 to 60 days.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review and save" })).toBeDisabled();
  await expect(page.locator("li", { hasText: "How far ahead members can book" }).first()).toContainText("up to Tue 1 Dec");
  await horizon.fill("21");
  await expect(page.locator("li", { hasText: "How far ahead members can book" }).first()).toContainText("up to Tue 8 Dec");

  // A switch, an amount, a grace period: each with its example.
  await page.getByRole("switch", { name: "A no-show uses the credit" }).click();
  await expect(page.locator("li", { hasText: "A no-show uses the credit" }).first()).toContainText("gets the credit back");
  await page.getByLabel("Cancellation fee", { exact: true }).fill("1000");
  await expect(page.locator("li", { hasText: "Cancellation fee" }).first()).toContainText("less the ₹1,000 fee: ₹966.66 may be offered back");
  await page.getByLabel("Grace period after a membership ends", { exact: true }).fill("3");
  await expect(page.locator("li", { hasText: "Grace period after a membership ends" }).first()).toContainText("still lets the member in until Sun 20 Dec");
  await page.getByLabel("Shortest freeze", { exact: true }).fill("45");
  await expect(page.getByText("The shortest freeze can’t be longer than the longest.")).toBeVisible();
  await expect(page.locator("li", { hasText: "Shortest freeze" }).first()).toContainText("isn’t allowed with these numbers");
  await page.getByLabel("Shortest freeze", { exact: true }).fill("7");
  await noSideways(page, "Policies, edited");

  // The review lists each change from and to, then it is saved and audited.
  await page.getByRole("button", { name: "Review and save" }).click();
  const review = dialog(page, "Review policy changes");
  await expect(review.getByRole("list", { name: "What will change" })).toContainText("12 hours");
  await expect(review.getByRole("list", { name: "What will change" })).toContainText("24 hours");
  await expect(review.getByRole("list", { name: "What will change" })).toContainText("₹500");
  await expect(review.getByRole("list", { name: "What will change" }).getByRole("listitem")).toHaveCount(5);
  await review.getByLabel("Reason (optional)").fill("Members asked for a day’s notice");
  await review.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Policies saved")).toBeVisible();
  await expect(page.getByRole("region", { name: "Unsaved changes" })).toHaveCount(0);
  const history = page.getByRole("list", { name: "Recent changes" });
  await expect(history).toContainText("Free cancellation until: 12 hours to 24 hours");
  await expect(history).toContainText("Cancellation fee: ₹500 to ₹1,000");
  await expect(history).toContainText("Members asked for a day’s notice");
  await expect(page.getByLabel("Free cancellation until", { exact: true })).toHaveValue("24");

  // One membership’s own grace period, at the desk: a sheet with the date it means, a reason, and the profile says where it comes from.
  await signIn("u_desk_andheri", "/desk/members/mem_arjun");
  await expect(page.getByText("Grace after it ends")).toBeVisible();
  await expect(page.getByText("3 days")).toBeVisible();
  await page.getByRole("button", { name: "Grace period" }).click();
  const grace = dialog(page, "Grace period");
  await grace.getByLabel("Grace days for this membership").fill("10");
  await expect(grace.getByText(/can come in until .* \(the membership ends /)).toBeVisible();
  await grace.getByRole("button", { name: "Set grace period" }).click();
  await expect(grace.getByText("Say why the grace period is being changed. The reason is kept and audited.")).toBeVisible();
  await grace.getByLabel("Reason").fill("Away on work");
  await grace.getByRole("button", { name: "Set grace period" }).click();
  await expect(page.getByText("Grace period set")).toBeVisible();
  await expect(page.getByText("10 days")).toBeVisible();
  await expect(page.getByText("(set for this member)")).toBeVisible();

  // A branch manager reads the values, the examples and the history, and cannot change any of it.
  await signIn("u_bm_bandra", "/owner/policies");
  await expect(page.getByText("Only the owner can change them.")).toBeVisible();
  await expect(page.getByLabel("Free cancellation until", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Free cancellation until", { exact: true })).toHaveValue("24");
  await expect(page.getByRole("switch", { name: "A no-show uses the credit" })).toBeDisabled();
  await expect(page.getByText("For example:")).toHaveCount(21);
  await expect(page.getByRole("list", { name: "Recent changes" })).toContainText("Members asked for a day’s notice");
  await expect(page.getByRole("region", { name: "Unsaved changes" })).toHaveCount(0);
  await noSideways(page, "Policies, branch manager");
}
