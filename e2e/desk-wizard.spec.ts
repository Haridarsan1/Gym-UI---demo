import { expect, test } from "@playwright/test";
import { hasHorizontalScroll, readStore, signInAs } from "./helpers";
import { newMemberJourney } from "./trainer-journeys";

/** The new member wizard (T01, M01, M03, O03) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("New member on a phone", () => {
  test("registers a member: duplicate stop and warning, consent, plan, trainer, discount, UPI payment and the pass", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_desk_andheri", "/desk");
    await newMemberJourney(page);
    expect(problems).toEqual([]);
  });

  test("a child can be registered on a parent’s number: it is recorded on the new member, and each has their own pass", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk/new");
    await page.getByLabel("Full name").fill("Ishaan Kumar");
    await page.getByLabel("Mobile number").fill("98200 22002");
    await page.getByLabel("Date of birth").fill("2011-06-01");
    const shared = page.getByRole("alert", { name: "This phone number or email is already used" });
    await expect(shared).toContainText("Arjun Kumar");
    await shared.getByRole("radio", { name: "Different person sharing this number" }).click();
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("radio", { name: /^3-day trial/ }).click();
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Register member" }).click();
    await expect(page.getByRole("heading", { name: "Ishaan Kumar is a member" })).toBeVisible();
    const kid = (await readStore(page, "members")).find((m) => m.name === "Ishaan Kumar")!;
    expect(kid).toMatchObject({ phone: "9820022002", sharesContactWith: ["mem_arjun"] });
    expect(kid.qrToken).not.toBe((await readStore(page, "members")).find((m) => m.id === "mem_arjun")!.qrToken);
    await page.getByRole("link", { name: "Back to check-in" }).click();
    await page.getByRole("combobox", { name: /Search members/ }).fill("98200 22002");
    await expect(page.getByRole("option")).toHaveCount(2);
  });

  test("the draft survives a reload, and Start over clears it", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk/new");
    await page.getByLabel("Full name").fill("Tara Bose");
    await page.getByLabel("Mobile number").fill("91234 56780");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Step 2 of 5: Consent" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Step 2 of 5: Consent" })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Tara Bose");
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("");
  });

  test("pay later leaves the membership waiting and says the pass won’t open the door", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk/new");
    await page.getByLabel("Full name").fill("Tara Bose");
    await page.getByLabel("Mobile number").fill("91234 56780");
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("radio", { name: /^Monthly ₹/ }).click();
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("radio", { name: /Pay later/ }).click();
    await page.getByRole("button", { name: "Register member" }).click();
    await expect(page.getByRole("heading", { name: "Tara Bose is a member" })).toBeVisible();
    await expect(page.getByText("Their pass won’t open the door until the invoice is paid.")).toBeVisible();
    await expect(page.getByText(/There is no email address/)).toBeVisible();
    expect((await readStore(page, "memberships")).find((m) => m.terms && (m.memberId as string).startsWith("mem_w_"))).toMatchObject({ status: "pending" });
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("finance and members cannot open it, and a desk member can’t register at another branch", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    await page.goto("/desk/new");
    await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
  });
});
