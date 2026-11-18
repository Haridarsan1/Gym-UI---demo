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
| Drag to reorder | `@dnd-kit/core` and `@dnd-kit/sortable` (approved and confirmed for M2; exact pins, published at least two weeks before they are added) | Program builder only, in its own chunk. Move up and Move down buttons stay for keyboard users |
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
| `GymPolicies` | The booking, cancellation and streak rules are the gym’s choice, not constants. One row per gym: free-cancellation cutoff (12 hours), whether late cancels and no-shows use the credit (both yes), the streak threshold (75%), how far ahead members can book (14 days) and session length (60 minutes), and “Members can book sessions with other trainers” (off by default). The owner edits them in M4. |

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
- **Pre-filled sets (W03):** reps are the prescribed number; for a range, last time’s reps when they fall inside it, otherwise the bottom of the range. Load is last time’s load when there is one, otherwise the prescribed load. “Last time” is the best set done for that exercise in the most recent finished workout (heaviest load; at equal load, most reps; skipped sets and workouts don’t count), shown under the set title (“Best last time: 10 × 22.5 kg”). A swapped exercise gets the reps and no load. A set logged unchanged is stored as “as prescribed” only when it equals the prescription.
- **Substitution (W03):** a swapped exercise is stored against the one it replaced and answers its prescription. Its sets start empty, because they are a different movement.
- **When a workout can be logged:** on its day, for an active membership. A started workout can still be saved until the end of the next day. A finished workout is final; a trainer corrects it (T05). A frozen or ended membership can preview the plan but not log.
- **Drafts and retries:** one log per member and day. A draft is saved as sets are logged and carries the workout’s idempotency key; the final submit uses the same key, so repeating it returns the same log. A draft save that arrives after the submit is ignored.

### Responsive patterns (M1.5, for every area)

The full rules are in `CLAUDE.md` (“Responsive rules”). What was built and where:

- **Navigation by width.** Phone: bottom bar with the raised action. Tablet (640 to 1023 px): a rail 88 px wide with an icon and a short word, the raised action first as Button3D. Desktop (1024 px and up): a 256 px sidebar with the gym’s logo and name, the raised action as a full-width Button3D, the navigation, and the account menu at the bottom. `design/shells/AppNav.tsx` (`NavRail`, `NavSidebar`) is used by `PlayShell` and `StaffShell`. Screens can set a one-word `short` label in `screens.ts` for the rail. The workout session is a focus mode and hides the navigation at every width.
- **Content width.** `main` is capped at 1200 px; reading text at about 70 characters.
- **Sheet** (`design/Sheet.tsx`) replaces direct use of `Dialog`: panel (bottom sheet, then right-hand panel from 640 px) or confirm (bottom sheet, then centred dialog). Cancel session, Finish workout and Turn on auto-renew are confirmations; everything else is a panel.
- **ThreeZone** (`design/layout/`, M2): list, detail and a context panel from 1280 px (two zones from 768 px; phones stack in the screen). Trainer screens use it.
- **ListDetail**, **ResponsiveTable** and **StickyActions** (`design/layout/`) are ready for the trainer and staff screens. **Tooltip** and **useShortcut** are in `design/`.
- **Member screens on wide screens.** Today: two columns from 1024 px (workout, review and week strip left; streak, training sessions, next booking and membership right). Program: path left, the selected day’s preview right from 1024 px, no dialog, `?date=` in the address; phones and tablets open the preview in a sheet (the tablet content area is only about 600 px wide, too narrow for two columns). Workout session: exercise list left from 768 px, set logging in the centre, rest timer docked right from 1024 px; “n” and “b” move to the next and previous exercise. Progress: stats in a row from 768 px, charts in two columns, records and goals side by side. Bookings: from 1024 px booking is inline, trainer and day pickers left, times and confirmation right; tablets use the side panel. Membership: plan and actions left, invoices and payments right. Check-in pass: pass card with recent check-ins beside it. Me and Reviews: two columns. Receipt: a centred document.

