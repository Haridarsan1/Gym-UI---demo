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

const accountMenu = async (page: Page) => {
  await page.getByRole("button", { name: /^Account menu/ }).first().click();
};

/**
 * Staff and roles (R02, S03): the owner’s list and filters, the invitation with the rules saying what is wrong and what the person will be able to do, the invitation in the demo switcher,
 * a change to someone’s limits with what it changes, switching an account off, and a branch manager first reading it all and then, once the owner allows it, inviting at their own branch only.
 */
export async function staffJourney(page: Page, signIn: SignIn) {
  await signIn("u_owner", "/owner/staff");
  await expect(page.getByRole("heading", { name: "Staff and roles", level: 1 })).toBeVisible();
  await expect(rowOf(page, "Rohit Sethi")).toContainText("Branch manager");
  const wide = (page.viewportSize()?.width ?? 0) >= 640;
  if (wide) await expect(rowOf(page, "Rohit Sethi")).toContainText("Refunds to ₹50,000");
  await expect(rowOf(page, "Pooja Nair")).toContainText("Front desk");
  await noSideways(page, "Staff");
  await page.getByRole("button", { name: "Trainers", exact: true }).click();
  await expect(rowOf(page, "Meera Joshi")).toBeVisible();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: "Pooja Nair" })).toHaveCount(0);
  await page.getByRole("button", { name: "Everyone", exact: true }).click();

  // Inviting: the rules say what is wrong, and what the person will be able to do follows what is chosen.
  await page.getByRole("button", { name: "Invite staff" }).first().click();
  const sheet = dialog(page, "Invite staff");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Send invitation" }).click();
  await expect(sheet.getByText("Enter the person’s name.")).toBeVisible();
  await expect(sheet.getByText("Choose a role.")).toBeVisible();
  await sheet.getByLabel("Name", { exact: true }).fill("Ritu Verma");
  await sheet.getByLabel("Email").fill("pooja.nair@pulsefitness.in");
  await sheet.getByRole("radio", { name: /^Front desk/ }).check();
  await sheet.getByRole("checkbox", { name: "Bandra" }).check();
  await sheet.getByRole("button", { name: "Send invitation" }).click();
  await expect(sheet.getByText("Someone at this gym already has this email.")).toBeVisible();
  await sheet.getByLabel("Email").fill("ritu.verma@pulsefitness.in");
  await sheet.getByLabel("Mobile number").fill("98200 55001");
  const about = sheet.getByRole("region", { name: "What this person can do" });
  await expect(about).toContainText("Front desk at Bandra.");
  await expect(about).toContainText("Can give discounts up to 5%.");
  await expect(about).toContainText("Can let a member in by override, with a reason, 3 a day.");
  await expect(sheet.getByLabel("Largest refund they can approve (₹)")).toHaveCount(0);
  await sheet.getByLabel("Largest discount they can give (%)").fill("8");
  await sheet.getByLabel("Overrides a day").fill("");
  await expect(about).toContainText("Can give discounts up to 8%.");
  await expect(about).toContainText("Can let a member in by override, with a reason.");
  await sheet.getByRole("radio", { name: /^Finance/ }).check();
  await expect(sheet.getByLabel("Largest refund they can approve (₹)")).toBeVisible();
  await expect(sheet.getByLabel("Largest discount they can give (%)")).toHaveValue("5");
  await sheet.getByRole("radio", { name: /^Front desk/ }).check();
  await noSideways(page, "Invite staff");
  await sheet.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();
  await expect(rowOf(page, "Ritu Verma")).toContainText("Invited");
  await expect(rowOf(page, "Ritu Verma")).toContainText("Bandra");

  // The invitation can be sent again; opening it in the demo switcher accepts it and signs them in at their own branch.
  await page.getByRole("button", { name: "Edit Ritu Verma" }).click();
  await dialog(page, "Staff: Ritu Verma").getByRole("button", { name: "Send the invitation again" }).click();
  await expect(page.getByText("Invitation sent again")).toBeVisible();
  await dialog(page, "Staff: Ritu Verma").getByRole("button", { name: "Cancel" }).click();
  await accountMenu(page);
  await page.getByRole("list", { name: "New staff" }).getByRole("button", { name: /Ritu Verma/ }).click();
  await expect(page).toHaveURL(/\/desk/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await signIn("u_owner", "/owner/staff");
  await expect(rowOf(page, "Ritu Verma")).toContainText("Active");

  // Changing limits shows what it changes, asks for an optional reason and is applied from their next action.
  await page.getByRole("button", { name: "Edit Pooja Nair" }).click();
  const edit = dialog(page, "Staff: Pooja Nair");
  await edit.getByLabel("Largest discount they can give (%)").fill("2");
  await expect(edit.getByRole("list", { name: "Changes" })).toContainText("Discount limit: 5% to 2%");
  await edit.getByLabel("Reason (optional)").fill("Too many discounts last month");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Access changed")).toBeVisible();
  if (wide) await expect(rowOf(page, "Pooja Nair")).toContainText("Discounts to 2%");
  // The health-data switch is the owner’s, and only on an owner or a branch manager.
  await page.getByRole("button", { name: "Edit Pooja Nair" }).click();
  await expect(dialog(page, "Staff: Pooja Nair").getByRole("switch", { name: "Can view client health and progress photos" })).toHaveCount(0);
  await dialog(page, "Staff: Pooja Nair").getByRole("button", { name: "Cancel" }).click();

  // A branch manager first reads, and can change nothing.
  await signIn("u_bm_bandra", "/owner/staff");
  await expect(page.getByText("only the owner can invite or change staff", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite staff" })).toHaveCount(0);
  await expect(rowOf(page, "Imran Qureshi")).toBeVisible();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: "Aditya Rao" })).toHaveCount(0);
  await page.getByRole("button", { name: "View Imran Qureshi" }).click();
  await expect(dialog(page, "Staff: Imran Qureshi")).toContainText("Only the owner can invite or change staff.");
  await expect(dialog(page, "Staff: Imran Qureshi").getByLabel("Name", { exact: true })).toBeDisabled();
  await expect(dialog(page, "Staff: Imran Qureshi").getByRole("button", { name: /Save changes|Switch off/ })).toHaveCount(0);
  await dialog(page, "Staff: Imran Qureshi").getByRole("button", { name: "Close" }).first().click();

  // The owner allows Rohit to manage front desk and trainers, and to see client health.
  await signIn("u_owner", "/owner/staff");
  await page.getByRole("button", { name: "Edit Rohit Sethi" }).click();
  const grant = dialog(page, "Staff: Rohit Sethi");
  await grant.getByRole("switch", { name: "Can invite and manage front desk and trainers" }).click();
  await grant.getByRole("switch", { name: "Can view client health and progress photos" }).click();
  await expect(grant.getByRole("list", { name: "Changes" })).toContainText("Can invite and manage front desk and trainers: No to Yes");
  await expect(grant.getByRole("list", { name: "Changes" })).toContainText("Can view client health and progress photos: No to Yes");
  await grant.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Access changed")).toBeVisible();

  // Now Rohit can invite and change front desk and trainers at Bandra, within his own limits, and nobody else.
  await signIn("u_bm_bandra", "/owner/staff");
  await expect(page.getByText("The owner has allowed you to invite and manage front desk and trainers").first()).toBeVisible();
  await page.getByRole("button", { name: "Invite staff" }).first().click();
  const mine = dialog(page, "Invite staff");
  await expect(mine.getByRole("radio", { name: /^Branch manager/ })).toHaveCount(0);
  await expect(mine.getByRole("radio", { name: /^Finance/ })).toHaveCount(0);
  await expect(mine.getByRole("radio", { name: /^Trainer/ })).toBeVisible();
  await mine.getByLabel("Name", { exact: true }).fill("Sunil Rane");
  await mine.getByLabel("Email").fill("sunil.rane@pulsefitness.in");
  await mine.getByRole("radio", { name: /^Front desk/ }).check();
  await expect(mine.getByRole("checkbox", { name: "Bandra" })).toBeVisible();
  await expect(mine.getByRole("checkbox", { name: "Andheri" })).toHaveCount(0);
  await mine.getByRole("checkbox", { name: "Bandra" }).check();
  await mine.getByLabel("Largest discount they can give (%)").fill("15");
  await mine.getByRole("button", { name: "Send invitation" }).click();
  await expect(mine.getByText("You can give up to 10%, your own limit.").first()).toBeVisible();
  await mine.getByLabel("Largest discount they can give (%)").fill("10");
  await mine.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();
  await expect(rowOf(page, "Sunil Rane")).toContainText("Invited");
  await page.getByRole("button", { name: "View Meera Joshi" }).click();
  await expect(dialog(page, "Staff: Meera Joshi")).toContainText("They also work at a branch you don’t manage.");
  await dialog(page, "Staff: Meera Joshi").getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "Edit Imran Qureshi" }).click();
  await expect(dialog(page, "Staff: Imran Qureshi").getByRole("button", { name: "Switch off account" })).toBeVisible();
  await dialog(page, "Staff: Imran Qureshi").getByRole("button", { name: "Cancel" }).click();

  // Switching an account off asks why and says what is left behind.
  await signIn("u_owner", "/owner/staff?person=u_trainer_aditya");
  await dialog(page, "Staff: Aditya Rao").getByRole("button", { name: "Switch off account" }).click();
  const off = dialog(page, "Switch off this account");
  await expect(off).toContainText("keep this assignment until you move them to another trainer");
  await off.getByRole("button", { name: "Switch off", exact: true }).click();
  await expect(off.getByText("Say why the account is being switched off. The reason is kept and audited.")).toBeVisible();
  await off.getByLabel("Reason").fill("Left the gym");
  await off.getByRole("button", { name: "Switch off", exact: true }).click();
  await expect(page.getByText("Account switched off")).toBeVisible();
  await expect(rowOf(page, "Aditya Rao")).toContainText("Switched off");
}

