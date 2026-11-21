import { expect, test } from "@playwright/test";
import { chrome, hasHorizontalScroll, signInAs } from "./helpers";

const main = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" });

test.describe("first open of the app", () => {
  test("marketing pages never create the demo database", async ({ page }) => {
    for (const path of ["/", "/signup", "/login"]) await page.goto(path);
    const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(names).not.toContain("ember-demo");
  });

  test("shows “Setting up demo gym” while the demo is built, then the home screen", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __sawSetup: boolean }).__sawSetup = false;
      new MutationObserver(() => {
        if (document.body?.innerText.includes("Setting up demo gym")) (window as unknown as { __sawSetup: boolean }).__sawSetup = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await signInAs(page, "u_owner", "/owner");
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sawSetup: boolean }).__sawSetup)).toBe(true);
    const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(names).toContain("ember-demo");
  });

  test("the second visit goes straight to the home screen without the setup placeholder", async ({ page }) => {
    await signInAs(page, "u_owner", "/owner");
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect(page.getByText("Setting up demo gym")).toHaveCount(0);
  });
});

test.describe("each role lands in its own home", () => {
  const landings: Array<[string, string, string | RegExp]> = [
    ["u_member_arjun", "/m", /^Good (morning|afternoon|evening), Arjun$/],
    ["u_trainer_meera", "/t", /^Good (morning|afternoon|evening), Meera$/],
    ["u_desk_andheri", "/desk", "Check-in"],
    ["u_finance", "/desk/finance/invoices", "Invoices and payments"],
    ["u_owner", "/owner", "Dashboard"],
    ["u_bm_bandra", "/owner", "Dashboard"],
    ["u_admin", "/admin", "Tenants"],
  ];
  for (const [userId, url, heading] of landings) {
    test(`${userId} lands on ${heading}`, async ({ page }) => {
      await signInAs(page, userId);
      await expect(page).toHaveURL(new RegExp(`${url.replace(/\//g, "\\/")}$`));
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    });
  }
});

