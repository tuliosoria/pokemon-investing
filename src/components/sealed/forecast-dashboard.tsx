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
import { SkeletonForecastCard } from "./skeleton-forecast-card";

const SCROLL_BATCH = 6;
const MIN_LOADING_MS = 300;

interface SetWithForecast {
  set: SealedSetData;
  forecast: ReturnType<typeof computeForecast>;
}

/** Build a Google Trends search keyword from a product name */
function buildTrendKeyword(name: string): string {
  const cleaned = name
    .replace(/\b(Pokemon Center|Pokémon Center)\b/gi, "")
    .trim();
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

  // Search: accumulates results, only rendered once complete
  const [searchComplete, setSearchComplete] = useState(false);

  // Progressive scroll: how many cards to show for curated/top-buys
  const [visibleCount, setVisibleCount] = useState(SCROLL_BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Staggered reveal: controls fade-in animation
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Google Trends scores
  const [trendScores, setTrendScores] = useState<
    Map<string, { score: number; current: number; average: number; direction: string }>
  >(new Map());
  const trendFetchedRef = useRef<Set<string>>(new Set());

  const curatedForecasts = useMemo(
    () =>
      SEALED_SETS.map((set) => ({ set, forecast: computeForecast(set) })),
    []
  );

  const topBuys = useMemo(
    () => getTopBuyOpportunities(50),
    []
  );

  // Reset visible count when mode changes
  useEffect(() => {
    setVisibleCount(SCROLL_BATCH);
    setRevealedIds(new Set());
  }, [showingTopBuys, hasInteracted, filter, sortBy, sortDir]);

  // Live search — accumulate ALL results, then mark complete
  const searchApi = useCallback(async (query: string) => {
    if (query.length < 2) {
      setApiResults([]);
      setSearchError(null);
      setSearchComplete(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setSearchComplete(false);
    setApiResults([]);

    const startTime = Date.now();

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
        // Respect minimum loading time
        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_LOADING_MS) {
          await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed));
        }
        setApiResults([]);
        setIsSearching(false);
        setSearchComplete(true);
        return;
      }

      const BATCH_SIZE = 8;
      const results: SetWithForecast[] = [];
      const seenPokedataIds = new Set<string>();
      const usedCuratedIds = new Set<string>();

      const norm = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[''`]/g, "").replace(/&/g, "and").toLowerCase().trim();

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

      // Fetch ALL batches before rendering (no progressive UI updates)
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
              // Prefer search result image if pricing API didn't return one
              if (pricing && !pricing.imageUrl && p.imageUrl) {
                pricing.imageUrl = p.imageUrl;
              }
              return pricing;
            } catch {
              return null;
            }
          })
        );

        for (const pricing of batchPricings) {
          processPricing(pricing);
        }
      }

      // Ensure minimum loading display time
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed));
      }

      // All done — render everything at once
      setApiResults([...results]);
      setSearchComplete(true);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSearchError("Search failed. Try again.");
        setApiResults([]);
        setSearchComplete(true);
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Staggered reveal animation for search results
  useEffect(() => {
    if (!searchComplete || apiResults.length === 0) return;

    // Reveal cards one by one with 60ms stagger
    const ids = apiResults.map((r) => r.set.id);
    let i = 0;
    const timer = setInterval(() => {
      if (i >= ids.length) {
        clearInterval(timer);
        return;
      }
      setRevealedIds((prev) => new Set([...prev, ids[i]]));
      i++;
    }, 60);

    return () => clearInterval(timer);
  }, [searchComplete, apiResults]);

  // Fetch Google Trends
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

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length >= 2) {
        debounceRef.current = setTimeout(() => {
          setApiQuery(value.trim());
          setRevealedIds(new Set());
          searchApi(value.trim());
        }, 500);
      } else {
        setApiQuery("");
        setApiResults([]);
        setSearchError(null);
        setSearchComplete(false);
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
    if (showingTopBuys) {
      return applyTrends(topBuys);
    }

    if (!hasInteracted) {
      return [];
    }

    const hasApiSearch = apiQuery.length >= 2;

    if (hasApiSearch) {
      const q = search.toLowerCase();

      const matchingCurated = showCurated
        ? curatedForecasts.filter(
            (r) =>
              r.set.name.toLowerCase().includes(q) ||
              r.set.chaseCards.some((c) => c.toLowerCase().includes(q)) ||
              r.set.productType.toLowerCase().includes(q)
          )
        : [];

      const curatedIds = new Set(matchingCurated.map((r) => r.set.id));
      const apiDeduped = apiResults.filter(
        (r) => !curatedIds.has(r.set.id) && !r.set.id.startsWith("dynamic-") || r.set.id.startsWith("dynamic-")
      );

      return applyTrends([...matchingCurated, ...apiDeduped]);
    }

    return applyTrends(curatedForecasts);
  }, [curatedForecasts, apiResults, apiQuery, search, showCurated, applyTrends, hasInteracted, showingTopBuys, topBuys]);

  const filtered = useMemo(() => {
    let result = allSets;

    if (filter !== "All") {
      result = result.filter((r) => r.forecast.signal === filter);
    }

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

  // Determine mode: is this a search result view or a curated/list view?
  const isSearchMode = apiQuery.length >= 2;
  const isCuratedMode = !isSearchMode && (showingTopBuys || hasInteracted);

  // For curated mode: the items to display (paginated by scroll)
  const visibleFiltered = useMemo(() => {
    if (isSearchMode) return filtered; // search shows all at once
    return filtered.slice(0, visibleCount);
  }, [filtered, visibleCount, isSearchMode]);

  const hasMoreToLoad = isCuratedMode && visibleCount < filtered.length;

  // Intersection Observer for progressive scroll loading
  useEffect(() => {
    if (!isCuratedMode || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreToLoad) {
          // Simulate a brief load delay for smooth UX
          setTimeout(() => {
            setVisibleCount((prev) => prev + SCROLL_BATCH);
          }, 200);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isCuratedMode, hasMoreToLoad]);

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
      {hasInteracted && !isSearching && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Showing {visibleFiltered.length}{isCuratedMode && filtered.length > visibleFiltered.length ? ` of ${filtered.length}` : ""} {showingTopBuys ? "top buy opportunities" : apiQuery.length >= 2 ? "results" : `of ${totalSets} sets`}
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
                <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(var(--poke-yellow))" strokeWidth="3" opacity="0.3" />
                <path d="M 4 50 A 46 46 0 0 1 96 50" fill="hsl(var(--poke-red))" opacity="0.15" />
                <path d="M 4 50 A 46 46 0 0 0 96 50" fill="hsl(var(--border))" opacity="0.1" />
                <line x1="4" y1="50" x2="96" y2="50" stroke="hsl(var(--poke-yellow))" strokeWidth="2.5" opacity="0.25" />
                <circle cx="50" cy="50" r="12" fill="none" stroke="hsl(var(--poke-yellow))" strokeWidth="2.5" opacity="0.4" />
                <circle cx="50" cy="50" r="6" fill="hsl(var(--poke-yellow))" opacity="0.3" />
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

      {/* Skeleton loading state — search in progress, no results yet */}
      {isSearching && !searchComplete && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))] animate-pulse">
              Fetching pricing data for &quot;{apiQuery}&quot;…
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonForecastCard key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Search results — all at once with staggered fade-in */}
      {isSearchMode && searchComplete && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
          {filtered.map(({ set, forecast }) => (
            <div
              key={set.id}
              className={`transition-all duration-300 ${
                revealedIds.has(set.id)
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
            >
              <SetForecastCard set={set} forecast={forecast} />
            </div>
          ))}
        </div>
      )}

      {/* Curated / Top Buys — progressive scroll loading */}
      {isCuratedMode && !isSearchMode && visibleFiltered.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
            {visibleFiltered.map(({ set, forecast }, index) => (
              <div
                key={set.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${(index % SCROLL_BATCH) * 60}ms` }}
              >
                <SetForecastCard set={set} forecast={forecast} />
              </div>
            ))}
          </div>

          {/* Scroll sentinel + loading indicator */}
          {hasMoreToLoad && (
            <div ref={sentinelRef} className="flex justify-center py-6">
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--poke-yellow))] animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--poke-yellow))] animate-pulse" style={{ animationDelay: "0.2s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--poke-yellow))] animate-pulse" style={{ animationDelay: "0.4s" }} />
                </div>
                Loading more…
              </div>
            </div>
          )}

          {/* End of list */}
          {!hasMoreToLoad && filtered.length > SCROLL_BATCH && (
            <p className="text-center text-xs text-[hsl(var(--muted-foreground))]/50 py-4">
              You&apos;ve reached the end · {filtered.length} products shown
            </p>
          )}
        </>
      )}

      {/* No results (search complete, nothing found) */}
      {hasInteracted && !isSearching && filtered.length === 0 && searchComplete && isSearchMode && (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <p className="text-lg font-semibold mb-1">No sealed products found</p>
          <p className="text-sm">
            Try a different search term — e.g. &quot;Celebrations&quot;, &quot;Shining Fates&quot;, &quot;Booster Box&quot;
          </p>
        </div>
      )}

      {/* No results (curated mode, filters active) */}
      {hasInteracted && !isSearching && filtered.length === 0 && !isSearchMode && (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <p className="text-lg font-semibold mb-1">No sets match your filters</p>
          <p className="text-sm">Try adjusting your search or filter criteria.</p>
        </div>
      )}

      {/* Search error state */}
      {searchError && !isSearching && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-3">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm text-red-400 font-medium mb-1">Search failed</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => searchApi(apiQuery)}
            className="mt-3 text-xs text-[hsl(var(--poke-yellow))] hover:underline"
          >
            Retry search
          </button>
        </div>
      )}

      {/* Methodology note — visually separated from card grid */}
      <div className="mt-12 pt-8 border-t border-[hsl(var(--border))]">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-5 text-xs text-[hsl(var(--muted-foreground))] space-y-2">
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
    </div>
  );
}