/**
 * Branches (O01): each branch’s hours and rooms, changed and saved with an audit entry, a room with sessions booked into it that can’t be removed, hours that leave sessions outside them
 * said in a count rather than canceled, and a branch manager seeing and editing only their own branch.
 */
export async function branchesJourney(page: Page, signIn: SignIn) {
  await signIn("u_owner", "/owner/branches");
  await expect(page.getByRole("heading", { name: "Branches", level: 1 })).toBeVisible();
  const branchCards = page.locator("ul[aria-label=Branches] > li");
  const bandra = branchCards.filter({ hasText: "Bandra" });
  await expect(bandra).toContainText("Mon to Fri 5:30 am to 10:30 pm");
  await expect(bandra).toContainText("Studio A, holds 18");
  await noSideways(page, "Branches");

  await page.getByRole("button", { name: "Edit hours and rooms for Bandra" }).click();
  const sheet = dialog(page, "Branch: Bandra");
  await sheet.getByLabel("Address").fill("Hill Road, Bandra West, Mumbai 400050");
  await sheet.getByLabel("Sunday opens").fill("08:00");
  await sheet.getByLabel("Sunday closes").fill("12:00");
  await expect(sheet.getByText("Sun 8 am to 12 pm.")).toBeVisible();
  await sheet.getByLabel("Monday closes").fill("04:00");
  await sheet.getByRole("button", { name: "Save branch" }).click();
  await expect(sheet.getByText("It has to open before it closes.")).toBeVisible();
  await sheet.getByLabel("Monday closes").fill("22:30");
  await sheet.getByRole("button", { name: "Add a room" }).click();
  await sheet.getByLabel("Name").last().fill("Cycle room");
  await sheet.getByLabel("Holds").last().fill("12");
  await noSideways(page, "Branch editor");
  await sheet.getByRole("button", { name: "Save branch" }).click();
  await expect(page.getByText("Branch saved")).toBeVisible();
  await expect(bandra).toContainText("Sun 8 am to 12 pm");
  await expect(bandra).toContainText("Cycle room, holds 12");

  // A room with sessions booked into it can’t be removed.
  await page.getByRole("button", { name: "Edit hours and rooms for Andheri" }).click();
  const andheri = dialog(page, "Branch: Andheri");
  const busy = andheri.getByRole("list", { name: "Rooms" }).getByRole("listitem").filter({ hasText: /sessions? (is|are) booked here/ }).first();
  await expect(busy).toContainText("can’t be removed until");
  await expect(busy.getByRole("button", { name: /^Remove / })).toBeDisabled();
  await andheri.getByRole("button", { name: "Cancel" }).click();

  // A branch manager sees and changes only their own branch.
  await signIn("u_bm_bandra", "/owner/branches");
  await expect(branchCards).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Edit hours and rooms for Andheri" })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit hours and rooms for Bandra" }).click();
  await expect(dialog(page, "Branch: Bandra").getByLabel("Address")).toHaveValue("Hill Road, Bandra West, Mumbai 400050");
  await noSideways(page, "Branches, branch manager");
}

