import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";
import { coachLogJourney } from "./trainer-journeys";

/** Coach-led logging (T05) on a phone. Wider layouts run the same journey in desktop-flows.spec.ts. */
test.describe("Coach-led logging on a phone", () => {
  test("logs a missed session for a client, then corrects it without losing the original", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await signInAs(page, "u_trainer_meera", "/t");
    await coachLogJourney(page);
    expect(problems).toEqual([]);
  });

  test("a finished coach log shows who entered it and offers a correction; another trainer cannot open it", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/log?client=mem_074&date=2026-11-16");
    await expect(page.getByRole("article", { name: "Finished log" })).toContainText("Entered by Coach Meera");
    await expect(page.getByRole("button", { name: "Correct this log" })).toBeVisible();
    await signInAs(page, "u_trainer_farah", "/t/log?client=mem_074&date=2026-11-16");
    await expect(page.getByText("We couldn’t open this session")).toBeVisible();
  });

  test("a client with nothing scheduled says what to do, and members cannot open the screen", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/log?client=mem_129");
    await expect(page.getByText("No workouts in the last two weeks")).toBeVisible();
    await signInAs(page, "u_member_arjun", "/t/log");
    await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Log a session" })).toHaveCount(0);
  });
});