### Patterns for the member app (from the Today design pass)

- **No uppercase labels and no dot separators** anywhere in the member app. Cards have sentence-case titles; a small date or context line goes above a page title; commas or separate lines replace “·”. A test checks computed text-transform and the text of every member screen.
- **The gym, not Ember:** the header, loading and error states show the gym’s logo (or its initials in a warm tile when there is none) and name, from `src/app/gymCache.ts`, written at sign-in and refreshed from the gym record, keyed by gym. `Tenant.logoUrl` is optional; the owner uploads one with Settings and logo in M4.
- **Warm surface for the thing to do, white for the rest;** coloured faces (mint, lilac) get rounded corners locally, and the lilac face uses dark text.
- **Celebrations** go through `celebrate()` in `src/design/celebrate.ts`: a buzz for every kind, and a lazy-loaded confetti burst (under 1 s, Ember, mint and lilac) for records and new badges only. Never where money or access is handled.
- **Space at the bottom:** member and trainer screens leave about 76 px between the last content and the raised button; a test at 390 px requires at least 40 px.

### Seeded training history (seed versions 5 to 7)

Plan loads rise in steps: each main lift holds a load for 2, 3 or 4 weeks (different for each lift), then goes up one step (2.5 kg on the bench press, about 6% elsewhere). The first session at a new load is a personal record, so a lift sets one every 2 to 4 weeks, not every session. About one completed session in ten is a lighter day (main loads a tenth lower, lower effort, “Light day, slept badly.”) and never sets a record; partial and skipped sessions stay as before. Arjun’s trainer benchmark tests for the bench press are 40 kg at the start and 47.5 kg a month ago, in line with his logged loads. A test checks the cadence and that Arjun’s latest record is within two weeks. The 10, 10, 8 against 3 × 10 case is a test of the submit flow and does not depend on the seeded loads. `writeSeed` uses the shared clock, so tests that fix the date get the same gym every day.

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
  - Seed (M0, extended in M1 with the sample members’ training, billing and activity, and in M2 with the trainers’ rosters): Pulse Fitness, 3 branches, 14 logins (6 trainers), plan catalogue, 150 members in every membership state, trainer assignments (incl. transfers), consents, PT credits. Invoices, bookings, workouts, check-ins and exercises are seeded in the milestone that first shows them.
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
  - Design pass (after step 7): a small date line above the greeting (the greeting is the page heading); sentence-case card titles. The workout card is an Ember-tinted surface (ember-50 to ember-100) with the first three exercise names and “+N more”. The week card has a strip of seven day circles, Monday to Sunday, as small clay circles: done is Ember with a tick, partial half filled, planned outlined, missed or skipped faint outlines, rest faint, frozen pale blue with a snowflake; today is larger and pulses gently (no pulse with reduced motion). Tapping a day opens it in Program (`/m/program?date=…`), with its preview if it has a workout. The streak says “12-week streak”, “5-week streak, paused”, or with none yet “Finish your first week to start a streak” (no zero, no grey flame).
  - Actions instead of links: an open invoice shows “Pay ₹2,950” (opens `/m/membership?pay=<invoice>`, built with the Membership step); a membership ending within 7 days, with nothing owed, shows an amber card with “Renew” (`/m/membership?renew=1`); a rest day offers “Open check-in pass”, “Log your weight” (`/m/progress?log=weight`) and “Book a session”.
- [x] Program path (step 5)
  - The plan as weeks of days, one week at a time with Previous and Next week and “Back to this week”. Workout days are markers on a path (done, partly done, skipped, not logged, today, coming up; skipped and not logged are neutral grey, never red); rest days are quiet markers. Past weeks show the version of the plan that governed them (T06), and “Earlier plans” lists older versions with their dates.
  - Tapping a workout opens a preview (`PreviewSheet`): the prescription, how to do each exercise, alternatives, and for a day already logged what was done next to the target. It offers Start or Continue only for today’s workout; for other days it says why not.
