import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, chrome } from "./helpers";

/**
 * Milestone M0, “done when”: each role lands on its own empty home inside its shell, on phone and desktop, with the
 * correct navigation. These tests go in through the login page, like a person would.
 */

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

interface Role {
  pick: RegExp;
  name: string;
  url: RegExp;
  home: string | RegExp;
  /** Links in the main navigation on a phone (bottom bar) and on a desktop (sidebar or bottom bar). */
  phone: string[];
  desktop: string[];
  /** Links that must not appear anywhere in the navigation. */
  absent: string[];
  /** True once the area’s home is a real screen, not a placeholder. */
  built?: boolean;
}

const roles: Role[] = [
  { pick: /^Member/, built: true, name: "Arjun Kumar", url: /\/m$/, home: /^Good (morning|afternoon|evening), Arjun$/, phone: ["Today", "Program", "Start today’s workout", "Progress", "Bookings"], desktop: ["Today", "Program", "Start today’s workout", "Progress", "Bookings"], absent: ["Clients", "Dashboard", "Refunds"] },
  { pick: /^Trainer/, name: "Meera Joshi", url: /\/t$/, built: true, home: /^Good (morning|afternoon|evening), Meera$/, phone: ["Today", "Clients", "Log session", "Schedule", "Exercises"], desktop: ["Today", "Clients", "Log session", "Schedule", "Exercises"], absent: ["Program", "Bookings", "Dashboard"] },
  { pick: /^Front desk/, built: true, name: "Pooja Nair", url: /\/desk$/, home: "Check-in", phone: ["Check-in", "Members", "Bookings", "Dues"], desktop: ["Check-in", "New member", "Members", "Collect payment", "Bookings", "Dues"], absent: ["Refunds", "Reconciliation", "Exports", "Invoices and payments", "Reports", "Settings"] },
  { pick: /^Finance/, name: "Deepa Menon", url: /\/desk\/finance\/invoices$/, home: "Invoices and payments", phone: ["Members", "Dues", "Collect payment", "Invoices and payments"], desktop: ["Members", "Collect payment", "Dues", "Invoices and payments", "Refunds", "Reconciliation", "Exports"], absent: ["Check-in", "New member", "Bookings", "Settings"] },
  { pick: /^Owner/, name: "Neha Kulkarni", url: /\/owner$/, home: "Dashboard", phone: ["Dashboard", "Reports", "Members", "Plans and pricing"], desktop: ["Dashboard", "Reports", "Members", "Plans and pricing", "Staff and roles", "Branches", "Policies", "Communications", "Import members", "Subscription", "Audit log", "Settings"], absent: ["Check-in", "Tenants"] },
  { pick: /^Branch manager/, name: "Rohit Sethi", url: /\/owner$/, home: "Dashboard", phone: ["Dashboard", "Reports", "Members", "Plans and pricing"], desktop: ["Dashboard", "Reports", "Members", "Plans and pricing", "Branches", "Communications", "Audit log"], absent: ["Staff and roles", "Policies", "Import members", "Subscription", "Settings"] },
  { pick: /^Platform admin/, name: "Ember Admin", url: /\/admin$/, home: "Tenants", phone: ["Tenants", "Support access", "SaaS plans"], desktop: ["Tenants", "Support access", "SaaS plans"], absent: ["Members", "Dashboard", "Check-in"] },
];

for (const role of roles) {
  test(`${role.name} logs in, lands on ${role.home} inside the right shell, and signs out`, async ({ page, isMobile }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: role.pick }).click();
    await expect(page).toHaveURL(role.url);
    await expect(page.getByRole("heading", { name: role.home, level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: `Account menu for ${role.name}` })).toBeVisible();

    // Until an area’s milestone builds its home, it is a placeholder that says which milestone does.
    if (!role.built) await expect(page.getByText(/is built in milestone M\d/)).toBeVisible();

    // Correct navigation for this role, for this screen size.
    for (const label of isMobile ? role.phone : role.desktop) await expect(nav(page).getByRole("link", { name: label, exact: true }), label).toBeVisible();
    for (const label of role.absent) await expect(page.getByRole("link", { name: label, exact: true }), `${label} should be hidden`).toHaveCount(0);

    // No sideways scroll and a skip link.
    expect(await hasHorizontalScroll(page)).toBe(false);
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveCount(1);

    await chrome(page).getByRole("button", { name: /Account menu/ }).click();
    await chrome(page).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
}

test.describe("every screen in the navigation opens", () => {
  const sweeps: Array<[RegExp, string[]]> = [
    [/^Owner/, ["Dashboard", "Reports", "Members", "Plans and pricing", "Staff and roles", "Branches", "Policies", "Communications", "Import members", "Subscription", "Audit log", "Settings"]],
    [/^Front desk/, ["Check-in", "New member", "Members", "Collect payment", "Bookings", "Dues"]],
    [/^Finance/, ["Invoices and payments", "Refunds", "Reconciliation", "Exports"]],
    [/^Platform admin/, ["Tenants", "Support access", "SaaS plans"]],
  ];
  for (const [pick, titles] of sweeps) {
    test(`${pick.source.slice(1)}`, async ({ page, isMobile }) => {
      test.skip(isMobile, "The sidebar lists them all on desktop. Phones are covered by the More sheet test.");
      await page.goto("/login");
      await page.getByRole("button", { name: pick }).click();
      for (const title of titles) {
        await nav(page).getByRole("link", { name: title, exact: true }).click();
        await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
      }
    });
  }
});

test("a first open builds the demo gym in under a second, even with a slowed-down CPU", async ({ page, context }) => {
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); // roughly a mid-range Android phone
  await page.getByRole("button", { name: /^Owner/ }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  const ms = await page.evaluate(() => performance.getEntriesByName("demo-seed")[0]?.duration ?? -1);
  expect(ms).toBeGreaterThan(0);
  expect(ms).toBeLessThan(1000);
});

test("motion stops with reduced motion, and the information stays", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/design");
  const skeleton = page.locator(".skeleton").first();
  const duration = await skeleton.evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(duration).toBeLessThan(0.001);
  const button = page.locator("button.btn3d").first();
  expect(await button.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
  await expect(page.getByRole("heading", { name: "Skeletons" }).or(page.getByRole("heading", { name: "Loading" }))).toBeVisible();
});

test("the sample gym is the same for everyone who opens it", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /^Owner/ }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  const counts = await page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const open = indexedDB.open("ember-demo");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const out: Record<string, number> = {};
          const names = ["members", "memberships", "users", "branches", "trainerAssignments"];
          const tx = db.transaction(names, "readonly");
          names.forEach((n) => (tx.objectStore(n).count().onsuccess = (e) => (out[n] = (e.target as IDBRequest<number>).result)));
          tx.oncomplete = () => resolve(out);
        };
      }),
  );
  expect(counts).toMatchObject({ members: 150, branches: 3, users: 16 });
  expect(counts.memberships).toBeGreaterThanOrEqual(150);
});

test("the ring and streak describe themselves in words", async ({ page }) => {
  await page.goto("/dev/design");
  await expect(page.getByRole("img", { name: "2 of 4 workouts done this week" })).toBeVisible();
  await expect(page.getByRole("img", { name: "6-week streak", exact: true })).toBeVisible();
  await expect(page.getByText("Finish your first week to start a streak")).toBeVisible();
  await expect(page.getByRole("img", { name: "6-week streak, paused" })).toBeVisible();
});
