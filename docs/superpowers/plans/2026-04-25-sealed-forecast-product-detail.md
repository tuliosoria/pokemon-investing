# Sealed Forecast Investment Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing sealed-forecast page into a polished investment-research experience — a dense, scannable card grid where each sealed product links out to a dedicated `/sealed-forecast/[slug]` detail page that includes a historical-vs-projected price chart, an analytical product description, model transparency, and a Buy/Hold/Watch/Avoid recommendation.

**Architecture:** Re-use the existing `SealedSetData` model (rich enough for cards), `computeForecast()` ML output, and `listStoredSealedPriceSnapshots()` for history. Add a new dynamic route `/sealed-forecast/[slug]` that server-loads (a) the set, (b) its forecast, (c) its 24-month price history, (d) a description (templated generator + optional curated overrides keyed by `set.id`). Promote `forecast-breakdown-modal.tsx` content into the detail page; cards link directly to the detail page (modal stays for in-grid quick-peek, but is no longer the primary CTA). Recommendation derives from existing `Signal` + `Confidence` + age (Sell+lowConfidence → Avoid, Hold+youngSet → Watch). Description JSON lives at `src/lib/data/sealed-descriptions.ts`. Chart is a new `ForecastChart` component that stitches history + projection on one X axis, distinguishing the two visually.

**Tech Stack:** Next.js 15 (App Router, server components), React 19, TypeScript, Tailwind, Recharts (already in use — `roi-chart.tsx`), AWS DynamoDB (`pokeinvest-cache` via `listStoredSealedPriceSnapshots`), Vitest.

**Assumptions to confirm with user during/after review:**
1. **Slug** = `set.id` (already URL-safe — e.g. `pokemon-evolving-skies`). No slug field added.
2. **Description source** = hybrid: templated generator from set metadata, with optional curated overrides in `src/lib/data/sealed-descriptions.ts` per `set.id`.
3. **Modal** stays as a "Quick view" button on cards but card body click navigates to the detail page.
4. **Recommendation taxonomy** = Buy / Hold / Watch / Avoid, derived from existing model output + heuristics:
   - `Buy` ← model `Buy` with Medium/High confidence
   - `Watch` ← model `Buy` with Low confidence OR `Hold` with set age < 2 yrs
   - `Hold` ← model `Hold` with age ≥ 2 yrs
   - `Avoid` ← model `Sell` OR negative `roiPercent`
5. **Historical chart range** = up to 24 months of `listStoredSealedPriceSnapshots`. If <3 data points exist, show projection-only chart and a "Limited history" badge.
6. **Per-product page is fully server-rendered** (cacheable, SEO-friendly), with one client component for the chart.

---

### Task 1: Capture baseline (lint, build, tests, route map)

**Files:**
- No edits.

- [ ] **Step 1: Lint baseline**

Run: `npm run lint 2>&1 | tail -10`
Expected: 0 errors. Record warning count.

- [ ] **Step 2: Build baseline**

Run: `npm run build 2>&1 | tail -40`
Expected: success. Record route list (especially `/sealed-forecast`).

- [ ] **Step 3: Unit-test baseline**

Run: `npm test -- --run 2>&1 | tail -20`
Expected: green.

- [ ] **Step 4: No commit (baseline only)**

---

### Task 2: Add `Recommendation` type and `deriveRecommendation()` pure function (TDD)