- [x] Workout session with logging, drafts, substitutions, rest timer, idempotent submit (step 6)
  - One exercise at a time with Back and Next; the tab bar steps aside and the session has its own bar. Each set opens pre-filled with its target, so a set done as prescribed is one tap on “Log set”; reps, load, time and distance have − and + buttons and can be typed. “Skip set” is neutral grey and can be undone or logged after all; “Change” edits a logged set.
  - “Swap exercise” lists the library’s alternatives and keeps the original in view (“Instead of …”). A rest timer starts after a set when the trainer set a rest, counts down from an end time (so it stays right when the phone sleeps), and has +15 s and Skip rest.
  - Sets are saved as a draft half a second after each change, in order, and when the person leaves or the page is hidden. “Finish” (any time) or “Finish workout” (last exercise) opens a sheet with the result in words, effort 1 to 10 and a note; submitting again after a failure uses the same key.
  - Finishing sends the member to Today with a short confirmation. The celebration, volume and personal records come with the next step.
- [x] Workout complete celebration and badges (step 7)
  - Finishing opens `/m/workout/:date/complete`. The parts appear in order: the result, the volume counting up, each personal record one by one, the week ring and streak, then each badge. The whole sequence is under 4 seconds (`planStages` shares 3.8 s by weight, at least 0.35 s a part; beyond three records or two badges the rest go straight into the final list). A tap anywhere moves to the next part, “Skip” goes to the end. With reduced motion, or when the summary is opened later from Today (“See summary”), everything is shown at once and nothing replays. No confetti: parts pop in, buzz on Android for a record or badge, and the ring fills.
  - A partly done workout is celebrated by its sets (“8 of 9 sets done”) with “Every session counts.” A skipped day gets a calm note and no sequence. Nothing is red or says failed.
  - After the sequence: “How did it feel?” (effort 1 to 10, recovery in five words), both optional, each tap saves on its own and a second tap clears it (P04). Effort moved here from the finish sheet, which now only has an optional note.
  - Share uses the Web Share API with a plain line such as “Upper body and core done: 6,420 kg moved, new dumbbell bench press PR 25 kg” (or “… : 8 of 9 sets done, …” when partly done). No name or link. The button is left out where `navigator.share` doesn’t exist.
  - Badges are awarded once, inside the submit transaction, so a repeated submit awards nothing new. Records are worked out from the logs (not stored): the heaviest load ever for that exercise, the first time an exercise is logged being a baseline.
