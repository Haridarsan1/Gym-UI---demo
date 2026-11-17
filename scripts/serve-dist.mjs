/**
 * A small static server for the production build, used by the service worker tests (npm run e2e:pwa).
 * It does what Vercel does for this app (serves dist/, falls back to index.html for app routes), plus
 * POST /__deploy, which makes /sw.js and index.html come back changed, like a new deploy would.
 *   node scripts/serve-dist.mjs 4175
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.argv[2] ?? 4175);
const root = join(process.cwd(), "dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff": "font/woff", ".webmanifest": "application/manifest+json", ".json": "application/json" };
let deploys = 0;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "POST" && url.pathname === "/__deploy") {
    deploys++;
    res.writeHead(200).end(String(deploys));
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, rel);
  const isFile = await stat(file).then((s) => s.isFile(), () => false);
  if (!isFile) file = join(root, "index.html");
  let body = await readFile(file);
  const headers = { "Content-Type": types[extname(file)] ?? "application/octet-stream" };
  if (file.endsWith("index.html") || file.endsWith("sw.js") || file.endsWith(".webmanifest")) headers["Cache-Control"] = "public, max-age=0, must-revalidate";
  else if (rel.startsWith("/assets/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
  if (file.endsWith("sw.js") && deploys > 0) body = Buffer.concat([body, Buffer.from(`\n// deploy ${deploys}`)]);
  if (file.endsWith("index.html") && deploys > 0) body = Buffer.from(body.toString().replace("</body>", `<!-- deploy ${deploys} --></body>`));
  res.writeHead(200, headers).end(body);
}).listen(port, () => console.log(`Serving dist on http://localhost:${port}`));
