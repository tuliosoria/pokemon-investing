# PokeFuture — Recreate-From-Scratch Guide

> Read this first. Single source of truth for AI agents tasked with
> rebuilding this site from an empty repository. Every section is
> intentionally self-contained so you can implement phase by phase
> without spelunking through 200 files.

---

## 1. Project Overview

**PokeFuture** is a 5-year value-forecasting and Buy/Hold/Sell decision
engine for **sealed Pokémon TCG products** (Booster Boxes, Elite Trainer
Boxes, Booster Bundles, etc.). It also ships a secondary **grading /
flip / sealed-hold ROI calculator** for individual cards.

Audience: collectors and small investors who want to know whether a
sealed product is likely to appreciate, by how much, and how confident
the model is.

Core experience:

1. Land on `/sealed-forecast` and see a searchable, filterable catalog
   of every English sealed product we cover (~150 products today).
2. Each product card shows a Buy / Hold / Sell signal, current price,
   5-year projection range (Pessimist / Moderate / Optimist), and a
   confidence tier.
3. A detail page (`/sealed-forecast/[slug]`) shows the full forecast,
   a 5-year ROI chart, model details, and a TCGplayer buy link.
4. `/sealed-forecast/methodology` explains the model in plain English.
5. `/calculator` covers grading EV, flip ROI, and a single-product
   sealed-hold ROI calculator for cards you already own.

The catalog is **English-only** by policy (a JP denylist filters out
Japanese sets at load time).

---

## 2. Live URL & Branding

- Live host: AWS Amplify, e.g. `https://main.<app-id>.amplifyapp.com`
- Brand name in copy: **PokeFuture**
- Repo name (legacy): `pokemon-investing`
- Visual style: dark theme, slate/zinc surfaces, accent colors driven
  by Tailwind CSS variables (`--muted`, `--accent`, etc.).
- Iconography: `lucide-react`.
- Charts: `recharts`.

---

## 3. Tech Stack

| Layer            | Choice                                                       |
| ---------------- | ------------------------------------------------------------ |
| Framework        | **Next.js 16** (App Router, RSC, server actions disabled)    |
| Language         | TypeScript ^6, React 19                                      |
| Styling          | Tailwind CSS v4 (`@tailwindcss/postcss`)                     |
| Forms            | `react-hook-form` + `zod`                                    |
| Charts / icons   | `recharts`, `lucide-react`                                   |
| Cloud            | AWS Amplify Hosting (Gen 1, `WEB_COMPUTE`)                   |
| Datastore        | DynamoDB (single table, on-demand)                           |
| ML runtime       | Bundled JSON model artifacts loaded by Node                  |
| ML training      | Python 3.11, **XGBoost 2.1.4**, scikit-learn 1.5.2, pandas   |
| Sync scripts     | Node ESM (`*.mjs`) and Python                                |
| Lint / verify    | ESLint 9 + `eslint-config-next`, `next build`, `node --check`|
| Pre-push hook    | `.githooks/` runs `npm run verify` before push               |

Node version: **22.x** (Amplify default). Python: **3.11**.

---

## 4. High-Level Architecture

```
                ┌────────────────────────────────────────────┐
   Browser  ──► │ Next.js 16 App Router (Amplify hosted)     │
                │  • /sealed-forecast (catalog + filters)    │
                │  • /sealed-forecast/[slug] (detail)        │
                │  • /sealed-forecast/methodology            │
                │  • /calculator (grading / flip / sealed)   │
                │  • /api/sealed/*  /api/cards/*  /api/health│
                └─────┬───────────────────────┬──────────────┘
                      │                       │
            bundled JSON artifacts     DynamoDB (cache + history)
            in src/lib/data/sealed-ml  pokeinvest-cache
                      ▲                       ▲
                      │                       │
   ┌──────────────────┴──────┐   ┌────────────┴────────────────┐
   │ Offline pipelines (CI / │   │ Live sync scripts (cron /   │
   │ local), build artifacts │   │ manual): pricecharting,     │
   │ committed to repo:      │   │ trends, community score,    │
   │  • train_sealed_ml.py   │   │ tcgplayer validation        │
   │  • retrain_sealed_ml.py │   └─────────────────────────────┘
   │  • build-sealed-*.mjs   │
   │  • build-community-*    │
   └─────────────────────────┘
```