- [x] Progress charts, PRs, goals (step 8)
  - **Layout:** a Progress and Reviews tab row, one date range row (4 weeks, 12 weeks, 6 months, all time) that scopes everything, then **Key stats** (weight, workouts completed, visits, personal records), then the charts linked to the member’s active goals in the order of the goals (a weight goal puts Weight first; a strength goal puts Strength first, opened on that exercise; waist or body fat opens Measurements; sessions a week opens Attendance), then Workout completion, then a collapsed **More charts** with the rest (open or closed is remembered per member on the device, `ember.progress.moreCharts.<user id>`), then Personal records, Goals and Progress photos. With no active goal, every chart except completion is under More charts. “Log your weight or a measurement” sits under the range row; `?log=weight` opens it (the rest-day button on Today).
  - **Charts** are hand-written SVG in `src/design/charts` (no chart library): 2 px lines, round markers of 9 px with a 2 px surface ring, bars up to 24 px with a 4 px rounded top, hairline grid, a 2 px gap between stacked parts, a legend for the two or more series in completion. Ember for one series; completed is Ember and partly done lilac (checked with the palette validator: ΔE above 31); skipped and not logged are neutral greys. Each chart answers a tap, a pointer or the arrow keys with a readout line, has a table view with the same numbers, and names itself in words. Bar charts show the latest 52 weeks.
  - **Baseline, latest and change** are the first and last readings in the range and their difference. A missing reading is a gap, never zero: a line breaks where readings are more than three weeks apart (six for measurements, four for strength); a week with no workout, no freeze-free week before joining, or a freeze week is blank. An empty range says so and what to do. Weeks with no check-in are a real zero; weeks of a freeze and before the first membership are gaps.
  - **Strength** is the best set (heaviest, then most reps) in each finished workout for one exercise, plus the trainer’s benchmark tests. **Weekly volume** is load times completed reps (P02), for all exercises or one. **Completion** is P03: completed against scheduled workouts whose dates have passed, with partly done, skipped and not logged counted apart and adding up to the scheduled number.
  - **Personal records** are a shelf with one tile for each exercise (its current record, newest first, with how many records it has had); each opens that exercise’s records and its best-set chart. **Goals** show a bar (towards the target in whichever direction it goes), the target date and days left, and the status in words (Active, Achieved, Revised, Closed). **One rule for every kind of goal** (weight, measurement, strength, sessions): when a reading or a workout first reaches an active goal’s target, a “Target reached” note goes into the goal’s history, the member sees “Target reached” and `celebrate("goal")` throws confetti (on Progress for a logged reading; as a part of the workout celebration for a workout), and the goal stays **Active**. Only the trainer confirms **Achieved**, in a review (M2), and the Goal achieved badge is awarded then. Members have no permission to change a goal. A target is recorded once; later readings past it don’t celebrate again.
  - **Logging** (P01): weight, waist, chest, hips, arm, thigh, body fat (with an optional method), with the last value filled in and a date up to a year back. It is stored as entered by the member (`source: member`, `recordedBy` the member), the same value for the same day saves once, and a different value for that day is a correction that keeps the first row and leaves it out of the charts. The trainer’s name or “You” shows beside each reading.
  - **Photos** (P01, S04): only with the photo consent. Without it the card explains why (only you and your trainer, never the front desk or finance) and links to `/m/me#consent`. With it, a photo is shrunk to 1,000 px JPEG in the browser and stored in IndexedDB (`measurements`, kind `progress_photo`); every view goes through `viewSensitive` (a member’s own views are not audited) and the member can remove a photo. When consent is withdrawn, photos stay stored but are not shown.
  - **Reviews and check-ins** (P04, T06): shared reviews newest first with a “New” tag for the ones that were new when the screen opened (opening marks them read, which clears the card on Today), the follow-up date, and never a private note. The check-in form takes effort 1 to 10, recovery in five words and what got in the way; any one answer is enough, and a retry sends once (one key per form).
