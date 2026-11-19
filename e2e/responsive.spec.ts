import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";

/**
 * Every area follows the same responsive rules (CLAUDE.md, “Responsive rules”): the navigation pattern for each width,
 * no sideways scroll, a capped content width, and sheets that become side panels. They run once, in the desktop project
 * (the phone project ignores this file), and set their own viewport.
 */

const WIDTHS = [360, 390, 768, 1024, 1440] as const;
const HEIGHT = (w: number) => (w < 640 ? 800 : w < 1024 ? 1024 : 900);

async function at(page: Page, width: number, userId: string, path: string) {
  await page.setViewportSize({ width, height: HEIGHT(width) });
  await signInAs(page, userId, path);
}

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

test.describe("navigation pattern by width", () => {
  for (const [who, userId, path, raisedName] of [
    ["member", "u_member_arjun", "/m", /^(Start|Continue) today’s workout$/],
    ["trainer", "u_trainer_meera", "/t", /Log session/],
  ] as const) {
    for (const width of WIDTHS) {
      test(`${who} at ${width} px`, async ({ page }) => {
        await at(page, width, userId, path);
        const navs = page.locator('nav[aria-label="Main"]:visible');
        await expect(navs).toHaveCount(1);
        const b = (await navs.first().boundingBox())!;
        const raised = navs.first().getByRole("link", { name: raisedName });
        await expect(raised).toBeVisible();
        if (width < 640) {
          // Phone: a bar along the bottom with the raised action standing above it.
          expect(b.y + b.height).toBeGreaterThan(HEIGHT(width) - 4);
          expect(b.width).toBeLessThan(width + 1);
          const r = (await raised.boundingBox())!;
          expect(r.y).toBeLessThan(b.y + b.height / 2);
        } else if (width < 1024) {
          // Tablet: a rail down the left, about 88 px wide, with the raised action as its first item.
          expect(b.x).toBe(0);
          expect(b.width).toBeGreaterThan(80);
          expect(b.width).toBeLessThan(100);
          expect(b.height).toBeGreaterThan(HEIGHT(width) - 4);
          const r = (await raised.boundingBox())!;
          for (const link of await navs.first().getByRole("link").all()) {
            if ((await link.getAttribute("aria-label")) === "Home" || link === raised) continue;
            expect(r.y).toBeLessThanOrEqual((await link.boundingBox())!.y);
          }
          await expect(raised).toHaveClass(/btn3d/);
        } else {
          // Desktop: a full sidebar with the gym’s name, the raised action as a full-width button, and the account menu.
          expect(b.x).toBe(0);
          expect(b.width).toBeGreaterThan(240);
          const side = page.locator("aside:visible");
          await expect(side.getByText("Pulse Fitness")).toBeVisible();
          await expect(side.getByRole("button", { name: /^Account menu/ })).toBeVisible();
          const r = (await raised.boundingBox())!;
          expect(r.width).toBeGreaterThan(b.width - 40);
        }
        expect(await hasHorizontalScroll(page)).toBe(false);
      });
    }
  }

  for (const width of WIDTHS) {
    test(`front desk at ${width} px`, async ({ page }) => {
      await at(page, width, "u_desk_andheri", "/desk");
      const navs = page.locator('nav[aria-label="Main"]:visible');
      await expect(navs).toHaveCount(1);
      const b = (await navs.first().boundingBox())!;
      if (width < 640) expect(b.y + b.height).toBeGreaterThan(HEIGHT(width) - 4);
      else if (width < 1024) {
        expect(b.x).toBe(0);
        expect(b.width).toBeLessThan(100);
      } else {
        expect(b.x).toBe(0);
        expect(b.width).toBeGreaterThan(240);
      }
      expect(await hasHorizontalScroll(page)).toBe(false);
    });
  }
});