Key principle: **all model + catalog state ships in the repo as JSON**.
DynamoDB is used for live price caching, trend snapshots, owned-data,
and (optionally) hot-swappable model chunks. The site degrades
gracefully when DynamoDB is unavailable — JSON is the source of truth.

---

## 5. Data Sources

| Source                  | Used for                                          | Auth                      |
| ----------------------- | ------------------------------------------------- | ------------------------- |
| **PriceCharting**       | Sealed product current + historical prices        | `PRICECHARTING_API_TOKEN` |
| Pokemon TCG API (v2)    | Set universe, set IDs, release dates, logos       | `TCG_API_KEY` (optional)  |
| TCGplayer (search HTML) | Resolving the canonical product URL per SKU       | none (rate-limited)       |
| Reddit (search API)     | Community demand signal (`r/PokemonTCG`, `pkmntcg`)| none, throttled 1 req/s   |
| Google Trends           | Demand signal via `google-trends-api` package     | none                      |
| PokeData (legacy)       | Decommissioned — historical seed only             | n/a                       |

---

## 6. Data Pipelines (npm scripts)

All scripts live in `scripts/`. Outputs go to
`src/lib/data/sealed-ml/` (committed to git so the app is self-bootstrapping).

| Command                              | What it does                                            |
| ------------------------------------ | ------------------------------------------------------- |
| `npm run sync:sealed:catalog`        | Build the canonical sealed product catalog from Pokemon TCG API + overrides; emits `sealed-catalog.json`, `sealed-catalog-review.json`, `sealed-search-catalog.json` |
| `npm run sync:sealed:expansion`      | Build expansion product catalog (`products-expansion.json`) |
| `npm run sync:pricecharting`         | Pull live PriceCharting prices for every catalog entry, write `pricecharting-current-prices.json` and (optionally) DynamoDB |
| `npm run sync:pricecharting:csv`     | Bulk import a PriceCharting CSV export                  |
| `npm run sync:trends`                | Capture Google Trends snapshot for every set            |
| `npm run train:sealed-ml`            | Train XGBoost models (1yr + 3yr + 5yr stack) → `model-{1,3,5}yr.json`, `training-summary.json`, `training-dataset.csv` |
| `npm run retrain:sealed-ml`          | Incremental retrain capturing new outcomes; can publish chunks to DynamoDB if `SEALED_ML_PUBLISH_ENABLED=true` |
| `npm run backfill:cards:catalog`     | Hydrate single-card catalog (calculator support)        |
| `npm run backfill:pokedata:sealed`   | Legacy seed                                             |
| `node scripts/build-community-score.mjs` | Composite Reddit + Trends score → `community-score.json` |
| `node scripts/fetch-top-chase-cards.mjs` | Per-set most expensive singles → `top-chase-cards.json` |
| `node scripts/mirror-sealed-images.mjs`  | Mirror PriceCharting product images to public/         |
| `node scripts/validate_against_tcgplayer.mjs` | QA report: every catalog SKU resolves on TCGplayer |

The data files in `src/lib/data/sealed-ml/` are checked in. **Never
hand-edit them**; always regenerate via the relevant script and commit
the diff so deploys are reproducible.

---

## 7. ML Model

- **Algorithm:** XGBoost regression (`xgboost==2.1.4`).
- **Horizons:** three models — 1-year, 3-year, 5-year. The 5yr is a
  **stacked meta-model** that consumes out-of-fold predictions from
  the 1yr and 3yr models as additional features.
- **Validation:** scikit-learn `TimeSeriesSplit`.
- **Training data:** the offline pipeline assembles a per-product,
  per-month panel from PriceCharting price snapshots, set metadata,
  community-score blend, and engineered features.

Feature set (see `scripts/train_sealed_ml.py`):

```
current_price, most_expensive_card_price, chase_card_count,
chase_card_index_score, set_age_years, community_score,
reddit_score, forum_score, print_run_type_encoded,
price_trajectory_6mo, price_trajectory_24mo,
collector_demand_ratio, market_cycle_score, popularity_score,
product_type_encoded, era_encoded, price_momentum_1mo,
price_momentum_12mo, price_volatility_6mo, price_volatility_12mo,
drawdown_12mo, history_density_12mo, available_provider_count,
provider_spread_pct, provider_agreement_score,
snapshot_freshness_days, liquidity_proxy_score,
history_window_missing_flag, provider_context_missing_flag,
log_current_price, log_most_expensive_card_price,
chase_value_share, community_signal_consistency,
price_z_in_era, momentum_consistency
```

