import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets the tests run beside a dev server someone already has open on 5173 (which would show the Query devtools button).
const PORT = Number(process.env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: "./e2e",
  // The service worker only exists in production builds. See playwright.pwa.config.ts.
  testIgnore: "**/pwa.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    // The member app’s flow specs were written against the phone layout, so they run on the phone project. The desktop
    // project runs what is about the shells, the marketing site and the wide layouts. responsive.spec.ts sets its own viewports.
    { name: "desktop", testMatch: /(marketing|guards|login|m0|shells|responsive|desktop-flows|m2-acceptance|demo-guide)\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", testIgnore: [/pwa\.spec\.ts/, /responsive\.spec\.ts/, /desktop-flows\.spec\.ts/], use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `VITE_E2E=1 npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
