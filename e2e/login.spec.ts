import { expect, test, type Page } from "@playwright/test";

const heading = (page: Page, name: string) => page.getByRole("heading", { name, level: 1 });
const fastDemo = (page: Page) => page.addInitScript(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 0 })));

test.describe("email and password", () => {
  const people: Array<[string, string, string, string]> = [
    ["owner@pulsefitness.in", "/owner", "Dashboard", "owner"],
    ["rohit.sethi@pulsefitness.in", "/owner", "Dashboard", "branch manager"],
    ["pooja.nair@pulsefitness.in", "/desk", "Check-in", "front desk"],
    ["deepa.menon@pulsefitness.in", "/desk/finance/invoices", "Invoices and payments", "finance"],
    ["meera.joshi@pulsefitness.in", "/t", "Today", "trainer"],
    ["arjun.kumar@example.in", "/m", "Today", "member"],
    ["admin@ember.example", "/admin", "Tenants", "platform admin"],
  ];
  for (const [email, url, title, who] of people) {
    test(`${who} signs in with any password`, async ({ page }) => {
      await fastDemo(page);
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("whatever-123");
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${url.replace(/\//g, "\\/")}$`));
      await expect(heading(page, title)).toBeVisible();
    });
  }

  test("the email is matched without caring about capital letters or spaces", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("  Owner@PulseFitness.in ");
    await page.getByLabel("Password").fill("x");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/owner$/);
  });

  test("explains each mistake in plain words", async ({ page }) => {
    await page.goto("/login");
    const submit = page.getByRole("button", { name: "Log in", exact: true });
    await submit.click();
    await expect(page.getByRole("alert")).toHaveText("Enter the email you signed up with.");
    await page.getByLabel("Email").fill("not-an-email");
    await submit.click();
    await expect(page.getByRole("alert")).toHaveText("Enter the email you signed up with.");
    await page.getByLabel("Email").fill("owner@pulsefitness.in");
    await submit.click();
    await expect(page.getByRole("alert")).toHaveText("Enter your password.");
    await page.getByLabel("Email").fill("nobody@pulsefitness.in");
    await page.getByLabel("Password").fill("x");
    await submit.click();
    await expect(page.getByRole("alert")).toContainText("We couldn’t find an account with this email");
    expect(await page.evaluate(() => localStorage.getItem("ember.session"))).toBeNull();
  });
});

test.describe("phone and code", () => {
  const openPhone = async (page: Page) => {
    await fastDemo(page);
    await page.goto("/login");
    await page.getByRole("button", { name: "Phone and code" }).click();
  };

  test("a member signs in with their number and any 6-digit code", async ({ page }) => {
    await openPhone(page);
    await page.getByLabel("Mobile number").fill("98200 22002");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText("We sent a code to +91 98200 22002. In this demo, any 6 digits work.")).toBeVisible();
    await page.getByLabel("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/m$/);
    await expect(heading(page, "Today")).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu for Arjun Kumar" })).toBeVisible();
  });

  test("checks the number and the code, and explains what to fix", async ({ page }) => {
    await openPhone(page);
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter a 10-digit mobile number.");
    await page.getByLabel("Mobile number").fill("5555555555");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter a 10-digit mobile number.");
    await page.getByLabel("Mobile number").fill("9111111111");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("alert")).toContainText("We couldn’t find a member with this number");
    await page.getByLabel("Mobile number").fill("9820011003");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("alert")).toHaveText("Staff log in with email and password.");
    await page.getByLabel("Mobile number").fill("9820022002");
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("6-digit code").fill("12345");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter the 6-digit code.");
    expect(await page.evaluate(() => localStorage.getItem("ember.session"))).toBeNull();
  });

  test("lets you go back and use a different number", async ({ page }) => {
    await openPhone(page);
    await page.getByLabel("Mobile number").fill("9820022002");
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByRole("button", { name: "Use a different number" }).click();
    await expect(page.getByLabel("Mobile number")).toBeEditable();
    await expect(page.getByLabel("6-digit code")).toHaveCount(0);
  });
});

