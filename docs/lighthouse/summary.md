# Lighthouse, 2026-11-21

Mobile settings (Moto G Power, slow 4G, 4× CPU slowdown), Lighthouse 13, median of 3 runs, **return visit**: opened once in the same browser profile first; the app pages were signed in through the demo login page and left on their home screen. Measured at a local server that serves dist/ compressed (brotli) with long caching for hashed files, as Vercel does.

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 91 | 0.6 s | 0.9 s | 10 ms | 0 | 0.7 s |
| `/login` | 100 | 100 | 100 | 91 | 0.6 s | 0.6 s | 0 ms | 0.025 | 0.6 s |
| `/m` | 100 | 100 | 100 | 92 | 0.6 s | 0.7 s | 0 ms | 0.022 | 0.6 s |
| `/t` | 100 | 100 | 100 | 92 | 0.6 s | 0.7 s | 10 ms | 0 | 0.6 s |
| `/desk` | 100 | 100 | 100 | 92 | 0.6 s | 0.6 s | 0 ms | 0 | 0.6 s |
| `/owner` | 100 | 100 | 100 | 92 | 0.6 s | 0.8 s | 20 ms | 0.001 | 0.6 s |

Targets: performance ≥ 90, accessibility 100. Full reports: one HTML file per page in this folder.
