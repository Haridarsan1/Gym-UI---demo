/**
 * Loads each route from the production build in a real browser and reports the gzipped JS it downloads.
 * Fails if app-only code (React Query, Dexie, Zod) reaches a marketing route.
 *   npm run build && npm run bundle-report
 */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const BUDGET_KB = { "/m": 170, "/desk": 170 };

/**
 * Code the member app must never download up front. A module in any chunk that /m loads on a return visit (the seed
 * generator runs once, on the first visit only) fails the report. Chunk contents come from the build (vite.config.ts).
 */
const SCREENS_OF = (areas) => new RegExp(`^src/app/screens/(${areas})\\.`);
const TRAINER_API = /^src\/api\/(trainer|trainerHooks|clients|book|assessments|library|programs|templates|assignments|coachLog|review|schedule)\./;
const NOT_FOR = {
  "/m": [/^src\/features\/(trainer|desk|owner|admin)\//, SCREENS_OF("trainer|desk|owner|admin"), TRAINER_API, /^src\/domain\/trainerToday\./],
  // The desk never downloads the member or trainer apps, the owner or admin consoles, or the QR scanner and finance screens up front.
  "/desk": [/^src\/features\/(member|trainer|owner|admin)\//, SCREENS_OF("member|trainer|owner|admin"), /^src\/api\/(trainer|trainerHooks|clients|book|assessments|library|programs|templates|coachLog|review|schedule)\./, /^src\/domain\/trainerToday\./, /^node_modules\/@zxing\//],
};
const chunkModules = JSON.parse(readFileSync("node_modules/.cache/ember/chunk-modules.json", "utf8"));

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
/**
 * Each marker must also appear in a built chunk, otherwise the guard is stale (reported as a warning). The chunks are read from
 * dist rather than from what a route downloads, because Zod loads on demand (its own chunk, fetched when the first form or
 * api call needs a schema), so a route may finish loading without it.
 */
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
  if (NOT_FOR[route.path]) {
    // A second visit in the same browser: the demo gym exists, so only what the member app itself needs is downloaded.
    const again = await ctx.newPage();
    const seen = new Set();
    again.on("response", (res) => res.url().endsWith(".js") && seen.add(res.url().split("/").pop()));
    await again.goto(BASE + route.path, { waitUntil: "networkidle" });
    const leaks = [];
    for (const file of seen) for (const mod of chunkModules[`assets/${file}`] ?? []) if (NOT_FOR[route.path].some((re) => re.test(mod))) leaks.push(`${mod} (${file})`);
    if (seen.size === 0) notes.push("FAIL: the code check saw no scripts");
    if (leaks.length) notes.push(`FAIL: code that does not belong in ${route.path}: ${[...new Set(leaks)].join(", ")}`);
    if (seen.size === 0 || leaks.length) failed = true;
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
  if (process.env.BUNDLE_FILES === route.path) for (const f of files.sort((a, b) => b.gz - a.gz)) console.log(`    ${(f.gz / 1024).toFixed(1).padStart(6)} KB  ${f.url.split("/").pop()}`);
  console.log(`${route.path.padEnd(10)} ${(total / 1024).toFixed(1).padStart(6)} KB ${String(files.length).padStart(5)}  ${notes.join(", ") || (route.marketing ? "no app code" : "")}`);
  await ctx.close();
}
await browser.close();
stop();
const built = readdirSync("dist/assets").filter((f) => f.endsWith(".js")).map((f) => ({ f, text: readFileSync(`dist/assets/${f}`, "utf8") }));
for (const [name, marker] of Object.entries(FORBIDDEN)) {
  const chunks = built.filter((b) => b.text.includes(marker));
  if (chunks.length === 0) console.log(`WARN: marker for ${name} not found in any built chunk. The guard is stale, update the marker.`);
  else if (name === "Zod") console.log(`Zod loads on demand: ${chunks.map((c) => c.f).join(", ")} (${(chunks.reduce((n, c) => n + gzipSync(c.text).length, 0) / 1024).toFixed(1)} KB gzip), never on marketing routes.`);
}
process.exit(failed ? 1 : 0);
