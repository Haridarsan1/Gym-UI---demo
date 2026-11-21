/**
 * Lighthouse on mobile settings, three runs each, median saved, on a RETURN visit: the page has been opened once in the same browser profile (and, for the app, signed in through the demo
 * login page and left on its home screen), so the demo gym already exists and the scripts are in the cache. That is what a person who comes back gets, and what the budgets are about.
 *
 *   npm run build && npm run lighthouse                     measures dist/ through a local server that compresses like Vercel does
 *   LH_BASE=https://some-preview.vercel.app npm run lighthouse   measures a deployed address
 *
 * Writes docs/lighthouse/<page>.html (the median run’s full report) and summary.md / summary.json. Exits with 1 if any page is under performance 90 or accessibility 100.
 */
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { brotliCompressSync, constants } from "node:zlib";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "@playwright/test";
import { launch } from "chrome-launcher";
import puppeteer from "puppeteer-core";
import lighthouse from "lighthouse";

const RUNS = Number(process.env.LH_RUNS ?? 3);
/** For a Vercel preview that sits behind Vercel’s login: its “Protection Bypass for Automation” secret, sent with every request. */
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS ? { "x-vercel-protection-bypass": process.env.VERCEL_PROTECTION_BYPASS } : undefined;
const OUT = process.env.LH_OUT ?? "docs/lighthouse";
const PAGES = [
  { name: "home", path: "/", who: null },
  { name: "login", path: "/login", who: null },
  { name: "member", path: "/m", who: /^Member/ },
  { name: "trainer", path: "/t", who: /^Trainer/ },
  { name: "desk", path: "/desk", who: /^Front desk/ },
  { name: "owner", path: "/owner", who: /^Owner/ },
];

/** A static server for dist/ that does what Vercel does: brotli, long caching for hashed files, index.html for app routes. */
async function serveDist() {
  const root = join(process.cwd(), "dist");
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".json": "application/json", ".ico": "image/x-icon" };
  const cache = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    let file = join(root, rel);
    if (!(await stat(file).then((s) => s.isFile(), () => false))) file = join(root, "index.html");
    const ext = extname(file);
    const headers = { "Content-Type": types[ext] ?? "application/octet-stream" };
    headers["Cache-Control"] = rel.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate";
    let body = cache.get(file) ?? (await readFile(file));
    if (/\.(html|js|css|svg|json|webmanifest)$/.test(file) && String(req.headers["accept-encoding"] ?? "").includes("br")) {
      if (!cache.has(file + "#br")) cache.set(file + "#br", brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }));
      body = cache.get(file + "#br");
      headers["Content-Encoding"] = "br";
    }
    headers["Content-Length"] = body.length;
    res.writeHead(200, headers).end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const median = (xs) => [...xs].sort((a, b) => a.score - b.score)[Math.floor(xs.length / 2)];