/**
 * Communications (O04): the groups and who can be reached, the gym’s own wording with a preview, an offer that respects consent, the demo’s mail failure with a failed email and its retry, and a
 * branch manager reading the log for their own branch and previewing, not editing, the wording.
 */
export async function communicationsJourney(page: Page, signIn: SignIn) {
  await signIn("u_owner", "/owner/communications");
  await expect(page.getByRole("heading", { name: "Communications", level: 1 })).toBeVisible();
  const offers = page.getByRole("list", { name: "Groups" }).getByRole("listitem").filter({ hasText: "Offers and news" });
  await expect(offers).toContainText("haven’t agreed to offers");
  await noSideways(page, "Communications");

  // The wording, with a preview that follows what is typed.
  await page.getByRole("button", { name: "Edit the Payment reminder email" }).click();
  const tpl = dialog(page, "Email: Payment reminder");
  await tpl.getByLabel("Subject").fill("Quick note: {{plan}} is open");
  await tpl.getByRole("button", { name: "Save wording" }).click();
  await expect(tpl.getByText("{{plan}} isn’t available in this email.")).toBeVisible();
  await tpl.getByLabel("Subject").fill("Quick note: {{amount_due}} is open on {{invoice}}");
  await expect(tpl.getByRole("region", { name: "Preview" })).toContainText("Quick note: ₹2,950 is open on PFAND/26-27/0042");
  await tpl.getByRole("button", { name: "Save wording" }).click();
  await expect(page.getByText("Wording saved")).toBeVisible();
  await expect(page.getByRole("list", { name: "Email wording" })).toContainText("Edited");

  // The mail server refuses mail: an offer fails, and the retry works once it is back.
  await page.getByRole("switch", { name: "Demo: make the mail server refuse mail" }).click();
  await offers.getByRole("button", { name: /^Send to/ }).click();
  const confirm = dialog(page, "Send to a group");
  await expect(confirm).toContainText("are listed in the log as not sent, each with the reason");
  await confirm.getByRole("button", { name: /^Send to/ }).click();
  await expect(page.getByText("Emails sent")).toBeVisible();
  await page.getByRole("button", { name: /^Failed ?\d+$/ }).click();
  const log = page.getByRole("region", { name: "Delivery log" });
  const failed = log.locator("tr:visible, li:visible").filter({ hasText: "Offers and news" }).first();
  await expect(failed).toContainText("Failed");
  await expect(failed).toContainText("The mail server didn’t accept it");
  await failed.getByRole("button", { name: /^Retry the email to/ }).click();
  await expect(page.getByText("Failed again")).toBeVisible();
  await expect(log.locator("tr:visible, li:visible").filter({ hasText: "2 tries" }).first()).toBeVisible();
  await page.getByRole("switch", { name: "Demo: make the mail server refuse mail" }).click();
  await page.getByRole("button", { name: /^Retry all failed/ }).click();
  await expect(page.getByText("Retried")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing matches" })).toBeVisible();
  await page.getByRole("button", { name: /^Not sent ?\d+$/ }).click();
  await expect(log.locator("tr:visible, li:visible").filter({ hasText: "hasn’t agreed to offers and news" }).first()).toBeVisible();
  await noSideways(page, "Communications, log");

  // A branch manager reads their branch’s log, and previews the wording.
  await signIn("u_bm_bandra", "/owner/communications");
  await expect(page.getByRole("button", { name: "Preview the Payment reminder email" })).toBeVisible();
  await page.getByRole("button", { name: "Preview the Payment reminder email" }).click();
  await expect(dialog(page, "Email: Payment reminder")).toContainText("Only the owner can change the wording.");
  await expect(dialog(page, "Email: Payment reminder").getByRole("button", { name: "Save wording" })).toHaveCount(0);
  await dialog(page, "Email: Payment reminder").getByRole("button", { name: "Close" }).first().click();
  await noSideways(page, "Communications, branch manager");
}

const IMPORT_FILE = [
  "name,phone,email,date_of_birth,gender,branch,plan,start_date,visits_left,pt_credits,lead_source",
  "Asha Menon,9820011122,asha@example.in,1992-04-09,female,Bandra,Monthly,2026-11-10,,4,Walk-in",
  "Vikram Shah,9820033344,,,male,Andheri,10-visit pass,2026-11-01,6,,Instagram",
  "Dev Ramaswamy,9820022090,,2010-03-14,male,Andheri,,,,,",
  "Ravi Kale,9820011100,,,,Bandra,,,,,",
  "Sita Kale,9820011100,,,,Bandra,,,,,",
  "No Number,12345,,,,Bandra,,,,,",
  "Meena Ramaswamy,9820022090,,,,Andheri,,,,,",
].join("\r\n");

/**
 * Import members (S01): the template, a file checked row by row with each problem in words, a number another member has imported as a separate flagged member, a tick to leave a row out, the import, a
 * second press that adds nobody, and the same file again refused row by row. Only the owner has it.
 */
export async function importJourney(page: Page, signIn: SignIn) {
  await signIn("u_owner", "/owner/import");
  await expect(page.getByRole("heading", { name: "Import members", level: 1 })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the template" }).click();
  expect((await download).suggestedFilename()).toBe("ember-members-template.csv");
  await noSideways(page, "Import");

  await page.getByLabel("Choose a CSV file").setInputFiles({ name: "members.csv", mimeType: "text/csv", buffer: Buffer.from(IMPORT_FILE) });
  const summary = page.locator("dl[aria-label=Summary]");
  await expect(summary).toContainText("Ready3");
  await expect(summary).toContainText("Shared number2");
  await expect(summary).toContainText("Problems2");
  const row = (name: string) => page.locator("tr:visible, li:visible").filter({ hasText: name }).first();
  await expect(row("Dev Ramaswamy")).toContainText("Shares this number with Meena Ramaswamy (a member), Aarav Ramaswamy (a member). Added as a separate member with the shared-number flag.");
  await expect(row("Sita Kale")).toContainText("Shares this number with Ravi Kale (row 5)");
  await expect(row("No Number")).toContainText("phone: Enter a 10-digit mobile number.");
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: /Meena Ramaswamy\d{10}/ }).first()).toContainText("is already a member with this phone number. Nobody is added twice.");
  await expect(page.getByRole("checkbox", { name: /^Row 7, No Number/ })).toBeDisabled();
  await noSideways(page, "Import preview");

  // A row can be left out with its tick, and put back.
  await expect(page.getByRole("region", { name: "Import" })).toContainText("5 of 7 rows will be imported; 2 have problems and are left out.");
  await page.getByRole("checkbox", { name: "Import row 6, Sita Kale" }).uncheck();
  await expect(page.getByRole("region", { name: "Import" })).toContainText("4 of 7 rows will be imported");
  await page.getByRole("checkbox", { name: "Import row 6, Sita Kale" }).check();
  await page.getByRole("button", { name: /^Needs a look/ }).click();
  await expect(row("Asha Menon")).toHaveCount(0);
  await page.getByRole("button", { name: /^All rows/ }).click();

  await page.getByRole("button", { name: "Import 5 members" }).click();
  const confirm = dialog(page, "Import members");
  await expect(confirm.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await confirm.getByRole("checkbox", { name: /agreed to the gym keeping their details/ }).check();
  await confirm.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Members imported")).toBeVisible();
  const done = page.getByRole("region", { name: "Imported" });
  await expect(done).toContainText("5 members were added.");
  await expect(done).toContainText("2 memberships started or scheduled");
  await expect(done).toContainText("1 balance of training sessions");
  await expect(done).toContainText("2 with a shared number, flagged");

  // Sending the same import again adds nobody.
  await page.getByRole("button", { name: "Send this import again" }).click();
  await expect(page.getByText("Already imported").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Already imported" })).toContainText("nobody was added twice");

  // App invitations: who has joined and who hasn’t, an invitation by email through the delivery log, and the link that sets up a login.
  const imports = page.getByRole("list", { name: "Imports" });
  await expect(imports).toContainText("0 joined, 0 invited, 5 not invited (4 have no email)");
  await page.getByRole("button", { name: "Send app invites (1)" }).click();
  await expect(page.getByText("Invitations sent")).toBeVisible();
  await expect(imports).toContainText("0 joined, 1 invited, 4 not invited");
  await page.goto("/owner/communications");
  const mail = page.getByRole("region", { name: "Delivery log" }).locator("tr:visible, li:visible").filter({ hasText: "App invitation" }).first();
  await expect(mail).toContainText("Sent");
  await mail.getByRole("button", { name: /^Read the email to/ }).click();
  const link = (await dialog(page, "Email").locator("p.whitespace-pre-line").textContent())!.match(/https:\/\/app\.ember\.example(\/join\/\S+)/)![1]!;
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Hi Asha, set up your login" })).toBeVisible();
  await noSideways(page, "Join");
  await page.getByRole("button", { name: "Create my login" }).click();
  await expect(page.getByText("Enter the 6-digit code.")).toBeVisible();
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByText("your code is 246810")).toBeVisible();
  await page.getByLabel("Six-digit code").fill("246810");
  await page.getByRole("button", { name: "Create my login" }).click();
  await expect(page).toHaveURL(/\/m$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link can’t be used" })).toBeVisible();
  await signIn("u_owner", "/owner/import");
  await expect(page.getByRole("list", { name: "Imports" })).toContainText("1 joined, 0 invited, 4 not invited");

  // The same file under a new run: every row is now a member, so nothing is left to import.
  await signIn("u_owner", "/owner/import");
  await page.getByLabel("Choose a CSV file").setInputFiles({ name: "members.csv", mimeType: "text/csv", buffer: Buffer.from(IMPORT_FILE) });
  await expect(page.locator("dl[aria-label=Summary]")).toContainText("Ready0");
  await expect(page.locator("dl[aria-label=Summary]")).toContainText("Problems7");
  await expect(row("Asha Menon")).toContainText("is already a member with this phone number. Nobody is added twice.");
  await expect(page.getByRole("button", { name: "Import 0 members" })).toBeDisabled();

  // A file that can’t be read says why.
  await page.getByLabel("Choose a CSV file").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("name,phone\r\nA B,9820011122") });
  await expect(page.getByRole("alert").filter({ hasText: "Missing: branch" })).toBeVisible();

  // Nobody else has it.
  await signIn("u_bm_bandra", "/owner/import");
  await expect(page.getByRole("heading", { name: "Import members", level: 1 })).toHaveCount(0);
}