- [x] Bookings with credits and policy (step 9)
  - **Trainer choice (`GymPolicies.membersMayChooseTrainer`, off by default):** off, the sheet lists only the member’s assigned trainer, and the API refuses another trainer’s slots, bookings and moves (a session already with another trainer can still be moved with that trainer). On, the assigned trainer is first and the others follow. A member with no assigned trainer is told to ask the front desk.
  - **Booking in three steps** (a sheet): a trainer (the member’s own trainer first, tagged “Your trainer”, with their next free slot), a day (chips with the number of free slots), then a slot. Trainers are those with availability at the member’s home branch. The last step shows the cost (“Costs 1 session credit. You have 5 sessions left, and 4 after this booking.”), the **exact** free-cancellation time (“Free cancellation until 6:00 am Wed 18 Nov”, always with its date, never “tomorrow”) and the late and no-show terms in words. If the slot is already inside the cancellation window it says “Free cancellation ended …”.
  - **Slots** (`domain/slots.ts`): inside the trainer’s availability window and the branch’s opening hours, on the session grid from the start of the window, wholly inside the window, after now and within the booking horizon (14 days), and taken when they overlap a booking the trainer has.
  - **Credits (M06):** booking reserves one credit (a `reservation` ledger entry). Cancelling in time writes a `release`. A late cancellation writes a `consumption` when the policy says so (and a `release` when the gym doesn’t charge). A no-show consumes it by policy (`noShowSettlement`; marking a no-show is the trainer’s and the desk’s, in M2 and M3). The cancel sheet shows what cancelling does right now, in plain words, before the member confirms, and sends that outcome with the request: if the free time passes while the member decides, nothing happens and the new terms are shown.
  - **Rescheduling** moves the booking (and can change trainer). The one reserved credit stays with it: nothing is reserved or released, so the member never holds two. It is free only while cancelling is free; after that the card says moving was free until that time and offers only Cancel.
  - **Two tabs, one slot (A03):** each booking, cancellation and move runs in one database transaction that re-checks the slot, and `bookings.slotKey` is a unique index (a cancelled booking drops its key, which frees the slot). One request wins. The other gets “That slot was just taken.” with the next four free slots, nothing is held, the credit balance is unchanged, and the sheet goes back to choosing. A repeated request with the same key returns the same booking.
  - **Email delivery log (O04):** a confirmation, cancellation or move writes an `emailLog` entry (template, to, subject, body, sent or skipped with the reason). Nothing is really sent in demo mode. The owner console shows the log in M4.
  - **Lists:** Upcoming and Past tabs with counts. Past shows Attended (filled mint), Cancelled and No-show (neutral grey, never red) with plain notes on what happened to the credit; a booking whose time has passed with no mark says “Time passed”.
  - **No credits:** says why, how credits work, and offers “Buy more sessions” (`/m/membership?buy=sessions`, built with the Membership step); no Book button. A frozen or inactive membership says why booking is closed.
