# Ember product plan

This is the plan for building the Ember gym management app on top of the existing marketing site. It is written for both people and Claude Code: every milestone has a scope, the requirement IDs it covers (from `docs/REQUIREMENTS.md`), and a definition of done.

**Status key:** `[ ]` not started · `[~]` in progress · `[x]` done. Claude Code updates the checkboxes as work lands.

---

## 1. What we are building

One responsive web app (installable on phones as a PWA) that serves all five roles from the requirements:

| Role (req.) | Where they work | Main device | Feel |
|---|---|---|---|
| Member (R05) | `/m` | Phone | Playful, motivating, Duolingo-style |
| Trainer (R04) | `/t` | Phone, sometimes tablet | Fast, encouraging, action-first |
| Front desk and finance (R03) | `/desk` | Desktop or tablet at the counter, phone as backup | Quick, clear, big feedback |
| Owner and branch manager (R02) | `/owner` | Desktop and phone | Calm, precise, data-dense |
| Platform admin (R01) | `/admin` | Desktop | Plain and functional |

The marketing site (`/`, `/signup`, `/login`) stays as it is.

### Demo-first data layer

Until a backend exists, the app runs in **demo mode** against a typed in-browser API (`src/api/`) backed by seeded data saved in IndexedDB. Every screen calls the same functions a real backend would answer, so swapping in real HTTP calls later changes one layer, not the screens. Demo mode simulates network delay, failures, retries and concurrent requests, so acceptance scenarios A01–A05 can be demonstrated on Vercel.

Seed data: one gym ("Pulse Fitness", 3 branches: Andheri, Bandra, Powai), about 150 members across every membership state, 6 trainers, front-desk and finance staff, plan catalogue, 12 weeks of invoices, payments, check-ins, bookings, workout plans and logs, measurements and goals. Indian names, INR, GST, Asia/Kolkata.

---

## 2. Experience principles

1. **Useful first, delightful second.** Every animation confirms an action, shows progress or guides the next step. Nothing decorative blocks work.
2. **Two moods, one brand.**
   - *Member and trainer apps* are game-like: 3D press buttons, streaks, celebrations, a program path and haptics. No mascot (decided).
   - *Desk, owner, finance and admin consoles* are calm and fast: dense tables, keyboard shortcuts, ⌘K search, subtle motion. Gamification never appears where money or access decisions are made.
3. **One tap for the common case.** Targets are pre-filled (W03), "Done as prescribed" logs a set in one tap, check-in is one scan.
4. **Never lose work.** Drafts autosave (W03), forms survive refresh, retries never duplicate (W03, M04, S01).
5. **Honest numbers.** Metrics follow P03 and O07 definitions exactly; missing data shows as gaps, never as zero.
6. **Fast on a ₹12,000 Android phone over 4G.** See performance budgets in section 6.
7. **Accessible.** WCAG 2.2 AA, 44 px touch targets, full keyboard support, all motion off with reduced motion.

---

## 3. Design system additions (extends the marketing site theme)

Keep the existing tokens (`tailwind.config.ts`, `src/styles/index.css`): cream canvas, clay surfaces, Ember orange, lilac and mint, plum-ink text, Outfit and Big Shoulders Display.

New pieces:

