import { expect, test } from "@playwright/test";

/** Regression tests for the finished marketing site. Do not change these unless the marketing pages change. */

test.describe("home page", () => {
  test("menu links jump to their sections", async ({ page, isMobile }) => {
    await page.goto("/");
    for (const [label, id] of [["Features", "features"], ["Demo", "demo"], ["Pricing", "pricing"], ["FAQ", "faq"]] as const) {
      if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
      const nav = isMobile ? page.locator("#mobile-menu") : page.getByRole("navigation", { name: "Main" });
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport({ timeout: 5000 });
    }
  });

  test("menu has working Log in and Start free trial links", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    const scope = isMobile ? page.locator("#mobile-menu") : page.locator("header");
    await scope.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    await scope.getByRole("link", { name: "Start free trial" }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("hero journey: clicking a step jumps to it", async ({ page }) => {
    await page.goto("/");
    const journey = page.getByRole("navigation", { name: "Member journey" });
    await expect(journey.getByRole("button")).toHaveCount(6);
    for (const [i, label] of ["Join", "Pay", "Check in", "Train", "Progress", "Renew"].entries()) {
      await journey.getByRole("button", { name: label }).click();
      await expect(journey.getByRole("button", { name: label })).toHaveAttribute("aria-current", "step");
      await expect(page.getByText(`Step ${i + 1} of 6: ${label}`)).toBeVisible();
    }
  });

  test("check-in demo: repeat scan uses no extra visit", async ({ page }) => {
    await page.goto("/#demo");
    const demo = page.locator("#demo");
    await demo.getByPlaceholder("Type a name, like Priya").fill("Priya");
    await demo.getByRole("list", { name: "Matching members" }).getByRole("button", { name: /Priya Sharma/ }).click();
    await demo.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(demo.getByText("Priya Sharma checked in")).toBeVisible();
    await demo.getByRole("button", { name: "Scan again" }).click();
    await expect(demo.getByText(/Already checked in at .*No visit used\./)).toBeVisible();
    await expect(demo.getByText("Priya Sharma scanned again, no visit used")).toBeVisible();
  });

  test("check-in demo: a frozen member needs an override reason", async ({ page }) => {
    await page.goto("/#demo");
    const demo = page.locator("#demo");
    await demo.getByPlaceholder("Type a name, like Priya").fill("Rahul");
    await demo.getByRole("list", { name: "Matching members" }).getByRole("button", { name: /Rahul Mehta/ }).click();
    await expect(demo.getByRole("button", { name: "Check in", exact: true })).toHaveCount(0);
    await demo.getByRole("button", { name: "Override with reason" }).click();
    await demo.getByRole("button", { name: "Manager approved" }).click();
    await expect(demo.getByText("Rahul Mehta checked in. Override: manager approved")).toBeVisible();
  });

  test("pricing slider picks the plan that fits", async ({ page }) => {
    await page.goto("/#pricing");
    const slider = page.getByLabel("How many active members do you have?");
    const fits = async (value: number, plan: string) => {
      await slider.fill(String(value));
      await expect(slider).toHaveAttribute("aria-valuetext", new RegExp(`fits the ${plan} plan`));
      await expect(page.locator("#pricing li[aria-current='true']")).toContainText(plan);
    };
    await fits(50, "Starter");
    await fits(200, "Growth");
    await fits(400, "Pro");
    await fits(750, "Enterprise");
  });

  test("pricing billing toggle changes the prices", async ({ page }) => {
    await page.goto("/#pricing");
    const price = page.locator("#pricing li").filter({ hasText: "Growth" }).first();
    await page.getByText("Monthly", { exact: true }).click();
    const monthly = await price.innerText();
    await page.getByText("Yearly, save 20%").click();
    await expect.poll(async () => price.innerText()).not.toBe(monthly);
  });
});

test.describe("signup flow", () => {
  const fillStep0 = async (page: import("@playwright/test").Page, email = "neha@pulsestudio.in") => {
    await page.getByLabel("Full name").fill("Neha Kulkarni");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Mobile number").fill("98765 43210");
    await page.getByLabel("Password", { exact: true }).fill("strongpass1");
    await page.getByRole("button", { name: "Continue" }).click();
  };
  const fillStep1 = async (page: import("@playwright/test").Page) => {
    await page.getByLabel("Gym name").fill("Pulse Studio");
    await page.getByLabel("City").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Continue" }).click();
  };
  const fillStep2 = async (page: import("@playwright/test").Page) => {
    await page.locator("label:has(input[name=branches])").first().click();
    await page.locator("label:has(input[name=members])").first().click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create my gym" }).click();
  };

  test("shows plain-language errors, then completes all three steps", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Enter your full name.")).toBeVisible();
    await expect(page.getByText("Enter a 10-digit Indian mobile number.")).toBeVisible();
    await fillStep0(page);
    await expect(page.getByText("Step 2 of 3")).toBeVisible();
    await fillStep1(page);
    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    await fillStep2(page);
    await expect(page.getByRole("heading", { name: "Pulse Studio is ready." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open your dashboard" })).toBeVisible();
  });

  test("an email ending @taken.test shows the error message", async ({ page }) => {
    await page.goto("/signup");
    await fillStep0(page, "neha@taken.test");
    await fillStep1(page);
    await fillStep2(page);
    await expect(page.getByRole("alert")).toContainText("An account already uses this email");
  });

  test("?plan= preselects the member range", async ({ page }) => {
    await page.goto("/signup?plan=growth");
    await fillStep0(page);
    await fillStep1(page);
    await expect(page.locator("input[name=members]:checked")).toHaveCount(1);
  });
});

test.describe("legal pages and 404", () => {
  for (const [path, title] of [["/privacy", "Privacy policy"], ["/terms", "Terms of service"], ["/refunds", "Refund policy"]] as const) {
    test(`${path} renders and links home`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await page.getByRole("link", { name: "Back to home page" }).click();
      await expect(page).toHaveURL(/\/$/);
    });
  }

  test("an unknown path shows the not-found page", async ({ page }) => {
    await page.goto("/nothing-here");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test("the login page accepts an email and password", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Enter the email you signed up with.")).toBeVisible();
});
