/**
 * Loads each route from the production build in a real browser and reports the gzipped JS it downloads.
 * Fails if app-only code (React Query, Dexie, Zod) reaches a marketing route.
 *   npm run build && npm run bundle-report
 */
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const BUDGET_KB = { "/m": 170 };

const routes = [
  { path: "/", marketing: true },
  { path: "/signup", marketing: true },
  { path: "/login", marketing: true },
  { path: "/m", user: { userId: "u_member_arjun", role: "member" } },
  { path: "/t", user: { userId: "u_trainer_meera", role: "trainer" } },
  { path: "/desk", user: { userId: "u_desk_andheri", role: "front_desk" } },
  { path: "/owner", user: { userId: "u_owner", role: "owner" } },
  { path: "/admin", user: { userId: "u_admin", role: "platform_admin" } },
];

/** Strings that only exist in app-only libraries. */
/** Each marker must also appear in an app chunk, otherwise the guard is stale (reported as a warning). */
const FORBIDDEN = { "React Query": "Missing queryFn", Dexie: "DexieError", Zod: "ZodError" };

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
const stop = () => server.kill();
process.on("exit", stop);

for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}

const browser = await chromium.launch();
let failed = false;
const appText = [];
console.log("Route      JS gzip   Files  Notes");
for (const route of routes) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  if (route.user) {
    // Real demo users, so the route renders its shell. Roles and branches are re-read from the database by the app.
    await ctx.addInitScript((u) => localStorage.setItem("ember.session", JSON.stringify({ ...u, name: "Report", tenantId: "t_pulse", branchIds: ["br_andheri"] })), route.user);
  }
  const page = await ctx.newPage();
  const files = [];
  page.on("response", async (res) => {
    if (!res.url().endsWith(".js") || !res.ok()) return;
    const body = await res.body().catch(() => null);
    if (body) files.push({ url: res.url(), gz: gzipSync(body).length, text: body.toString("utf8") });
  });
  await page.goto(BASE + route.path, { waitUntil: "networkidle" });
  const total = files.reduce((n, f) => n + f.gz, 0);
  const notes = [];
  if (!route.marketing) appText.push(...files.map((f) => f.text));
  if (route.marketing) {
    for (const [name, marker] of Object.entries(FORBIDDEN)) {
      if (files.some((f) => f.text.includes(marker))) {
        notes.push(`FAIL: ${name} loaded`);
        failed = true;
      }
    }
  }
  // The home page is loaded lazily and fetched only on "/". Every other route must not download it.
  if (route.path !== "/" && files.some((f) => f.url.includes("/HomePage-"))) {
    notes.push("FAIL: home page loaded");
    failed = true;
  }
  const budget = BUDGET_KB[route.path];
  if (budget && total / 1024 > budget) {
    notes.push(`FAIL: over ${budget} KB budget`);
    failed = true;
  }
  if (!route.marketing) {
    // A return visit: the demo gym already exists in this browser, so the seed generator is not downloaded.
    const seed = files.filter((f) => f.url.includes("/seed-")).reduce((n, f) => n + f.gz, 0);
    notes.push(`return visit ${((total - seed) / 1024).toFixed(1)} KB`);
  }
  console.log(`${route.path.padEnd(10)} ${(total / 1024).toFixed(1).padStart(6)} KB ${String(files.length).padStart(5)}  ${notes.join(", ") || (route.marketing ? "no app code" : "")}`);
  await ctx.close();
}
await browser.close();
stop();
for (const [name, marker] of Object.entries(FORBIDDEN)) {
  if (!appText.some((t) => t.includes(marker))) console.log(`WARN: marker for ${name} not found in any app chunk. Check or update it (expected until the library is used).`);
}
process.exit(failed ? 1 : 0);
