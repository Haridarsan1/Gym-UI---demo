import { expect, type Page } from "@playwright/test";
import { hasHorizontalScroll } from "./helpers";

/** The platform admin’s journeys (M5), shared by the phone spec and the 768 and 1440 px runs. */
type SignIn = (userId: string, path: string) => Promise<void>;
const noSideways = async (page: Page, where: string) => expect(await hasHorizontalScroll(page), `${where}: sideways scroll`).toBe(false);
const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const row = (page: Page, text: string | RegExp) => page.locator("tr:visible, li:visible").filter({ hasText: text }).first();

/**
 * Tenants and subscription states (R01, S01, S02): the list with health, state, use and set-up; a gym’s detail; suspending it with a reason, which the gym’s owner then sees as a read-only gym that
 * refuses changes in plain words and can be paid and reopened; and a second gym that saw none of it.
 */
export async function tenantsJourney(page: Page, signIn: SignIn) {
  await signIn("u_admin", "/admin");
  await expect(page.getByRole("heading", { name: "Tenants", level: 1 })).toBeVisible();
  await expect(row(page, "Pulse Fitness")).toContainText("Growth");
  await expect(row(page, "Pulse Fitness")).toContainText("Paid");
  await expect(row(page, "Pulse Fitness")).toContainText("Needs a look");
  await expect(row(page, "Lotus Strength Club")).toContainText("Free trial");
  await expect(row(page, "Lotus Strength Club")).toContainText("The trial ends in 5 days");
  if ((page.viewportSize()?.width ?? 0) >= 640) { await expect(row(page, "Pulse Fitness")).toContainText("3 of 3 branches"); await expect(row(page, "Pulse Fitness")).toContainText("100%"); }
  await noSideways(page, "Tenants");
  await page.getByRole("button", { name: /^Needs a look/ }).click();
  await expect(row(page, "Lotus Strength Club")).toBeVisible();
  await page.getByRole("button", { name: /^All gyms/ }).click();

  // A new gym starts on a trial with its owner invited, and set-up shows what is left.
  await page.getByRole("button", { name: "New gym" }).click();
  const make = dialog(page, "New gym");
  await make.getByLabel("Gym name").fill("Iron Oak Gym");
  await make.getByLabel("Owner’s name").fill("Farhan Ali");
  await make.getByLabel("Owner’s email").fill("owner@pulsefitness.in");
  await make.getByRole("button", { name: "Create gym" }).click();
  await expect(make.getByText("Someone already has this email. Use another for the owner.")).toBeVisible();
  await make.getByLabel("Owner’s email").fill("farhan@ironoak.example");
  await make.getByRole("button", { name: "Create gym" }).click();
  await expect(page.getByRole("heading", { name: "Iron Oak Gym", level: 1 })).toBeVisible();
  const steps = page.getByRole("list", { name: "Onboarding steps" });
  await expect(steps).toContainText("Owner invited");
  await expect(steps.getByText("Branches configured")).toBeVisible();
  await expect(page.getByText("50%").first()).toBeVisible();
  await noSideways(page, "New gym");

  // Pulse Fitness: plan, entitlements, billing and Ember’s invoices to it.
  await page.goto("/admin");
  await row(page, "Pulse Fitness").getByRole("link", { name: "Open Pulse Fitness" }).or(page.getByRole("link", { name: "Open Pulse Fitness" })).first().click();
  await expect(page.getByRole("heading", { name: "Pulse Fitness", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Use against limits" })).toContainText("3 of 3");
  await expect(page.getByRole("list", { name: "Entitlements" })).toContainText("Reports and CSV downloads");
  await expect(page.getByRole("list", { name: "Software invoices" })).toContainText("EMB/26-27/0004");
  await expect(page.getByText("Separate from the invoices it raises for its members.")).toBeVisible();
  await noSideways(page, "Tenant detail");

  // Suspending needs a reason, and the gym follows at once.
  await page.getByLabel("Change the state").selectOption({ label: "Suspended" });
  await expect(page.getByText("The gym is read-only.", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Change state" }).click();
  const confirm = dialog(page, "Change the subscription state");
  await confirm.getByRole("button", { name: "Make suspended" }).click();
  await expect(confirm.getByText("Say why the state is changing. The gym’s owner can read it.")).toBeVisible();
  await confirm.getByLabel("Reason").fill("Payment not received after two reminders");
  await confirm.getByRole("button", { name: "Make suspended" }).click();
  await expect(page.getByText("Now suspended")).toBeVisible();

  // The gym’s owner sees a read-only gym, in words, and changes are refused in words.
  await signIn("u_owner", "/owner");
  await expect(page.getByRole("status", { name: "Subscription" })).toContainText("This gym is read-only");
  await page.goto("/owner/subscription");
  await expect(page.getByRole("status", { name: "What this means" })).toContainText("The subscription is suspended.");
  await expect(page.getByRole("button", { name: /^Pay .* and reactivate$/ })).toBeVisible();
  await noSideways(page, "Subscription, suspended");
  await page.goto("/owner/policies");
  await expect(page.getByLabel("Free cancellation until", { exact: true })).toBeDisabled();
  // The desk can look and can’t check in.
  await signIn("u_desk_andheri", "/desk/members/mem_arjun");
  await expect(page.getByRole("status", { name: "Subscription" })).toContainText("read-only");
  await expect(page.getByRole("heading", { name: "Arjun Kumar", level: 1 })).toBeVisible();
  // A downloadable report still works for the owner.
  await signIn("u_owner", "/owner/reports?report=invoices");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await download).suggestedFilename()).toContain("invoices");

  // The other gym is untouched and has none of Pulse’s people.
  await signIn("u_lotus_owner", "/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByRole("status", { name: "Subscription" })).toHaveCount(0);
  await page.goto("/owner/staff");
  await expect(row(page, "Anita Desai")).toBeVisible();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: /Neha Kulkarni|Pooja Nair|Meera Joshi/ })).toHaveCount(0);
  await noSideways(page, "Lotus staff");

  // Paying reopens Pulse at once, and the owner’s audit log says who suspended it and why.
  await signIn("u_owner", "/owner/subscription");
  await page.getByRole("button", { name: /^Pay .* and reactivate$/ }).click();
  await expect(page.getByText("The gym is open again")).toBeVisible();
  await expect(page.getByRole("status", { name: "What this means" })).toHaveCount(0);
  await page.goto("/owner/audit");
  await expect(row(page, "Subscription changed")).toBeVisible();
  const entry = page.locator("tr:visible, li:visible").filter({ hasText: "Subscription changed" }).filter({ hasText: "Ember Admin" }).first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.getByText("Payment not received after two reminders").locator("visible=true").first()).toBeVisible();
}

