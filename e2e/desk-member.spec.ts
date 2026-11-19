import { expect, test } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";
import { memberLifecycleJourney } from "./trainer-journeys";

/** The member profile and lifecycle (M02, A02) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Member profile on a phone", () => {
  test("freeze, upgrade with a credit note, cancel with “Request refund”, and change trainer", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_desk_andheri", "/desk");
    await memberLifecycleJourney(page);
    expect(problems).toEqual([]);
  });

  test("a frozen member is denied at the door, with the reason, until the freeze ends", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk/members/mem_arjun");
    await page.getByRole("button", { name: "Freeze", exact: true }).click();
    await page.getByRole("dialog", { name: "Freeze membership" }).getByLabel("Reason").fill("Travel");
    await page.getByRole("dialog", { name: "Freeze membership" }).getByRole("button", { name: "Freeze membership" }).click();
    await expect(page.getByText("Arjun’s membership is frozen")).toBeVisible();
    await page.goto("/desk");
    await page.getByRole("combobox", { name: /Search members/ }).fill("arjun");
    await page.getByRole("option", { name: /Arjun Kumar/ }).getByRole("button").click();
    await expect(page.getByRole("region", { name: "Check-in result" })).toHaveAttribute("data-result", "denied");
    await expect(page.getByRole("region", { name: "Check-in result" })).toContainText("frozen until 23 Nov 2026");
  });

  test("buttons that can’t be used say why, and finance sees the profile without the lifecycle buttons", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk/members/mem_priya");
    await expect(page.getByRole("heading", { name: "Priya Sharma", level: 1 })).toBeVisible();
    // Priya has an open renewal invoice, so changing her plan waits for it; there is nothing to unfreeze or take back.
    await expect(page.getByRole("button", { name: "Renew or change plan" })).toBeDisabled();
    await expect(page.getByText("An invoice for a renewal or upgrade is still open.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Unfreeze", exact: true })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Open invoices" })).toContainText("overdue");
    await signInAs(page, "u_finance", "/desk/members/mem_arjun");
    await expect(page.getByRole("heading", { name: "Arjun Kumar", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Freeze", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Renew or change plan" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change trainer" })).toHaveCount(0);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("the desk never sees health information on a member, and another branch’s member is not found", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk/members/mem_arjun");
    for (const tab of ["Membership", "Invoices and payments", "Training credits", "Bookings and check-ins", "Trainer", "Messages"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByText(/assessment|progress photo|private note/i).filter({ hasNotText: "never sees" })).toHaveCount(0);
    }
    await page.goto("/desk/members/mem_rahul");
    await expect(page.getByText("We couldn’t open this member")).toBeVisible();
    await expect(page.getByText("They may belong to another branch.")).toBeVisible();
  });
});
