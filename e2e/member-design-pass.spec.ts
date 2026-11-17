import { expect, test, type Page } from "@playwright/test";
import { doWorkout, hasHorizontalScroll, signInAs } from "./helpers";

const GREETING = /^Good (morning|afternoon|evening), Arjun$/;

/** Moves Arjun’s membership end date to `days` from today, in the demo database. */
const endMembershipIn = (page: Page, days: number) =>
  page.evaluate((d) => new Promise<void>((resolve, reject) => {
    const ist = new Date(Date.now() + 5.5 * 3600_000 + d * 86_400_000).toISOString().slice(0, 10);
    const open = indexedDB.open("ember-demo");
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("memberships", "readwrite");
      tx.objectStore("memberships").openCursor().onsuccess = (e) => {
        const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!c) return;
        if (c.value.memberId === "mem_arjun" && c.value.status === "active") c.update({ ...c.value, endsOn: ist });
        c.continue();
      };
      tx.oncomplete = () => (db.close(), resolve());
      tx.onerror = () => reject(tx.error);
    };
  }), days);

test.describe("Today: Arjun, design pass", () => {
  test.beforeEach(async ({ page }) => signInAs(page, "u_member_arjun", "/m"));

  test("the workout card is a warm Ember-tinted surface with the first three exercises and +N more", async ({ page }) => {
    const hero = page.getByRole("region", { name: "Upper body and core" });
    const bg = await hero.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain("linear-gradient");
    expect(bg).toContain("rgb(255, 244, 236)"); // ember-50
    expect(bg).toContain("rgb(255, 230, 214)"); // ember-100
    await expect(hero.getByRole("list", { name: "Exercises" }).getByRole("listitem")).toHaveCount(4);
    await expect(hero.getByRole("link", { name: "Start workout" })).toBeVisible();
  });

  test("the week strip has seven day circles, Monday to Sunday, with today larger", async ({ page }) => {
    const strip = page.getByRole("list", { name: "Days this week" });
    const days = strip.getByRole("link");
    await expect(days).toHaveCount(7);
    await expect(strip.getByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)).toHaveText(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    const today = strip.locator("[data-today='true']");
    await expect(today).toHaveCount(1);
    await expect(strip.locator("[aria-current='date']")).toHaveCount(1);
    const big = (await today.boundingBox())!.width;
    const other = (await strip.locator("[data-today='false']").first().boundingBox())!.width;
    expect(big).toBeGreaterThan(other);
    for (let i = 0; i < 7; i++) expect((await days.nth(i).boundingBox())!.width).toBeGreaterThanOrEqual(44);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("states: planned days are outlined, rest days faint, and a day is named in words", async ({ page }) => {
    const strip = page.getByRole("list", { name: "Days this week" });
    await expect(strip.locator("[data-state='planned']").first()).toBeVisible();
    await expect(strip.locator("[data-state='rest']").first()).toBeVisible();
    await expect(strip.getByRole("link", { name: /today, workout planned, Upper body and core$/ })).toBeVisible();
    await expect(strip.getByRole("link", { name: /rest day$/ }).first()).toBeVisible();
  });

  test("tapping a workout day opens it in Program with its preview; a rest day opens the week", async ({ page }) => {
    await page.getByRole("list", { name: "Days this week" }).getByRole("link", { name: /workout planned, Push$/ }).click();
    await expect(page).toHaveURL(/\/m\/program\?date=\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByRole("dialog", { name: "Workout preview" }).getByRole("heading", { name: "Push" })).toBeVisible();
    await page.goto("/m");
    await page.getByRole("list", { name: "Days this week" }).getByRole("link", { name: /rest day$/ }).first().click();
    await expect(page.getByRole("heading", { name: "Program", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("today’s circle pulses gently, and stops with reduced motion", async ({ page }) => {
    const today = page.locator(".day-bubble[data-today='true']");
    expect(await today.evaluate((el) => getComputedStyle(el).animationName)).toBe("gentle-pulse");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await today.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });

  test("a membership ending within 7 days gets an amber card with a Renew button", async ({ page }) => {
    await expect(page.getByRole("complementary", { name: "Membership ending soon" })).toHaveCount(0); // 21 days left
    await endMembershipIn(page, 3);
    await page.reload();
    const card = page.getByRole("complementary", { name: "Membership ending soon" });
    await expect(card).toContainText("ends in 3 days");
    await expect(card.getByRole("link", { name: "Renew" })).toHaveAttribute("href", "/m/membership?renew=1");
    await expect(card).toHaveCSS("background-color", "rgb(255, 241, 214)");
    await endMembershipIn(page, 8);
    await page.reload();
    await expect(page.getByRole("complementary", { name: "Membership ending soon" })).toHaveCount(0);
  });

  test("with a streak it reads “12-week streak”, in words, with a flame", async ({ page }) => {
    await expect(page.getByRole("region", { name: "This week" }).getByRole("img", { name: /^\d+-week streak$/ })).toBeVisible();
  });
});

test.describe("no uppercase labels and no dot separators in the member app", () => {
  const check = async (page: Page, where: string) => {
    const shouted = await page.evaluate(() => [...document.querySelectorAll("main *, header *, [role='dialog'] *, nav *")].filter((e) => getComputedStyle(e).textTransform === "uppercase").map((e) => e.textContent?.slice(0, 40)));
    expect(shouted, `${where}: uppercase text`).toEqual([]);
    const text = await page.evaluate(() => [document.querySelector("main"), ...document.querySelectorAll("[role='dialog']")].map((e) => e?.textContent ?? "").join(" "));
    expect(text, `${where}: dot separator`).not.toContain("·");
  };

  test("Today, Program, the preview, the session, the rest timer and the summary", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    await check(page, "Today");
    await page.goto("/m/program");
    await expect(page.getByRole("heading", { name: "Program", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /Preview Upper body and core/ }).click();
    await expect(page.getByRole("dialog", { name: "Workout preview" })).toBeVisible();
    await check(page, "Program preview");
    await page.keyboard.press("Escape");
    await check(page, "Program");
    await page.goto("/m");
    await page.getByRole("link", { name: "Start workout" }).click();
    await page.getByRole("button", { name: "Next exercise" }).click();
    await page.getByRole("form", { name: "Set 1" }).getByRole("button", { name: "Log set" }).click();
    await expect(page.getByRole("region", { name: "Rest timer" })).toBeVisible();
    await check(page, "Workout session");
    await page.getByRole("button", { name: "Swap exercise" }).click();
    await check(page, "Swap sheet");
  });

  test("Today as Priya (rest day, overdue invoice), Rahul (frozen) and the workout summary", async ({ page }) => {
    await signInAs(page, "u_member_priya", "/m");
    await check(page, "Priya");
    await signInAs(page, "u_member_rahul", "/m");
    await check(page, "Rahul");
    await doWorkout(page, { exercises: 2 });
    await page.getByRole("dialog", { name: "Finish workout" }).getByRole("button", { name: "Save partly done workout" }).click();
    await expect(page.locator('[data-stage="done"]')).toBeVisible({ timeout: 6000 });
    await check(page, "Workout complete");
  });
});

test.describe("the gym’s own name and logo, never Ember", () => {
  test("the header shows the gym straight away while loading, and while loading fails", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    await expect(page.getByRole("banner")).toContainText("Pulse Fitness");
    // Loading: slow every call down, then reload. The name comes from the cache, so the header is never empty or Ember.
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 1500, maxMs: 1500, failureRate: 0 })));
    await page.reload();
    await expect(page.getByRole("banner")).toContainText("Pulse Fitness", { timeout: 800 });
    await expect(page.getByRole("status", { name: "Loading today" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/\bEmber\b/);
    // Failing: every call fails. The page says what went wrong, under the gym’s own header.
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 1 })));
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("We couldn’t load today");
    await expect(page.getByRole("banner")).toContainText("Pulse Fitness");
    expect(await page.locator("body").innerText()).not.toMatch(/\bEmber\b/);
  });

  test("with no logo the gym’s initials are shown, and the cache is for that gym only", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    await expect(page.getByRole("banner").getByText("PF", { exact: true })).toBeVisible();
    await page.evaluate(() => localStorage.setItem("ember.gym", JSON.stringify({ tenantId: "t_other", name: "Other Gym" })));
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 1200, maxMs: 1200, failureRate: 0 })));
    await page.reload();
    await expect(page.getByRole("banner")).not.toContainText("Other Gym");
  });

  test("signing in from the login page fills the cache, so the very first header has the gym’s name", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 1500, maxMs: 1500, failureRate: 0 })));
    await page.getByRole("button", { name: /^Member/ }).click();
    await expect(page).toHaveURL(/\/m$/);
    await expect(page.getByRole("banner")).toContainText("Pulse Fitness", { timeout: 800 });
  });
});

