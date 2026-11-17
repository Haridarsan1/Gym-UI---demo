# Ember · instructions for Claude Code

Ember is gym management software for Indian gyms: one role-based web app for platform admins, gym owners and branch managers, front desk and finance staff, trainers and members. The marketing site (home, signup, login) is finished. We are now building the app.

**Confirmed decisions:** demo mode first (no real backend yet), members log in with phone + OTP or email + password, no mascot, email-only messages.

**Read these first, every session:**
1. `docs/REQUIREMENTS.md`: the product requirements. Requirement IDs (T01, W03, M05, A01…) are the source of truth.
2. `docs/PLAN.md`: what to build, in which order, and the current checklist.

## How to work

- Work on **one milestone at a time**, in the order in `docs/PLAN.md`. Within a milestone, finish one screen end to end (data, UI, states, tests) before starting the next.
- Before writing code for a screen, re-read the requirement IDs listed for it and follow them exactly.
- After each screen: run the checks below, then tick its box in `docs/PLAN.md` (`[ ]` → `[x]`).
- If a requirement is unclear or two requirements conflict, stop and ask instead of guessing. Note open questions under “Decisions to confirm” in `docs/PLAN.md`.
- Do not change the marketing pages unless asked. `e2e/marketing.spec.ts` must keep passing.

## Commands

```bash
npm run dev         # local dev server
npm run build       # typecheck + production build (must pass)
npm run test        # Vitest unit tests (domain rules)
npm run e2e         # Playwright flows (acceptance scenarios, marketing regression)
npm run bundle-report  # after build: gzipped JS per route; fails if app code reaches marketing routes
```

Add the `test` and `e2e` scripts in milestone M0 if they don’t exist yet.

## Architecture rules

- **Screens never touch storage directly.** All data goes through `src/api/` (TanStack Query hooks on top). In demo mode `src/api/` is backed by the Dexie database in `src/demo/`; later it becomes HTTP calls with the same signatures.
- **Business rules live in `src/domain/` as pure TypeScript functions** with unit tests: membership lifecycle (M02), check-in eligibility and scan window (M05), credit ledger (M06), billing, taxes and refunds (M03, M04), metrics (P02, P03), report definitions (O07), permissions (S03).
- **Permissions:** every route, navigation item, button and API call checks `src/domain/permissions.ts`. Deny by default. Members see only their own records; trainers only assigned members; branch managers only their branches; desk staff never see assessments or progress photos.
- **Idempotency:** workout submissions, payments, gateway events and imports carry an idempotency key; repeating them must not create duplicates.
- **Audit:** membership changes, refunds, credit adjustments, permission changes, overrides and support access write an audit event (actor, time, action, reason, record).
- TypeScript strict, no `any`. Small components. Co-locate a feature’s components, hooks and tests in `src/features/<role>/`.
- Ask before adding a dependency that is not listed in `docs/PLAN.md` section 5. Prefer small, tree-shakeable libraries; lazy-load heavy ones (QR scanner, confetti).

## Design rules (keep the existing theme)

- Use the tokens in `tailwind.config.ts` and the clay classes in `src/styles/index.css`. Cream canvas, white clay cards, Ember orange accent, lilac and mint as supporting colours, plum-ink text. Outfit for text, Big Shoulders Display only for numbers.
- **Member and trainer apps:** game-like. Use `Button3D` for primary actions, the program path, the shared `celebrate()` system, streaks and badges, haptics. Celebrate real achievements only (workout done, PR, goal, streak, check-in). No mascot.
- **Desk, finance, owner and admin consoles:** calm and fast. Dense tables, ⌘K, keyboard shortcuts, subtle motion. No confetti, mascots or badges where money or access is handled.
- Status pills: membership filled, invoice outlined, skipped workouts never red.
- Mobile first. Member and trainer apps use a bottom tab bar; staff consoles use a sidebar on desktop and a bottom bar with “More” on phones. Touch targets at least 44 px. No horizontal scroll from 360 px up.
- Every list has a loading skeleton, an empty state that says what to do next, and an error state with a retry.
- Respect `prefers-reduced-motion`: no animation, same information.

## Writing rules

- Plain, specific words. Say what the thing is or does. No slogans, no hype, no exclamation marks in the UI.
- Buttons are verbs that say what happens: “Log set”, “Check in”, “Publish plan”, “Record payment”.
- Errors say what went wrong and how to fix it: “Enter a 10-digit mobile number.”
- Use Indian formats: ₹2,48,600, 17 Nov 2026, 6:30 am, GST.
- Use the curly apostrophe (’) in visible text.

## Definition of done (per screen)

- [ ] Matches the requirement IDs listed for it in `docs/PLAN.md`
- [ ] Works at 390 px and 1440 px, keyboard accessible, reduced-motion safe
- [ ] Loading, empty and error states
- [ ] Permissions enforced in UI and API
- [ ] Unit tests for new domain rules; Playwright test for the main flow
- [ ] `npm run build` passes with no type errors
- [ ] Checkbox ticked in `docs/PLAN.md`

## Performance budgets

Initial JS for `/m` ≤ 170 KB gzipped · LCP ≤ 2 s on mid-range Android over 4G · Lighthouse mobile performance ≥ 90 and accessibility 100. Code-split by role and by heavy feature.