| Piece | Description |
|---|---|
| **3D press button** (`Button3D`) | Duolingo-style: solid face plus a darker bottom lip (`box-shadow: 0 4px 0 <darker>`). On press the face moves down 4 px and the lip disappears. Variants: ember, mint, lilac, ink, white. Faces are light with plum-ink text (white on Ember orange is only about 3.4:1; plum-ink on it is 4.9:1), except ink. Used for primary actions in member and trainer apps. |
| **Program path** | Vertical, gently zig-zagging path of workout nodes (like Duolingo’s lesson path). Done = ember with check, today = pulsing with a “Start” bubble, upcoming = clay grey, missed = outlined, skipped = dashed. Week headers as path milestones. |
| **Celebration system** | `celebrate({ kind })` for: workout complete, personal record, goal achieved, streak extended, check-in success. Confetti in brand colours, XP and stat count-ups, badge pop. Short, skippable, off with reduced motion. One shared component, so it stays consistent. |
| **Streak flame and weekly ring** | Streak counts *weeks in a row* the member hit their planned workouts (healthy for gyms; no daily guilt). Frozen membership pauses the streak instead of breaking it. |
| **Badges** | Milestones that reflect real effort: first workout, 10/50/100 workouts, first PR, 4-week streak, goal achieved, 50 check-ins. No pay-to-earn badges. |
| **Haptics and sound** | `navigator.vibrate` on set logged, PR and check-in (Android). Optional sounds, off by default, member setting. |
| **Status pills** | Membership = filled, invoice = outlined (M02). Workout: completed, partial, skipped (never red). Booking: booked, cancelled, attended, no-show. |
| **Data components** | `DataTable` (sort, filter, column picker, CSV export, virtualised), `StatCard`, `TrendChart`, `BarChart`, `Heatmap`, `Ring` built as lightweight SVG (no heavy chart library). |
| **App shell** | Member and trainer: bottom tab bar with a raised centre action. Staff: left sidebar on desktop, bottom bar plus “More” sheet on mobile, branch switcher, ⌘K command palette. |
| **Feedback** | Toasts with undo where safe, inline errors in plain language, skeletons (never spinners for page loads), empty states that say what to do next. |

---

## 4. Feature map by role

Release labels follow the requirements: **R1** = proposed first release, **R2** = proposed second release.

### 4.1 Member app `/m` (R05)

| Screen | What it does | Requirements | Delight |
|---|---|---|---|
| **Today** | Today’s workout, next booking, weekly ring, streak, sessions left, renewal date | T07 | Streak flame, ring fills, greeting by time of day |
| **Program path** | Current plan version as a path; tap a node to preview; see past weeks | T03, T06 | Duolingo-style path, “Start” bubble on today |
| **Workout session** | Exercise by exercise: instructions, alternatives, prescribed vs actual, pre-filled targets, one-tap “Done as prescribed”, rest timer, substitutions, skip set, notes, effort (RPE) | W03, T05, W01 | 3D buttons, rest timer ring, haptics, PR detection |
| **Workout complete** | Summary: completed/partial/skipped, volume (load × reps), PRs, effort and feedback | W03, P02, P04 | Celebration, XP and volume count-up, badges |
| **Progress** | Charts by metric and date range: weight, measurements, strength, volume, attendance, completion; baseline, latest, change; PR list; goals | P01–P04 | Self-drawing charts, goal trophies |
| **Bookings** | Book PT sessions against trainer availability and credits; reschedule/cancel with policy shown before confirming; upcoming and past | T04, O01, M06 | Slot picker with clear credit cost |
| **Membership** | Plan, status, validity, visits left, freeze info, renew/upgrade, auto-renew opt-in, invoices, receipts (download), payment history | M01–M04 | One-tap renew with confirmation stamp |
| **Check-in pass** | Personal QR code, brightness boost, last check-ins | M05 | Pass flips when scanned (polling in demo) |
| **Reviews and check-ins** | Shared trainer reviews, submit feedback on effort, recovery and obstacles | P04, T06 | — |
| **Me** | Profile, consent (photos, assessments, marketing), notification preferences, data export request, log out | S04, O04 | — |

### 4.2 Trainer app `/t` (R04)

