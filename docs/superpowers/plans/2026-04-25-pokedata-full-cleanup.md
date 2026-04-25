# PokeData IO Full Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish decommissioning PokeData IO end-to-end — strip dead runtime types/exports, remove the obsolete offline backfill script, gate the catalog sync behind an explicit `--pokedata-catalog` file (no live API), verify the new `/api/cards/grade-submissions` endpoint works in prod, and decide on a sane default for the grading-calculator probability fields.

**Architecture:** PokeData was already removed from the runtime in commit `91665e1` (job 116). What remains are (a) dead types/exports in `card-cache.ts` and `types/card.ts` still shaped around `population` + `psa10Probability` + `pokedataId`, (b) `grading-opportunities.ts` reading those now-always-null fields, (c) offline scripts that import `POKEDATA_API_KEY` at module load. We'll narrow types to what's actually written, keep `pokedataId` as a passive cache key only, replace probability heuristics with the new user-supplied stats fallback, delete the dead backfill script, switch the catalog sync to file-only mode, then live-smoke the new submissions endpoint and pick a calculator default.

**Tech Stack:** TypeScript, Next.js 15, React 19, AWS DynamoDB (`pokeinvest-cache`), AWS Amplify, Python 3 (catalog sync), Node 22, Vitest (existing test runner).

---

### Task 1: Snapshot baseline lint + build + tests

**Files:**
- No file edits — just baseline capture.

- [ ] **Step 1: Run lint and capture warning count**

Run: `npm run lint 2>&1 | tail -20`
Expected: 0 errors, 9 warnings (8 pre-existing + 1 new benign React-Compiler note about `useForm.watch()`).

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -30`
Expected: success. Both `/api/cards/grade-data` and `/api/cards/grade-submissions` listed as compiled routes.

- [ ] **Step 3: Run unit tests**

Run: `npm test -- --run 2>&1 | tail -20`
Expected: all green. Note any flaky/skipped tests for context.

- [ ] **Step 4: Record baseline in commit message draft**

No commit yet — keep numbers in scratch for the final summary.

---

### Task 2: Smoke-test the new `/api/cards/grade-submissions` endpoint in prod

**Files:**
- No file edits — production verification only.

- [ ] **Step 1: GET an empty stats payload for a known cardId**

Run:
```bash
curl -s 'https://main.d16gvb6c6e6eir.amplifyapp.com/api/cards/grade-submissions?cardId=test-smoke-001' | python3 -m json.tool
```
Expected: HTTP 200, JSON with `count: 0` (or absent stats), no error.

- [ ] **Step 2: POST a synthetic submission**

Run:
```bash
curl -s -X POST 'https://main.d16gvb6c6e6eir.amplifyapp.com/api/cards/grade-submissions' \
  -H 'content-type: application/json' \
  -d '{"cardId":"test-smoke-001","psa10Pct":40,"psa9Pct":40,"psa8Pct":15}' | python3 -m json.tool
```
Expected: HTTP 200, returned stats with `count: 1`, `mean.psa10 ≈ 40`.

- [ ] **Step 3: GET again to confirm persistence**

Run the same GET as step 1.
Expected: `count: 1` and the means from step 2. If this fails, stop — DynamoDB IAM is the likely culprit; do not proceed to Task 3 until resolved.

- [ ] **Step 4: Clean up the smoke test row**

Run:
```bash
aws dynamodb delete-item --table-name pokeinvest-cache --region us-east-1 \
  --key '{"pk":{"S":"CARD#test-smoke-001"},"sk":{"S":"USER_GRADES"}}'
```
Expected: empty success response.

- [ ] **Step 5: No commit (verification only)**

---

### Task 3: Add a guarded fallback in `grading-opportunities.ts` so it no longer reads always-null `psa10Probability`

**Files:**
- Modify: `src/lib/domain/grading-opportunities.ts`
- Modify: `src/lib/types/card.ts`

The current code path at `grading-opportunities.ts:86-95` branches on `gradeData.psa10Probability === null` and falls through to a hardcoded `{psa10:20, psa9:50, psa8:25}` baseline. Since `psa10Probability` is now *always* null, the branch is dead. Replace with an explicit baseline lookup keyed off card rarity (already on `gradeData`, look it up) so the discovery view at least varies per card. Then drop the `psa10Probability` field from the type since nothing writes it anymore.

- [ ] **Step 1: Write a failing test for the new baseline behavior**

Create `src/lib/domain/__tests__/grading-opportunities.baseline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeGradingOpportunity } from "../grading-opportunities";