async function measure(base, page) {
  const profile = await mkdtemp(join(tmpdir(), "lh-"));
  const chrome = await launch({ chromePath: chromium.executablePath(), userDataDir: profile, chromeFlags: ["--headless=new", "--no-first-run", "--disable-extensions"] });
  try {
    const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
    const tab = await browser.newPage();
    if (BYPASS) await tab.setExtraHTTPHeaders(BYPASS);
    // Open it once, as a person would: the app through the login page's “Try the demo as”, left on its home screen.
    if (page.who) {
      await tab.goto(`${base}/login`, { waitUntil: "networkidle0" });
      await tab.evaluate((src) => {
        const re = new RegExp(src);
        const b = [...document.querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
        if (!b) throw new Error("no sign-in button for " + src);
        b.click();
      }, page.who.source);
      await tab.waitForFunction((p) => location.pathname.startsWith(p), { timeout: 60000 }, page.path);
      await tab.waitForSelector("h1", { timeout: 60000 });
      await tab.waitForNetworkIdle({ idleTime: 1000, timeout: 60000 });
    } else {
      await tab.goto(base + page.path, { waitUntil: "networkidle0" });
    }
    // A second load so the service worker and the cache are warm, then leave the page for Lighthouse.
    await tab.goto(base + page.path, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500));
    await tab.close();
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await lighthouse(base + page.path, { port: chrome.port, output: "html", logLevel: "error", disableStorageReset: true, ...(BYPASS ? { extraHeaders: BYPASS } : {}), onlyCategories: ["performance", "accessibility", "best-practices", "seo"] });
      const c = r.lhr.categories;
      runs.push({ score: c.performance.score, html: r.report, lhr: r.lhr });
      console.log(`  ${page.name} run ${i + 1}: performance ${Math.round(c.performance.score * 100)}, accessibility ${Math.round(c.accessibility.score * 100)}`);
    }
    await browser.disconnect();
    return median(runs);
  } finally {
    await chrome.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

const local = process.env.LH_BASE ? null : await serveDist();
const base = (process.env.LH_BASE ?? local.base).replace(/\/$/, "");
await mkdir(OUT, { recursive: true });
const rows = [];
let failed = false;
for (const page of PAGES.filter((p) => !process.env.LH_PAGES || process.env.LH_PAGES.split(",").includes(p.name))) {
  console.log(`${page.path} (${page.name})`);
  const m = await measure(base, page);
  const c = m.lhr.categories, a = m.lhr.audits;
  const failedA11y = Object.values(a).filter((x) => c.accessibility.auditRefs.some((r) => r.id === x.id && r.weight > 0) && x.score !== null && x.score < 1).map((x) => x.id);
  const row = {
    page: page.path, name: page.name, performance: Math.round(c.performance.score * 100), accessibility: Math.round(c.accessibility.score * 100), bestPractices: Math.round(c["best-practices"].score * 100), seo: Math.round(c.seo.score * 100),
    fcp: a["first-contentful-paint"].displayValue, lcp: a["largest-contentful-paint"].displayValue, tbt: a["total-blocking-time"].displayValue, cls: a["cumulative-layout-shift"].displayValue, si: a["speed-index"].displayValue, failedAccessibility: failedA11y,
  };
  // What is failing, element by element, so it can be fixed.
  row.detail = failedA11y.flatMap((id) => (a[id].details?.items ?? []).slice(0, 6).map((it) => `${id}: ${it.node?.selector ?? ""} ${(it.node?.explanation ?? "").replace(/\s+/g, " ").slice(0, 200)}`));
  if (row.detail.length && process.env.LH_DETAIL) console.log(row.detail.join("\n"));
  rows.push(row);
  if (row.performance < 90 || row.accessibility < 100) failed = true;
  await writeFile(join(OUT, `${page.name}.html`), m.html);
}
const date = new Date().toISOString().slice(0, 10);
const md = [
  `# Lighthouse, ${date}`,
  "",
  `Mobile settings (Moto G Power, slow 4G, 4× CPU slowdown), Lighthouse ${rows.length ? "13" : ""}, median of ${RUNS} runs, **return visit**: opened once in the same browser profile first${PAGES.some((p) => p.who) ? "; the app pages were signed in through the demo login page and left on their home screen" : ""}. Measured at ${process.env.LH_BASE ? process.env.LH_BASE : "a local server that serves dist/ compressed (brotli) with long caching for hashed files, as Vercel does"}.`,
  "",
  "| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| \`${r.page}\` | ${r.performance} | ${r.accessibility} | ${r.bestPractices} | ${r.seo} | ${r.fcp} | ${r.lcp} | ${r.tbt} | ${r.cls} | ${r.si} |`),
  "",
  "Targets: performance ≥ 90, accessibility 100. Full reports: one HTML file per page in this folder.",
  ...rows.filter((r) => r.failedAccessibility.length).map((r) => `\nAccessibility audits not passing on \`${r.page}\`: ${r.failedAccessibility.join(", ")}`),
  "",
].join("\n");
await writeFile(join(OUT, "summary.md"), md);
await writeFile(join(OUT, "summary.json"), JSON.stringify({ date, base: process.env.LH_BASE ?? "local", runs: RUNS, rows }, null, 2));
console.log("\n" + md);
local?.close();
process.exit(failed ? 1 : 0);