| Screen | What it does | Requirements |
|---|---|---|
| **Today** | Assigned members, today’s sessions, overdue reviews, recent missed workouts, expiring credits, members awaiting a plan, each with a one-tap action | T07 |
| **Clients** | Search and filter assigned clients; adherence at a glance | T01, S03 |
| **Client profile** | Overview, current plan, logs (with author), progress, assessments, goals, private notes vs shared feedback, history from previous trainers (authorised, authors preserved) | T02, T05, T06, P01–P04, A02 |
| **Assessment** | Experience, availability, preferences, member-reported restrictions, baseline measurements, goals with target dates and review cadence; sensitive fields optional and access-controlled | T02, P01 |
| **Program builder** | Program → week → day → exercises; sets, reps or ranges, load, duration, distance, rest, tempo, effort, cues, warm-up and cooldown; drag to reorder; copy templates; preview as member; publish as a new dated version | W02, T03, T06 |
| **Templates** | Personal and gym-wide templates | W02 |
| **Exercise library** | Browse, search, filter by muscle and equipment; tenant exercises; archive (kept in history) | W01 |
| **Log for a client** | Coach-led session logging; entries marked as entered by trainer | T05 |
| **Review** | Adherence (P03), trends, client feedback; shared feedback or private note; schedule follow-up | T06, P04 |
| **Schedule** | Availability, shifts, leave; booked sessions; mark attended or no-show | O01, O02, T04, M06 |

### 4.3 Front desk `/desk` (R03)

| Screen | What it does | Requirements |
|---|---|---|
| **Check-in** (home) | Search or QR scan (camera); eligibility result (branch, plan validity, visits, restrictions); repeat-scan protection; override with reason; live list of today’s check-ins | M05, A04 |
| **New member** | Wizard: details and duplicate check → consent → plan (snapshot terms) → trainer and effective date → invoice and payment → QR pass sent | T01, M01, M03, O03 |
| **Member profile** | Membership (status, freeze, renew, upgrade, cancel with effective date), invoices and dues, payments, credits ledger, bookings, check-ins, assigned trainer, communications | M02–M06, T01 |
| **Collect payment** | Cash, UPI, card, transfer; partial if enabled; receipt by email or print | M03 |
| **Bookings** | Day and week calendar by trainer and room; book against availability and credits; conflict-safe | T04, O01, A03 |
| **Dues** | Unpaid and failed invoices, reminder actions | M03, O04 |

Restrictions (R03): no access to assessments or progress photos anywhere in `/desk`.

### 4.4 Finance (R03, inside `/desk` with finance permissions)

| Screen | What it does | Requirements |
|---|---|---|
| **Invoices and payments** | Search, filter by status and branch, billed vs collected | M03, O07 |
| **Refunds** | Authorised partial or full refunds, effect on credits, transaction history | M04, M06 |
| **Reconciliation** | Match collections to gateway settlements and cash records; flagged discrepancies (duplicate gateway events) | M03, M04 |
| **Exports** | Role-scoped CSV exports | O06, S03 |

### 4.5 Owner and branch manager `/owner` (R02)

| Screen | What it does | Requirements |
|---|---|---|
| **Dashboard** | Collections vs billed, dues, active and expiring memberships, renewals, check-ins heat map, trainer utilisation, alerts | O06, O07 |
| **Reports** | Memberships, renewals (cohort definition), leads and conversions, check-ins and peak hours, classes and no-shows, trainer utilisation, PT credits, invoices, collections, dues, refunds; filter by branch and date; CSV | O06, O07 |
| **Members** | Full list with filters and bulk actions | M02 |
| **Plans and pricing** | Trial, time-based and visit-based plans; prices, effective dates, branch coverage, visits, class entitlements, training credits; taxes and discounts | M01, M03 |
| **Staff and roles** | Invite staff, assign roles and branches, permission limits | R02, S03 |
| **Branches** | Hours, rooms, capacity, locale | O01 |
| **Policies** | Check-in window, freeze rules, grace periods, cancellation cutoffs, no-show rules, proration, partial payments | M02, M05, T04, O02 |
| **Communications** | Templates, delivery log, retry status, consent-aware sending (email first) | O04 |
| **Import members** | CSV upload, preview, row-level errors, idempotent retry | S01 |
| **Subscription** | Ember plan, limits usage, features, billing dates, software invoices (separate from member billing) | S02 |
| **Audit log** | Membership changes, refunds, credit adjustments, permission changes, sensitive edits, support access | S05 |
| **Settings** | Gym profile, logo (white-label), GSTIN, currency, time zone | Operating assumptions |

