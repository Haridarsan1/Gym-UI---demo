import { expect, test } from "@playwright/test";
import { hasHorizontalScroll, readStore, signInAs } from "./helpers";
import { checkInJourney } from "./trainer-journeys";

/** Check-in at the front desk (M05) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Check-in on a phone", () => {
  test("search, allowed, repeat, dues, grace, turned away and an override with a reason", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_desk_andheri", "/desk");
    await checkInJourney(page);
    expect(problems).toEqual([]);
  });

  test("the result is large and readable: at least 32 px, with the words as well as the colour", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk");
    await page.getByRole("combobox", { name: /Search members/ }).fill("arjun");
    await page.getByRole("option", { name: /Arjun Kumar/ }).getByRole("button").click();
    const headline = page.getByRole("region", { name: "Check-in result" }).getByRole("heading", { level: 2 });
    await expect(headline).toHaveText("Checked in");
    expect(await headline.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(32);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("the answer is on screen in under a second", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk");
    const box = page.getByRole("combobox", { name: /Search members/ });
    await box.fill("arjun");
    const option = page.getByRole("option", { name: /Arjun Kumar/ });
    await expect(option).toBeVisible();
    // Real time: the page clock in these tests is faked, so the stopwatch is the page’s own monotonic timer.
    const ms = await page.evaluate(async () => {
      const t0 = performance.now();
      (document.querySelector('[role="option"] button') as HTMLButtonElement).click();
      await new Promise<void>((resolve) => { const i = setInterval(() => { if (document.querySelector('[data-result]')) { clearInterval(i); resolve(); } }, 5); });
      return performance.now() - t0;
    });
    expect(ms).toBeLessThan(1000);
  });

  test("an unknown name says what to do, and finance and members cannot open check-in", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk");
    await page.getByRole("combobox", { name: /Search members/ }).fill("zzzzzz");
    await expect(page.getByText(/No member matches “zzzzzz” at this branch/)).toBeVisible();
    await signInAs(page, "u_finance", "/desk");
    await expect(page).not.toHaveURL(/\/desk$/);
    await signInAs(page, "u_member_arjun", "/m");
    await page.goto("/desk");
    await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
  });

  test("a front desk member at one branch sees only that branch’s members and check-ins", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk");
    await page.getByRole("combobox", { name: /Search members/ }).fill("rahul");
    await expect(page.getByRole("listbox", { name: "Matching members" })).toBeVisible();
    for (const o of await page.getByRole("option").all()) await expect(o).not.toContainText("Bandra");
    expect((await readStore(page, "members")).length).toBeGreaterThan(100);
  });
});
