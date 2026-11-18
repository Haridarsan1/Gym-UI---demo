/**
 * Puts the 390 px screenshots of the member app on contact sheets: a grid of thumbnails with a caption under each.
 *   node scripts/contact-sheets.mjs docs/checkpoints/m1-final            (390 px, the default)
 *   node scripts/contact-sheets.mjs docs/checkpoints/m1-5/768 3 768        (folder, number of sheets, width)
 *   node scripts/contact-sheets.mjs docs/checkpoints/m2-1/1440 1 1440 e2e/m2-shots.json "Ember trainer app"
 * Reads <dir>/screens/NN-key.png and the captions file (e2e/m1-shots.json unless given), writes <dir>/contact-sheet-1.png and so on.
 * Each sheet is a page drawn by the browser we already have for tests, so no image library is needed.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const dir = resolve(process.argv[2] ?? "docs/checkpoints/m1-final");
const SHEETS = Number(process.argv[3] ?? 3);
const WIDTH = Number(process.argv[4] ?? 390);
const HEIGHT = WIDTH < 640 ? 844 : WIDTH < 1024 ? 1024 : 900;
const COLUMNS = WIDTH < 640 ? 5 : WIDTH < 1024 ? 4 : 3;
const THUMB_W = WIDTH < 640 ? 210 : WIDTH < 1024 ? 260 : 420;
const THUMB_H = Math.round((THUMB_W * HEIGHT) / WIDTH);

const CAPTIONS = process.argv[5] ?? "e2e/m1-shots.json";
const TITLE = process.argv[6] ?? "Ember member app";
const shots = JSON.parse(readFileSync(CAPTIONS, "utf8"));
const files = new Map(readdirSync(join(dir, "screens")).filter((f) => f.endsWith(".png")).map((f) => [f.replace(/^\d+-/, "").replace(/\.png$/, ""), f]));
const present = shots.filter((s) => files.has(s.key));
const missing = shots.filter((s) => !files.has(s.key)).map((s) => s.key);
if (missing.length) console.warn(`Missing screenshots: ${missing.join(", ")}`);
if (present.length === 0) throw new Error("No screenshots found. Run the shots script first.");

// Sheets of nearly equal size, in the order of the app.
const per = Math.ceil(present.length / SHEETS);
const groups = Array.from({ length: SHEETS }, (_, i) => present.slice(i * per, (i + 1) * per)).filter((g) => g.length > 0);

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const html = (group, n, total) => `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 28px 28px 20px; background: #FBF8F4; color: #231C35; font-family: "Outfit", system-ui, sans-serif; width: ${COLUMNS * (THUMB_W + 24) + 28 * 2 - 24}px; }
  h1 { margin: 0 0 4px; font-size: 26px; } p.sub { margin: 0 0 20px; color: #6B6383; font-size: 15px; }
  .grid { display: grid; grid-template-columns: repeat(${COLUMNS}, ${THUMB_W}px); gap: 22px 24px; }
  figure { margin: 0; } .frame { width: ${THUMB_W}px; height: ${THUMB_H}px; border-radius: 18px; overflow: hidden; background: #fff; box-shadow: 0 0 0 1.5px #ECE6F1, 0 6px 14px rgba(35,28,53,.08); }
  .frame img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  figcaption { margin-top: 8px; font-size: 14px; line-height: 1.25; font-weight: 600; } figcaption span { display: block; color: #9A93AE; font-weight: 500; font-size: 12px; }
</style>
<h1>${esc(TITLE)}, ${WIDTH} px</h1><p class="sub">Sheet ${n} of ${total}. Each picture is the screen at ${WIDTH} by ${HEIGHT}.</p>
<div class="grid">${group.map((s) => `<figure><div class="frame"><img src="${pathToFileURL(join(dir, "screens", files.get(s.key))).href}" alt=""></div><figcaption>${esc(s.caption)}<span>${esc(files.get(s.key).replace(/\.png$/, ""))}</span></figcaption></figure>`).join("")}</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [i, group] of groups.entries()) {
  const file = join(dir, "sheet.html");
  writeFileSync(file, html(group, i + 1, groups.length));
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r))))));
  await page.screenshot({ path: join(dir, `contact-sheet-${i + 1}.png`), fullPage: true });
  console.log(`contact-sheet-${i + 1}.png: ${group.length} screens`);
}
await browser.close();
import("node:fs").then((fs) => fs.rmSync(join(dir, "sheet.html"), { force: true }));