**Scenarios.** From the model output, the app derives three
projections:

- **Pessimist** — downside scenario (lower bound of the prediction
  band).
- **Moderate** — central forecast.
- **Optimist** — upside scenario.

**Confidence tiers.** High / Medium / Low based on history density,
peer-group strength, and signal agreement. See
`src/lib/domain/confidence-display.ts`.

**Recommendation.** Buy / Hold / Sell derived from forecasted CAGR
relative to a hold-cost threshold. See
`src/lib/domain/recommendation.ts`.

**Brand-new / sparse-data products are blocked** rather than forced
into a noisy projection. See `src/lib/domain/sealed-forecast.ts`.

**Runtime loading.** `SEALED_ML_MODEL_SOURCE` controls source:

- `auto` (default) — prefer DynamoDB-published chunks, fall back to
  bundled JSON.
- `bundled` — force the repo-bundled rollback copy.

---

## 8. App Surfaces (pages)

| Route                                | Purpose                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `/`                                  | Marketing landing — hero, value props, CTA into `/sealed-forecast`              |
| `/sealed-forecast`                   | Catalog: left sidebar filters + search + grid of `ProductForecastCard`s         |
| `/sealed-forecast/[slug]`            | Bloomberg-style product detail: signal, projection chart, model details, TCGplayer link |
| `/sealed-forecast/methodology`       | Plain-English explanation of model, sources, confidence                         |
| `/calculator`                        | Tabs: Grading EV, Flip ROI, Sealed-hold ROI                                     |
| `/contact`, `/privacy`, `/privacy-rights`, `/terms` | Legal / contact (driven by `LEGAL_*` env vars)                |

### Catalog filter sidebar (`/sealed-forecast`)

Persistent left sidebar (sticky on `md+`, top of page on mobile):

- **Product Type** — multi-select checkboxes (Booster Box, ETB, Booster
  Bundle). Counts derived from current result set.
- **Recommendation** — Buy / Hold / Sell / All.
- **Scenario** — Pessimist / Moderate / Optimist.
- **Sort by** — pills (price, projected upside, confidence, etc.).
- **Reset filters** link when any non-default filter is active.
- Filters render immediately (no `hasInteracted` gate).
- Search input lives in the right column; empty-state shows no filters.

---

## 9. API Routes

All under `src/app/api/`:

| Route                            | Method | Purpose                                      |
| -------------------------------- | ------ | -------------------------------------------- |
| `/api/health`                    | GET    | Liveness probe                               |
| `/api/sealed/search`             | GET    | Free-text + filter search over catalog       |
| `/api/sealed/forecast`           | GET    | Forecast for a single product                |
| `/api/sealed/history`            | GET    | Historical price series                      |
| `/api/sealed/pricing`            | GET    | Live spot price (PriceCharting)              |
| `/api/sealed/tcgplayer`          | GET    | Resolve TCGplayer URL for a SKU              |
| `/api/sealed/top-buys`           | GET    | Top Buy-recommended products                 |
| `/api/cards/search`              | GET    | Single-card search (calculator)              |
| `/api/cards/grade-data`          | GET    | PSA grading population & price tiers         |
| `/api/cards/grade-submissions`   | GET    | PSA submission counts                        |
| `/api/trends`                    | GET    | Google Trends snapshot                       |

---

## 10. Filter / Search UX & Catalog Policies

- **English-only catalog.** `src/lib/data/sealed-ml/sealed-catalog-jp-denylist.json`
  and JP set-id pattern matching strip Japanese SKUs at load time
  (`src/lib/db/sealed-search.ts`).
- **TCGplayer resolver disqualifies single-card pages.** When
  resolving a Booster Box link, results that point at a single card
  (e.g. Shiny Vault Dubwool V) are rejected. See
  `src/lib/domain/sealed-tcgplayer.ts` and the
  `use-sealed-tcgplayer-url` hook.
- **Phantom subset cleanup.** Shiny Vault and similar non-product
  subset SKUs are filtered.
- **Search aliases** are precomputed (`buildSealedSearchAliases`) so
  queries like `all etbs` or `booster boxes` map to the right
  category.
