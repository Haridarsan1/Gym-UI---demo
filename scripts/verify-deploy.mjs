/**
 * The checks for a deployed address (a Vercel preview, then production): the service worker and manifest tests that can run against a live site, the demo-mode check, and Lighthouse
 * on a return visit. Reports go to docs/lighthouse/live/.
 *   npm run verify:deploy -- https://gym-ui-demo-git-m6-release-hari-darsans-projects.vercel.app
 * A preview behind Vercel’s login needs VERCEL_PROTECTION_BYPASS=<the project’s “Protection Bypass for Automation” secret>.
 */
import { spawnSync } from "node:child_process";

const url = process.argv[2]?.replace(/\/$/, "");
if (!url || !/^https:\/\//.test(url)) {
  console.error("Give the deployed address: npm run verify:deploy -- https://your-preview.vercel.app");
  process.exit(2);
}
const run = (label, cmd, args, env) => {
  console.log(`\n== ${label}`);
  return spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } }).status === 0;
};
const bypass = process.env.VERCEL_PROTECTION_BYPASS ? { "x-vercel-protection-bypass": process.env.VERCEL_PROTECTION_BYPASS } : {};
const headers = await fetch(url + "/sw.js", { method: "HEAD", redirect: "manual", headers: bypass }).then((r) => `${r.status} cache-control: ${r.headers.get("cache-control")}`, (e) => String(e));
console.log(`/sw.js: ${headers}`);
if (/^30\d/.test(headers)) {
  console.error("The address sends you to a login page: it is protected. Set VERCEL_PROTECTION_BYPASS to the project’s “Protection Bypass for Automation” secret, or turn protection off for previews.");
  process.exit(2);
}
const pwa = run("service worker, manifest and demo mode", "npx", ["playwright", "test", "-c", "playwright.pwa.config.ts"], { PWA_BASE_URL: url });
const lighthouse = run("Lighthouse, return visit, mobile", "node", ["scripts/lighthouse.mjs"], { LH_BASE: url, LH_OUT: "docs/lighthouse/live" });
process.exit(pwa && lighthouse ? 0 : 1);