test.describe("member app navigation", () => {
  test("shows the four tabs and a raised button, and Me behind the avatar", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    for (const tab of ["Today", "Program", "Progress", "Bookings"]) await expect(main(page).getByRole("link", { name: tab, exact: true })).toBeVisible();
    // Arjun has a workout today, so the raised button starts it. On a rest day it is the check-in pass.
    await expect(main(page).getByRole("link", { name: /^Start (today’s )?workout$/ })).toBeVisible();
    await page.getByRole("button", { name: /Account menu/ }).click();
    for (const item of ["Membership and receipts", "Check-in pass", "Profile, consent and preferences", "Sign out"]) {
      await expect(page.getByRole("button", { name: item }).or(page.getByRole("link", { name: item })).first()).toBeVisible();
    }
  });

  test("every tab opens its screen", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    for (const [tab, heading] of [["Program", "Program"], ["Progress", "Progress"], ["Bookings", "Bookings"], ["Today", /^Good (morning|afternoon|evening), Arjun$/]] as const) {
      await main(page).getByRole("link", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
    await main(page).getByRole("link", { name: /^Start (today’s )?workout$/ }).click();
    await expect(page).toHaveURL(/\/m\/workout\/\d{4}-\d{2}-\d{2}$/);
  });

  test("the avatar menu reaches membership, pass and profile, and no longer lists reviews", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    await page.getByRole("button", { name: /Account menu/ }).click();
    await expect(chrome(page).getByRole("link", { name: /Reviews/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    for (const [link, heading] of [["Membership and receipts", "Membership"], ["Check-in pass", "Check-in pass"], ["Profile, consent and preferences", "Me"]] as const) {
      await page.getByRole("button", { name: /Account menu/ }).click();
      await chrome(page).getByRole("link", { name: link }).last().click();
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });
});

test.describe("reviews live inside Progress", () => {
  test("Progress has a Reviews section, reachable by tab, and Progress stays the active tab", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress");
    const section = page.getByRole("navigation", { name: "Section" });
    await expect(section.getByRole("link")).toHaveText(["Progress", "Reviews"]);
    await section.getByRole("link", { name: "Reviews" }).click();
    await expect(page).toHaveURL(/\/m\/progress\/reviews$/);
    await expect(page.getByRole("heading", { name: "Reviews and check-ins", level: 1 })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Progress", exact: true })).toHaveAttribute("aria-current", "page");
    await section.getByRole("link", { name: "Progress" }).click();
    await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible();
  });
});

test.describe("trainer app navigation", () => {
  test("shows Today, Clients, Schedule, Library and a raised Log session button", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t");
    for (const tab of ["Today", "Clients", "Schedule", "Exercises"]) await expect(main(page).getByRole("link", { name: tab })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Log session" })).toBeVisible();
  });

  test("Library has exercises, templates and programs", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t");
    await main(page).getByRole("link", { name: "Exercises" }).click();
    const section = page.getByRole("navigation", { name: "Section" });
    await expect(section.getByRole("link")).toHaveText(["Exercises", "Templates", "Programs"]);
    await section.getByRole("link", { name: "Programs" }).click();
    await expect(page.getByRole("heading", { name: "Program builder", level: 1 })).toBeVisible();
  });

  test("client pages open with an id in the address", async ({ page }) => {
    await signInAs(page, "u_trainer_meera", "/t/clients/mem_arjun/assessment");
    await expect(page.getByRole("heading", { name: "Assessment", level: 1 })).toBeVisible();
  });
});

test.describe("staff console navigation", () => {
  test("front desk sees the desk screens and no finance screens", async ({ page, isMobile }) => {
    await signInAs(page, "u_desk_andheri", "/desk");
    const nav = main(page);
    for (const l of ["Check-in", "Members", "Bookings", "Dues"]) await expect(nav.getByRole("link", { name: l })).toBeVisible();
    for (const l of ["Refunds", "Reconciliation", "Exports"]) await expect(page.getByRole("link", { name: l })).toHaveCount(0);
    if (!isMobile) await expect(nav.getByRole("link", { name: "New member" })).toBeVisible();
  });

  test("a front desk member who opens a finance address is turned away", async ({ page }) => {
    await signInAs(page, "u_desk_andheri", "/desk/finance/refunds");
    await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
  });

  test("a branch manager cannot open settings by address", async ({ page }) => {
    await signInAs(page, "u_bm_bandra", "/owner/settings");
    await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
  });

  test("on phones the owner gets four tabs and a More sheet with the rest", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Phone layout only");
    await signInAs(page, "u_owner", "/owner");
    await expect(main(page).getByRole("link")).toHaveCount(4);
    await main(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    for (const l of ["Staff and roles", "Branches", "Policies", "Audit log", "Settings", "Subscription"]) await expect(sheet.getByRole("link", { name: l })).toBeVisible();
    await sheet.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(sheet).toHaveCount(0);
  });

  test("on desktop the owner gets a grouped sidebar", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop layout only");
    await signInAs(page, "u_owner", "/owner");
    for (const l of ["Dashboard", "Reports", "Members", "Plans and pricing", "Staff and roles", "Branches", "Policies", "Communications", "Import members", "Subscription", "Audit log", "Settings"]) {
      await expect(main(page).getByRole("link", { name: l, exact: true })).toBeVisible();
    }
  });
});

test.describe("branch switcher", () => {
  test("lets the owner choose between all branches and one", async ({ page }) => {
    await signInAs(page, "u_owner", "/owner");
    const select = page.getByRole("combobox", { name: "Branch" });
    await expect(select).toHaveValue("all");
    await expect(select.locator("option")).toHaveText(["All branches", "Andheri", "Bandra", "Powai"]);
    await select.selectOption({ label: "Bandra" });
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Branch" }).locator("option:checked")).toHaveText("Bandra");
  });

  test("shows a branch manager only their own branch, with no choice", async ({ page }) => {
    await signInAs(page, "u_bm_bandra", "/owner");
    await expect(page.getByRole("combobox", { name: "Branch" })).toHaveCount(0);
    await expect(chrome(page).getByText("Bandra", { exact: true })).toBeVisible();
  });
});

test.describe("command palette", () => {
  test("opens with Ctrl+K, filters, and jumps to a screen", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard shortcut");
    await signInAs(page, "u_owner", "/owner");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    await page.keyboard.type("report");
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/owner\/reports$/);
    await expect(dialog).toHaveCount(0);
  });

  test("only lists screens the person may open", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard shortcut");
    await signInAs(page, "u_desk_andheri", "/desk");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog.getByRole("option", { name: /Dues/ })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /Refunds/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("opens from the search button too, and returns focus on close", async ({ page }) => {
    await signInAs(page, "u_owner", "/owner");
    const button = page.getByRole("button", { name: /^Search/ });
    await button.click();
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  });
});

