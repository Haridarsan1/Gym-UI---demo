/**
 * Takes the screenshots used to review colour changes: marketing orange buttons and the Button3D gallery.
 *   node scripts/screenshots.mjs before   (or: after)
 * Needs a dev server: npm run dev -- --port 5190
 */
import { chromium } from "@playwright/test";

const tag = process.argv[2] ?? "shot";
const base = process.env.BASE ?? "http://localhost:5190";
const out = "screenshots/m0-followups";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

const shot = async (name, path, selector) => {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const file = `${out}/${tag}-${name}.png`;
  if (selector) await page.locator(selector).first().screenshot({ path: file });
  else await page.screenshot({ path: file });
  console.log(file);
};

await shot("home-hero", "/");
await shot("home-pricing", "/#pricing", "#pricing");
await shot("home-features", "/", "#features");
await shot("signup-step1", "/signup?plan=growth");
await shot("design-button3d", "/dev/design", "section[aria-labelledby=d-btn]");

// Signup, last step: the choice tiles and the primary button.
await page.goto(base + "/signup?plan=growth");
await page.getByLabel("Full name").fill("Asha Verma");
await page.getByLabel("Work email").fill("asha@fitzone.in");
await page.getByLabel("Mobile number").fill("98765 43210");
await page.getByLabel("Password", { exact: true }).fill("strongpass1");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel("Gym name").fill("Fit Zone");
await page.getByLabel("City").selectOption({ index: 1 });
await page.getByRole("button", { name: "Continue" }).click();
await page.locator("label:has(input[name=branches])").first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/${tag}-signup-step3.png` });
console.log(`${out}/${tag}-signup-step3.png`);
await browser.close();