- **Catalog overrides** (`sealed-catalog-overrides.json`) allow manual
  fixes (renames, image swaps) without losing them on next sync.

---

## 11. Folder & File Layout

```
.
├── amplify.yml                     # Amplify build spec
├── package.json                    # Node deps + all sync/train scripts
├── requirements-ml.txt             # Python deps for ML pipeline
├── next.config.ts                  # Empty default Next config
├── tsconfig.json
├── eslint.config.mjs
├── .githooks/                      # pre-push runs `npm run verify`
├── public/                         # mirrored product images, static assets
├── src/
│   ├── app/
│   │   ├── page.tsx                # Landing
│   │   ├── sealed-forecast/
│   │   │   ├── page.tsx            # Catalog + sidebar filters
│   │   │   ├── [slug]/page.tsx     # Detail
│   │   │   └── methodology/page.tsx
│   │   ├── calculator/page.tsx
│   │   ├── contact|privacy|privacy-rights|terms/page.tsx
│   │   └── api/
│   │       ├── sealed/{forecast,history,pricing,search,tcgplayer,top-buys}/route.ts
│   │       ├── cards/{search,grade-data,grade-submissions}/route.ts
│   │       ├── trends/route.ts
│   │       └── health/route.ts
│   ├── components/
│   │   ├── layout/{header,footer,first-visit-disclaimer}.tsx
│   │   ├── sealed/                 # ProductForecastCard, ForecastChart, etc.
│   │   ├── calculator/             # GradingCalculator, ConditionWizard, etc.
│   │   └── ui/                     # Button, Card, Input, FadeIn (shadcn-style)
│   └── lib/
│       ├── data/sealed-ml/         # ALL committed data + model artifacts
│       │   ├── sealed-catalog.json
│       │   ├── sealed-catalog-review.json
│       │   ├── sealed-search-catalog.json
│       │   ├── sealed-catalog-overrides.json
│       │   ├── sealed-catalog-jp-denylist.json
│       │   ├── products.json / products-expansion.json
│       │   ├── pricecharting-current-prices.json
│       │   ├── pricecharting-product-images*.json
│       │   ├── community-score.json
│       │   ├── top-chase-cards.json
│       │   ├── pull-rates.json
│       │   ├── dual-provider-monthly-snapshots.json
│       │   ├── product-history-summary.json
│       │   ├── training-dataset.csv / training-summary.json
│       │   └── model-{1,3,5}yr{,.baseline}.json
│       ├── data/cards/             # single-card cache
│       ├── data/sealed-sets.ts     # set-id constants + era mapping
│       ├── data/sealed-descriptions.ts
│       ├── db/                     # dynamo, sealed-search, *-models, etc.
│       ├── domain/                 # forecast, recommendation, scenarios, etc.
│       ├── server/                 # server-only loaders (load-sealed-set, history)
│       ├── owned-data/             # append-only owned-data exports
│       ├── schemas/                # zod schemas
│       ├── types/                  # shared TS types
│       ├── utils/index.ts
│       └── legal-config.ts
├── scripts/                        # all sync / train / backfill / mirror scripts
├── infra/sealed-ml-retrainer/      # Lambda container for scheduled retrains
│   ├── Dockerfile
│   └── template.yaml               # SAM/CloudFormation
├── docs/
│   └── pokemon-investing-pricecharting-plan.txt
└── Specs-Driven/
    ├── DEPLOY_AWS.md               # Amplify deploy runbook
    └── TODO.md                     # phased build log
```

---

## 12. Environment Variables & Secrets

Source: `.env.example` and `grep -r process.env src scripts`.

