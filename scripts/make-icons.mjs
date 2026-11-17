/**
 * Renders the PWA icons from the Ember logo mark (same shapes as public/favicon.svg).
 *   node scripts/make-icons.mjs
 * "any" icons keep the rounded tile. The maskable icon fills the whole square and keeps the mark inside the central 80%,
 * because Android crops maskable icons to a circle or a rounded square.
 */
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const mark = (scale, tx) => `<g transform="translate(${tx} ${tx}) scale(${scale})"><path d="M8 23a12 12 0 0 1 16-11.3M11 23a9 9 0 0 1 12-8.5M14 23a6 6 0 0 1 8-5.7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></g>`;
const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFA778"/><stop offset="1" stop-color="#FC5200"/></linearGradient></defs>`;
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${defs}<rect width="32" height="32" rx="9" fill="url(#g)"/>${mark(1, 0)}</svg>`;
// Mark scaled to 70% and centred: (32 - 32 * 0.7) / 2 = 4.8
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${defs}<rect width="32" height="32" fill="url(#g)"/>${mark(0.7, 4.8)}</svg>`;

const jobs = [
  ["public/icons/icon-192.png", rounded, 192],
  ["public/icons/icon-512.png", rounded, 512],
  ["public/icons/maskable-512.png", maskable, 512],
];

const browser = await chromium.launch();
for (const [file, svg, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await writeFile(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  await page.close();
  console.log("wrote", file);
}
await browser.close();