test.describe("sidebar labels", () => {
  for (const width of [1024, 1440] as const) {
    for (const [who, userId, path] of [
      ["member", "u_member_arjun", "/m"],
      ["trainer", "u_trainer_meera", "/t"],
      ["front desk", "u_desk_andheri", "/desk"],
      ["finance", "u_finance", "/desk/finance/invoices"],
      ["owner", "u_owner", "/owner"],
      ["platform admin", "u_admin", "/admin"],
    ] as const) {
      test(`every ${who} sidebar label fits on one line at ${width} px`, async ({ page }) => {
        await at(page, width, userId, path);
        const wrapped = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("aside:not([hidden]) nav a")]
            .filter((a) => a.offsetParent !== null)
            .filter((a) => {
              // One line: no taller than a single 44 px row (raised button included), and nothing overflowing sideways.
              const r = a.getBoundingClientRect();
              return r.height > 56 || a.scrollWidth > a.clientWidth + 1;
            })
            .map((a) => (a.getAttribute("aria-label") ?? a.textContent ?? "").trim()),
        );
        expect(wrapped, "sidebar entries that wrap or overflow").toEqual([]);
      });
    }
  }

  test("shortened sidebar labels keep their full wording as the accessible name and in a tooltip", async ({ page }) => {
    await at(page, 1440, "u_member_arjun", "/m");
    const side = page.locator("aside:visible");
    await expect(side.getByRole("link", { name: "Start today’s workout" })).toHaveText("Start workout");
    const me = side.getByRole("link", { name: "Profile, consent and preferences" });
    await expect(me).toHaveText("Profile and settings");
    await me.hover();
    await expect(page.getByRole("tooltip", { name: "Profile, consent and preferences" })).toBeVisible();
  });
});

