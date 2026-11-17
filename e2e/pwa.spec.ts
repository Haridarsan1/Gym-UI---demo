import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/** Runs against a production build (npm run e2e:pwa). */

const controlled = (page: Page) =>
  page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return !!navigator.serviceWorker.controller;
  });

/** Opens the app signed in, and waits until a service worker is controlling the page. */
async function openAppWithWorker(page: Page) {
  await signInAs(page, "u_member_arjun", "/m");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // the first load happens before the worker takes over
  await expect.poll(() => controlled(page)).toBe(true);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
}

test("the manifest describes an installable app with real icons", async ({ page, request }) => {
  await page.goto("/");
  expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.webmanifest");
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: "Ember", short_name: "Ember", start_url: "/app", scope: "/", display: "standalone", background_color: "#FBF8F4" });
  const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of m.icons as Array<{ src: string; type: string }>) {
    const r = await request.get(icon.src);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()["content-type"]).toContain(icon.type);
  }
});

test("marketing pages never install the service worker", async ({ page }) => {
  for (const path of ["/", "/signup", "/login"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  await page.waitForTimeout(1000);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test("opening the app installs it", async ({ page }) => {
  await openAppWithWorker(page);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
});

test("the service worker caches static files and app code, never index.html", async ({ page, request }) => {
  await openAppWithWorker(page);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const n of names.filter((x) => x.includes("precache"))) urls.push(...(await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname));
    return urls;
  });
  expect(cached.some((u) => /^\/assets\/index-.*\.js$/.test(u))).toBe(true);
  expect(cached.some((u) => /^\/assets\/AppEntry-.*\.js$/.test(u))).toBe(true);
  expect(cached.some((u) => u.endsWith(".woff"))).toBe(true);
  expect(cached.some((u) => u.startsWith("/icons/"))).toBe(true);
  expect(cached.filter((u) => u === "/" || u.endsWith(".html"))).toEqual([]);
  expect(cached.some((u) => /HomePage|TrialSignupPage|latin-ext|og-image/.test(u))).toBe(false);

  const sw = await (await request.get("/sw.js")).text();
  expect(sw).toContain("NetworkFirst");
  expect(sw).toContain("skipWaiting");
  expect(sw).not.toMatch(/url:\s*"index\.html"/);
  expect(sw).not.toContain("NavigationRoute");
});

test("page loads go to the network first and the last copy opens the app when offline", async ({ page, context }) => {
  await openAppWithWorker(page);
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("pages")).keys()).map((r) => new URL(r.url).pathname)), { timeout: 10_000 }).toContain("/m");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await context.setOffline(false);
});

test("shows “New version available” when a new service worker takes over, and Reload reloads", async ({ page, request }) => {
  await openAppWithWorker(page);
  await expect(page.getByText("New version available")).toHaveCount(0);

  // A deploy changes the worker file. The test server serves a different sw.js from now on.
  await request.post("/__deploy");
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());

  const toast = page.getByRole("status").filter({ hasText: "New version available" });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(toast.getByText("Reload to get the latest changes.")).toBeVisible();
  // It stays until dismissed.
  await page.waitForTimeout(6000);
  await expect(toast).toBeVisible();

  const navigated = page.waitForNavigation();
  await toast.getByRole("button", { name: "Reload" }).click();
  await navigated;
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByText("New version available")).toHaveCount(0);
});

test("a deploy shows up on the next page load, even with the service worker in control", async ({ page, request }) => {
  const deployNumber = (html: string) => Number(html.match(/<!-- deploy (\d+) -->/)?.[1] ?? 0);
  await openAppWithWorker(page);
  // Load once more so the worker has handled a page load and kept its own copy for offline use.
  await page.reload();
  await expect.poll(() => page.evaluate(async () => (await (await caches.open("pages")).keys()).length)).toBeGreaterThan(0);
  const before = deployNumber(await page.content());

  await request.post("/__deploy");
  await page.reload();
  // The page the browser loaded is the new one, not the copy the worker kept.
  expect(deployNumber(await page.content())).toBe(before + 1);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
});

test("a lazy screen that a deploy removed offers the same reload", async ({ page }) => {
  await signInAs(page, "u_owner", "/owner");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("vite:preloadError")));
  await expect(page.getByRole("status").filter({ hasText: "New version available" })).toBeVisible();
});
