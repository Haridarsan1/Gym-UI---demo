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
| **3D press button** (`Button3D`) | Duolingo-style: solid face plus a darker bottom lip (`box-shadow: 0 4px 0 <darker>`). On press the face moves down 4 px and the lip disappears. Variants: ember, mint, lilac, ink, white. Ember is dark enough for white text (4.7:1); mint and lilac are light faces with dark text (7.7:1 and 8.4:1). A test keeps every pair at 4.5:1 or more. Used for primary actions in member and trainer apps. |
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
| **Today** | Today’s workout, next booking, weekly ring, streak, sessions left, renewal date; a card when the trainer shares a new review | T07 | Streak flame, ring fills, greeting by time of day |
| **Program path** | Current plan version as a path; tap a node to preview; see past weeks | T03, T06 | Duolingo-style path, “Start” bubble on today |
| **Workout session** | Exercise by exercise: instructions, alternatives, prescribed vs actual, pre-filled targets, one-tap “Done as prescribed”, rest timer, substitutions, skip set, notes, effort (RPE) | W03, T05, W01 | 3D buttons, rest timer ring, haptics, PR detection |
| **Workout complete** | Summary: completed/partial/skipped, volume (load × reps), PRs, effort and feedback | W03, P02, P04 | Celebration, XP and volume count-up, badges |
| **Progress** | Charts by metric and date range: weight, measurements, strength, volume, attendance, completion; baseline, latest, change; PR list; goals; a **Reviews** section (shared trainer reviews) | P01–P04 | Self-drawing charts, goal trophies |
| **Bookings** | Book PT sessions against trainer availability and credits; reschedule/cancel with policy shown before confirming; upcoming and past | T04, O01, M06 | Slot picker with clear credit cost |
| **Membership** | Plan, status, validity, visits left, freeze info, renew/upgrade, auto-renew opt-in, invoices, receipts (download), payment history | M01–M04 | One-tap renew with confirmation stamp |
| **Check-in pass** | Personal QR code, brightness boost, last check-ins | M05 | Pass flips when scanned (polling in demo) |
| **Reviews and check-ins** | A section inside Progress (Progress → Reviews, not in the avatar menu): shared trainer reviews, submit feedback on effort, recovery and obstacles | P04, T06 | — |
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
| **Staff and roles** | Invite staff, assign roles and branches, permission limits, including “Can view client health and progress photos” (off by default; owners and branch managers only) | R02, S03 |
| **Branches** | Hours, rooms, capacity, locale | O01 |
| **Policies** | Check-in window, freeze rules, grace periods, cancellation cutoffs, no-show rules, proration, partial payments | M02, M05, T04, O02 |
| **Communications** | Templates, delivery log, retry status, consent-aware sending (email first) | O04 |
| **Import members** | CSV upload, preview, row-level errors, idempotent retry | S01 |
| **Subscription** | Ember plan, limits usage, features, billing dates, software invoices (separate from member billing) | S02 |
| **Audit log** | Membership changes, refunds, credit adjustments, permission changes, sensitive edits, every view of an assessment or progress photo, support access | S05 |
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


### Records beyond S07

These exist because the member app needs them. Each is a Zod schema in `src/domain/types/supporting.ts`, has a Dexie table, and is seeded for the sample members.

| Record | Why it is needed |
|---|---|
| `TrainerReview` | T06 and P04 need feedback the member can see (`shared_review`), notes the trainer keeps private (`private_note`), and the member’s own effort, recovery and obstacles check-in (`member_checkin`). One record with a kind keeps the history, with its author, in one place. `readByMemberAt` drives the “new review” card on Today. Members never see private notes. |
| `MemberSettings` | O04 and S04 let members choose which emails they get, and the app offers sounds (off by default) and haptics. Marketing consent is a `Consent` record, not stored here. |
| `BadgeAward` | A celebration should happen once, when a badge is first earned. The stored award is how the app knows a badge is new, and keeps its date. The badge rules are in `domain/badges.ts`. |
| `TrainerAvailability` | T04 and O01 book coaching against trainer availability, so the member needs open slots. This is the weekly pattern (weekday, start, end, branch). Leave and shifts arrive in M2. |
| `GymPolicies` | The booking, cancellation and streak rules are the gym’s choice, not constants. One row per gym: free-cancellation cutoff (12 hours), whether late cancels and no-shows use the credit (both yes), the streak threshold (75%), how far ahead members can book (14 days) and session length (60 minutes). The owner edits them in M4. |

Also added to existing records: `Invoice.placeOfSupply` (GST state code, decides CGST + SGST or IGST) and `Tenant.legalName` and `Tenant.address` (printed on tax receipts).

### Rules written down in M1

