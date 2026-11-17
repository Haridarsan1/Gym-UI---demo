import type { Page } from "@playwright/test";
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
