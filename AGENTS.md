# pokemon-investing — Agent Instructions

Data + ML pipeline for the PokeFuture stack. Legacy repo name is `pokemon-investing`; the user-facing product is **PokeFuture** (see `RECREATE.md` for the full end-to-end product spec).

- The **live consumer site** lives in `~/pokefuture/` (Next.js App Router + Amplify).
- **This repo** owns the sealed-product catalog, PriceCharting sync, TCGplayer resolvers, community-score signals, image mirrors, and the sealed-ML training pipeline that feeds PokeFuture.

## Stack

- **Next.js** App Router (App Router pages exist for a parallel site view) + React + TypeScript
- **Tailwind CSS**
- **AWS SDK v3** (`@aws-sdk/client-dynamodb`, `lib-dynamodb`)
- **Python** for ML training (`train_sealed_ml.py`, `retrain_sealed_ml.py`, `sync_sealed_catalog.py`, `import_pricecharting_csv.py`)
- **Node `.mjs`** for JS-side sync scripts
- **DynamoDB** single-table cache

## Repo layout

```
src/app/                          # Next.js App Router pages + API routes
src/components/                   # UI
src/lib/                          # data, db, domain, schemas, server, types, utils
src/lib/data/                     # canonical committed JSON (catalog, prices, model artifacts)
scripts/                          # sync / backfill / mirror / build scripts (.mjs and .py)
scripts/data/                     # generated inputs/outputs for scripts
docs/                             # plans, superpowers specs
RECREATE.md                       # end-to-end PokeFuture rebuild guide (canonical product spec)
Specs-Driven/                     # deploy + spec docs
infra/                            # infra artifacts
images/                           # mirrored product images
```

## Scripts

- `npm run dev` / `build` / `start` / `lint`
- `npm run verify:app` — lint + build
- `npm run verify:scripts` — `node --check` all sync scripts + `python -m py_compile` all Python scripts
- `npm run verify` — full chain
- `npm run backfill:pokedata:sealed` / `backfill:pokedata:sealed-meta` — seed sealed products
- `npm run backfill:pokedata:grades` — pull grade data
- `npm run backfill:cards:catalog` — build individual-card catalog
- `npm run sync:pricecharting` / `sync:pricecharting:csv` — refresh PriceCharting prices (JS API + Python CSV path)
- `npm run sync:sealed:catalog` — Python catalog sync
- `npm run sync:sealed:expansion` — rebuild sealed expansion catalog
- `npm run sync:trends` — Google Trends demand signal
- `npm run train:sealed-ml` / `retrain:sealed-ml` — retrain XGBoost sealed model

**Before pushing:** run `npm run verify`.

## Invariants — do not break

- **English-only sealed catalog.** A JP denylist filters Japanese sets at load time; do not remove it.
- **Reject single-card TCGplayer matches for sealed products** (see commit `2bd59d2`) — sealed URLs must resolve to a sealed SKU, not a card SKU.
- **PriceCharting is the pricing anchor.** Do not swap it for another source without user approval (see commit `9794353`).
- **Phantom Shiny Vault SKUs stay dropped** — do not reintroduce them.
- **`RECREATE.md` is the canonical product spec.** If code and `RECREATE.md` disagree, ask which is correct before editing.
- **Downstream consumer is PokeFuture** at `~/pokefuture/`. Model artifacts and catalog JSON changes must be compatible with what the PokeFuture repo consumes.
- **Never `git add -A` or `git add .`.** Some workflow files carry OAuth-scoped tokens (mirrors `pokefuture`'s discipline).

## Working style for agents

- **TDD** for behavior changes. Watch tests fail first.
- **Use `edit`** on existing files; `create` only for new files.
- **Every commit ends with this trailer:**

  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

- **Commit style** matches history: `Add ...`, `Drop ...`, `Move ...`, `Filter ...`, `Fix ...`.
- **Verify before claiming done.** Run `npm run verify` and read the output.
- **Do not commit agent planning markdown.** Session plans live in `~/.copilot/session-state/<id>/plan.md`.

## Relationship to PokeFuture

- **Product docs, copy, and consumer UX** live in `~/pokefuture/`. Don't duplicate them here.
- **Sealed catalog, PriceCharting sync, ML training** live here. When PokeFuture needs new products or a fresh model, run the appropriate script here and land the resulting JSON.
- If asked to "add a product" or "fix a price," first decide whether the fix belongs here (catalog / pricing source) or in `~/pokefuture/` (display / forecast rendering).

## Autopilot notes

- Primary agent context: this file + `RECREATE.md` + `docs/` + `Specs-Driven/`.
- If a change touches pricing sources, ML retraining, catalog eligibility rules, or DynamoDB schema, stop and ask before shipping.
- If a task is ambiguous, prefer the smallest change that preserves invariants, then verify.