/** A 2 × 2 orange PNG, the “logo” the owner uploads. */
const LOGO_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxMCAkQ3nO4AAAAASUVORK5CYII=", "base64");
const LOGO = 'img[src^="data:image/"]';

/**
 * Subscription, settings and the audit log (S02, R02, S05): the plan, what it uses against its limits and what each state means; the gym’s logo uploaded and then showing on the sidebar and at the
 * top of a receipt; the audit log filtered by who and by kind, with the entry’s details and a download; the Policies screen’s link into it; and what a branch manager does and doesn’t get.
 */
export async function accountJourney(page: Page, signIn: SignIn) {
  await signIn("u_owner", "/owner/subscription");
  await expect(page.getByRole("heading", { name: "Subscription", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Growth", level: 2 })).toBeVisible();
  await expect(page.getByText("Free trial").first()).toBeVisible();
  const usage = page.getByRole("list", { name: "Usage against your limits" });
  await expect(usage).toContainText("Branches");
  await expect(usage).toContainText("3 of 3");
  await expect(usage).toContainText("You are at this limit.");
  await expect(usage).toContainText("of 250");
  await expect(page.getByRole("table", { name: "What each Ember plan includes" }).or(page.getByRole("list", { name: "Plans" }))).toContainText("Pro");
  await expect(page.getByRole("heading", { name: "No software invoices yet" })).toBeVisible();
  await expect(page.getByText("separate from what your members pay you", { exact: false })).toBeVisible();
  await noSideways(page, "Subscription");

  // Settings: the demo gym starts with its own sample logo (white-labelling is visible at once); upload another and it replaces it in the sidebar or header, and on a receipt.
  await page.goto("/owner/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.locator(`header img[src^="data:image/svg+xml"]:visible, nav img[src^="data:image/svg+xml"]:visible, aside img[src^="data:image/svg+xml"]:visible`).first()).toBeVisible();
  await page.getByLabel("GSTIN").fill("27AABCP1234F1");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("A GSTIN is 15 characters")).toBeVisible();
  await page.getByLabel("GSTIN").fill("99AABCP1234F1Z5");
  await expect(page.getByText("aren’t a state code", { exact: false })).toBeVisible();
  await page.getByLabel("GSTIN").fill("27AABCP1234F1Z5");
  await expect(page.getByText("Registered in Maharashtra")).toBeVisible();
  await page.getByLabel("Logo file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByText("Use a PNG, JPG, WebP or SVG image.")).toBeVisible();
  await page.getByLabel("Logo file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: LOGO_PNG });
  await expect(page.getByText("The new logo is shown here.")).toBeVisible();
  await page.getByLabel("Registered address").fill("Ground floor, Veera Desai Road, Andheri West, Mumbai 400053");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await noSideways(page, "Settings");
  await expect(page.locator(`header img[src^="data:image/png"]:visible, nav img[src^="data:image/png"]:visible, aside img[src^="data:image/png"]:visible`).first()).toBeVisible();

  await signIn("u_desk_andheri", "/desk/members/mem_arjun?tab=billing");
  await page.getByRole("link", { name: /^(INV|PF)/ }).first().click();
  await expect(page.locator(`.receipt-sheet ${LOGO}:visible`)).toBeVisible();
  await expect(page.locator(`header ${LOGO}:visible, nav ${LOGO}:visible, aside ${LOGO}:visible`).first()).toBeVisible();

  // The audit log: filtered by who, by kind, with an entry’s details and a download.
  await signIn("u_owner", "/owner/policies");
  await page.getByRole("link", { name: "Open the audit log" }).click();
  await expect(page).toHaveURL(/\/owner\/audit\?kind=setup/);
  await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: "Gym settings changed" }).first()).toBeVisible();
  await page.getByLabel("Kind").selectOption({ label: "Everything" });
  await page.getByLabel("Who").selectOption({ label: "Neha Kulkarni, Owner" });
  await expect(page.getByRole("status")).toContainText("1 entry");
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: "Pooja Nair" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Details of Gym settings changed/ }).first().click();
  const entry = dialog(page, "Audit entry");
  await expect(entry).toContainText("Neha Kulkarni, Owner");
  await expect(entry.getByRole("list", { name: "Details" }).or(entry.locator("dl[aria-label=Details]"))).toContainText("Logo: replaced");
  await entry.getByRole("button", { name: "Close" }).first().click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^ember-audit-log-all-branches-2026-11-17\.csv$/);
  await expect(page.getByText("Download ready")).toBeVisible();
  await page.getByRole("button", { name: "Clear the filters" }).click();
  await expect(page.getByLabel("Who")).toHaveValue("");
  await noSideways(page, "Audit log");

  // A branch manager reads what concerns their branch, and has no Settings or Subscription.
  await signIn("u_bm_bandra", "/owner/audit");
  await expect(page.getByText("What concerns this branch")).toBeVisible();
  await expect(page.getByLabel("Who").locator("option", { hasText: "Pooja Nair" })).toHaveCount(0);
  await noSideways(page, "Audit log, branch manager");
  for (const path of ["/owner/settings", "/owner/subscription"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /^(Settings|Subscription)$/, level: 1 })).toHaveCount(0);
  }
}

