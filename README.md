# Ember: marketing site and trial signup (Phase 0)

React 18 + TypeScript + Tailwind CSS 3 + Vite 5, with Framer Motion for scroll-linked animation. Fonts (Outfit, Big Shoulders Display) are self-hosted through Fontsource.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks, then builds to dist/
npm run preview    # serve the production build at http://localhost:4173
npm run test       # unit tests (domain rules, seed, API)
npm run e2e        # browser tests (marketing regression, login, guards, shells)
npm run e2e:pwa    # service worker tests against a production build
npm run bundle-report  # after build: JS downloaded per route
```

Requires Node.js 18.18 or newer.

## Deploy to Vercel

The project is ready for Vercel as it is: `vercel.json` sets the Vite build, the `dist` output folder, and a rewrite so links like `/signup` and `/login` work when opened directly or refreshed.

**Option A: from GitHub (recommended, redeploys on every push)**

1. Create a new repository on GitHub and push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "Ember website demo"
   git branch -M main
   git remote add origin https://github.com/<your-account>/ember-web.git
   git push -u origin main
   ```
2. In Vercel, choose **Add New → Project**, then import the repository.
3. Vercel detects **Vite** automatically. Leave the defaults (build command `npm run build`, output directory `dist`) and press **Deploy**.
4. Share the `https://<project>.vercel.app` link.

**Option B: from your computer with the Vercel CLI**

```bash
npm install -g vercel
vercel          # first run: log in and answer the setup questions (accept the defaults)
vercel --prod   # publish to the production URL
```

No environment variables are needed for this demo.

## Demo walkthrough for reviewers

1. **Home page hero:** the member journey plays on its own. Click any step (Join, Pay, Check in, Train, Progress, Renew) to jump to it.
2. **What each person at your gym gets:** scroll slowly; the screen changes between Owner, Front desk, Trainer and Member.
3. **Try the check-in desk:** search “Priya” and check her in, then press **Scan again** (no extra visit is used). Try “Rahul” (frozen) and use **Override with reason**.
4. **Pricing:** drag the members slider and switch between monthly and yearly.
5. **Start free trial:** complete the three steps (any details work; an email ending `@taken.test` shows the error message). It ends on the “Your gym is ready” checklist.
6. **Log in** (top right): any email and password continue to a page describing the app screens that come next.

## Routes

| Path      | What it is |
|-----------|------------|
| `/`       | Home page: member-journey hero, role tour, check-in demo, what’s included, progress, customer quotes, pricing, FAQ |
| `/signup` | 3-step free-trial signup with validation, ending on the "Set up your gym" checklist. `?plan=starter\|growth\|pro` preselects the member range |
| `/login`  | Demo login: email + any password, or (members) phone + any 6-digit code, or one tap under “Try the demo as”. The email or phone must belong to someone in the sample gym (`src/app/demoAccounts.ts`) |
| `/app`    | Sends you to your own home, or to log in |
| `/m` `/t` `/desk` `/owner` `/admin` | The role-based app (member, trainer, front desk and finance, owner and branch manager, platform admin). Runs on a sample gym, “Pulse Fitness”, stored in your browser. Built milestone by milestone, see `docs/PLAN.md` |
| `/dev/design` | Design gallery, development only |
| `/privacy`, `/terms`, `/refunds` | Placeholders until the real policies are written |

## Where to change things

- **Product name, domain, support email, trial length:** `src/config/brand.ts`
- **All marketing copy, pricing, FAQs, customer stories:** `src/data/content.ts`
- **Colour scales and type:** `tailwind.config.ts` (static scales) and `src/styles/index.css` (light/dark semantic tokens)
- **Trial signup API:** `src/lib/api.ts`. Replace the mock `createTrialAccount` with your backend call. Use an email ending `@taken.test` to see the error state.

## Before launch

- Customer names, quotes, results and gym wordmarks in `content.ts` are **placeholders**. Replace them with real, approved ones.
- The hero's social proof (“4.9 from gym owners”, “Trusted by 120+ gyms”) in `src/pages/home/sections/Hero.tsx` is a **placeholder**. Use only figures you can back up.
- Prices are placeholders (INR, excluding GST).
- `/privacy`, `/terms` and `/refunds` links need real pages.
- Product screens are built in code, so they stay sharp and are easy to update as the real app takes shape.

## Design rules

- **One warm, light look.** Cream canvas, soft peach, lavender and mint light, Ember orange as the accent, deep plum-ink text. No dark sections.
- **Clay surfaces** (`.clay`, `.clay-flat`, `.clay-well` in `src/styles/index.css`) have a top highlight, a bottom inner shade and a soft long shadow. Coloured clay (`.clay-ember`, `.clay-lilac`, `.clay-mint`) is for emphasis.
- **The ember button (`variant="primary"`) is for the free-trial call to action.**
- **Plain words.** Section headings say what the section is ("Pricing", "What’s included"), not slogans. Copy uses short, everyday sentences.
- **Motion only where it does a job:** the hero journey, the role tour and the check-in demo. Section headings don’t animate.
- Membership status uses **filled** pills; invoice status uses **outlined** pills (spec M02). Skipped workouts are never red.
- Outfit for headings and interface text; Big Shoulders Display only for numbers.

## Motion and effects

| Effect | Where | Notes |
|---|---|---|
| Member journey plays through six steps | Hero | Countdown ring on the active step; pauses on hover; pause button; click any step |
| Highlighter slides to the headline line for the current stage | Hero | |
| Product card tilts toward the pointer; confirmation toast per step | Hero | |
| Arjun’s day counter and 90-day progress bar | Hero card | |
| Gym equipment drops in, floats and follows the pointer | Hero | `src/components/gym/Equipment.tsx` |
| Pinned role tour | `#tour` | Desktop only; stacked on phones |
| Working check-in desk | `#demo` | Real rules: eligibility, one visit per window, overrides need a reason |
| Self-drawing progress chart, parallax phones | Progress | |
| Member slider and rolling prices | Pricing | |

All motion stops for visitors who set **reduce motion** in their operating system.

## Structure

```
src/
  config/brand.ts            product identity
  data/content.ts            copy, pricing, demo members, mock data
  lib/                       formatting (₹, en-IN), API boundary
  hooks/                     reduced motion, media query, count-up, spotlight
  components/gym/            Dumbbell, kettlebell, plate and stopwatch illustrations
  components/screens/        clay product screens built in code (owner, desk, trainer, member, chart)
  components/ui/             Button, Logo, Container, StatusPill
  pages/home/sections/       one file per home page section
  pages/signup/              trial signup
```
# Gym-UI---demo