### 4.6 Platform admin `/admin` (R01)

| Screen | What it does | Requirements |
|---|---|---|
| **Tenants** | List, health, subscription state (trial, paid, past due, suspended, cancelled), usage vs limits | S02, S06 |
| **Tenant detail** | Plan, limits, entitlements, billing, onboarding progress | S01, S02 |
| **Support access** | Request time-limited, reasoned access; visible banner while active; auto-expiry; audited | R01, S05 |
| **SaaS plans** | Plan limits by branches, staff or active members | S02 |

### 4.7 Release 2 modules

| Module | Requirements |
|---|---|
| Group classes, recurring schedules, capacity, waitlists with auto-offer | O01, O02 |
| Leads and trials pipeline (source, stage, follow-ups, conversion with duplicate check) | O03 |
| Equipment and maintenance, incidents (restricted) | O05 |
| Configurable notifications | O04 |
| Advanced analytics | O06 |
| Automated payment reconciliation | M03, M04 |

Optional expansion (POS, chat, wearables, nutrition) is out of scope until rollout gyms are chosen.

---

## 5. Architecture

| Area | Choice | Why |
|---|---|---|
| Framework | React 18, TypeScript (strict), Vite 5 | Already in place |
| Routing | React Router 6, lazy-loaded route modules per role | Small initial bundle per role |
| Server state | TanStack Query | Caching, optimistic updates, retries, background refresh |
| Local UI state | React state and context; Zustand only if a store is truly shared | Keep it simple |
| Forms | React Hook Form + Zod | Fast, typed validation; same schemas validate API input in demo mode |
| Tables and lists | TanStack Table + TanStack Virtual | Large member lists stay smooth |
| Dates | date-fns + date-fns-tz, Asia/Kolkata default | Small, tree-shakeable |
| Motion | Framer Motion via `LazyMotion` + `domAnimation` | Smaller bundle |
| Charts | Own SVG components | Avoids a 100 KB chart dependency |
| QR | `qrcode` (generate), `@zxing/browser` or `BarcodeDetector` (scan, lazy-loaded on desk only) | Only the desk downloads the scanner |
| Confetti | `canvas-confetti` (lazy) | ~4 KB, loaded only when celebrating |
| Demo database | Dexie (IndexedDB) with seed + reset | Survives refresh; reset button for demos |
| Offline | `vite-plugin-pwa`; offline workout drafts and queue | W03 drafts, gym basements have bad signal |
| Tests | Vitest (domain rules), Playwright (acceptance flows) | A01–A05 automated |

### Folder structure

Marketing code stays where it was. App code is new and lives in its own folders so it never ships to marketing routes. Entries marked *(planned)* are added later in M0; remove the mark when the folder lands.