- [x] Membership, renew, invoices and receipts (step 10)
  - **Screen** (`/m/membership`): plan, status (filled pill), validity with days left, visits left on a visit pass (with a bar), freeze dates and reason, the next membership when a renewal is already paid for, and “What your plan includes”, the snapshot of the agreed terms (M01: unlimited or visits, branches, training sessions, classes, and the agreed price, which later catalogue changes never touch). An open invoice shows “Pay ₹2,950” first. Links: `?pay=<invoice id>`, `?renew=1`, `?buy=sessions` open the checkout sheet.
  - **One checkout sheet** for the three ways to pay. Renew lists the plans on sale at the member’s branch (never the free trial), the current one first, a dearer one tagged Upgrade, and shows the **new period and the price with GST before anything is paid**. A renewal starts the day after the current membership ends (no paid days lost), or today when it has ended. An upgrade is a renewal onto a dearer plan, effective when the current period ends; mid-period change with proration is the desk’s in M3. Buy more sessions sells packs of 4, 8 and 12 at ₹800 plus GST each (`SESSION_PRICE_PAISE`, to be set by the owner in M4), good for 150 days. Pay then shows the summary and the gateway form.
  - **Simulated gateway** (`api/membership.ts`): UPI, card or net banking, with checks that say how to fix a field (“Enter a valid UPI ID, like name@okbank.”); nothing typed is sent or stored, only the method. Success is the default; **Demo controls** (demo mode only) has “Make payments fail”. Pay makes a gateway event (`payment.succeeded` or `payment.failed`, with its own id) and applies it **once**, in one transaction: the event id is stored (`gatewayEvents`), the payment is keyed by its event, and one invoice buys at most one membership (`Membership.invoiceId`) and one batch of credits (ledger key). Paying an invoice that has a purpose (`Invoice.purpose`: renewal or sessions) renews or adds credits; a first invoice for a pending membership starts it. A failed payment is recorded with what happened, leaves the invoice open and activates nothing. A repeat of one attempt (same key, after a dropped connection) returns the same result and charges once; after a decline the next try has a new key.
  - **Duplicate event demo (M04):** the demo panel shows the last event with three counters (times sent, payments made, renewals made) and “Send this event again”. Replaying it, even five copies at once, leaves one payment and one renewal; the counters show the event arriving again while the others stay at 1. Tested in unit tests (sequential and concurrent) and in the browser.
  - **Auto-renew (M04), opt-in:** an explanation before anything is asked: the charge is on the last day of the membership, for the plan’s price at that time plus GST, starting the next period; an email goes three days before; turning it off before the charge day means nothing is charged. The member picks UPI AutoPay or card. Writes an audit event each way (`membership.autorenew`). The charge itself is not run in demo mode.
  - **Invoices and payments:** invoices newest first with outlined status pills (Due, Paid, Overdue, Partly paid; membership status stays filled, M02), each opening its receipt; payments list every attempt, a failed one in amber with its reason, never red.
  - **Tax receipt** (`/m/membership/invoices/:invoiceId`): the gym’s registered name, address and GSTIN, invoice number and date, place of supply with state, SAC 999723, items with taxable value, CGST and SGST (IGST when the place of supply is another state), total, amount in words (lakh and crore), payments with receipt numbers, and the balance. **Save as PDF** opens the browser’s print window (PDF is a destination there; no library); printed, the shell and buttons are hidden. Someone else’s invoice reads as not found.
  - **Renewal success** uses `celebrate("result")` (a buzz on Android) and a short confirmation stamp (“Renewed”, “Sessions added”, “Paid”); no confetti, as money is involved. The stamp lands with a thud, and sits still with reduced motion.
  - **Records added:** `Invoice.purpose`, `Membership.invoiceId` and `autoRenewMethod`, `Payment.failureReason` and a `netbanking` method, `GatewayEvent`, `DataRequest` (for Me), `MemberSettings.email.inactivityPrompts`, email templates for receipts and renewals, audit actions for auto-renew, consent and data requests, permissions `payment.pay` and `membership.autorenew` (members only). Seed version 6 (Priya’s open invoice is a renewal of Monthly).
  - **Today:** a renewal already paid for hides the “Renew” reminder and says when the next period starts.
  - **A checkout that was never paid is a cart, not a bill** (`isUnpaidCart`): an invoice the member started and has not tried to pay isn’t owed, isn’t listed and doesn’t appear as dues on Today or Membership, and asking for the same thing again reuses it. Once a payment has been tried, even a declined one, it is a real open invoice that can be paid again. Choosing another plan replaces an earlier unpaid renewal; paying one voids the other plans’ carts.
- [x] Check-in pass (step 11)
  - **Pass** (`/m/pass`): the member’s QR code, drawn as one SVG from `qrcode` 1.5.4 (exact pin, listed in section 5; `@types/qrcode` 1.5.6 for types), black on white with the quiet border, at least 200 px and square. The value is the member’s `qrToken`. Under it the name, gym and branch, a member ID, and a status panel: “Ready to scan”, or “This pass won’t open the door right now” with the reason and what to do (frozen until a date, ended on a date, no visits left, plan doesn’t cover the branch), with a link to Membership. A payment due doesn’t stop entry and the pass says so.
  - **Brightness hint:** a browser can’t change brightness, so the card says to raise it before scanning. It also keeps the screen awake with the Screen Wake Lock API while the pass is open (a switch, on by default; asked for again when the page returns; nothing happens where it isn’t supported).
  - **Rules** are in `domain/checkin.ts` and are shared with the desk in M3 (`checkInDecision`, `SCAN_WINDOW_MINUTES` = 10): allowed when the membership is active and in date, covers the branch and, for a visit pass, has a visit left; denied with a reason otherwise; a grace period lets the member in; open dues give `allowed_with_dues`; a second scan at the same branch within 10 minutes of an allowed one is `repeat_scan`: recorded, lets the member through, uses no extra visit. Visit passes lose one visit per allowed scan, inside the same transaction as the check-in, so five scans at once use one.
  - **The pass notices a scan:** the screen reads again every four seconds; a check-in newer than when the screen opened turns the code into “Checked in at Andheri” with the time (and a buzz); a repeat says “You’re already checked in”; a denied scan says why. **Demo controls** has “Scan my pass at the door”.
  - **Recent check-ins:** the last eight, newest first, with the branch and a plain outcome (“Checked in, one visit used”, “Scanned again, no extra visit used”, or the reason it was denied). Empty state says what to do.
