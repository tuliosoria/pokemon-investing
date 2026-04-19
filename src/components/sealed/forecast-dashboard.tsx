"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { SEALED_SETS } from "@/lib/data/sealed-sets";
import { computeForecast } from "@/lib/domain/sealed-forecast";
import { buildDynamicSetData } from "@/lib/domain/sealed-estimate";
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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);

  const curatedForecasts = useMemo(
    () =>
      SEALED_SETS.map((set) => ({ set, forecast: computeForecast(set) })),
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

      // Fetch pricing for top 12 results in parallel
      const top = products.slice(0, 12);
      const pricingPromises = top.map(async (p) => {
        try {
          const res = await fetch(
            `/api/sealed/pricing?id=${p.pokedataId}`,
            { signal: controller.signal }
          );
          if (!res.ok) return null;
          const { pricing } = (await res.json()) as { pricing: SealedPricing };
          return pricing;
        } catch {
          return null;
        }
      });

      const pricings = await Promise.all(pricingPromises);

      // Build SealedSetData from each pricing result
      const results: SetWithForecast[] = [];
      for (const pricing of pricings) {
        if (!pricing || !pricing.bestPrice || pricing.bestPrice <= 0) continue;

        // Check if this product matches a curated set (by name similarity)
        const curatedMatch = SEALED_SETS.find(
          (s) =>
            s.name.toLowerCase() === pricing.name.toLowerCase() ||
            pricing.name.toLowerCase().includes(s.name.toLowerCase())
        );

        if (curatedMatch) {
          // Use curated data but update price from API
          const updated = {
            ...curatedMatch,
            currentPrice: pricing.bestPrice,
            pokedataId: pricing.pokedataId,
          };
          results.push({ set: updated, forecast: computeForecast(updated) });
        } else {
          const dynamicSet = buildDynamicSetData(pricing);
          results.push({
            set: dynamicSet,
            forecast: computeForecast(dynamicSet),
          });
        }
      }

      setApiResults(results);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSearchError("Search failed. Try again.");
        setApiResults([]);
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search trigger
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);

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

  // Combine curated + API results
  const allSets = useMemo(() => {
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

      return [...matchingCurated, ...apiDeduped];
    }

    // No search: show all curated
    return curatedForecasts;
  }, [curatedForecasts, apiResults, apiQuery, search, showCurated]);

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
              onClick={() => setFilter(s)}
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
      <div className="flex items-center gap-3">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Showing {filtered.length} {apiQuery.length >= 2 ? "results" : `of ${totalSets} sets`}
          {apiQuery.length >= 2 && apiResults.length > 0 && (
            <span className="ml-1">
              ({apiResults.filter((r) => r.set.curated !== true && r.set.curated !== undefined).length} from PokeData)
            </span>
          )}
        </p>
        {searchError && (
          <p className="text-xs text-red-400">{searchError}</p>
        )}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map(({ set, forecast }) => (
          <SetForecastCard key={set.id} set={set} forecast={forecast} />
        ))}
      </div>

      {filtered.length === 0 && !isSearching && (
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
          <strong className="text-[hsl(var(--foreground))]">Search results</strong> from
          PokeData use live pricing with auto-estimated factors (set age, price
          trajectory, market value). Chase card index, print run, popularity, market
          cycle, and demand ratio default to neutral (50) — these forecasts are
          screening estimates, not full analyses. Look for the
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