test.describe("booking days", () => {
  test("on a phone the days scroll in one row with a right-edge fade and snapping, and the last chip clears the fade", async ({ page }) => {
    await at(page, 390, "u_member_arjun", "/m/bookings");
    await page.getByRole("button", { name: "Book a session" }).first().click();
    const d = page.getByRole("dialog", { name: "Book a session" });
    await d.getByRole("button", { name: /Meera Joshi/ }).click();
    const group = d.getByRole("radiogroup", { name: "Day" });
    await expect(group.getByRole("radio").first()).toBeVisible();
    expect(await group.evaluate((el) => getComputedStyle(el).scrollSnapType)).toMatch(/x/);
    expect(await group.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(d.locator('[data-fade="days"]')).toBeVisible();
    await group.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    const last = (await group.getByRole("radio").last().boundingBox())!;
    const fade = (await d.locator('[data-fade="days"]').boundingBox())!;
    expect(last.x + last.width, "the last chip sits under the fade").toBeLessThanOrEqual(fade.x + 1);
    // The row is never taller than one line of chips.
    expect((await group.boundingBox())!.height).toBeLessThan(90);
  });

  for (const width of [768, 1024] as const) {
    test(`at ${width} px every available day is shown in a wrapping grid, with no scrolling row`, async ({ page }) => {
      await at(page, width, "u_member_arjun", "/m/bookings");
      await page.getByRole("button", { name: "Book a session" }).first().click();
      const flow = width >= 1024 ? page.getByRole("region", { name: "Book a session" }) : page.getByRole("dialog", { name: "Book a session" });
      await flow.getByRole("button", { name: /Meera Joshi/ }).click();
      const group = flow.getByRole("radiogroup", { name: "Day" });
      await expect(group.getByRole("radio").first()).toBeVisible();
      expect(await group.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await expect(flow.locator('[data-fade="days"]')).toBeHidden();
      const box = (await group.boundingBox())!;
      for (const chip of await group.getByRole("radio").all()) {
        const b = (await chip.boundingBox())!;
        expect(b.x + b.width, "a chip is clipped").toBeLessThanOrEqual(box.x + box.width + 1);
      }
    });
  }
});

test.describe("owner and admin shells at every width", () => {
  for (const [who, userId, path, h1] of [
    ["owner", "u_owner", "/owner", "Dashboard"],
    ["branch manager", "u_bm_bandra", "/owner", "Dashboard"],
    ["platform admin", "u_admin", "/admin", "Tenants"],
  ] as const) {
    for (const width of WIDTHS) {
      test(`${who} at ${width} px: the right navigation, no sideways scroll, a capped width`, async ({ page }) => {
        await at(page, width, userId, path);
        await expect(page.getByRole("heading", { name: h1, level: 1 })).toBeVisible();
        const navs = page.locator('nav[aria-label="Main"]:visible');
        await expect(navs).toHaveCount(1);
        const b = (await navs.first().boundingBox())!;
        if (width < 640) {
          // Phone: tabs along the bottom.
          expect(b.y + b.height).toBeGreaterThan(HEIGHT(width) - 4);
          expect(b.width).toBeLessThan(width + 1);
        } else if (width < 1024) {
          // Tablet: a rail down the left.
          expect(b.x).toBe(0);
          expect(b.width).toBeLessThan(100);
          expect(b.height).toBeGreaterThan(HEIGHT(width) - 4);
        } else {
          // Desktop: a full sidebar.
          expect(b.x).toBe(0);
          expect(b.width).toBeGreaterThan(240);
          await expect(page.locator("aside:visible").getByRole("button", { name: /^Account menu/ })).toBeVisible();
        }
        expect(await hasHorizontalScroll(page)).toBe(false);
        expect((await box(page, "main")).width).toBeLessThanOrEqual(1200);
        // Nothing is clipped on the right: every visible heading and button sits inside the window.
        const clipped = await page.evaluate((w) =>
          [...document.querySelectorAll<HTMLElement>("main h1, main h2, main button, main a")]
            .filter((el) => el.offsetParent !== null)
            .filter((el) => el.getBoundingClientRect().right > w + 1)
            .map((el) => (el.textContent ?? "").trim().slice(0, 30)), width);
        expect(clipped, "elements run past the right edge").toEqual([]);
      });
    }
  }
});

test.describe("trainer screens at every width", () => {
  /** Every trainer screen, as it is built: its address, its h1 and whether it uses the three-zone layout. Add each new screen here. */
  const TRAINER_SCREENS: Array<{ path: string; h1: string | RegExp; zones: boolean }> = [
    { path: "/t", h1: /^Good (morning|afternoon|evening), Meera$/, zones: true },
    { path: "/t/clients", h1: "Clients", zones: true },
    { path: "/t/clients/mem_arjun", h1: "Arjun Kumar", zones: true },
    { path: "/t/clients/mem_arjun/assessment", h1: "Assessment and goals", zones: true },
    { path: "/t/clients/mem_arjun/review", h1: "Review", zones: true },
    { path: "/t/schedule", h1: "Schedule", zones: true },
    { path: "/t/schedule?tab=availability", h1: "Schedule", zones: true },
    { path: "/t/schedule?tab=away", h1: "Schedule", zones: true },
    { path: "/t/log", h1: "Log a session", zones: false },
    { path: "/t/log?client=mem_126&date=2026-11-16", h1: "Log a session", zones: false },
    { path: "/t/library", h1: "Exercises", zones: true },
    { path: "/t/library/programs?member=mem_arjun", h1: "Program for Arjun Kumar", zones: true },
    { path: "/t/library/templates", h1: "Templates", zones: true },
    { path: "/t/library/templates?t=tpl_full3", h1: /^(Templates|Full body, three days)$/, zones: true },
    // On a phone the open exercise is the whole screen, so its name is the h1; beside the list the screen’s title is.
    { path: "/t/library?ex=ex_bench_press", h1: /^(Exercises|Barbell bench press)$/, zones: true },
  ];
  for (const width of WIDTHS) {
    test(`no sideways scroll, a capped width, the right zones and 44 px targets at ${width} px`, async ({ page }) => {
      for (const { path, h1, zones } of TRAINER_SCREENS) {
        await at(page, width, "u_trainer_meera", path);
        await expect(page.getByRole("heading", { name: h1, level: 1 })).toBeVisible();
        expect(await hasHorizontalScroll(page), `${path} scrolls sideways`).toBe(false);
        expect((await box(page, "main")).width, `${path} is wider than 1200 px`).toBeLessThanOrEqual(1200);
        if (zones) {
          // Phones: one column. 768 to 1279 px: list and detail. From 1280 px: list, detail and context.
          const expected = width < 768 ? 0 : width < 1280 ? 2 : 3;
          const found = await page.locator("[data-zones]").count();
          expect(found === 0 ? 0 : Number(await page.locator("[data-zones]").first().getAttribute("data-zones")), `${path} zones at ${width} px`).toBe(expected);
          if (expected) {
            // Zones sit side by side and none is clipped by the window.
            const cells = await page.locator("[data-zones] > div").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, w: r.width }; }));
            for (let i = 1; i < cells.length; i++) expect(cells[i]!.x, `zone ${i + 1} sits right of zone ${i}`).toBeGreaterThanOrEqual(cells[i - 1]!.right - 1);
            for (const c of cells) expect(c.right).toBeLessThanOrEqual(width + 1);
          }
        }
        if (width < 1024) {
          const small = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>("a, button, [role=radio], [role=switch], input:not([type=hidden])")]
              .filter((el) => el.offsetParent !== null && !el.closest("p, li > p, summary") && !el.classList.contains("sr-only"))
              .map((el) => ({ el, r: el.getBoundingClientRect() }))
              .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5))
              .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
          );
          expect(small, `${path} has small touch targets`).toEqual([]);
        }
      }
    });
  }
});

