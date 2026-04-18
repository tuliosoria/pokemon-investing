# Pokémon Card Investing — TODO / Next Steps

## What Has Been Implemented (Phase 1 MVP — Local)

### ✅ Project Setup
- Next.js 16 App Router + TypeScript
- Tailwind CSS v4 with dark theme
- React Hook Form + Zod validation
- Custom UI components (Card, Tabs, Button, Input)
- Project structure per spec

### ✅ Landing Page (`/`)
- Hero section with clear value proposition: "Should you grade that card?"
- Feature bullets for all three calculators
- CTA to calculator page
- Responsive layout with dark theme

### ✅ Calculator Workspace (`/calculator`)
- **Grading EV Tab** — Probability-weighted expected value across PSA 10/9/8/below grades
  - Inputs: raw card value, grading cost, graded values, grade probabilities, fees, shipping, insurance
  - Outputs: expected profit, expected value, break-even PSA 10 %, scenario breakdown table
  - Recommendation band: Strong Yes / Yes / Marginal / No / Strong No
- **Flip ROI Tab** — Buy and resell net profit calculator
  - Inputs: buy price, sell price, marketplace fee %, payment fee %, shipping, packing, tax
  - Outputs: net profit, ROI %, gross profit, net margin, total fees, total costs
- **Sealed ROI Tab** — Hold period return projection
  - Inputs: acquisition price, current market price, annual growth %, hold months, exit costs
  - Outputs: net exit value, annualized return %, total ROI, projected value, holding costs

### ✅ Domain Logic (`lib/domain/`)
- `grading.ts` — `calculateGradeExpectedValue()` — deterministic, pure function
- `flip.ts` — `calculateFlipNetProfit()` — deterministic, pure function
- `sealed.ts` — `calculateSealedRoi()` — deterministic, pure function with CAGR
- `fees.ts` — Fee profiles (eBay, TCGPlayer, Mercari, Private) + recommendation band config

### ✅ API Route Handlers
- `POST /api/calc/grade-ev` — Validates input with Zod, returns grade EV calculation
- `POST /api/calc/flip` — Validates input with Zod, returns flip ROI calculation
- `POST /api/calc/sealed` — Validates input with Zod, returns sealed ROI calculation
- `GET /api/health` — Health check endpoint

### ✅ Validation Schemas (`lib/schemas/`)
- Zod schemas for all three calculators with proper constraints

---

## What Needs To Be Done Next

### Phase 2 — Account & Persistence

#### Supabase Setup
- [ ] Create Supabase project
- [ ] Configure environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Install `@supabase/supabase-js` and `@supabase/ssr`
- [ ] Create database client (`lib/db/client.ts`)
- [ ] Run migrations to create tables:
  - `users` — Supabase Auth managed
  - `profiles` — display name, avatar, fee_profile_id
  - `fee_profiles` — saved marketplace fee presets
  - `cards` — user card collection
  - `card_price_snapshots` — historical price data
  - `grading_scenarios` — saved grading calculations
  - `flip_scenarios` — saved flip calculations
  - `sealed_scenarios` — saved sealed calculations
  - `saved_calculations` — polymorphic saved calc reference
  - `portfolios` — user portfolios
  - `portfolio_items` — items in portfolios
  - `alert_rules` — price/condition alerts
  - `alert_events` — triggered alert history
  - `agent_runs` — AI agent execution log

#### Authentication
- [ ] Implement Supabase Auth (email/password + Google OAuth)
- [ ] Create auth middleware for protected routes
- [ ] Add sign-in/sign-up pages
- [ ] Gate save/portfolio features behind auth (calculator stays free)

#### Save & Load
- [ ] `POST /api/scenarios/save` — Save a calculation scenario
- [ ] `GET /api/scenarios` — List saved scenarios
- [ ] Scenario comparison view — side-by-side calculator results
- [ ] Share link generation (optional)

#### Portfolio
- [ ] Portfolio creation and management UI
- [ ] `POST /api/portfolio/import` — Import holdings from CSV or manual entry
- [ ] Portfolio dashboard with aggregate metrics
- [ ] Portfolio value tracking over time

### Phase 3 — Market Data Integrations

#### Data Providers
- [ ] Research and select a card market data provider with permissive API ToS
- [ ] Build provider adapter pattern (`lib/integrations/market-data/provider-adapter.ts`)
- [ ] Implement price snapshot caching and refresh
- [ ] Auto-fill card values in calculator from market data
- [ ] **Important**: Do NOT build around scraping. Product must work with manual entry first.