test.describe("the last content scrolls clear of the tab bar and the raised button, at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const clear = async (page: Page, where: string) => {
    // Wait for the content: the loading placeholder is shorter than the screen it stands in for.
    await page.waitForFunction(() => !document.querySelector("[role='status'][aria-label^='Loading']"));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const last = document.querySelector("main")!.lastElementChild as HTMLElement;
      const nav = document.querySelector("nav[aria-label='Main']")!;
      const tops = [nav.firstElementChild!.getBoundingClientRect().top, ...[...nav.querySelectorAll(".btn3d")].map((b) => b.getBoundingClientRect().top)];
      return { bottom: last.getBoundingClientRect().bottom, barTop: Math.min(...tops) };
    });
    expect(m.bottom, `${where}: last content bottom ${m.bottom} vs bar top ${m.barTop}`).toBeLessThanOrEqual(m.barTop - 40); // a comfortable gap, not just touching (the shell leaves about 76 px)
  };

  for (const [name, user, path, h1] of [
    ["Today", "u_member_arjun", "/m", GREETING],
    ["Today with an overdue invoice (Priya)", "u_member_priya", "/m", /^Good (morning|afternoon|evening), Priya$/],
    ["Today, frozen (Rahul)", "u_member_rahul", "/m", /^Good (morning|afternoon|evening), Rahul$/],
    ["Program", "u_member_arjun", "/m/program", "Program"],
    ["Progress", "u_member_arjun", "/m/progress", "Progress"],
    ["Bookings", "u_member_arjun", "/m/bookings", "Bookings"],
    ["Membership", "u_member_arjun", "/m/membership", "Membership"],
    ["Check-in pass", "u_member_arjun", "/m/pass", "Check-in pass"],
    ["Me", "u_member_arjun", "/m/me", "Me"],
  ] as const) {
    test(name, async ({ page }) => {
      await signInAs(page, user, "/login");
      await page.goto(path);
      await expect(page.getByRole("heading", { name: h1, level: 1 })).toBeVisible();
      await clear(page, name);
    });
  }

  test("Workout complete", async ({ page }) => {
    await doWorkout(page, { exercises: 2 });
    await page.getByRole("dialog", { name: "Finish workout" }).getByRole("button", { name: "Save partly done workout" }).click();
    await expect(page.locator('[data-stage="done"]')).toBeVisible({ timeout: 6000 });
    await clear(page, "Workout complete");
  });
});