| Variable                       | Required | Purpose                                                 |
| ------------------------------ | -------- | ------------------------------------------------------- |
| `AWS_REGION`                   | yes      | DynamoDB + S3 region (`us-east-1`)                      |
| `DYNAMODB_TABLE`               | yes      | Single-table name (default `pokeinvest-cache`)          |
| `PRICECHARTING_API_TOKEN`      | sync     | PriceCharting API auth                                  |
| `TCG_API_KEY`                  | optional | Pokemon TCG API rate-limit relief                       |
| `POKEDATA_API_KEY`             | legacy   | Only for legacy backfills; can be omitted               |
| `SEALED_ML_MODEL_SOURCE`       | runtime  | `auto` \| `bundled`                                     |
| `SEALED_ML_PUBLISH_ENABLED`    | retrain  | When `true`, retrainer publishes new model chunks       |
| `SEALED_ML_OUTPUT_DIR`         | retrain  | Local override for output path                          |
| `OWNED_DATA_ASSET_BUCKET`      | optional | S3 bucket for append-only owned-data exports            |
| `OWNED_DATA_ASSET_PREFIX`      | optional | Prefix inside the bucket (default `owned-data`)         |
| `LEGAL_OPERATOR_NAME`          | launch   | Name shown on legal pages                               |
| `LEGAL_CONTACT_EMAIL`          | launch   | Contact email                                           |
| `PRIVACY_REQUEST_EMAIL`        | launch   | Privacy-rights contact                                  |
| `LEGAL_BUSINESS_ADDRESS`       | launch   | Address on Terms/Privacy                                |
| `LEGAL_CONTACT_URL`            | launch   | External contact form URL (optional)                    |

Amplify reads only the keys listed in `amplify.yml` `preBuild`; if you
add new ones, also add them to that loop and to the Amplify console.

---

## 13. AWS Infrastructure

- **Amplify Hosting (Gen 1)** — connected to GitHub `main`. Platform
  `WEB_COMPUTE`. Build spec: `amplify.yml` (runs `npm run verify:app`).
- **DynamoDB** — single on-demand table (default name
  `pokeinvest-cache`). Access pattern is key-value: PK is a string
  like `pricecharting#<id>`, `trends#<setId>#<yyyymm>`,
  `model#sealed-ml#chunk#N`, etc. See `src/lib/db/*.ts` for every
  prefix used. Provision with `scripts/setup-dynamodb.sh`.
- **S3 (optional)** — append-only owned-data exports under
  `OWNED_DATA_ASSET_BUCKET / OWNED_DATA_ASSET_PREFIX`.
- **Lambda container (optional)** — scheduled ML retrainer. Source:
  `infra/sealed-ml-retrainer/{Dockerfile,template.yaml}`. Triggered
  via EventBridge cron, writes new model chunks back to DynamoDB.
- **IAM** — see `Specs-Driven/DEPLOY_AWS.md`. Amplify deploy user
  needs `AdministratorAccess-Amplify` plus `AdministratorAccess` for
  initial role creation.

---

## 14. Local Dev Setup

```bash
# Prereqs: Node 22+, Python 3.11+, AWS CLI (optional), git

git clone <repo>
cd <repo>
cp .env.example .env.local         # fill in PRICECHARTING_API_TOKEN at minimum
npm ci
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-ml.txt

npm run hooks:install              # install pre-push verify hook
npm run dev                        # http://localhost:3000
```

The site runs **without DynamoDB or any sync scripts** because all
catalog + model state ships in `src/lib/data/sealed-ml/`. To regenerate
data:

```bash
npm run sync:sealed:catalog
npm run sync:pricecharting
node scripts/build-community-score.mjs
npm run train:sealed-ml
```

---

## 15. Build & Deploy

Local verification (mirrors what Amplify runs):

```bash
npm run verify        # lint + build + script syntax checks
```

Amplify pipeline (from `amplify.yml`):

1. `preBuild`: `npm ci`, then write a `.env.production` populated from
   the whitelisted Amplify env vars.
2. `build`: `npm run verify:app` (lint + `next build`).
3. Artifacts: `.next/**`. Cache: `node_modules/**`, `.next/cache/**`.

Manually triggering a deploy:

```bash
aws amplify start-job \
  --app-id <APP_ID> --branch-name main --job-type RELEASE \
  --region us-east-1
```

Polling latest job:

```bash
aws amplify list-jobs --app-id <APP_ID> --branch-name main \
  --region us-east-1 --max-items 1 \
  --query 'jobSummaries[0].status' --output text
```

---

## 16. Recreate-From-Scratch Recipe (ordered)

> Each phase is independently verifiable. Don't skip ahead.

### Phase 0 — Repo bootstrap

1. Create empty repo, add `.gitignore` (Node + Python + `.next`,
   `.venv`, `.env*`, `scripts/.cache/`).
2. `npm init -y`, set `"name": "pokemon-investing"`,
   `"private": true`, `"description": "Pokémon Card ROI & Grading
   Decision Engine"`.