test.describe("front desk screens at every width", () => {
  // Each screen the desk gets in M3 is added here when it is built.
  const DESK_SCREENS: Array<{ path: string; h1: string | RegExp }> = [{ path: "/desk", h1: "Check-in" }];
  for (const width of WIDTHS) {
    test(`no sideways scroll, a capped width and 44 px targets at ${width} px`, async ({ page }) => {
      for (const { path, h1 } of DESK_SCREENS) {
        await at(page, width, "u_desk_andheri", path);
        await expect(page.getByRole("heading", { name: h1, level: 1 })).toBeVisible();
        expect(await hasHorizontalScroll(page), `${path} scrolls sideways`).toBe(false);
        expect((await box(page, "main")).width, `${path} is wider than 1200 px`).toBeLessThanOrEqual(1200);
        if (width < 1024) {
          const small = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>("a, button, [role=radio], [role=switch], input:not([type=hidden])")]
              .filter((el) => el.offsetParent !== null && !el.closest("p, li > p, summary") && !el.classList.contains("sr-only"))
              .map((el) => ({ el, r: el.getBoundingClientRect() }))
              .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5))
              .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
          );
          expect(small, `${path} has small touch targets`).toEqual([]);
        }
      }
    });
  }
});

test.describe("member screens at every width", () => {
  const SCREENS: Array<[string, string | RegExp]> = [
    ["/m", /^Good (morning|afternoon|evening)/],
    ["/m/program", "Program"],
    ["/m/progress", "Progress"],
    ["/m/progress/reviews", "Reviews and check-ins"],
    ["/m/bookings", "Bookings"],
    ["/m/membership", "Membership"],
    ["/m/pass", "Check-in pass"],
    ["/m/me", "Me"],
  ];
  for (const width of WIDTHS) {
    test(`no sideways scroll, a capped width and 44 px targets at ${width} px`, async ({ page }) => {
      for (const [path, h1] of SCREENS) {
        await at(page, width, "u_member_arjun", path);
        await expect(page.getByRole("heading", { name: h1, level: 1 })).toBeVisible();
        expect(await hasHorizontalScroll(page), `${path} scrolls sideways`).toBe(false);
        const main = await box(page, "main");
        expect(main.width, `${path} content is wider than 1200 px`).toBeLessThanOrEqual(1200);
        if (width >= 1024) expect(main.width, `${path} is a phone-width column on a wide screen`).toBeGreaterThan(Math.min(width - 288, 1100) * 0.9);
        if (width < 1024) {
          // Touch widths: every visible button and link is at least 44 px tall and wide, except links inside a line of text.
          const small = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>("a, button, [role=radio], [role=switch], input:not([type=hidden])")]
              .filter((el) => el.offsetParent !== null && !el.closest("p, li > p, summary") && !el.classList.contains("sr-only"))
              .map((el) => ({ el, r: el.getBoundingClientRect() }))
              .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5))
              .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
          );
          expect(small, `${path} has small touch targets`).toEqual([]);
        }
      }
    });
  }

  test("Today is two columns on desktop and the week strip sits under the workout", async ({ page }) => {
    await at(page, 1440, "u_member_arjun", "/m");
    const workout = await box(page, 'section[aria-labelledby="hero-title"]');
    const sessions = await box(page, 'section[aria-labelledby="sessions-title"]');
    const week = await box(page, 'section[aria-labelledby="week-title"]');
    expect(sessions.x).toBeGreaterThan(workout.x + workout.width);
    expect(week.y).toBeGreaterThan(workout.y + workout.height);
    expect(Math.abs(week.x - workout.x)).toBeLessThan(2);
  });

  test("Program shows the selected day beside the path from 1024 px, with no dialog, and the address follows; tablets open a side panel", async ({ page }) => {
    await at(page, 1440, "u_member_arjun", "/m/program");
    await expect(page.getByRole("region", { name: "Selected workout" })).toBeVisible();
    await page.getByRole("button", { name: /Preview Pull/ }).click();
    await expect(page.getByRole("region", { name: "Selected workout" }).getByRole("heading", { name: "Pull", level: 2 })).toBeVisible();
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const width of [390, 768]) {
      await at(page, width, "u_member_arjun", "/m/program");
      await page.getByRole("button", { name: /Preview Pull/ }).click();
      await expect(page.getByRole("dialog", { name: "Workout preview" })).toBeVisible();
    }
  });
});