- **Which plan applies on a date:** the published version that started most recently on or before that date. A new version replaces the old one from its start date; earlier dates keep their original targets (T06).
- **Adherence (P03):** completed workouts against scheduled, non-canceled workouts whose dates have passed in the period. Partial, skipped and missed (nothing logged) are counted separately. Unscheduled workouts are reported as extra. With nothing scheduled the rate is empty, never zero. Days inside a freeze are not counted as missed.
- **Volume (P02):** the sum of load × reps over sets that were done and have both.
- **Personal record:** the heaviest load ever lifted for an exercise in a set that was done. The first time an exercise is logged sets the baseline and is not a record. A substituted exercise is judged as the exercise actually done.
- **Streak:** weeks (Monday to Sunday) in a row in which at least 75% of the planned workouts were completed or partial (the percentage is a `GymPolicies` value). Weeks with nothing planned, and weeks overlapping a freeze, pause the streak. The week in progress adds to it once it reaches the threshold and never breaks it before it ends.
- **Credits (M06):** purchase adds to available; reservation moves available to reserved; consumption uses reserved; release returns reserved to available; reversal undoes the referenced entry; expiry and adjustments change available.
- **Invoice totals:** a discount is spread over the lines before 18% GST is worked out. **Tax split:** CGST + SGST in equal halves (an odd paisa goes to SGST) when the place of supply is the gym’s state, otherwise IGST. **Place of supply** for in-gym services (memberships, PT sessions, classes) is the branch’s state (`Branch.stateCode`), whatever the member’s address (`placeOfSupplyFor` in `billing.ts`); IGST stays for services delivered in another state. Gym services use SAC 999723.

### Rules written down in M1, steps 5 and 6

- **Workout result (T05):** completed when every prescribed main set was done, whatever the reps and load (10, 10, 8 against 3 × 10 is completed); partial when some were done; skipped when none were. Warm-up and cool-down sets are logged but do not change the result, unless they are all a day has.
- **Pre-filled targets (W03):** a set is pre-filled with the prescribed reps (the lower end of a range), load and duration. Logging it unchanged is stored as “as prescribed”.
- **Substitution (W03):** a swapped exercise is stored against the one it replaced and answers its prescription. Its sets start empty, because they are a different movement.
- **When a workout can be logged:** on its day, for an active membership. A started workout can still be saved until the end of the next day. A finished workout is final; a trainer corrects it (T05). A frozen or ended membership can preview the plan but not log.
- **Drafts and retries:** one log per member and day. A draft is saved as sets are logged and carries the workout’s idempotency key; the final submit uses the same key, so repeating it returns the same log. A draft save that arrives after the submit is ignored.

### Sample members

| Member | Login | Shows |
|---|---|---|
| Arjun Kumar | `u_member_arjun`, phone 98200 22002 | A workout today (new plan from 13 days ago), 12 weeks of logs, a streak, 8 training credits (5 free, 1 held, 2 used), a booking in two days at 6 pm (free cancellation until 6 am that day), one unread review, badges, a GST invoice for each month. |
| Priya Sharma | phone 98200 22003 | A rest day, and a renewal invoice of ₹2,950 overdue by four days. |
| Rahul Mehta | phone 98200 22004 | A frozen membership (streak paused), a CGST + SGST invoice (in-gym services are taxed in the branch’s state, even though Rahul lives in Karnataka). |
| Sneha Patil | phone 98200 22005 | A trainer but no plan yet, a 10-visit pass with 4 visits left. |

Everything is relative to today, so Arjun always has a workout today.

### Permissions

One permission map in `domain/permissions.ts` (role × action × scope: own, assigned, branch, organisation, platform). It drives routes, navigation, buttons and API checks in demo mode. Cross-tenant and cross-branch access is denied by default and covered by tests (S03, A05).

**Client health data.** Assessments and progress photos are open to the assigned trainer and to the member. Owners and branch managers are denied by default and can be given “Can view client health and progress photos” (a per-person switch in `StaffLimits`, set by an owner, never for front desk or finance). Even then, photos need the member’s photo consent, branch managers stay within their branches, and private trainer notes stay trainer-only. Owners and branch managers can always see that an assessment exists and each goal’s status. Every view goes through `src/api/sensitive.ts` and writes an audit event (`assessment.view`, `photo.view`), including repeat views. A member looking at their own records is not audited (decided after M0).

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
  - Seed (M0, extended in M1 with the sample members’ training, billing and activity): Pulse Fitness, 3 branches, 14 logins (6 trainers), plan catalogue, 150 members in every membership state, trainer assignments (incl. transfers), consents, PT credits. Invoices, bookings, workouts, check-ins and exercises are seeded in the milestone that first shows them.