```
src/
  pages/          marketing pages: home/, signup/, LoginPage, LegalPage, NotFound
  components/     ui/ (Button, Logo, Container, SectionHeader, StatusPill) and gym/ (marketing illustrations)
  config/ data/ hooks/ lib/   marketing brand, content, motion hooks, formatting and scroll helpers
  app/            lazy entry (AppEntry), session (localStorage), SessionContext, guards (RequireArea, RequireCan, Can),
                  screens.ts (registry of every PLAN §4 screen: path, requirement IDs, permission, place in navigation),
                  navigation.ts (what each person sees, mobile bar, landing screen, raised action), AreaRoutes (routes built from the registry),
                  demoSignIn (sign in as a demo person; shared by login, signup and the role switcher), mode (demo flag),
                  ScreenStub (placeholder until a screen’s milestone), SubNav, demoAccounts (people who can log in; also read by the login page, so keep it tiny)
  api/            typed API functions and React Query hooks. context.ts re-resolves the caller from the database and checks permissions. Demo implementation now, HTTP later
  demo/           db.ts (Dexie, one table per S07 record), seed.ts (pure, deterministic generator), simulate.ts (latency and failures), index.ts (ensureSeeded, resetDemo, runOnce, writeAudit)
  domain/         pure business rules, no React
    roles.ts        roles, areas, home path per role
    types/          S07 records as Zod schemas: common, core, billing, ops, training. Money is whole paise; dates are ISO strings
    permissions.ts  role × action → scope map, can(), canRefund() (S03)
    dates.ts audit.ts membership.ts   India-time dates, audit event builder, current membership and trainer assignment helpers
    checkin.ts credits.ts billing.ts metrics.ts reports.ts   added in the milestone that needs each (membership.ts gains the lifecycle in M3)
  test/           Vitest setup (fake IndexedDB, in-memory localStorage, no simulated delay)
  features/       one folder per area: member/ trainer/ desk/ owner/ admin/ (finance lives in desk/)
  design/         app-only pieces: Button3D, Skeleton, States (empty and error), StatusPills, Toast, Dialog, Avatar, DemoGate, DesignCheck (dev only)
    shells/         PlayShell (member and trainer), StaffShell (desk, owner, admin), AvatarMenu, BranchSwitcher and BranchContext, CommandPalette
e2e/              Playwright tests: marketing.spec.ts is the regression suite for the marketing site; pwa.spec.ts runs against a production build (npm run e2e:pwa)
scripts/          bundle-report.mjs, make-icons.mjs, serve-dist.mjs
```

**Bundle rule:** `App.tsx` loads `src/app/AppEntry.tsx` lazily and nothing else from the app. The home page is lazy too, so `/m`, `/login` and `/signup` don’t download it; `vite.config.ts` preloads it (with everything it imports) on `/` only, so `/` is not slowed down (measured: LCP 1744 ms vs 1728 ms before, Slow-4G profile with 4× CPU slowdown). React Query, Dexie, Zod, the seed generator and the shells must not appear in the bundles for `/`, `/signup` or `/login`. `npm run bundle-report` (after `npm run build`) fails if they do.

**Dependencies are pinned** to exact versions, each at least two weeks old when added. Vitest is on 3.x because Vitest 4 and later need Vite 6 or newer and the project is on Vite 5.


### Permissions

One permission map in `domain/permissions.ts` (role × action × scope: own, assigned, branch, organisation, platform). It drives routes, navigation, buttons and API checks in demo mode. Cross-tenant and cross-branch access is denied by default and covered by tests (S03, A05).

---

## 6. Performance and quality budgets

| Measure | Target |
|---|---|
| Initial JS for `/m` (gzipped) | ≤ 170 KB |
| Largest Contentful Paint, mid-range Android, 4G | ≤ 2.0 s |
| Interaction to Next Paint | ≤ 200 ms |
| Common views load (S06) | ≤ 2 s at p95 in demo |
| Lighthouse mobile | Performance ≥ 90, Accessibility 100, Best practices ≥ 95 |
| Layout | No horizontal scroll at 360, 390, 768, 1024, 1440 px |
| Motion | Everything works with reduced motion; animations ≤ 400 ms except celebrations (≤ 1.6 s, skippable) |

---

## 7. Milestones

Each milestone ends with: typecheck and build pass, unit tests for any new domain rules, Playwright tests for the milestone’s flows, a check at 390 px and 1440 px, and an updated checklist here.

### M0 · Foundation
- [x] Add `/app` role routing (lazy, per area); marketing pages stay in `src/pages/`
- [x] Domain types for every S07 record
- [x] Demo database (Dexie), seed generator, reset control (`resetDemo()`; the button comes with the shells), latency and failure simulation
  - Seed in M0: Pulse Fitness, 3 branches, 14 logins (6 trainers), plan catalogue, 150 members in every membership state, trainer assignments (incl. transfers), consents, PT credits. Invoices, bookings, workouts, check-ins and exercises are seeded in the milestone that first shows them.