3. Install runtime deps from §3 (Next 16, React 19, Tailwind v4 +
   `@tailwindcss/postcss`, AWS SDK v3, `recharts`, `lucide-react`,
   `react-hook-form`, `zod`, `clsx`, `tailwind-merge`,
   `class-variance-authority`, `google-trends-api`).
4. Install dev deps: `eslint`, `eslint-config-next`, `typescript`,
   `@types/{node,react,react-dom}`.
5. Add `tsconfig.json` (Next defaults), `next.config.ts` (empty),
   `eslint.config.mjs` (extend `next/core-web-vitals`),
   `postcss.config.mjs` (`@tailwindcss/postcss`).
6. Add `requirements-ml.txt` exactly as in §3.
7. Add `.githooks/pre-push` running `npm run verify`; wire
   `npm run hooks:install` script (`git config core.hooksPath
   .githooks`).

### Phase 1 — Scaffolding & shell

1. Create `src/app/layout.tsx`, `src/app/globals.css`,
   `src/app/page.tsx` (landing).
2. Create `src/components/{ui,layout}` per §11. Build `Header`,
   `Footer`, `Button`, `Card`, `Input`, `FadeIn`.
3. Add `src/lib/utils/index.ts` (`cn` helper).
4. Add `src/lib/legal-config.ts` reading `LEGAL_*` env vars.
5. Stub the legal pages (`/contact`, `/privacy`, `/privacy-rights`,
   `/terms`) and `/api/health/route.ts`.
6. Verify: `npm run verify` is clean and `/` renders.

### Phase 2 — Catalog data plumbing (no live calls yet)

1. Add types in `src/lib/types/sealed.ts` (`ProductType`, `Scenario`,
   `Recommendation`, `Confidence`, `SealedProduct`, etc.).
2. Add `src/lib/data/sealed-sets.ts` listing every English set we
   cover, with id, name, era, releaseDate, logo url.
3. Drop seed JSON into `src/lib/data/sealed-ml/` (start with one or
   two hand-written entries to unblock UI work):
   `sealed-catalog.json`, `sealed-search-catalog.json`,
   `sealed-catalog-jp-denylist.json` (`[]` is fine to start),
   `pricecharting-current-prices.json`, `community-score.json`.
4. Add `src/lib/db/dynamo.ts` (returns `null` when env not set).
5. Add `src/lib/db/sealed-search.ts` — loads bundled JSON, applies JP
   denylist, exposes `loadStoredCatalog()`.
6. Add `src/lib/domain/sealed-catalog-search.ts` (id helpers,
   `coerceProductType`, `buildSealedSearchAliases`,
   `buildSealedDisplayName`).
7. Add `src/lib/domain/sealed-image.ts`, `sealed-slug.ts`.
8. Smoke test: write a quick page that lists `loadStoredCatalog()`.

### Phase 3 — Catalog page & filter sidebar

1. Build `src/app/sealed-forecast/page.tsx` and the dashboard component
   tree under `src/components/sealed/`:
   - `ForecastDashboard` (state container)
   - `ProductForecastCard` (single card)
   - `SkeletonForecastCard`
   - `SignalBadge`, `ForecastChart`, `RoiChart`, `ModelDetails`,
     `ForecastBreakdownModal`, `TopBuyOpportunities`
2. Implement the **left sidebar filters** per §10.
3. Implement search input + alias matching (`all etbs`, `booster
   boxes`, etc.).
4. Verify: filtering by Product Type returns correct counts; search
   covers every alias.

### Phase 4 — API + forecast logic

1. Build `/api/sealed/search` over `loadStoredCatalog()`.
2. Add `src/lib/domain/{sealed-forecast.ts,sealed-estimate.ts,
   scenarios.ts,recommendation.ts,confidence-display.ts,
   forecast-breakdown.ts,key-drivers.ts,projection-series.ts}`.
3. Add `/api/sealed/forecast`, `/api/sealed/pricing`,
   `/api/sealed/history`, `/api/sealed/top-buys`.
4. Add `src/lib/domain/sealed-tcgplayer.ts` (resolver that rejects
   single-card pages and JP language pages) and
   `/api/sealed/tcgplayer`.

### Phase 5 — Detail page & methodology

1. Build `src/app/sealed-forecast/[slug]/page.tsx` (Bloomberg-style
   layout: signal, ROI chart, model details, TCGplayer link).