test.describe("sheets", () => {
  test("a detail sheet is a bottom sheet on a phone and a side panel from 640 px", async ({ page }) => {
    await at(page, 390, "u_member_arjun", "/m/progress");
    await page.getByRole("button", { name: "Log your weight or a measurement" }).click();
    const phone = page.getByRole("dialog", { name: "Log a measurement" });
    await expect(phone).toBeVisible();
    let b = (await phone.boundingBox())!;
    expect(b.y + b.height).toBeGreaterThan(800 - 2);
    expect(b.y).toBeGreaterThan(40);
    for (const width of [768, 1440]) {
      await at(page, width, "u_member_arjun", "/m/progress");
      await page.getByRole("button", { name: "Log your weight or a measurement" }).click();
      const panel = page.getByRole("dialog", { name: "Log a measurement" });
      await expect(panel).toBeVisible();
      b = (await panel.boundingBox())!;
      expect(b.x + b.width).toBeGreaterThan(width - 2);
      expect(b.x).toBeGreaterThan(width - 520);
      expect(b.height).toBeGreaterThan(HEIGHT(width) - 4);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
    }
  });

  test("a confirmation is a bottom sheet on a phone and a centred dialog from 640 px", async ({ page }) => {
    for (const width of [390, 768, 1440]) {
      await at(page, width, "u_member_arjun", "/m/bookings");
      await page.getByRole("button", { name: "Cancel session" }).click();
      const d = page.getByRole("dialog", { name: "Cancel session" });
      await expect(d).toBeVisible();
      const b = (await d.boundingBox())!;
      if (width < 640) expect(b.y + b.height).toBeGreaterThan(HEIGHT(width) - 2);
      else {
        expect(Math.abs(b.x + b.width / 2 - width / 2)).toBeLessThan(2);
        expect(Math.abs(b.y + b.height / 2 - HEIGHT(width) / 2)).toBeLessThan(2);
      }
    }
  });

  test("booking is a side panel on a tablet and inline, with pickers left and times right, on desktop", async ({ page }) => {
    await at(page, 768, "u_member_arjun", "/m/bookings");
    await page.getByRole("button", { name: "Book a session" }).first().click();
    const panel = page.getByRole("dialog", { name: "Book a session" });
    await expect(panel).toBeVisible();
    expect((await panel.boundingBox())!.x + (await panel.boundingBox())!.width).toBeGreaterThan(766);
    await at(page, 1440, "u_member_arjun", "/m/bookings");
    await page.getByRole("button", { name: "Book a session" }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const inline = page.getByRole("region", { name: "Book a session" });
    await inline.getByRole("button", { name: /Meera Joshi/ }).click();
    const times = inline.getByRole("list", { name: /^Times on/ });
    await expect(times).toBeVisible();
    const trainer = (await inline.getByRole("button", { name: /Meera Joshi/ }).boundingBox())!;
    expect((await times.boundingBox())!.x).toBeGreaterThan(trainer.x + trainer.width);
  });
});

test.describe("desktop polish", () => {
  test("icon-only buttons have a tooltip and everything has a visible focus ring", async ({ page }) => {
    await at(page, 1440, "u_member_arjun", "/m");
    const account = page.getByRole("button", { name: /^Account menu/ }).first();
    await account.hover();
    await expect(page.getByRole("tooltip", { name: "Account" })).toBeVisible();
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).not.toBe("none");
  });
});