**Files:**
- Modify: `src/lib/types/sealed.ts`
- Create: `src/lib/domain/recommendation.ts`
- Create: `src/lib/domain/__tests__/recommendation.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/domain/__tests__/recommendation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveRecommendation } from "../recommendation";

describe("deriveRecommendation", () => {
  it("returns Buy for Buy signal with High confidence", () => {
    expect(
      deriveRecommendation({ signal: "Buy", confidence: "High", roiPercent: 80, releaseYear: 2018 }),
    ).toBe("Buy");
  });

  it("returns Buy for Buy signal with Medium confidence", () => {
    expect(
      deriveRecommendation({ signal: "Buy", confidence: "Medium", roiPercent: 40, releaseYear: 2019 }),
    ).toBe("Buy");
  });

  it("downgrades Buy + Low confidence to Watch", () => {
    expect(
      deriveRecommendation({ signal: "Buy", confidence: "Low", roiPercent: 30, releaseYear: 2024 }),
    ).toBe("Watch");
  });

  it("returns Watch for Hold on a young set (<2yr old)", () => {
    const thisYear = new Date().getFullYear();
    expect(
      deriveRecommendation({ signal: "Hold", confidence: "Medium", roiPercent: 5, releaseYear: thisYear }),
    ).toBe("Watch");
  });

  it("returns Hold for Hold on a mature set", () => {
    expect(
      deriveRecommendation({ signal: "Hold", confidence: "Medium", roiPercent: 5, releaseYear: 2010 }),
    ).toBe("Hold");
  });

  it("returns Avoid for Sell signal", () => {
    expect(
      deriveRecommendation({ signal: "Sell", confidence: "High", roiPercent: -20, releaseYear: 2015 }),
    ).toBe("Avoid");
  });

  it("returns Avoid for any negative ROI even on Hold", () => {
    expect(
      deriveRecommendation({ signal: "Hold", confidence: "Medium", roiPercent: -5, releaseYear: 2010 }),
    ).toBe("Avoid");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/lib/domain/__tests__/recommendation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the type**

Append to `src/lib/types/sealed.ts`:

```ts
export type Recommendation = "Buy" | "Hold" | "Watch" | "Avoid";
```

- [ ] **Step 4: Implement `deriveRecommendation`**

Create `src/lib/domain/recommendation.ts`:

```ts
import type { Confidence, Recommendation, Signal } from "@/lib/types/sealed";

export interface RecommendationInput {
  signal: Signal;
  confidence: Confidence;
  roiPercent: number;
  releaseYear: number;
}

export function deriveRecommendation(input: RecommendationInput): Recommendation {
  const { signal, confidence, roiPercent, releaseYear } = input;
  if (roiPercent < 0) return "Avoid";
  if (signal === "Sell") return "Avoid";

  const ageYears = new Date().getFullYear() - releaseYear;

  if (signal === "Buy") {
    return confidence === "Low" ? "Watch" : "Buy";
  }

  // Hold
  return ageYears < 2 ? "Watch" : "Hold";
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run src/lib/domain/__tests__/recommendation.test.ts`
Expected: all 7 cases PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/sealed.ts src/lib/domain/recommendation.ts src/lib/domain/__tests__/recommendation.test.ts
git commit -m "feat(sealed): add Buy/Hold/Watch/Avoid recommendation derivation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Add description generator + curated overrides (TDD)

**Files:**
- Create: `src/lib/data/sealed-descriptions.ts`
- Create: `src/lib/domain/sealed-description.ts`
- Create: `src/lib/domain/__tests__/sealed-description.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/domain/__tests__/sealed-description.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDescription } from "../sealed-description";
import type { SealedSetData } from "@/lib/types/sealed";

const baseSet: SealedSetData = {
  id: "pokemon-evolving-skies",
  name: "Evolving Skies",
  productType: "Booster Box",
  releaseYear: 2021,
  currentPrice: 1100,
  gradient: "",
  factors: {
    marketValue: 1100, chaseCardIndex: 95, printRun: 60, setAge: 4,
    priceTrajectory: 88, popularity: 90, marketCycle: 70, demandRatio: 80,
  },
  chaseCards: ["Umbreon VMAX (Alt Art)", "Rayquaza VMAX (Alt Art)"],
  printRunLabel: "Standard",
  notes: "Key chase: Umbreon VMAX alt art.",
};

