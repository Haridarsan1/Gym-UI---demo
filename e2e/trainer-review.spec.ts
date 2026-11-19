import { expect, test } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";
import { reviewJourney } from "./trainer-journeys";

/** The review (T06, P04) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Review on a phone", () => {
  test("shares feedback with a follow-up date, keeps a private note, and confirms a goal that shows Target reached", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_trainer_meera", "/t");
    await reviewJourney(page);
    expect(problems).toEqual([]);
  });

  test("shows the client’s latest check-in, trends and goals; a goal that has not reached its target has no Confirm button", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/clients/mem_arjun/review");
    await expect(page.getByRole("heading", { name: "Arjun’s latest check-in" })).toBeVisible();
    await expect(page.getByText("“Work travel on Thursday.”")).toBeVisible();
    await expect(page.getByText(/^Sent .*, (after|before) your last review$/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trends, last 12 weeks" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Goals" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm achieved" })).toHaveCount(0);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("what is shared reaches the member and a private note never does", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/clients/mem_arjun/review");
    await page.getByLabel("Feedback for Arjun").fill("Bench is moving well. Keep the same loads this week.");
    await page.getByRole("button", { name: "Share review" }).click();
    await expect(page.getByText("Review shared with Arjun")).toBeVisible();
    await page.getByRole("radio", { name: /Private note/ }).click();
    await page.getByLabel("Your note").fill("Mention the shoulder at the next session.");
    await page.getByRole("button", { name: "Save private note" }).click();
    await expect(page.getByText("Private note saved")).toBeVisible();
    // The same browser keeps the demo database; switch to the member.
    await page.evaluate(() => localStorage.removeItem("ember.session"));
    await signInAs(page, "u_member_arjun", "/m/progress/reviews");
    await expect(page.getByText("Bench is moving well. Keep the same loads this week.")).toBeVisible();
    await expect(page.getByText("Mention the shoulder")).toHaveCount(0);
  });

  test("a write that is too short, or a follow-up in the past, says what is wrong and saves nothing", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/clients/mem_arjun/review");
    await page.getByRole("button", { name: "Share review" }).click();
    await expect(page.getByRole("alert")).toContainText("Write the feedback first. It is what Arjun reads.");
    await page.getByLabel("Feedback for Arjun").fill("A short review.");
    await page.getByLabel("Follow-up date").fill("2026-11-10");
    await page.getByRole("button", { name: "Share review" }).click();
    await expect(page.getByRole("alert")).toContainText("Choose a follow-up date after today.");
  });

  test("another trainer cannot open it: the client is not found", async ({ page }) => {
    await signInAs(page, "u_trainer_farah", "/t");
    await page.goto("/t/clients/mem_arjun/review");
    await expect(page.getByText("We couldn’t open this review")).toBeVisible();
    await expect(page.getByText("We couldn’t find this client.")).toBeVisible();
  });

  test("a member cannot open it", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    await page.goto("/t/clients/mem_arjun/review");
    await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
  });
});