- [x] Me: consent, preferences, data requests (step 12)
  - **Details:** name, mobile, email, home branch, trainer and member since, read only (“To change your details, ask the front desk”).
  - **Consent** (S04, anchor `#consent`, which Progress links to and which is scrolled to): photos, assessments and marketing are switches; data processing is shown as required. Each says what it allows and who can see it, and what turning it off does, with “Agreed on …”, “Withdrawn on …” or “Not agreed”. Withdrawing keeps the record and stamps `withdrawnAt`; agreeing again adds a new record against the current notice (`NOTICE_VERSION`); each change is audited (`consent.change`); repeating the same choice changes nothing. Withdrawing photo consent hides photos in Progress at once. **For M2:** the trainer app must refuse to record or open an assessment without the assessment consent, as the screen promises.
  - **Messages** (O04, email only): booking confirmations and reminders, workout updates, renewal and payment reminders, a nudge after a quiet spell; each saves on its own. Receipts and payment confirmations always go, as they are records; offers and news are the marketing consent. **On this phone:** a vibration switch, saved to the member’s settings and to the device (`ember.haptics`), which `haptic()` reads.
  - **Your data** (S04): “Ask for a copy” and “Ask for deletion”, each with a short sheet that explains what happens before anything is sent (deletion: the gym answers under its retention policy, invoices and tax receipts are kept for the time the law requires, and the membership can’t be used once data is deleted). One request per kind stays open at a time; asking again, or sending the same key twice, returns it. Writes an audit event and a confirmation email to the delivery log, and the list shows each request’s status. The owner console fulfils them in M4 (`data.export.fulfil`).
- [x] M1 acceptance (step 13)
  - `e2e/m1-acceptance.spec.ts` follows one member from phone and code login through a workout logged 10, 10, 8 against 3 × 10 (completed, and Progress’s completed count goes up by one), a booking, a renewal through the gateway with its stamp and receipt, the pass and a scan, and a consent change. It runs at 390 px and 1440 px, fails on any console error and on sideways scroll.
  - Results: 501 unit tests, 528 browser tests (498 passed, 28 skipped that only run for screenshots, the 2 failures were fixed and re-run), 8 PWA tests, build clean, `/m` 158.0 KB gzipped of 170 KB, no app code on marketing routes.
  - **Review pack:** `npm run m1:shots` writes 43 screens at 390 px to `docs/checkpoints/m1-final/screens/` (motion reduced so each is in its finished state) and three contact sheets, `contact-sheet-1.png` to `contact-sheet-3.png`, each a grid with a caption under every picture (`scripts/contact-sheets.mjs`, captions in `e2e/m1-shots.json`).
- **Done when:** a member can complete a workout logging 10, 10, 8 reps against 3×10 and see it in progress (P03 acceptance check).

### M1.5 · Responsive pass (all areas)
- [x] Shared pieces: breakpoints, `NavRail`, `NavSidebar`, `Sheet`, `ListDetail`, `ResponsiveTable`, `StickyActions`, `Tooltip`, `useShortcut`
- [x] Rules recorded in `CLAUDE.md` (Responsive rules) and in the patterns section above
- [x] Member screens converted: Today, Program, Workout session, Progress and Reviews, Bookings, Membership and Receipt, Check-in pass, Me, Workout complete
- [x] `e2e/responsive.spec.ts`: navigation by width (member, trainer, front desk, owner, branch manager and platform admin shells at 360, 390, 768, 1024 and 1440 px), content width, touch targets, sheet switching
- [x] `e2e/desktop-flows.spec.ts`: the M1 journeys driven through the rail or sidebar and side panels at 1440 px and 768 px (workout logged 10, 10, 8 and seen in Progress; book and cancel a session; pay an invoice; renew)
- [ ] Contact sheets at 390, 768 and 1440 px reviewed
- **Done when:** every member screen follows the rules at 360, 390, 768, 1024 and 1440 px and the full suites pass.

