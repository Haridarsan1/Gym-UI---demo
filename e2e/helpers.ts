import { expect, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../src/app/demoAccounts";

/** Signs in as one of the demo people by writing the session the login page would write, then opens `path`. */
export async function signInAs(page: Page, userId: string, path = "/app") {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId);
  if (!a) throw new Error(`No demo account ${userId}`);
  await page.goto("/login");
  await page.evaluate(
    (s) => {
      localStorage.setItem("ember.session", JSON.stringify(s));
      // No simulated delay or failures in tests.
      localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 0 }));
    },
    { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits },
  );
  await page.goto(path);
  // Wait for the app to mount (past the lazy load and the demo setup) so key presses and taps land.
  await page.getByRole("heading", { level: 1 }).first().waitFor();
}

export const hasHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

/** Logs every open set of the exercise on screen as prescribed (or as pre-filled). */
export async function logRemainingSets(page: Page) {
  const log = page.getByRole("button", { name: "Log set" });
  while (await log.count()) {
    const list = page.getByRole("list", { name: /^Sets,/ });
    const before = await list.getAttribute("aria-label");
    await log.click();
    await expect(list).not.toHaveAttribute("aria-label", before!);
  }
}

/**
 * Starts Arjun’s workout and goes through it. `exercises` limits how many exercises are logged (the rest are left, so the
 * workout is partly done). `heavyBench` lifts 200 kg on the first set of the bench press, which is a personal record.
 * Leaves the Finish sheet open.
 */
export async function doWorkout(page: Page, opts: { exercises?: number; heavyBench?: boolean } = {}) {
  await signInAs(page, "u_member_arjun", "/m");
  await page.getByRole("link", { name: "Start workout" }).click();
  await expect(page.getByRole("heading", { name: "Arm circles", level: 2 })).toBeVisible();
  const count = opts.exercises ?? 7;
  for (let i = 0; i < count; i++) {
    const name = await page.getByRole("heading", { level: 2 }).first().textContent();
    if (opts.heavyBench && name === "Dumbbell bench press") await page.getByRole("form", { name: "Set 1" }).getByRole("textbox", { name: "Load (kg)" }).fill("200");
    await logRemainingSets(page);
    if (i < count - 1) await page.getByRole("button", { name: "Next exercise" }).click();
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
}
