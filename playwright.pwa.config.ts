import { defineConfig, devices } from "@playwright/test";

/**
 * Tests for the service worker and manifest. They need a production build, because the service worker does not exist in
 * development. Run with `npm run e2e:pwa`.
 */
const PORT = 4175;
/** A deployed address to test instead of a local build (the checks of a deploy, `npm run verify:deploy`). */
const LIVE = process.env.PWA_BASE_URL?.replace(/\/$/, "");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "pwa.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: LIVE ?? `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  webServer: LIVE
    ? undefined
    : {
        command: `npm run build && node scripts/serve-dist.mjs ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