- [x] Permission map and route guards (`member.list` is separate from `member.read`, so members cannot browse the member list)
- [x] Design additions: `Button3D`, shells (member/trainer bottom tabs, staff sidebar), skeletons, toasts, empty states, status pills, ⌘K palette
  - Navigation: member tabs Today · Program · (raised: Start today’s workout, or Check-in pass when there is no workout) · Progress · Bookings; Me behind the avatar (membership and receipts, check-in pass, profile/consent/preferences). Reviews are a section of Progress. Trainer tabs Today · Clients · (raised: Log session) · Schedule · Library (exercises, templates, programs); Me behind the avatar. Staff: sidebar on desktop, four tabs plus More on phones. Every screen in §4 has a route and a place; the registry is checked against this file by a test.
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
- [x] Today (step 4)
  - States: workout today (with “New plan from Coach Meera, 4 Nov”), workout started (Continue), done / partly done / skipped (never red), rest day, no plan yet, frozen, expired, pending, no membership. Notices for overdue or due invoices. Cards: this week’s ring and streak, training sessions with the exact free-cancellation deadline, new shared review, membership. The raised button starts or continues today’s workout for active members, and is the check-in pass otherwise.
  - The seed generator loads on demand, so returning visits never download it.
- [x] Program path (step 5)
  - The plan as weeks of days, one week at a time with Previous and Next week and “Back to this week”. Workout days are markers on a path (done, partly done, skipped, not logged, today, coming up; skipped and not logged are neutral grey, never red); rest days are quiet markers. Past weeks show the version of the plan that governed them (T06), and “Earlier plans” lists older versions with their dates.
  - Tapping a workout opens a preview (`PreviewSheet`): the prescription, how to do each exercise, alternatives, and for a day already logged what was done next to the target. It offers Start or Continue only for today’s workout; for other days it says why not.
- [x] Workout session with logging, drafts, substitutions, rest timer, idempotent submit (step 6)
  - One exercise at a time with Back and Next; the tab bar steps aside and the session has its own bar. Each set opens pre-filled with its target, so a set done as prescribed is one tap on “Log set”; reps, load, time and distance have − and + buttons and can be typed. “Skip set” is neutral grey and can be undone or logged after all; “Change” edits a logged set.
  - “Swap exercise” lists the library’s alternatives and keeps the original in view (“Instead of …”). A rest timer starts after a set when the trainer set a rest, counts down from an end time (so it stays right when the phone sleeps), and has +15 s and Skip rest.
  - Sets are saved as a draft half a second after each change, in order, and when the person leaves or the page is hidden. “Finish” (any time) or “Finish workout” (last exercise) opens a sheet with the result in words, effort 1 to 10 and a note; submitting again after a failure uses the same key.
  - Finishing sends the member to Today with a short confirmation. The celebration, volume and personal records come with the next step.
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
- [ ] Upgrade to Vite 6 and Vitest 4 (Vitest 4 needs Vite 6; clears the remaining development-tool advisories)
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

**Confirmed after M0**

| Decision | Choice |
|---|---|
| Owner access to assessments and progress photos | Denied by default. An owner can switch on “Can view client health and progress photos” for an owner or branch manager (never front desk or finance). Every view of an assessment or photo by staff or a trainer is written to the audit log; members’ views of their own records are not. Owners always see that an assessment exists and each goal’s status. |
| React Router | Stay on 6.x, upgraded from 6.28.0 to 6.30.6 (exact pin). The two moderate advisories that remain affect all of 6.x through 7.17 and need the v7 jump: they concern server-side rendering, which we do not use, and open redirects via `<Link>`/`navigate`, where we only navigate to our own paths (the login return address is checked against the person’s own area). |
| Reviews and check-ins | A Reviews section inside Progress, not in the avatar menu. Today shows a card when a trainer shares a new review. |
| Button colours | Coloured faces stay. Ember is `#D14000` (white text 4.7:1). Mint and lilac keep dark text. The marketing site’s orange (`.clay-ember`) uses the same shade family. |
| Unknown email or phone at login | No error. “This demo uses sample accounts. Pick one below to explore.” and the “Try the demo as” picker is highlighted. |
| Vite 6 and Vitest 4 | Done in M6. |

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
| Finance staff work in `/desk` but cannot check members in. Where do they land? | On Invoices and payments. |
| Platform administrators see no gym records, not even in support mode yet. | Support access (M5) adds a time-limited, reasoned, audited grant. |
| GST place of supply and rates | Branch state for in-gym services (CGST + SGST), 18%, SAC 999723. GST rules to be confirmed by the gym’s accountant before launch. |
| Lighthouse (performance 90, accessibility 100) | Not yet measured. Planned for M6. Bundle budget for `/m` is met: 150 KB of 170 KB after step 6. The workout API (which uses Zod) is loaded on demand with the program and workout screens, so it stays out of every area’s first download. |