2. Build `src/app/sealed-forecast/methodology/page.tsx` — keep copy
   high-level: peer-group + signals + scenarios + confidence; mention
   XGBoost + PriceCharting + Community + Trends sources; **no model
   stack / training rows / guardrail jargon**.

### Phase 6 — Calculator

1. Build `src/app/calculator/page.tsx` and components in
   `src/components/calculator/`:
   - Grading EV (PSA 10/9/8/below probabilities, fees)
   - Flip ROI (buy/sell, marketplace fees)
   - Sealed-hold ROI (CAGR over hold months)
2. Add domain functions in `src/lib/domain/{grading,fees,
   grading-opportunities,price-estimates}.ts`.
3. Wire `/api/cards/{search,grade-data,grade-submissions}`.

### Phase 7 — Sync pipelines

1. Port each script from §6 in this order:
   - `scripts/sync_sealed_catalog.py` (catalog from Pokemon TCG API)
   - `scripts/sync-pricecharting-prices.mjs`
   - `scripts/build-community-score.mjs`
   - `scripts/fetch-top-chase-cards.mjs`
   - `scripts/build-sealed-expansion-catalog.mjs`
   - `scripts/mirror-*-images.mjs`
   - `scripts/validate_against_tcgplayer.mjs`
2. Add them all to `npm run verify:scripts`.

### Phase 8 — ML training

1. Port `scripts/train_sealed_ml.py`. Output goes to
   `src/lib/data/sealed-ml/model-{1,3,5}yr.json` and
   `training-{summary.json,dataset.csv}`.
2. Port `scripts/retrain_sealed_ml.py` (incremental, optional publish
   to DynamoDB).
3. Add `src/lib/db/sealed-forecast-models.ts` to load models from
   DynamoDB chunks with bundled-JSON fallback (controlled by
   `SEALED_ML_MODEL_SOURCE`).

### Phase 9 — Infra & deploy

1. Add `amplify.yml` (copy verbatim from this repo).
2. Provision DynamoDB table (`scripts/setup-dynamodb.sh`).
3. Connect Amplify to the GitHub repo, set env vars in §12.
4. (Optional) Deploy `infra/sealed-ml-retrainer/` Lambda + EventBridge
   cron from `template.yaml`.

### Phase 10 — Polish

- Disclaimers (`first-visit-disclaimer.tsx`).
- Accessibility pass on filter sidebar.
- README with screenshots + this `RECREATE.md` linked.

---

## 17. Known Gotchas & Conventions

- **English-only catalog.** Never reintroduce JP SKUs. The denylist
  + `isJapaneseSetId` heuristic in `src/lib/db/sealed-search.ts` are
  the gate. Adding a JP set means adding it to the denylist and
  regenerating `sealed-search-catalog.json`.
- **TCGplayer single-card disqualification.** A box link must point at
  a sealed product page; if the resolver returns a single-card URL
  (e.g. `…shining-fates-shiny-vault-dubwool-v…`), reject and fall back
  to the search page. Test: Shining Fates Booster Box must NOT link to
  Dubwool V.
- **`git add` discipline.** Never `git add -A`. The
  `.github/workflows/refresh-community-score.yml` workflow file
  requires a token scope this repo's deploy key doesn't have; pushing
  it triggers an OAuth scope rejection. Always add only the files your
  change touched.
- **Commit trailer.** Every commit must end with:

  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```
- **Methodology copy.** No "30 seconds", no jargon, no model-stack /
  guardrails / training-rows callouts. List sources as PriceCharting,
  Community, Google Trends, etc. — not row counts.
- **Brand-new / sparse-data products are blocked**, never forced into
  a noisy projection.
- **Plan / checkpoint workflow.** Long-form work goes in
  `~/.copilot/session-state/<id>/plan.md`; finished phases get
  checkpointed under `checkpoints/`. The repo itself never carries
  agent planning markdown.
- **Amplify env var whitelist.** When adding a new env var the app
  reads at runtime, also add it to the `for key in …` loop in
  `amplify.yml` `preBuild`, otherwise the deployed bundle won't see
  it.
- **Pre-push hook.** `npm run hooks:install` once per clone; the
  `.githooks/pre-push` will then run `npm run verify` before every
  push.

---

_End of guide. If something here drifts from the codebase, fix the
codebase or fix this file in the same PR — never let the two diverge._