test.describe("slow data", () => {
  for (const [userId, home] of [["u_owner", "/owner"], ["u_member_arjun", "/m"]] as const) {
    test(`the account menu stays open when ${userId}’s details arrive after it was opened`, async ({ page }) => {
      await signInAs(page, userId, home);
      // From now on every call takes about a second, so the shell is up well before the user’s details arrive.
      await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 1200, maxMs: 1200, failureRate: 0 })));
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.getByRole("button", { name: /Account menu/ }).click();
      const signOut = chrome(page).getByRole("button", { name: "Sign out" });
      await expect(signOut).toBeVisible();
      await page.waitForTimeout(2200); // the details arrive during this wait
      await expect(chrome(page).getByText(/^(Owner|Member), Pulse Fitness$/)).toBeVisible();
      await expect(signOut).toBeVisible();
    });
  }
});

test.describe("sign out and reset", () => {
  for (const [userId, home] of [["u_member_arjun", "/m"], ["u_owner", "/owner"], ["u_admin", "/admin"]] as const) {
    test(`${userId} can sign out from the avatar menu`, async ({ page }) => {
      await signInAs(page, userId, home);
      await page.getByRole("button", { name: /Account menu/ }).click();
      await chrome(page).getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect(await page.evaluate(() => localStorage.getItem("ember.session"))).toBeNull();
      await page.goto(home);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("the account menu at the bottom of the desk sidebar has Sign out", async ({ page, isMobile }) => {
    test.skip(isMobile, "Sidebar is desktop only");
    await signInAs(page, "u_desk_andheri", "/desk");
    await page.locator("aside").getByRole("button", { name: /Account menu/ }).click();
    await page.locator("aside").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("reset demo data asks first, then confirms with a message", async ({ page }) => {
    await signInAs(page, "u_owner", "/owner");
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("button", { name: "Reset demo data" }).click();
    await page.getByRole("dialog", { name: "Reset demo data" }).getByRole("button", { name: "Reset demo data" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Demo data reset" })).toBeVisible();
  });
});

test.describe("layout", () => {
  const roles = ["u_member_arjun", "u_trainer_meera", "u_desk_andheri", "u_finance", "u_owner", "u_admin"];
  for (const width of [360, 390, 1440]) {
    test(`no horizontal scroll at ${width}px on any role’s home`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const userId of roles) {
        await signInAs(page, userId);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await hasHorizontalScroll(page), `${userId} at ${width}`).toBe(false);
      }
    });
  }

  test("touch targets in the bottom bar are at least 44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await signInAs(page, "u_member_arjun", "/m");
    for (const link of await main(page).getByRole("link").all()) {
      const box = (await link.boundingBox())!;
      expect(box.width, await link.innerText()).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test("the design gallery is available in development", async ({ page }) => {
  await page.goto("/dev/design");
  await expect(page.getByRole("heading", { name: "Design check", level: 1 })).toBeVisible();
});

test("Button3D lowers by its lip when pressed", async ({ page }) => {
  await page.goto("/dev/design");
  const button = page.locator("button.btn3d", { hasText: "ember" }).first();
  const before = (await button.boundingBox())!;
  await button.hover();
  await page.mouse.down();
  await page.waitForTimeout(200);
  const during = (await button.boundingBox())!;
  await page.mouse.up();
  expect(during.y - before.y).toBeCloseTo(4, 0);
  expect(await button.evaluate((el) => /0px 0px 0px/.test(getComputedStyle(el).boxShadow))).toBe(true);
});