- [x] Permission map and route guards (`member.list` is separate from `member.read`, so members cannot browse the member list)
- [x] Design additions: `Button3D`, shells (member/trainer bottom tabs, staff sidebar), skeletons, toasts, empty states, status pills, ⌘K palette
  - Navigation: member tabs Today · Program · (raised: Start today’s workout, or Check-in pass when there is no workout) · Progress · Bookings; Me behind the avatar (membership and receipts, check-in pass, reviews and check-ins, profile/consent/preferences). Trainer tabs Today · Clients · (raised: Log session) · Schedule · Library (exercises, templates, programs); Me behind the avatar. Staff: sidebar on desktop, four tabs plus More on phones. Every screen in §4 has a route and a place; the registry is checked against this file by a test.
  - Finance staff work in `/desk` and land on Invoices and payments, because they cannot open Check-in.
  - Left for the login step: role switcher in demo mode. The PWA step adds the “New version available” toast (the toast component already supports staying until dismissed).
- [x] Login: members with phone number + OTP **or** email + password (both offered); staff with email + password; demo accepts any 6-digit OTP and any password, plus a “Try as…” role picker and a role switcher in demo mode
  - The email or phone number must belong to someone in the demo gym (`src/app/demoAccounts.ts`); anything else says so in plain words. Phone login is for members only. The session is stored in localStorage (`ember.session`) and Sign out is in every shell. The role switcher is in the avatar menu and ⌘K, and hidden when `VITE_DEMO_MODE=false`.
  - After signup, “Open your dashboard” signs in as the owner of Pulse Fitness and opens the owner home.
- [x] PWA setup
  - `vite-plugin-pwa` with `registerType: "autoUpdate"`: a new service worker takes over as soon as it is ready. It is registered by `src/app/pwa.ts` only when the app opens (never on marketing pages) and only in production builds.
  - Caches static files only (app scripts, styles, Latin fonts, icons), about 790 KB uncompressed. `index.html` is never precached and there is no navigation fallback; page loads are network first (3 s timeout) with the last copy kept for offline, so a Vercel deploy shows on the next load. Marketing-only chunks and Latin-extended fonts are not precached.
  - The page is not reloaded for you, so a workout in progress is safe. A “New version available” toast with a Reload button stays until dismissed. The same toast shows when a lazy screen’s file was removed by a deploy (`vite:preloadError`).
  - `public/icons/` is made by `npm run icons`. `vercel.json` serves `sw.js` and the manifest with no caching. Tests: `npm run e2e:pwa` (builds and uses `scripts/serve-dist.mjs`, which can simulate a deploy).
- **Done when:** each role lands on its own empty home inside its shell, on phone and desktop, with the correct navigation. ✔ Checked by `e2e/m0.spec.ts` (all seven logins, 390 px and 1440 px), `shells.spec.ts`, `guards.spec.ts` and `login.spec.ts`.

### M1 · Member app (R05)
- [ ] Today
- [ ] Program path
- [ ] Workout session with logging, drafts, substitutions, rest timer, idempotent submit
- [ ] Workout complete celebration and badges
- [ ] Progress charts, PRs, goals
- [ ] Bookings with credits and policy
- [ ] Membership, renew, invoices and receipts
- [ ] Check-in pass
- [ ] Me: consent, preferences
- **Done when:** a member can complete a workout logging 10, 10, 8 reps against 3×10 and see it in progress (P03 acceptance check).

### M2 · Trainer app (R04)
- [ ] Today dashboard (T07)
- [ ] Clients and client profile with authorship
- [ ] Assessment and goals
- [ ] Exercise library
- [ ] Program builder, templates, preview, publish as version
- [ ] Coach-led logging
- [ ] Review and follow-up
- [ ] Schedule, availability, attended and no-show
- **Done when:** publishing a new plan version leaves earlier prescriptions and logs intact, and trainer transfer (A02) works.

