"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { SEALED_SETS } from "@/lib/data/sealed-sets";
import { computeForecast } from "@/lib/domain/sealed-forecast";
import { buildDynamicSetData, inferProductType } from "@/lib/domain/sealed-estimate";
import { getTopBuyOpportunities } from "@/lib/domain/top-buys";
import type {
  SortField,
  FilterSignal,
  SealedSetData,
  SealedSearchResult,
  SealedPricing,
} from "@/lib/types/sealed";
import { SetForecastCard } from "./set-forecast-card";

interface SetWithForecast {
  set: SealedSetData;
  forecast: ReturnType<typeof computeForecast>;
}

/** Build a Google Trends search keyword from a product name */
function buildTrendKeyword(name: string): string {
  // Strip common suffixes that dilute the search
  const cleaned = name
    .replace(/\b(Pokemon Center|Pokémon Center)\b/gi, "")
    .trim();
  // Prepend "Pokemon" if not already present
  if (!/pokemon|pokémon/i.test(cleaned)) {
    return `Pokemon ${cleaned}`;
  }
  return cleaned;
}

export function ForecastDashboard() {
  const [sortBy, setSortBy] = useState<SortField>("roi");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<FilterSignal>("All");
  const [search, setSearch] = useState("");
  const [apiQuery, setApiQuery] = useState("");
  const [apiResults, setApiResults] = useState<SetWithForecast[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showCurated, setShowCurated] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showingTopBuys, setShowingTopBuys] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Google Trends scores: maps set ID → popularity score
  const [trendScores, setTrendScores] = useState<
    Map<string, { score: number; current: number; average: number; direction: string }>
  >(new Map());
  const trendFetchedRef = useRef<Set<string>>(new Set());

  const curatedForecasts = useMemo(
    () =>
      SEALED_SETS.map((set) => ({ set, forecast: computeForecast(set) })),
    []
  );

  // Top buy opportunities (pre-computed, no API call needed)
  const topBuys = useMemo(
    () => getTopBuyOpportunities(15),
    []
  );

  // Live search against PokeData API
  const searchApi = useCallback(async (query: string) => {
    if (query.length < 2) {
      setApiResults([]);
      setSearchError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);

    try {
      const searchRes = await fetch(
        `/api/sealed/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal }
      );
      if (!searchRes.ok) throw new Error("Search failed");
      const { products } = (await searchRes.json()) as {
        products: SealedSearchResult[];
      };

      if (!products || products.length === 0) {
        setApiResults([]);
        setIsSearching(false);
        return;
      }

      // Fetch pricing for ALL results in batches, updating UI progressively
      const BATCH_SIZE = 8;
      const results: SetWithForecast[] = [];
      const seenPokedataIds = new Set<string>();
      const usedCuratedIds = new Set<string>();

      // Normalize for comparison: strip diacritics, punctuation, lowercase
      const norm = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[''`]/g, "").replace(/&/g, "and").toLowerCase().trim();

      // Variant keywords that prevent curated matching (Costco bundles, cases, etc.)
      const VARIANT_WORDS = ["costco", "walmart", "target", "pokemon center", "display"];

      const processPricing = (pricing: SealedPricing | null) => {
        if (!pricing) return;
        if (seenPokedataIds.has(pricing.pokedataId)) return;
        seenPokedataIds.add(pricing.pokedataId);

        const pricingProductType = inferProductType(pricing.name);
        const pricingNorm = norm(pricing.name);
        const isVariant = VARIANT_WORDS.some((v) => pricingNorm.includes(v));

        const curatedMatch = !isVariant
          ? SEALED_SETS.find(
              (s) =>
                !usedCuratedIds.has(s.id) &&
                s.productType === pricingProductType &&
                pricingNorm.includes(norm(s.name))
            )
          : undefined;

        if (curatedMatch) {
          usedCuratedIds.add(curatedMatch.id);
          const updated = {
            ...curatedMatch,
            currentPrice: pricing.bestPrice ?? curatedMatch.currentPrice,
            pokedataId: pricing.pokedataId,
            imageUrl: pricing.imageUrl ?? curatedMatch.imageUrl,
          };
          results.push({ set: updated, forecast: computeForecast(updated) });
        } else {
          const dynamicSet = buildDynamicSetData(pricing);
          results.push({ set: dynamicSet, forecast: computeForecast(dynamicSet) });
        }
      };

      // Process in batches to avoid overwhelming the API while showing results fast
      for (let i = 0; i < products.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) break;

        const batch = products.slice(i, i + BATCH_SIZE);
        const batchPricings = await Promise.all(
          batch.map(async (p) => {
            try {
              const res = await fetch(
                `/api/sealed/pricing?id=${p.pokedataId}`,
                { signal: controller.signal }
              );
              if (!res.ok) {
                // Pricing unavailable — build a stub from search result metadata
                return {
                  pokedataId: p.pokedataId,
                  name: p.name,
                  releaseDate: p.releaseDate,
                  imageUrl: p.imageUrl ?? null,
                  tcgplayerPrice: null,
                  ebayPrice: null,
                  pokedataPrice: null,
                  bestPrice: null,
                } as SealedPricing;
              }
              const { pricing } = (await res.json()) as { pricing: SealedPricing };
              return pricing;
            } catch {
              return null;
            }
          })
        );

        for (const pricing of batchPricings) {
          processPricing(pricing);
        }

        // Update UI after each batch so results appear progressively
        setApiResults([...results]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSearchError("Search failed. Try again.");
        setApiResults([]);
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Fetch Google Trends data for a batch of sets (sequential with delay to avoid rate limits)
  const fetchTrends = useCallback(async (sets: SetWithForecast[]) => {
    const toFetch = sets.filter((s) => !trendFetchedRef.current.has(s.set.id));
    if (toFetch.length === 0) return;

    for (const { set } of toFetch) {
      if (trendFetchedRef.current.has(set.id)) continue;
      trendFetchedRef.current.add(set.id);

      const keyword = buildTrendKeyword(set.name);
      try {
        const res = await fetch(
          `/api/trends?keyword=${encodeURIComponent(keyword)}`
        );
        if (!res.ok) continue;
        const { trend } = await res.json();
        if (trend && typeof trend.popularityScore === "number") {
          setTrendScores((prev) => {
            const next = new Map(prev);
            next.set(set.id, {
              score: trend.popularityScore,
              current: trend.current,
              average: trend.average,
              direction: trend.trendDirection,
            });
            return next;
          });
        }
      } catch {
        // Trend fetch is best-effort
      }
      // Small delay between requests to avoid Google rate limiting
      await new Promise((r) => setTimeout(r, 300));
    }
  }, []);

  // Debounced search trigger
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (value.trim().length > 0) {
        setHasInteracted(true);
        setShowingTopBuys(false);
      }

      // For local filtering, apply immediately
      // For API search, debounce
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length >= 2) {
        debounceRef.current = setTimeout(() => {
          setApiQuery(value.trim());
          searchApi(value.trim());
        }, 500);
      } else {
        setApiQuery("");
        setApiResults([]);
        setSearchError(null);
      }
    },
    [searchApi]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Fetch Google Trends for curated sets on initial load
  useEffect(() => {
    fetchTrends(curatedForecasts);
  }, [curatedForecasts, fetchTrends]);

  // Fetch Google Trends for API results when they change
  useEffect(() => {
    if (apiResults.length > 0) {
      fetchTrends(apiResults);
    }
  }, [apiResults, fetchTrends]);

  // Apply trend scores to sets and recompute forecasts
  const applyTrends = useCallback(
    (items: SetWithForecast[]): SetWithForecast[] => {
      if (trendScores.size === 0) return items;

      return items.map((item) => {
        const trend = trendScores.get(item.set.id);
        if (!trend) return item;

        // For dynamic products: replace neutral popularity with trend score
        // For curated products: blend hand-tuned (60%) with trend (40%)
        const newPopularity =
          item.set.curated === false
            ? trend.score
            : Math.round(item.set.factors.popularity * 0.6 + trend.score * 0.4);

        const updatedSet: SealedSetData = {
          ...item.set,
          factors: { ...item.set.factors, popularity: newPopularity },
          trendData: {
            current: trend.current,
            average: trend.average,
            direction: trend.direction as "rising" | "stable" | "declining",
          },
        };

        return { set: updatedSet, forecast: computeForecast(updatedSet) };
      });
    },
    [trendScores]
  );

   // Combine curated + API results
  const allSets = useMemo(() => {
    // Top Buys mode: show pre-computed top buy opportunities
    if (showingTopBuys) {
      return applyTrends(topBuys);
    }

    // Not yet interacted: return empty so the empty state shows
    if (!hasInteracted) {
      return [];
    }

    const hasApiSearch = apiQuery.length >= 2;

    // If searching, show API results + matching curated
    if (hasApiSearch) {
      const q = search.toLowerCase();

      // Matching curated sets (local filter)
      const matchingCurated = showCurated
        ? curatedForecasts.filter(
            (r) =>
              r.set.name.toLowerCase().includes(q) ||
              r.set.chaseCards.some((c) => c.toLowerCase().includes(q)) ||
              r.set.productType.toLowerCase().includes(q)
          )
        : [];

      // Deduplicate: API results override matching curated
      const curatedIds = new Set(matchingCurated.map((r) => r.set.id));
      const apiDeduped = apiResults.filter(
        (r) => !curatedIds.has(r.set.id) && !r.set.id.startsWith("dynamic-") || r.set.id.startsWith("dynamic-")
      );

      return applyTrends([...matchingCurated, ...apiDeduped]);
    }

    // No search: show all curated
    return applyTrends(curatedForecasts);
  }, [curatedForecasts, apiResults, apiQuery, search, showCurated, applyTrends, hasInteracted, showingTopBuys, topBuys]);

  const filtered = useMemo(() => {
    let result = allSets;

    // Signal filter
    if (filter !== "All") {
      result = result.filter((r) => r.forecast.signal === filter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "roi":
          cmp = a.forecast.roiPercent - b.forecast.roiPercent;
          break;
        case "price":
          cmp = a.set.currentPrice - b.set.currentPrice;
          break;
        case "signal": {
          const order = { Buy: 3, Hold: 2, Sell: 1 };
          cmp = order[a.forecast.signal] - order[b.forecast.signal];
          break;
        }
        case "age":
          cmp = a.set.releaseYear - b.set.releaseYear;
          break;
        case "score":
          cmp = a.forecast.compositeScore - b.forecast.compositeScore;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [allSets, filter, sortBy, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  const totalSets = apiQuery.length >= 2
    ? filtered.length
    : SEALED_SETS.length;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search any sealed product… (e.g. Evolving Skies, ETB, Celebrations)"
            className="w-full h-10 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 rounded-full border-2 border-[hsl(var(--poke-yellow))] border-t-transparent animate-spin" />
            </div>
          )}
        </div>

        {/* Signal filter */}
        <div className="flex rounded-md border border-[hsl(var(--input))] overflow-hidden text-xs">
          {(["All", "Buy", "Hold", "Sell"] as FilterSignal[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setFilter(s);
                if (!hasInteracted) {
                  setHasInteracted(true);
                  setShowingTopBuys(false);
                }
              }}
              className={`px-3 py-2 font-medium transition-colors ${
                filter === s
                  ? s === "Buy"
                    ? "bg-green-500/20 text-green-400"
                    : s === "Hold"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : s === "Sell"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="text-[hsl(var(--muted-foreground))] py-1">Sort by:</span>
        {(
          [
            ["roi", "Projected ROI"],
            ["price", "Current Price"],
            ["signal", "Recommendation"],
            ["age", "Set Age"],
            ["score", "Composite Score"],
          ] as [SortField, string][]
        ).map(([field, label]) => (
          <button
            key={field}
            type="button"
            onClick={() => toggleSort(field)}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              sortBy === field
                ? "bg-[hsl(var(--poke-yellow))] text-[hsl(var(--poke-blue))]"
                : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            {label}
            {sortBy === field && (
              <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>
            )}
          </button>
        ))}

        {/* Toggle curated when searching */}
        {apiQuery.length >= 2 && (
          <button
            type="button"
            onClick={() => setShowCurated((v) => !v)}
            className={`rounded-full px-3 py-1 font-medium transition-colors ml-auto ${
              showCurated
                ? "bg-[hsl(var(--poke-yellow))]/20 text-[hsl(var(--poke-yellow))]"
                : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
            }`}
          >
            {showCurated ? "★ Curated included" : "★ Show curated"}
          </button>
        )}
      </div>

      {/* Results count */}
      {hasInteracted && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Showing {filtered.length} {showingTopBuys ? "top buy opportunities" : apiQuery.length >= 2 ? "results" : `of ${totalSets} sets`}
            {apiQuery.length >= 2 && apiResults.length > 0 && (
              <span className="ml-1">
                ({apiResults.filter((r) => !r.set.curated).length} from PokeData)
              </span>
            )}
          </p>
          {showingTopBuys && (
            <button
              type="button"
              onClick={() => {
                setShowingTopBuys(false);
                setHasInteracted(false);
                setFilter("All");
              }}
              className="text-xs text-[hsl(var(--poke-yellow))] hover:underline"
            >
              ← Back
            </button>
          )}
          {isSearching && apiResults.length > 0 && (
            <p className="text-xs text-[hsl(var(--poke-yellow))] animate-pulse">
              Loading more products…
            </p>
          )}
          {searchError && (
            <p className="text-xs text-red-400">{searchError}</p>
          )}
        </div>
      )}

      {/* Empty state — shown before any interaction */}
      {!hasInteracted && !showingTopBuys && (
        <div className="flex items-center justify-center py-16 animate-fade-in-up">
          <div className="text-center max-w-lg px-6">
            {/* Pokéball + magnifying glass icon */}
            <div className="relative mx-auto mb-6 w-24 h-24">
              <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg" aria-hidden="true">
                {/* Pokéball body */}
                <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(var(--poke-yellow))" strokeWidth="3" opacity="0.3" />
                <path d="M 4 50 A 46 46 0 0 1 96 50" fill="hsl(var(--poke-red))" opacity="0.15" />
                <path d="M 4 50 A 46 46 0 0 0 96 50" fill="hsl(var(--border))" opacity="0.1" />
                <line x1="4" y1="50" x2="96" y2="50" stroke="hsl(var(--poke-yellow))" strokeWidth="2.5" opacity="0.25" />
                <circle cx="50" cy="50" r="12" fill="none" stroke="hsl(var(--poke-yellow))" strokeWidth="2.5" opacity="0.4" />
                <circle cx="50" cy="50" r="6" fill="hsl(var(--poke-yellow))" opacity="0.3" />
                {/* Magnifying glass */}
                <circle cx="62" cy="38" r="14" fill="none" stroke="hsl(var(--poke-yellow))" strokeWidth="3" opacity="0.7" />
                <line x1="72" y1="48" x2="84" y2="60" stroke="hsl(var(--poke-yellow))" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
              </svg>
            </div>

            <h3 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-2">
              Discover What&apos;s Worth Buying
            </h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6 leading-relaxed">
              Search for any sealed Pokémon product by name or set — like{" "}
              <span className="text-[hsl(var(--poke-yellow))] font-medium">&quot;Prismatic Evolutions&quot;</span>,{" "}
              <span className="text-[hsl(var(--poke-yellow))] font-medium">&quot;Evolving Skies ETB&quot;</span>, or{" "}
              <span className="text-[hsl(var(--poke-yellow))] font-medium">&quot;Booster Box&quot;</span>
              . Or jump straight to our highest-rated investment picks.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => searchInputRef.current?.focus()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] text-sm font-medium hover:bg-[hsl(var(--muted))]/80 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                </svg>
                Start Searching
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowingTopBuys(true);
                  setHasInteracted(true);
                  setSortBy("score");
                  setSortDir("desc");
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500/15 text-green-400 text-sm font-medium hover:bg-green-500/25 border border-green-500/30 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Show Top Buys
              </button>
            </div>

            <p className="text-[11px] text-[hsl(var(--muted-foreground))]/60 mt-6">
              Powered by live PokeData pricing &amp; 8-factor composite scoring
            </p>
          </div>
        </div>
      )}

      {/* Cards grid */}
      {(hasInteracted || showingTopBuys) && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(({ set, forecast }) => (
            <SetForecastCard key={set.id} set={set} forecast={forecast} />
          ))}
        </div>
      )}

      {hasInteracted && filtered.length === 0 && !isSearching && (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <p className="text-lg font-semibold mb-1">
            {apiQuery.length >= 2
              ? "No sealed products found"
              : "No sets match your filters"}
          </p>
          <p className="text-sm">
            {apiQuery.length >= 2
              ? "Try a different search term — e.g. \"Celebrations\", \"Shining Fates\", \"Booster Box\""
              : "Try adjusting your search or filter criteria."}
          </p>
        </div>
      )}

      {isSearching && filtered.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 rounded-full border-3 border-[hsl(var(--poke-yellow))] border-t-transparent animate-spin mb-3" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Searching PokeData for &quot;{apiQuery}&quot;…
          </p>
        </div>
      )}

      {/* Methodology note */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-xs text-[hsl(var(--muted-foreground))] space-y-2">
        <h4 className="font-bold text-sm text-[hsl(var(--foreground))]">
          📊 Methodology
        </h4>
        <p>
          <strong className="text-[hsl(var(--foreground))]">★ Curated sets</strong> are
          scored across 8 hand-tuned weighted factors (market value, chase cards,
          supply scarcity, set age, price trajectory, popularity, market cycle, and
          collector demand ratio). All prices are live from PokeData.io.
        </p>
        <p>
          <strong className="text-[hsl(var(--foreground))]">📈 Google Trends</strong> data
          is fetched live for all sets to power the Popularity factor. For curated sets,
          trends are blended with hand-tuned scores. For dynamic products, Google Trends
          replaces the neutral default — giving real demand signal.
        </p>
        <p>
          <strong className="text-[hsl(var(--foreground))]">Search results</strong> from
          PokeData use live pricing with auto-estimated factors (set age, price
          trajectory, market value, popularity via Google Trends). Chase card index, print
          run, market cycle, and demand ratio default to neutral (50) — these forecasts
          are screening estimates, not full analyses. Look for the
          <span className="inline-block mx-1 rounded-full bg-orange-500/20 text-orange-400 px-1.5 py-0.5 text-[9px] font-semibold">
            Estimated
          </span>
          badge.
        </p>
        <p>
          S&amp;P 500 comparison uses a historical average annualized return of 10.5%.
          All projections are estimates — not financial advice.
        </p>
      </div>
    </div>
  );
}