test.describe("try the demo as", () => {
  const roles: Array<[RegExp, string, string]> = [
    [/^Platform admin/, "/admin", "Tenants"],
    [/^Owner/, "/owner", "Dashboard"],
    [/^Branch manager/, "/owner", "Dashboard"],
    [/^Front desk/, "/desk", "Check-in"],
    [/^Finance/, "/desk/finance/invoices", "Invoices and payments"],
    [/^Trainer/, "/t", "Today"],
    [/^Member/, "/m", "Today"],
  ];
  for (const [label, url, title] of roles) {
    test(`one tap as ${label.source.slice(1)}`, async ({ page }) => {
      await fastDemo(page);
      await page.goto("/login");
      await page.getByRole("button", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${url.replace(/\//g, "\\/")}$`));
      await expect(heading(page, title)).toBeVisible();
    });
  }
});

test.describe("session", () => {
  test("lasts through a reload and is stored in localStorage", async ({ page }) => {
    await fastDemo(page);
    await page.goto("/login");
    await page.getByRole("button", { name: /^Owner/ }).click();
    await expect(heading(page, "Dashboard")).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem("ember.session")))!)).toMatchObject({ userId: "u_owner", role: "owner" });
    await page.reload();
    await expect(heading(page, "Dashboard")).toBeVisible();
  });

  test("returns to the page you were trying to open", async ({ page }) => {
    await fastDemo(page);
    await page.goto("/owner/reports");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("button", { name: /^Owner/ }).click();
    await expect(page).toHaveURL(/\/owner\/reports$/);
    await expect(heading(page, "Reports")).toBeVisible();
  });

  test("ignores a return address the new role may not open", async ({ page }) => {
    await fastDemo(page);
    await page.goto("/owner/reports");
    await page.getByRole("button", { name: /^Member/ }).click();
    await expect(page).toHaveURL(/\/m$/);
  });

  test("tells a signed-in visitor who they are and lets them go on or sign out", async ({ page }) => {
    await fastDemo(page);
    await page.goto("/login");
    await page.getByRole("button", { name: /^Trainer/ }).click();
    await expect(heading(page, "Today")).toBeVisible();
    await page.goto("/login");
    await expect(page.getByText("You’re signed in as Meera Joshi.")).toBeVisible();
    await page.getByRole("link", { name: "Open your dashboard" }).click();
    await expect(page).toHaveURL(/\/t$/);
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByText("You’re signed in as")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("ember.session"))).toBeNull();
  });
});

test.describe("role switcher", () => {
  test("switches between roles from the avatar menu and clears the last person’s data", async ({ page }) => {
    await fastDemo(page);
    await page.goto("/login");
    await page.getByRole("button", { name: /^Owner/ }).click();
    await expect(heading(page, "Dashboard")).toBeVisible();
    await page.getByRole("button", { name: /Account menu/ }).click();
    await expect(page.getByRole("banner").getByRole("button", { name: /^Owner/ })).toHaveCount(0);
    await page.getByRole("banner").getByRole("button", { name: /^Front desk/ }).click();
    await expect(page).toHaveURL(/\/desk$/);
    await expect(heading(page, "Check-in")).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu for Pooja Nair" })).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem("ember.session")))!).role).toBe("front_desk");
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("banner").getByRole("button", { name: /^Member/ }).click();
    await expect(page).toHaveURL(/\/m$/);
  });

  test("works from the command palette", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard shortcut");
    await fastDemo(page);
    await page.goto("/login");
    await page.getByRole("button", { name: /^Owner/ }).click();
    await expect(heading(page, "Dashboard")).toBeVisible();
    await page.keyboard.press("Control+k");
    await page.keyboard.type("switch to trainer");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/t$/);
  });
});

test.describe("after the free trial signup", () => {
  test("“Open your dashboard” signs in as the owner of the sample gym", async ({ page }) => {
    await fastDemo(page);
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Asha Verma");
    await page.getByLabel("Work email").fill("asha@fitzone.in");
    await page.getByLabel("Mobile number").fill("98765 43210");
    await page.getByLabel("Password", { exact: true }).fill("strongpass1");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Gym name").fill("Fit Zone");
    await page.getByLabel("City").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator("label:has(input[name=branches])").first().click();
    await page.locator("label:has(input[name=members])").first().click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create my gym" }).click();
    await expect(page.getByText("This demo opens a sample gym, Pulse Fitness")).toBeVisible();
    await page.getByRole("link", { name: "Open your dashboard" }).click();
    await expect(page).toHaveURL(/\/owner$/);
    await expect(heading(page, "Dashboard")).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu for Neha Kulkarni" })).toBeVisible();
  });
});

test("the login page does not download or create any app data", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /^Owner/ })).toBeVisible();
  const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(names).not.toContain("ember-demo");
});