### M3 · Front desk and finance (R03)
- [ ] Check-in with QR, eligibility, repeat-scan protection, overrides
- [ ] New member wizard
- [ ] Member profile with lifecycle actions (freeze, renew, upgrade, cancel)
- [ ] Payments, receipts, dues
- [ ] PT credits ledger
- [ ] Bookings calendar with conflict safety
- [ ] Finance: invoices, refunds, reconciliation, exports
- **Done when:** A01, A03 and A04 pass end to end.

### M4 · Owner and branch manager (R02)
- [ ] Dashboard
- [ ] Reports with O07 definitions and CSV
- [ ] Plans and pricing, taxes, policies
- [ ] Staff, roles and branches
- [ ] Communications templates and log
- [ ] Member import with preview and row errors (S01)
- [ ] Subscription page, audit log, settings and logo
- **Done when:** a branch manager sees only their branches everywhere, including exports.

### M5 · Platform admin (R01)
- [ ] Tenants, tenant detail, SaaS plans (platform admins have no access to a gym’s records; support access adds a time-limited principal in `permissions.ts`)
- [ ] Time-limited support access with banner and audit
- **Done when:** support access expires automatically and every action is in the audit log.

### M6 · Hardening and release
- [ ] Acceptance suite A01–A05 green
- [ ] Performance budgets met, Lighthouse report saved
- [ ] Accessibility pass (keyboard, screen reader, contrast)
- [ ] Copy pass in plain language
- [ ] Vercel deploy with demo reset

### M7 · Release 2
- [ ] Classes and waitlists · [ ] Leads and trials · [ ] Equipment and incidents · [ ] Notification settings · [ ] Advanced analytics · [ ] Automated reconciliation

---

## 8. Decisions

**Confirmed**

| Decision | Choice |
|---|---|
| Backend | Demo mode first (seeded IndexedDB behind the typed `src/api/` layer); real backend later |
| Member login | Both: phone number + OTP, and email + password |
| Mascot | No mascot; use effects only (3D buttons, path, celebrations, streaks, haptics) |
| Message channels | Email only |

**Still to confirm (defaults in use)**

| Decision | Default |
|---|---|
| Staff login | Email + password; MFA for owners and platform admins (S04) |
| Sounds | Off by default |
| Payment gateway | Razorpay-style flow simulated in demo |
| Languages | English first, structure ready for Hindi |
| Launch gyms, peak load, retention, policies | From the requirements’ sign-off list; seed uses sensible defaults |

**Decisions to confirm (raised during M0, defaults in use)**

| Question | Default in use |
|---|---|
| Member menu: where do “Reviews and check-ins” live? The brief listed membership, receipts, check-in pass, consent and preferences behind the avatar. | Added to the avatar menu so every §4 screen has a place. Could move into Progress. |
| Finance staff work in `/desk` but cannot check members in. Where do they land? | On Invoices and payments. |
| Owners cannot read assessments, progress photos or private trainer notes (only the assigned trainer and the member can). The requirements restrict desk and finance explicitly but are silent on owners. | Denied by default. Say if owners should see assessments. |
| Platform administrators see no gym records, not even in support mode yet. | Support access (M5) adds a time-limited, reasoned, audited grant. |
| `react-router-dom` 6.28.0 has a published advisory (`@remix-run/router`). It was in the project before M0. Vite 5’s dev server has one for esbuild (development only). | Not upgraded. Upgrading React Router to a patched 6.x is small; Vite 6 is a larger change and would let Vitest move to 4. |
| Button faces: white text on Ember orange is about 3.4:1 (needs 4.5:1). | `Button3D` uses light faces with plum-ink text. The marketing buttons are unchanged. |
| Lighthouse (performance 90, accessibility 100) | Not yet measured. Planned for M6. Bundle budget for `/m` is met: 129 KB of 170 KB. |