describe("buildDescription", () => {
  it("uses curated override when present", () => {
    const result = buildDescription({ ...baseSet, id: "pokemon-evolving-skies" });
    // pokemon-evolving-skies should be in curated overrides
    expect(result.source).toBe("curated");
    expect(result.text.length).toBeGreaterThan(50);
  });

  it("falls back to templated generator for non-curated sets", () => {
    const result = buildDescription({ ...baseSet, id: "made-up-set-id" });
    expect(result.source).toBe("templated");
    expect(result.text).toContain("Booster Box");
    expect(result.text).toContain("2021");
  });

  it("includes chase cards when present in templated path", () => {
    const result = buildDescription({ ...baseSet, id: "made-up-set-id" });
    expect(result.text).toMatch(/Umbreon VMAX/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/domain/__tests__/sealed-description.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create curated overrides registry**

Create `src/lib/data/sealed-descriptions.ts`:

```ts
/**
 * Curated investment-tone descriptions per sealed product `id`.
 * Add entries for flagship sets where the templated generator is too generic.
 * Tone: analytical, no hype. ~80-150 words.
 */
export const SEALED_PRODUCT_DESCRIPTIONS: Record<string, string> = {
  "pokemon-evolving-skies":
    "Evolving Skies is widely viewed as the modern flagship for collector demand, anchored by the Umbreon and Rayquaza VMAX alt arts that drive most of the secondary singles value. Sealed Booster Box supply tightened sharply through 2023-2024 as English print runs ended; reprints have not materialized despite repeated speculation. Investability rests on the chase-card concentration (a single Umbreon VMAX alt regularly clears four figures), but the entry price has already absorbed much of the obvious upside, so timing and condition matter more than thesis.",
  "pokemon-base-set-unlimited":
    "Base Set Unlimited is the foundational vintage product. Print run was massive by modern standards, but two decades of opening, water damage, and grading attrition have kept supply of pristine sealed boxes scarce. The investment case is collector nostalgia plus the Charizard halo effect on singles. Authentication risk is real — verify weight, factory wrap, and provenance. Liquidity is good, but spreads are wide.",
  // Add more curated entries here as needed.
};
```

- [ ] **Step 4: Implement the generator**

Create `src/lib/domain/sealed-description.ts`:

```ts
import type { SealedSetData } from "@/lib/types/sealed";
import { SEALED_PRODUCT_DESCRIPTIONS } from "@/lib/data/sealed-descriptions";

export interface DescriptionResult {
  text: string;
  source: "curated" | "templated";
}

export function buildDescription(set: SealedSetData): DescriptionResult {
  const curated = SEALED_PRODUCT_DESCRIPTIONS[set.id];
  if (curated) return { text: curated, source: "curated" };

  const parts: string[] = [];
  parts.push(
    `${set.name} is a ${set.productType} from ${set.releaseYear}.`,
  );

  if (set.chaseCards?.length) {
    const chase = set.chaseCards.slice(0, 3).join(", ");
    parts.push(`Notable chase cards include ${chase}.`);
  }

  if (set.printRunLabel === "Limited") {
    parts.push(
      "Print run is reported as limited, which historically supports stronger price retention if collector demand persists.",
    );
  } else if (set.printRunLabel === "Overprinted") {
    parts.push(
      "This product was overprinted, so secondary supply remains plentiful and price upside depends heavily on a chase-card breakout.",
    );
  }

  const cs = set.factors.communityScore;
  if (typeof cs === "number") {
    if (cs >= 70) {
      parts.push(
        `Community engagement is strong (score ${cs}/100), suggesting durable collector demand.`,
      );
    } else if (cs <= 35) {
      parts.push(
        `Community engagement is muted (score ${cs}/100); price action will likely depend on broader market cycles rather than organic demand.`,
      );
    }
  }

  if (set.notes && set.notes.length > 0) {
    parts.push(set.notes);
  }

  parts.push(
    "Treat this as a speculative collectible, not a financial instrument: reprints, market cycles, and liquidity all materially affect outcomes.",
  );

  return { text: parts.join(" "), source: "templated" };
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run src/lib/domain/__tests__/sealed-description.test.ts`
Expected: all 3 cases PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/sealed-descriptions.ts src/lib/domain/sealed-description.ts src/lib/domain/__tests__/sealed-description.test.ts
git commit -m "feat(sealed): templated description generator + curated overrides

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Add `getSealedPriceHistory()` server helper that pulls 24 months of snapshots

**Files:**
- Create: `src/lib/server/sealed-history.ts`
- Create: `src/lib/server/__tests__/sealed-history.shape.test.ts`

This wraps the existing `listStoredSealedPriceSnapshots()` and shapes the result for the chart.

- [ ] **Step 1: Inspect the existing list helper**

Run: `grep -A 20 "export async function listStoredSealedPriceSnapshots" src/lib/db/sealed-pricing.ts`
Expected: signature is `(pokedataId: string, options?: { limit?, ascending? }) → Promise<StoredSealedPriceSnapshot[]>`. Confirm the return shape matches what we'll consume below; if not, adapt.

- [ ] **Step 2: Write a shape-only test (no live DynamoDB)**

Create `src/lib/server/__tests__/sealed-history.shape.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { snapshotsToHistoryPoints } from "../sealed-history";

describe("snapshotsToHistoryPoints", () => {
  it("returns ascending points with non-null bestPrice", () => {
    const result = snapshotsToHistoryPoints([
      { snapshotDate: "2025-01-15", bestPrice: 800 },
      { snapshotDate: "2024-07-15", bestPrice: 700 },
      { snapshotDate: "2024-12-15", bestPrice: null },
      { snapshotDate: "2025-04-15", bestPrice: 950 },
    ] as never);

    expect(result.map((p) => p.date)).toEqual([
      "2024-07-15",
      "2025-01-15",
      "2025-04-15",
    ]);
    expect(result.every((p) => typeof p.price === "number")).toBe(true);
  });

  it("returns empty array for empty input", () => {
    expect(snapshotsToHistoryPoints([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run src/lib/server/__tests__/sealed-history.shape.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement helper**

Create `src/lib/server/sealed-history.ts`:

```ts
import "server-only";
import { listStoredSealedPriceSnapshots, type StoredSealedPriceSnapshot } from "@/lib/db/sealed-pricing";

export interface PriceHistoryPoint {
  date: string;
  price: number;
}

export function snapshotsToHistoryPoints(
  snapshots: Pick<StoredSealedPriceSnapshot, "snapshotDate" | "bestPrice">[],
): PriceHistoryPoint[] {
  return snapshots
    .filter((s): s is { snapshotDate: string; bestPrice: number } =>
      typeof s.snapshotDate === "string" &&
      s.snapshotDate.length > 0 &&
      typeof s.bestPrice === "number",
    )
    .map((s) => ({ date: s.snapshotDate, price: s.bestPrice }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getSealedPriceHistory(
  pokedataId: string,
  monthsBack = 24,
): Promise<PriceHistoryPoint[]> {
  const snapshots = await listStoredSealedPriceSnapshots(pokedataId, {
    limit: monthsBack * 4,
    ascending: true,
  }).catch(() => []);
  return snapshotsToHistoryPoints(snapshots);
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run src/lib/server/__tests__/sealed-history.shape.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/sealed-history.ts src/lib/server/__tests__/sealed-history.shape.test.ts
git commit -m "feat(sealed): server helper to load 24mo price history per product

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Build reusable `ForecastChart` component (history + projection on one axis)

**Files:**
- Create: `src/components/sealed/forecast-chart.tsx`

Recharts `LineChart` with two series: one for history (`stroke="#6B7280"`, solid), one for projection (`stroke="#FFCB05"`, `strokeDasharray="6 4"`). Both share an X axis of ISO dates. Insert a vertical reference line at "today" using `<ReferenceLine>`.

- [ ] **Step 1: Implement the component**

Create `src/components/sealed/forecast-chart.tsx`:

```tsx
"use client";

import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { PriceHistoryPoint } from "@/lib/server/sealed-history";

export interface ForecastSeriesPoint {
  date: string;
  history?: number;
  projection?: number;
}

interface ForecastChartProps {
  history: PriceHistoryPoint[];
  projection: { date: string; value: number }[];
  todayIso: string;
}

function buildSeries(
  history: PriceHistoryPoint[],
  projection: { date: string; value: number }[],
): ForecastSeriesPoint[] {
  const map = new Map<string, ForecastSeriesPoint>();
  for (const h of history) {
    map.set(h.date, { date: h.date, history: h.price });
  }
  for (const p of projection) {
    const existing = map.get(p.date) ?? { date: p.date };
    map.set(p.date, { ...existing, projection: p.value });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: ${entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export function ForecastChart({ history, projection, todayIso }: ForecastChartProps) {
  const data = buildSeries(history, projection);
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 25%, 18%)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(215, 20%, 60%)" }} />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(215, 20%, 60%)" }}
            tickFormatter={(v: number) => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine x={todayIso} stroke="#9CA3AF" strokeDasharray="2 2" label={{ value: "Today", fontSize: 10, fill: "#9CA3AF" }} />
          <Line type="monotone" dataKey="history" name="Historical" stroke="#6B7280" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          <Line type="monotone" dataKey="projection" name="Projected" stroke="#FFCB05" strokeWidth={2.5} strokeDasharray="6 4" dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: 0 errors, build passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/sealed/forecast-chart.tsx
git commit -m "feat(sealed): ForecastChart component (history + dashed projection)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Build reusable `ProductForecastCard` (refactored card with explicit "View Forecast" CTA)

**Files:**
- Create: `src/components/sealed/product-forecast-card.tsx`

Don't modify `set-forecast-card.tsx` yet — keep it for the existing dashboard. The new card is leaner, investment-snapshot-styled, and links to `/sealed-forecast/[slug]`.

- [ ] **Step 1: Implement the card**

Create `src/components/sealed/product-forecast-card.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Forecast, SealedSetData } from "@/lib/types/sealed";
import { deriveRecommendation } from "@/lib/domain/recommendation";

interface ProductForecastCardProps {
  set: SealedSetData;
  forecast: Forecast;
}

function trendIcon(roi: number) {
  if (roi > 5) return <TrendingUp className="h-4 w-4 text-emerald-400" aria-hidden />;
  if (roi < -5) return <TrendingDown className="h-4 w-4 text-rose-400" aria-hidden />;
  return <Minus className="h-4 w-4 text-zinc-400" aria-hidden />;
}

function trendColor(roi: number) {
  if (roi > 5) return "text-emerald-400";
  if (roi < -5) return "text-rose-400";
  return "text-zinc-400";
}

const recommendationStyle: Record<string, string> = {
  Buy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Hold: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  Watch: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Avoid: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export function ProductForecastCard({ set, forecast }: ProductForecastCardProps) {
  const recommendation = deriveRecommendation({
    signal: forecast.signal,
    confidence: forecast.confidence,
    roiPercent: forecast.roiPercent,
    releaseYear: set.releaseYear,
  });

  const dollarGain = forecast.dollarGain;
  const roi = forecast.roiPercent;
  const community = set.factors.communityScore;

  return (
    <Link
      href={`/sealed-forecast/${set.id}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-all hover:border-[hsl(var(--poke-yellow))]/60 hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[hsl(var(--muted))]">
        {set.imageUrl ? (
          <Image src={set.imageUrl} alt={set.name} fill className="object-contain p-4 transition-transform group-hover:scale-105" sizes="(max-width: 768px) 50vw, 25vw" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">No image</div>
        )}
        <span className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${recommendationStyle[recommendation]}`}>
          {recommendation}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="text-sm font-semibold leading-tight line-clamp-2">{set.name}</h3>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{set.productType} · {set.releaseYear}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Now</p>
            <p className="font-semibold">${set.currentPrice.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">5y Projected</p>
            <p className="font-semibold">${forecast.projectedValue.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">ROI</p>
            <p className={`flex items-center gap-1 font-semibold ${trendColor(roi)}`}>
              {trendIcon(roi)}{roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Gain</p>
            <p className={`font-semibold ${trendColor(roi)}`}>{dollarGain >= 0 ? "+" : ""}${dollarGain.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
          <span>Confidence: <span className="text-[hsl(var(--foreground))] font-medium">{forecast.confidence}</span></span>
          {typeof community === "number" && <span>Community {community}/100</span>}
        </div>

        <span className="mt-1 inline-flex items-center justify-center rounded-md border border-[hsl(var(--poke-yellow))]/40 bg-[hsl(var(--poke-yellow))]/10 px-2 py-1 text-[11px] font-semibold text-[hsl(var(--poke-yellow))] transition-colors group-hover:bg-[hsl(var(--poke-yellow))]/20">
          View Forecast →
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: passes (note: build won't render the card since nothing imports it yet — that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/components/sealed/product-forecast-card.tsx
git commit -m "feat(sealed): ProductForecastCard investment-snapshot component

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Build reusable `ModelDetails` component

**Files:**
- Create: `src/components/sealed/model-details.tsx`

Pure presentational component — takes already-computed props. Source values from caller (forecast + set).

- [ ] **Step 1: Implement**

Create `src/components/sealed/model-details.tsx`:

```tsx
import type { Forecast, SealedSetData } from "@/lib/types/sealed";

interface ModelDetailsProps {
  set: SealedSetData;
  forecast: Forecast;
  modelVersion: string;
  lastUpdated: string;
  historicalDataPoints: number;
}

const KEY_DRIVERS = [
  "Historical price trend",
  "Volatility / prediction spread",
  "Age since release",
  "Print run / supply tier",
  "Community demand (Reddit + Google Trends + market activity)",
  "Chase-card expected value",
  "Set singles secondary value",
  "Comparable sealed products",
];

export function ModelDetails({ set, forecast, modelVersion, lastUpdated, historicalDataPoints }: ModelDetailsProps) {
  const rows: [string, string][] = [
    ["Model version", modelVersion],
    ["Last updated", lastUpdated],
    ["Historical data source", "PriceCharting (sealed) + community signals"],
    ["Historical data points", String(historicalDataPoints)],
    ["Forecast horizon", "5 years"],
    ["Confidence", forecast.confidence],
    ["Estimated factors", `${forecast.estimatedFactors} of model inputs were heuristic`],
    ["Prediction spread", `±${forecast.predictionSpreadPercent.toFixed(1)}%`],
    ["Set", set.name],
    ["Product type", set.productType],
    ["Release year", String(set.releaseYear)],
  ];

  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <h2 className="mb-3 text-lg font-semibold">Model Details</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-[hsl(var(--border))]/40 py-1">
            <dt className="text-[hsl(var(--muted-foreground))]">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <p className="mb-1 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">Key drivers</p>
        <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {KEY_DRIVERS.map((d) => <li key={d} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--poke-yellow))]" />{d}</li>)}
        </ul>
      </div>

      <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
        Forecasts are estimates, not financial advice. Pokémon sealed product prices are speculative and can be affected by reprints, market cycles, liquidity, and collector demand.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/sealed/model-details.tsx
git commit -m "feat(sealed): ModelDetails component with key drivers + disclaimer

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Build helper to project monthly prices for the chart

**Files:**
- Create: `src/lib/domain/projection-series.ts`
- Create: `src/lib/domain/__tests__/projection-series.test.ts`

We need an array of `{ date, value }` points starting at "today" → 5 years out, monthly. Use forecast `annualRate` and `currentPrice` as the seed.

- [ ] **Step 1: Write failing test**

Create `src/lib/domain/__tests__/projection-series.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildProjectionSeries } from "../projection-series";

describe("buildProjectionSeries", () => {
  it("starts at today and ends 60 months out", () => {
    const series = buildProjectionSeries({ currentPrice: 1000, annualRate: 0.10, todayIso: "2026-04-25" });
    expect(series.length).toBe(61);
    expect(series[0].date).toBe("2026-04-25");
    expect(series[0].value).toBe(1000);
    expect(series[60].value).toBeGreaterThan(1500);
    expect(series[60].value).toBeLessThan(1700);
  });

  it("respects negative annual rate", () => {
    const series = buildProjectionSeries({ currentPrice: 1000, annualRate: -0.05, todayIso: "2026-04-25" });
    expect(series[60].value).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/domain/__tests__/projection-series.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/domain/projection-series.ts`:

```ts
export interface ProjectionInput {
  currentPrice: number;
  annualRate: number;
  todayIso: string; // YYYY-MM-DD
  months?: number; // default 60
}

export interface ProjectionSeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export function buildProjectionSeries(input: ProjectionInput): ProjectionSeriesPoint[] {
  const months = input.months ?? 60;
  const monthlyRate = Math.pow(1 + input.annualRate, 1 / 12) - 1;

  const start = new Date(input.todayIso + "T00:00:00Z");
  const out: ProjectionSeriesPoint[] = [];
  for (let m = 0; m <= months; m++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + m);
    out.push({
      date: d.toISOString().slice(0, 10),
      value: Math.round(input.currentPrice * Math.pow(1 + monthlyRate, m)),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run src/lib/domain/__tests__/projection-series.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/projection-series.ts src/lib/domain/__tests__/projection-series.test.ts
git commit -m "feat(sealed): monthly projection series helper for forecast chart

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Create the dynamic `/sealed-forecast/[slug]` page

**Files:**
- Create: `src/app/sealed-forecast/[slug]/page.tsx`
- Create: `src/app/sealed-forecast/[slug]/not-found.tsx`

Server component. Loads set by slug from `SEALED_SETS`. Computes forecast, builds projection, fetches history, builds description, derives recommendation. Renders hero + chart + description + model details.

- [ ] **Step 1: Verify how the existing dashboard finds sets by id**

Run: `grep -rn "SEALED_SETS\|getSealedSet\|find.*set\." src/lib/data/sealed-sets.ts src/components/sealed/forecast-dashboard.tsx | head -10`
Expected: confirm there's a way to look up a set by `id`. If not, add a helper:

```ts
// In src/lib/data/sealed-sets.ts, append:
export function getSealedSetById(id: string): SealedSetData | undefined {
  return SEALED_SETS.find((s) => s.id === id);
}
```

(Only add if it doesn't already exist.)

- [ ] **Step 2: Create the not-found page**

Create `src/app/sealed-forecast/[slug]/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Product not found</h1>
      <p className="mb-6 text-[hsl(var(--muted-foreground))]">We couldn&apos;t find a sealed product with that slug.</p>
      <Link href="/sealed-forecast" className="text-[hsl(var(--poke-yellow))] underline">← Back to all forecasts</Link>
    </div>
  );
}
```

- [ ] **Step 3: Create the detail page**

Create `src/app/sealed-forecast/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SEALED_SETS, getSealedSetById } from "@/lib/data/sealed-sets";
import { computeForecast } from "@/lib/domain/sealed-forecast-ml";
import { deriveRecommendation } from "@/lib/domain/recommendation";
import { buildDescription } from "@/lib/domain/sealed-description";
import { buildProjectionSeries } from "@/lib/domain/projection-series";
import { getSealedPriceHistory } from "@/lib/server/sealed-history";
import { ForecastChart } from "@/components/sealed/forecast-chart";
import { ModelDetails } from "@/components/sealed/model-details";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return SEALED_SETS.map((s) => ({ slug: s.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const set = getSealedSetById(slug);
  if (!set) return { title: "Product not found — PokeFuture" };
  return {
    title: `${set.name} — Sealed Forecast — PokeFuture`,
    description: `5-year ML forecast, ROI, and recommendation for ${set.name} ${set.productType}.`,
  };
}

const recommendationStyle: Record<string, string> = {
  Buy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Hold: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  Watch: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Avoid: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export default async function SealedProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const set = getSealedSetById(slug);
  if (!set) notFound();

  const forecast = computeForecast(set);
  const recommendation = deriveRecommendation({
    signal: forecast.signal,
    confidence: forecast.confidence,
    roiPercent: forecast.roiPercent,
    releaseYear: set.releaseYear,
  });
  const description = buildDescription(set);
  const todayIso = new Date().toISOString().slice(0, 10);
  const projection = buildProjectionSeries({
    currentPrice: set.currentPrice,
    annualRate: forecast.annualRate,
    todayIso,
  }).map((p) => ({ date: p.date, value: p.value }));
  const history = set.pokedataId ? await getSealedPriceHistory(set.pokedataId, 24) : [];

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Link href="/sealed-forecast" className="mb-4 inline-block text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          ← All forecasts
        </Link>

        <header className="mb-6 grid gap-6 md:grid-cols-[260px_1fr]">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            {set.imageUrl ? (
              <Image src={set.imageUrl} alt={set.name} fill className="object-contain p-4" sizes="260px" priority />
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold md:text-3xl">{set.name}</h1>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${recommendationStyle[recommendation]}`}>{recommendation}</span>
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{set.productType} · {set.releaseYear} · Confidence: {forecast.confidence}</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Current" value={`$${set.currentPrice.toLocaleString()}`} />
              <Stat label="5y Projection" value={`$${forecast.projectedValue.toLocaleString()}`} />
              <Stat label="ROI" value={`${forecast.roiPercent >= 0 ? "+" : ""}${forecast.roiPercent.toFixed(1)}%`} accent={forecast.roiPercent} />
              <Stat label="Gain" value={`${forecast.dollarGain >= 0 ? "+" : ""}$${forecast.dollarGain.toLocaleString()}`} accent={forecast.dollarGain} />
            </div>

            {set.tcgplayerUrl && (
              <a href={set.tcgplayerUrl} target="_blank" rel="noopener" className="self-start rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs hover:border-[hsl(var(--poke-yellow))]/60">
                Buy on TCGplayer ↗
              </a>
            )}
          </div>
        </header>

        <section className="mb-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-3 text-lg font-semibold">Price history & 5-year projection</h2>
          {history.length < 3 && (
            <p className="mb-2 inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">Limited history available — chart shows projection-heavy view.</p>
          )}
          <ForecastChart history={history} projection={projection} todayIso={todayIso} />
        </section>

        <section className="mb-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-lg font-semibold">About this product</h2>
          <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]">{description.text}</p>
          {set.chaseCards?.length ? (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">Key chase cards</p>
              <ul className="flex flex-wrap gap-2 text-xs">
                {set.chaseCards.map((c) => <li key={c} className="rounded-full border border-[hsl(var(--border))] px-2 py-0.5">{c}</li>)}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="mb-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-lg font-semibold">Risk factors</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Reprint risk: {set.printRunLabel === "Limited" ? "Low" : set.printRunLabel === "Overprinted" ? "High" : "Moderate"}</li>
            <li>Liquidity tier: {set.factors.liquidityTier ?? "normal"}</li>
            <li>Set age: {new Date().getFullYear() - set.releaseYear} years (younger sets are more volatile)</li>
            <li>Prediction spread: ±{forecast.predictionSpreadPercent.toFixed(1)}% (wider = lower confidence)</li>
            {forecast.estimatedFactors > 2 && <li>{forecast.estimatedFactors} model inputs were heuristic estimates rather than measured values.</li>}
          </ul>
        </section>

        <ModelDetails
          set={set}
          forecast={forecast}
          modelVersion="sealed-forecast v1"
          lastUpdated={new Date().toISOString().slice(0, 10)}
          historicalDataPoints={history.length}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: number }) {
  const color = accent === undefined ? "" : accent > 0 ? "text-emerald-400" : accent < 0 ? "text-rose-400" : "text-zinc-400";
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]/40 p-2">
      <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className={`text-base font-semibold ${color}`}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Lint + build**

Run: `npm run lint && npm run build`
Expected: 0 errors, build succeeds. Inspect the route map output — `/sealed-forecast/[slug]` should appear with `(static)` since `generateStaticParams` is exhaustive.

- [ ] **Step 5: Commit**

```bash
git add src/app/sealed-forecast/\[slug\]/ src/lib/data/sealed-sets.ts
git commit -m "feat(sealed): /sealed-forecast/[slug] product detail page

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Wire `ProductForecastCard` into the listing — make card click navigate

**Files:**
- Modify: `src/components/sealed/forecast-dashboard.tsx` (only the card-rendering section)
- Optional modify: `src/components/sealed/set-forecast-card.tsx` (add a "Quick view" button so the modal still works)

The current dashboard renders `set-forecast-card.tsx` and opens a modal. We want the **card body** to navigate to `/sealed-forecast/[set.id]`, while preserving the modal as an explicit "Quick view" button so we don't lose that affordance.

- [ ] **Step 1: Find the rendering section**

Run: `grep -n "SetForecastCard\|set-forecast-card\|onClick" src/components/sealed/forecast-dashboard.tsx | head -20`
Expected: identify which JSX block renders the card and where the modal trigger lives.

- [ ] **Step 2: Replace `<SetForecastCard …/>` with `<ProductForecastCard …/>` in the listing grid**

Inline-edit `forecast-dashboard.tsx`. Import `ProductForecastCard` and swap. Keep all filter/sort logic untouched.

- [ ] **Step 3: Preserve the existing modal as an opt-in**

Inside `ProductForecastCard`'s parent (the dashboard), render a small "Quick view" button next to each card *outside* the link, e.g. by adding a sibling `<button>` that triggers the existing modal handler. (If the dashboard's modal trigger expects to be inside the card itself, refactor minimally so the modal can be opened from the dashboard level keyed by `set.id`.)

If the refactor is non-trivial, **drop the modal entirely** for this iteration — the detail page replaces it. Document this in the commit message.

- [ ] **Step 4: Lint + build**

Run: `npm run lint && npm run build`
Expected: 0 errors. Build succeeds. Visit (or `curl`) the `/sealed-forecast` page in dev to confirm the card visually renders.

- [ ] **Step 5: Smoke check the detail route in dev**

Run: `npm run dev` (background async) then `curl -s http://localhost:3000/sealed-forecast/pokemon-evolving-skies | head -50` to confirm 200 and HTML content. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/sealed/forecast-dashboard.tsx src/components/sealed/set-forecast-card.tsx
git commit -m "feat(sealed): wire ProductForecastCard into dashboard, link to detail page

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: Push, deploy, verify in production

**Files:**
- No edits.

- [ ] **Step 1: Push**

Run: `git push origin main`
Expected: success. Use targeted `git add` paths above — never `git add -A` from repo root, to avoid sweeping the untracked `.github/workflows/refresh-community-score.yml` (OAuth scope trap).

- [ ] **Step 2: Poll Amplify**

Run:
```bash
JOB=$(aws amplify list-jobs --app-id d16gvb6c6e6eir --branch-name main --region us-east-1 --max-items 1 --query 'jobSummaries[0].jobId' --output text | head -1)
while true; do
  S=$(aws amplify get-job --app-id d16gvb6c6e6eir --branch-name main --job-id "$JOB" --region us-east-1 --query 'job.summary.status' --output text)
  echo "$S"; [ "$S" = SUCCEED ] && break; [ "$S" = FAILED ] && exit 1; sleep 15
done
```
Expected: SUCCEED.

- [ ] **Step 3: Verify the listing page returns 200**

Run: `curl -sI https://main.d16gvb6c6e6eir.amplifyapp.com/sealed-forecast | head -3`
Expected: `HTTP/2 200`.

- [ ] **Step 4: Verify a detail page returns 200 and contains the product name**

Run: `curl -s https://main.d16gvb6c6e6eir.amplifyapp.com/sealed-forecast/pokemon-evolving-skies | grep -o "Evolving Skies" | head -1`
Expected: `Evolving Skies`.

- [ ] **Step 5: Verify the not-found page works**

Run: `curl -sI https://main.d16gvb6c6e6eir.amplifyapp.com/sealed-forecast/this-slug-does-not-exist | head -3`
Expected: `HTTP/2 404`.

- [ ] **Step 6: No commit — wrap-up**

Summarize: lint warnings delta, Amplify job ID, smoke tests passed, count of static-generated detail pages.