const baseGrade = {
  pokedataId: "abc",
  cardId: "abc",
  setName: "Test Set",
  cardName: "Test Card",
  cardNumber: "1/100",
  rarity: "Rare Holo",
  ungraded: 50,
  psa10: 200,
  psa9: 80,
  psa8: 40,
  population: {},
} as const;

describe("computeGradingOpportunity baseline probabilities", () => {
  it("uses a non-zero PSA 10 baseline when no user stats exist", () => {
    const result = computeGradingOpportunity(baseGrade, undefined);
    expect(result.psa10Probability).toBeGreaterThan(0);
    expect(result.psa10Probability).toBeLessThanOrEqual(100);
  });

  it("uses user-supplied mean when stats are provided", () => {
    const result = computeGradingOpportunity(baseGrade, {
      count: 12,
      mean: { psa10: 55, psa9: 30, psa8: 10 },
      std: { psa10: 5, psa9: 5, psa8: 3 },
    });
    expect(result.psa10Probability).toBeCloseTo(55, 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/lib/domain/__tests__/grading-opportunities.baseline.test.ts`
Expected: FAIL — `computeGradingOpportunity` does not accept a stats argument yet.

- [ ] **Step 3: Update `computeGradingOpportunity` signature and logic**

In `src/lib/domain/grading-opportunities.ts`, replace the current `psa10Probability`-reading block:

```ts
export function computeGradingOpportunity(
  gradeData: GradeData,
  userStats?: { count: number; mean: { psa10: number; psa9: number; psa8: number }; std: { psa10: number; psa9: number; psa8: number } },
): GradingOpportunity {
  const probabilityDefaults =
    userStats && userStats.count >= 3
      ? { psa10: userStats.mean.psa10, psa9: userStats.mean.psa9, psa8: userStats.mean.psa8 }
      : baselineFromRarity(gradeData.rarity);

  // ... rest unchanged ...
}

function baselineFromRarity(rarity: string | null | undefined): { psa10: number; psa9: number; psa8: number } {
  const r = (rarity || "").toLowerCase();
  if (r.includes("secret") || r.includes("hyper")) return { psa10: 12, psa9: 55, psa8: 25 };
  if (r.includes("ultra") || r.includes("full art")) return { psa10: 18, psa9: 52, psa8: 22 };
  if (r.includes("holo")) return { psa10: 22, psa9: 50, psa8: 22 };
  return { psa10: 25, psa9: 50, psa8: 20 };
}
```

Also remove the `gradeData.psa10Probability` reference from the `getConfidence(...)` call at line 143 — pass `userStats?.count ?? 0` as the second arg instead, and update `getConfidence` to take a count instead of a nullable probability:

```ts
function getConfidence(populationTotal: number, userSubmissionCount: number): "low" | "medium" | "high" {
  if (userSubmissionCount >= 10 || populationTotal >= 50) return "high";
  if (userSubmissionCount >= 3 || populationTotal >= 10) return "medium";
  return "low";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/lib/domain/__tests__/grading-opportunities.baseline.test.ts`
Expected: PASS, both cases.

- [ ] **Step 5: Wire user stats through the only caller**

Find the caller(s):

Run: `grep -rn "computeGradingOpportunity" src/`

For each caller, if it has access to a cardId, fetch stats via `getUserGradeStats(cardId)` and pass the result. If it's a bulk loop (likely `grading-opportunities.tsx`), batch the lookups with `Promise.all` and continue passing `undefined` if the fetch errors (catch and log, don't throw — the discovery view must still render).

- [ ] **Step 6: Drop the dead field from the type**

In `src/lib/types/card.ts`, remove the `psa10Probability: number | null` line from `GradeData`. In `src/lib/db/card-cache.ts`, remove `psa10Probability` from `CardGradeData` and from the UpdateExpression / ExpressionAttributeValues in the put helper.

- [ ] **Step 7: Run lint + build + full test suite**

Run: `npm run lint && npm run build && npm test -- --run`
Expected: 0 errors, warnings unchanged, build succeeds, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/grading-opportunities.ts \
        src/lib/domain/__tests__/grading-opportunities.baseline.test.ts \
        src/lib/types/card.ts \
        src/lib/db/card-cache.ts \
        src/components/calculator/grading-opportunities.tsx
git commit -m "refactor(grading): drop dead psa10Probability path; rarity-based baseline + user-stats fallback

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Remove the `population` field and `setPokedataId` / `POPULATION_MAX_AGE_MS` dead exports

**Files:**
- Modify: `src/lib/db/card-cache.ts`
- Modify: `src/lib/types/card.ts`
- Modify: `src/app/api/cards/grade-data/route.ts`

`population: Record<string, number>` is always `{}` now and nothing reads it after Task 3. `setPokedataId()` and `POPULATION_MAX_AGE_MS` have zero callers. Strip them.

- [ ] **Step 1: Confirm zero remaining callers**

Run:
```bash
grep -rn "setPokedataId\|POPULATION_MAX_AGE_MS\|\.population\b" src/ --include="*.ts" --include="*.tsx"
```
Expected: only the *definitions* in `card-cache.ts` and `types/card.ts` (no consumers). If a consumer remains, list it and stop — go fix that consumer first.

- [ ] **Step 2: Remove from `card-cache.ts`**

Delete the `setPokedataId` function (lines ~196-220), the `POPULATION_MAX_AGE_MS` export (line 25), and the `population` field from the `CardGradeData` type plus its `population = :population` clause in the UpdateExpression and `:population` ExpressionAttributeValue.

- [ ] **Step 3: Remove from `types/card.ts`**

Delete `population: Record<string, number>` from `GradeData`.

- [ ] **Step 4: Remove from `grade-data/route.ts`**

Delete the `population: {}` literal from the response body. Update any TS interface in the file accordingly.

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: 0 errors. Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/card-cache.ts src/lib/types/card.ts src/app/api/cards/grade-data/route.ts
git commit -m "chore: drop dead population/setPokedataId code

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Delete the obsolete `backfill-pokedata-card-grades.mjs` script

**Files:**
- Delete: `scripts/backfill-pokedata-card-grades.mjs`
- Modify: `package.json` (only if a script entry references it)

This script's whole purpose was backfilling PSA 10 probabilities into the cache from PokeData. Both inputs and consumer are gone.

- [ ] **Step 1: Check for npm script references**

Run: `grep -n "backfill-pokedata-card-grades" package.json`
Expected: zero or one match. If matched, note the script-name key.

- [ ] **Step 2: Check for cron / GitHub Actions references**

Run: `grep -rn "backfill-pokedata-card-grades" .github/ scripts/ 2>/dev/null`
Expected: only the file itself.

- [ ] **Step 3: Delete the file**

Run: `git rm scripts/backfill-pokedata-card-grades.mjs`

- [ ] **Step 4: Remove npm script entry (if Step 1 found one)**

Edit `package.json`, remove the matching `"scripts": { "...": "..." }` line, keep JSON valid.

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: still passes.

- [ ] **Step 6: Commit**

```bash
git add -A scripts/ package.json
git commit -m "chore: remove obsolete pokedata grade-backfill script

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Lock `sync_sealed_catalog.py` to file-only mode (no live PokeData API)

**Files:**
- Modify: `scripts/sync_sealed_catalog.py`

Current state: when `--pokedata-catalog <path>` is omitted, the script fetches `https://www.pokedata.io/api/products` using `POKEDATA_API_KEY`. We're decommissioning that API. Keep `pokedataId` as a passive identifier in the JSON (don't rename downstream consumers — that's out of scope), but make the live HTTP fetch impossible.

- [ ] **Step 1: Read the relevant section**

Open `scripts/sync_sealed_catalog.py` lines 437-460 (around `load_pokedata_candidates` and the API fetch).

- [ ] **Step 2: Replace the API fetch with a hard error**

Change the body so:
- If `args.pokedata_catalog` is provided → load and dedupe as today.
- Otherwise → `raise SystemExit("PokeData IO live API has been decommissioned. Re-run with --pokedata-catalog <path> pointing at a previously exported catalog JSON.")`

Delete the `POKEDATA_CATALOG_URL` constant and the `requests.get(...)` block. Also delete the `os.environ.get("POKEDATA_API_KEY")` lookup and its associated guard, since we no longer use the key here.

- [ ] **Step 3: Verify the script still parses and prints `--help`**

Run: `python3 scripts/sync_sealed_catalog.py --help`
Expected: argparse help text prints, no `ImportError` or `NameError`.

- [ ] **Step 4: Verify with a no-catalog dry-run that it errors cleanly**

Run: `python3 scripts/sync_sealed_catalog.py 2>&1 | tail -5`
Expected: the new `SystemExit` message about live API decommission. Non-zero exit.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync_sealed_catalog.py
git commit -m "chore(scripts): drop live pokedata.io fetch from catalog sync; require --pokedata-catalog

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Pick a sensible default for the grading calculator probability fields

**Files:**
- Modify: `src/components/calculator/grading-calculator.tsx`

Right now `DEFAULT_FORM_VALUES` sets `probabilityPsa10/9/8 = 0/0/0`. Submitting without filling them gives an EV of $0, which can confuse users into thinking grading is universally bad. Switch to a neutral baseline of `15/55/25` so the form yields a non-zero EV before the user touches anything, and rely on the condition wizard / density warnings to nudge them toward better numbers.

- [ ] **Step 1: Update defaults**

In `src/components/calculator/grading-calculator.tsx`, change `DEFAULT_FORM_VALUES`:

```ts
const DEFAULT_FORM_VALUES = {
  // ...
  probabilityPsa10: 15,
  probabilityPsa9: 55,
  probabilityPsa8: 25,
  // ...
};
```

- [ ] **Step 2: Add a small helper-text note above the probability inputs**

Inline next to the probability fields, render something like:

```tsx
<p className="text-xs text-muted-foreground">
  Defaults are a generic baseline. Use the Condition Wizard above for a card-specific estimate.
</p>
```

- [ ] **Step 3: Lint + build**

Run: `npm run lint && npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/calculator/grading-calculator.tsx
git commit -m "ux(grading): seed probabilities with neutral 15/55/25 baseline + helper note

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Push, deploy, verify

**Files:**
- No file edits.

- [ ] **Step 1: Push to main**

Run: `git push origin main`
Expected: push succeeds. (Use targeted `git add` paths above — never `git add -A` from repo root, to avoid sweeping the untracked `.github/workflows/refresh-community-score.yml` which trips OAuth scope.)

- [ ] **Step 2: Poll Amplify for the resulting job**

Run: `bash scripts/redeploy-amplify.sh` (it polls until SUCCEED/FAILED) **or** directly:
```bash
JOB=$(aws amplify list-jobs --app-id d16gvb6c6e6eir --branch-name main --region us-east-1 --max-items 1 --query 'jobSummaries[0].jobId' --output text | head -1)
while true; do
  S=$(aws amplify get-job --app-id d16gvb6c6e6eir --branch-name main --job-id "$JOB" --region us-east-1 --query 'job.summary.status' --output text)
  echo "$S"; [ "$S" = SUCCEED ] && break; [ "$S" = FAILED ] && exit 1; sleep 15
done
```
Expected: SUCCEED.

- [ ] **Step 3: Verify health endpoint shape**

Run:
```bash
curl -s https://main.d16gvb6c6e6eir.amplifyapp.com/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('pokedataConfigured present?', 'pokedataConfigured' in d['services']['monthlyIngestion'])"
```
Expected: `pokedataConfigured present? False`.

- [ ] **Step 4: Re-run the smoke test from Task 2 against the freshly-deployed build**

Same three curl commands. Expected: still works end-to-end.

- [ ] **Step 5: No commit — wrap-up**

Summarize: lint warnings delta, build status, Amplify job ID, smoke-test pass.
