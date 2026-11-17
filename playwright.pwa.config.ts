import { defineConfig, devices } from "@playwright/test";

/**
 * Tests for the service worker and manifest. They need a production build, because the service worker does not exist in
 * development. Run with `npm run e2e:pwa`.
 */
const PORT = 4175;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "pwa.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  webServer: {
    command: `npm run build && node scripts/serve-dist.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