/**
 * Support access (R01, S05): asked for with a reason and a time, announced inside the gym to everyone while it lasts, read-only for the administrator inside it, ended on its own or on request,
 * and written to the gym’s audit log where its owner reads it.
 */
export async function supportJourney(page: Page, signIn: SignIn) {
  await signIn("u_admin", "/admin/support?tenant=t_pulse");
  await expect(page.getByRole("heading", { name: "Support access", level: 1 })).toBeVisible();
  await noSideways(page, "Support");
  await page.getByLabel("Why you need access").fill("help");
  await page.getByRole("button", { name: "Start support access" }).click();
  await expect(page.getByText("Say why you need access, in at least 10 characters. The gym’s owner can read it.")).toBeVisible();
  await page.getByLabel("Why you need access").fill("Help the owner fix the member import");
  await page.getByRole("radio", { name: "60 minutes" }).check();
  await page.getByRole("button", { name: "Start support access" }).click();
  await expect(page.getByText("Support access started")).toBeVisible();
  const active = page.getByRole("list", { name: "Active support access" });
  await expect(active).toContainText("Pulse Fitness");
  await expect(active).toContainText("until 1:00 pm");

  // Everyone in that gym is told, and the other gym is not.
  await signIn("u_member_arjun", "/m");
  await expect(page.getByRole("status", { name: "Support access" })).toContainText("Ember support has read-only access to this gym.");
  await expect(page.getByRole("status", { name: "Support access" })).toContainText("Help the owner fix the member import");
  await signIn("u_desk_andheri", "/desk");
  await expect(page.getByRole("status", { name: "Support access" })).toBeVisible();
  await signIn("u_lotus_owner", "/owner");
  await expect(page.getByRole("status", { name: "Support access" })).toHaveCount(0);

  // Inside, the administrator has the owner’s views and nothing more.
  await signIn("u_admin", "/admin/support");
  await page.getByRole("button", { name: "Open Pulse Fitness" }).click();
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  const banner = page.getByRole("status", { name: "Support access" });
  await expect(banner).toContainText("You are inside this gym under support access, read-only.");
  await expect(banner).toContainText(/It ends at 1:00 pm, in 6[01] minutes\./);
  await page.goto("/owner/plans");
  await expect(page.getByRole("heading", { name: "Plans and pricing", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "New plan" })).toHaveCount(0);
  await page.goto("/owner/policies");
  await expect(page.getByLabel("Free cancellation until", { exact: true })).toBeDisabled();
  await page.goto("/owner/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toHaveCount(0);
  await page.goto("/owner/audit");
  await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
  await noSideways(page, "Audit log, in support");
  const log = page.getByRole("region", { name: /Audit log|Delivery/ }).or(page.locator("main"));
  await expect(log).toContainText("Support access started");
  await expect(log).toContainText("Support looked at a screen");

  // Ending it puts the administrator back in their own console, and the session is over.
  await page.getByRole("button", { name: "End support access" }).click();
  await expect(page).toHaveURL(/\/admin\/support$/);
  await expect(page.getByRole("heading", { name: "Support access", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Support sessions" })).toContainText("Ended early.");
  await expect(page.getByRole("list", { name: "Active support access" })).toHaveCount(0);

  // The gym’s owner reads all of it in their own audit log.
  await signIn("u_owner", "/owner/audit?kind=access");
  await expect(row(page, "Support access started")).toContainText("Ember Admin");
  await row(page, "Support access started").click();
  await expect(page.getByText("Help the owner fix the member import").locator("visible=true").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row(page, "Support looked at a screen")).toBeVisible();
  await expect(row(page, "Support access ended")).toBeVisible();
  await expect(page.getByRole("status", { name: "Support access" })).toHaveCount(0);

  // A session that runs out ends by itself, with the administrator put back and the owner told.
  await signIn("u_admin", "/admin/support?tenant=t_pulse");
  await page.getByLabel("Why you need access").fill("Check the reminder emails");
  await page.getByRole("radio", { name: "15 minutes" }).check();
  await page.getByRole("button", { name: "Start support access" }).click();
  await expect(page.getByText("Support access started")).toBeVisible();
  await page.getByRole("button", { name: "Open Pulse Fitness" }).click();
  await expect(page.getByRole("status", { name: "Support access" })).toContainText("You are inside this gym");
  await page.clock.fastForward("16:00");
  await expect(page).toHaveURL(/\/admin\/support$/, { timeout: 15_000 });
  await expect(page.getByRole("list", { name: "Support sessions" })).toContainText("Ended by itself when the time ran out.");
  await signIn("u_owner", "/owner/audit?kind=access");
  await expect(page.locator("main")).toContainText("Support access ended");
}

/**
 * Ember plans and limits (S02): a plan’s limits edited and enforced where a gym adds people, the message with its way out, the upgrade asked for by the owner and approved by the platform, a new
 * plan made, and a plan with gyms on it that can’t be withdrawn.
 */
export async function saasPlansJourney(page: Page, signIn: SignIn) {
  await signIn("u_admin", "/admin/plans");
  await expect(page.getByRole("heading", { name: "SaaS plans", level: 1 })).toBeVisible();
  const plans = page.getByRole("list", { name: "Ember plans" });
  await expect(plans).toContainText("Starter");
  await expect(plans).toContainText("Growth");
  await expect(plans.getByRole("listitem").filter({ hasText: "Growth" })).toContainText("2 gyms on it: Lotus Strength Club, Pulse Fitness");
  await noSideways(page, "SaaS plans");

  // Lowering Growth’s staff limit to what Pulse already uses stops it adding anyone, with a way out.
  await page.getByRole("button", { name: "Edit Growth" }).click();
  const editor = dialog(page, "Plan: Growth");
  await editor.getByLabel("Staff accounts").fill("x");
  await editor.getByRole("button", { name: "Save plan" }).click();
  await expect(editor.getByText("Enter a whole number above 0, or leave it empty for no limit.")).toBeVisible();
  await editor.getByLabel("Staff accounts").fill("12");
  await editor.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("Plan saved")).toBeVisible();
  await expect(plans.getByRole("listitem").filter({ hasText: "Growth" })).toContainText("12");

  await signIn("u_owner", "/owner/staff");
  await page.getByRole("button", { name: "Invite staff" }).first().click();
  const invite = dialog(page, "Invite staff");
  await invite.getByLabel("Name", { exact: true }).fill("Ritu Verma");
  await invite.getByLabel("Email").fill("ritu.verma@pulsefitness.in");
  await invite.getByRole("radio", { name: /^Front desk/ }).check();
  await invite.getByRole("checkbox", { name: "Bandra" }).check();
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(invite.getByRole("alert").filter({ hasText: "Your Growth plan allows 12 staff accounts and 12 are in use." })).toBeVisible();
  await invite.getByRole("link", { name: "Ask for a larger plan" }).click();
  await expect(page.getByRole("heading", { name: "Subscription", level: 1 })).toBeVisible();
  await page.getByLabel("Ask for another plan").selectOption({ label: "Pro, ₹7,999 a month" });
  await page.getByLabel("A note for Ember").fill("We are hiring two more trainers");
  await page.getByRole("button", { name: "Ask Ember" }).click();
  await expect(page.getByText("Request sent to Ember")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "It is waiting for an answer" })).toContainText("Pro");
  await noSideways(page, "Subscription, request");

  await signIn("u_admin", "/admin/tenants/t_pulse");
  await expect(page.getByRole("list", { name: "Plan requests" })).toContainText("Neha Kulkarni asked for Pro");
  await expect(page.getByRole("list", { name: "Plan requests" })).toContainText("We are hiring two more trainers");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status").getByText("Approved")).toBeVisible();
  await expect(page.getByText("Pulse Fitness is now on Pro.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pulse Fitness", level: 1 })).toBeVisible();
  await signIn("u_owner", "/owner/subscription");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pro", level: 2 })).toBeVisible();
  await signIn("u_owner", "/owner/staff");
  await page.reload();
  await page.getByRole("button", { name: "Invite staff" }).first().click();
  const again = dialog(page, "Invite staff");
  await again.getByLabel("Name", { exact: true }).fill("Ritu Verma");
  await again.getByLabel("Email").fill("ritu.verma@pulsefitness.in");
  await again.getByRole("radio", { name: /^Front desk/ }).check();
  await again.getByRole("checkbox", { name: "Bandra" }).check();
  await again.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();

  // A new plan, and withdrawing: a plan with gyms on it can’t go.
  await signIn("u_admin", "/admin/plans");
  await page.getByRole("button", { name: "New plan" }).click();
  const make = dialog(page, "New plan");
  await make.getByLabel("Name").fill("Studio");
  await make.getByLabel("Price a month before GST (₹)").fill("1999");
  await make.getByLabel("Branches").fill("1");
  await make.getByLabel("Active members").fill("50");
  await make.getByRole("checkbox", { name: "Reports and CSV downloads" }).check();
  await make.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("Plan made")).toBeVisible();
  const studio = plans.getByRole("listitem").filter({ hasText: "Studio" });
  await expect(studio).toContainText("₹1,999 a month before GST");
  await studio.getByRole("button", { name: "Withdraw from sale" }).click();
  await expect(page.getByText("Withdrawn").first()).toBeVisible();
  await expect(plans.getByRole("listitem").filter({ hasText: "Growth" }).getByRole("button", { name: "Withdraw from sale" })).toHaveCount(0);
}
