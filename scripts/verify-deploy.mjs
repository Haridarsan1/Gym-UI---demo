/**
 * The checks for a deployed address (a Vercel preview, then production): the service worker and manifest tests that can run against a live site, the demo-mode check, and Lighthouse
 * on a return visit. Reports go to docs/lighthouse/live/.
 *   npm run verify:deploy -- https://gym-ui-demo-git-m6-....vercel.app
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
const headers = await fetch(url + "/sw.js", { method: "HEAD" }).then((r) => `${r.status} cache-control: ${r.headers.get("cache-control")}`, (e) => String(e));
console.log(`/sw.js: ${headers}`);
const pwa = run("service worker, manifest and demo mode", "npx", ["playwright", "test", "-c", "playwright.pwa.config.ts"], { PWA_BASE_URL: url });
const lighthouse = run("Lighthouse, return visit, mobile", "node", ["scripts/lighthouse.mjs"], { LH_BASE: url, LH_OUT: "docs/lighthouse/live" });
process.exit(pwa && lighthouse ? 0 : 1);