### M2 · Trainer app (R04)
Every trainer screen is responsive from the start: single column on phones, list and detail from 768 px, three zones at 1440 px (see Responsive patterns).
- [x] Foundations (step 1): trainer rosters in the seed, the rules behind Today, the trainer API, the `ThreeZone` layout, trainer e2e coverage
- [x] Today dashboard (T07)
  - **Seed v8** (`demo/seedTrainer.ts`): every member who has a trainer and an active membership gets a place in that trainer’s book. 25% are `strong` (a plan, nearly every workout done, a recent review), 25% `steady`, 30% `slipping` (fine until the last nine days, an overdue review) and 20% `awaiting` (no plan). Their logs are coach-led (the trainer entered them, T05) because they have no login. Meera has four sessions today (one done), every other trainer two, each holding a credit; about one client in six holds a pack of credits that ends within two weeks.
  - **Rules** (`domain/trainerToday.ts`, tested): a review is due four weeks after the newest shared review, or on its follow-up date when it has one, or four weeks after the plan began when there has been none; private notes and the member’s check-ins are not reviews. A client has “missed” workouts when two or more scheduled days in the last seven days (not today) have nothing logged; skipped workouts and frozen days don’t count. Credits are “expiring” when unused ones sit in a pack that ends within 14 days. “Waiting for a plan” is an active client with no published plan. Frozen clients are only ever listed for expiring credits.
  - **API** (`api/trainer.ts`, loaded on demand): `getTrainerToday` returns only the caller’s own clients (their open assignment), for trainers only.
  - **Screen** (`features/trainer/Today.tsx`): phone, one column with the five lists stacked (three clients each and “Show all”); from 768 px the five lists are a menu on the left and the chosen list is beside it (`?show=`); from 1280 px a third zone shows the selected client at a glance (`?client=`), the next session’s client by default. Below 1280 px a row opens the client’s page instead, so the third zone never holds the only way to do anything.
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

**Decisions (raised during M0; the M2 ones were confirmed after M1.5)**

| Question | Default in use / decision |
|---|---|
| Finance staff work in `/desk` but cannot check members in. Where do they land? | On Invoices and payments. |
| Platform administrators see no gym records, not even in support mode yet. | Support access (M5) adds a time-limited, reasoned, audited grant. |
| GST place of supply and rates | Branch state for in-gym services (CGST + SGST), 18%, SAC 999723. GST rules to be confirmed by the gym’s accountant before launch. |
| Lighthouse (performance 90, accessibility 100) | Not yet measured. Planned for M6. Bundle budget for `/m` is met: 150 KB of 170 KB after step 6. The workout API (which uses Zod) is loaded on demand with the program and workout screens, so it stays out of every area’s first download. |
| Retention of member records, including assessments withdrawn by consent | Kept, hidden from all staff, until the retention period ends or the member asks for deletion. Retention policy to be confirmed with the gym’s accountant and legal adviser (GST record-keeping, Digital Personal Data Protection Act 2023). |
| Trainer leave and existing bookings (M2) | Leave blocks new bookings. Bookings that clash show as conflicts for the trainer and the front desk. Either can reschedule or move the session to another trainer; the member gets an email and the credit is not affected. **Confirmed.** |
| Private notes after a trainer transfer (M2) | They stay with their author. A new trainer never sees a previous trainer’s private notes. **Confirmed.** |
| Assessment consent withdrawn (M2) | New assessments are blocked and existing ones are hidden from all staff, trainer included, who see “Assessment consent withdrawn”. Records are kept until the retention period ends or the member asks for deletion. **Confirmed.** |