/**
 * M4 acceptance (R02), the branch manager’s view: Bandra only on every owner screen, in the dashboard, the reports and their downloaded files; the screens that are the owner’s alone are not theirs,
 * and the ones they may read are read-only. The same screens as the owner, side by side, are in the API acceptance test.
 */
export async function scopeJourney(page: Page, signIn: SignIn) {
  await signIn("u_bm_bandra", "/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByText(/visits, Bandra/)).toBeVisible();
  await expect(page.getByText(/Andheri|Powai/).first()).toHaveCount(0);
  await noSideways(page, "Dashboard, branch manager");

  // A report, and the file it downloads, hold Bandra’s invoices and no other branch’s.
  await page.goto("/owner/reports?report=invoices");
  await expect(page.getByText(/For Bandra\./)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;
  const text = (await import("node:fs")).readFileSync(await file.path(), "utf8");
  expect(file.suggestedFilename()).toContain("bandra");
  expect(text).toContain("PFBAN");
  expect(text).not.toMatch(/PFAND|PFPOW/);

  // Screens they may read: their branch only, and read only.
  await page.goto("/owner/staff");
  await expect(page.getByRole("heading", { name: "Staff and roles", level: 1 })).toBeVisible();
  await expect(rowOf(page, "Imran Qureshi")).toBeVisible();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: /Aditya Rao|Kavya Reddy|Tanvi Desai/ })).toHaveCount(0);
  await page.goto("/owner/branches");
  await expect(page.locator("ul[aria-label=Branches] > li")).toHaveCount(1);
  await page.goto("/owner/plans");
  await expect(page.getByText("Only the owner can change plans.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New plan" })).toHaveCount(0);
  await page.goto("/owner/policies");
  await expect(page.getByText("Only the owner can change them.")).toBeVisible();
  await expect(page.getByLabel("Free cancellation until", { exact: true })).toBeDisabled();
  await page.goto("/owner/communications");
  await expect(page.getByRole("heading", { name: "Communications", level: 1 })).toBeVisible();
  await page.goto("/owner/audit");
  await expect(page.getByText("What concerns this branch")).toBeVisible();
  await noSideways(page, "Audit log, branch manager");

  // The owner’s alone: not theirs, whatever address they type.
  for (const path of ["/owner/settings", "/owner/subscription", "/owner/import"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /^(Settings|Subscription|Import members)$/, level: 1 }), path).toHaveCount(0);
  }
  await signIn("u_owner", "/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByText(/visits, /).first()).toBeVisible();
}