#### Alerts
- [ ] `POST /api/alerts` — Create alert rule (price threshold, ROI change, etc.)
- [ ] `GET /api/alerts` — List alert rules
- [ ] Alert evaluation logic (background job)
- [ ] Push/email notifications when alert fires

### Phase 4 — AI Agents & Premium

#### OpenAI Integration
- [ ] Install OpenAI SDK
- [ ] Configure `OPENAI_API_KEY` environment variable
- [ ] Implement Responses API with function calling pattern
- [ ] **Agent A — Decision Explainer** (`POST /api/agent/explain`)
  - Takes calculator output + card context
  - Calls deterministic tools (calculate_grade_ev, normalize_fee_profile, build_recommendation_band)
  - Returns natural-language recommendation with rationale
- [ ] **Agent B — Scenario Comparator** (`POST /api/agent/compare`)
  - Compares multiple saved scenarios
  - Returns ranked recommendation with sensitivity notes
- [ ] **Agent C — Portfolio Summarizer**
  - Weekly email summaries of portfolio changes
  - Dashboard narrative text
- [ ] **Agent D — Alert Writer**
  - Converts alert triggers into user-facing messages

#### AI Guardrails
- [ ] Never invent prices or grading probabilities
- [ ] Distinguish deterministic outputs vs. AI explanation
- [ ] Log all agent runs to `agent_runs` table

#### Email Service (Resend)
- [ ] Install Resend SDK
- [ ] Configure `RESEND_API_KEY`
- [ ] Sign-up confirmation emails
- [ ] Alert notification emails
- [ ] Weekly portfolio summary emails

#### Billing (Stripe)
- [ ] Install Stripe SDK
- [ ] Configure webhook handler
- [ ] Subscription plan creation
- [ ] Premium feature gating (AI explanations, advanced reports)
- [ ] Trial handling

### Deployment

#### Vercel
- [ ] Connect GitHub repo to Vercel
- [ ] Configure environment variables in Vercel dashboard
- [ ] Set up Vercel Functions (Node.js runtime)
- [ ] Configure custom domain (if applicable)
- [ ] Set up Vercel cron jobs for background tasks:
  - Alert evaluations
  - Weekly email summaries
  - Price snapshot refreshes
  - Stale calculation cleanup

#### CI/CD
- [ ] ESLint configuration
- [ ] TypeScript strict mode enforcement
- [ ] Domain logic unit tests (grading, flip, sealed calculations)
- [ ] API endpoint integration tests
- [ ] Pre-commit hooks

---

## Architecture Principles (from Spec)

1. **Deterministic math first, AI second** — Calculators are pure functions. AI explains results, never computes them.
2. **Manual entry first** — Product must work without external data providers.
3. **All external calls go through adapters** — market data, OpenAI, Resend, Stripe each have a clean adapter layer.
4. **Never change formulas without tests** — Domain logic must be tested.
5. **Calculator logic stays out of UI components** — All math lives in `lib/domain/`.
6. **All new endpoints require Zod schemas** — Type safety at every boundary.

---

## File Structure Reference

```
src/
  app/
    page.tsx                          — Landing page
    layout.tsx                        — Root layout (dark theme)
    globals.css                       — Tailwind + CSS variables
    calculator/page.tsx               — Calculator workspace (3 tabs)
    api/calc/grade-ev/route.ts        — Grading EV API
    api/calc/flip/route.ts            — Flip ROI API
    api/calc/sealed/route.ts          — Sealed ROI API
    api/health/route.ts               — Health check
  components/
    ui/card.tsx                       — Card UI component
    ui/button.tsx                     — Button with variants
    ui/input.tsx                      — Input with label/error/hint
    ui/tabs.tsx                       — Tabs component
    calculator/grading-calculator.tsx — Grading EV form + results
    calculator/flip-calculator.tsx    — Flip ROI form + results
    calculator/sealed-calculator.tsx  — Sealed ROI form + results
    calculator/result-display.tsx     — Shared result display component
  lib/
    domain/grading.ts                 — calculateGradeExpectedValue()
    domain/flip.ts                    — calculateFlipNetProfit()
    domain/sealed.ts                  — calculateSealedRoi()
    domain/fees.ts                    — Fee profiles + recommendation bands
    schemas/grading.ts                — Zod schema for grading input
    schemas/flip.ts                   — Zod schema for flip input
    schemas/sealed.ts                 — Zod schema for sealed input
    utils/index.ts                    — cn(), formatCurrency(), formatPercent()
```
