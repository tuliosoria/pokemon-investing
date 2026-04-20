"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { SEALED_SETS } from "@/lib/data/sealed-sets";
import { buildDynamicSetData, inferProductType } from "@/lib/domain/sealed-estimate";
import type {
  Forecast,
  SortField,
  FilterSignal,
  SealedSetData,
  SealedSearchResult,
  SealedPricing,
} from "@/lib/types/sealed";
import { SetForecastCard } from "./set-forecast-card";
import { SkeletonForecastCard } from "./skeleton-forecast-card";
import { useSealedTcgplayerUrl } from "./use-sealed-tcgplayer-url";

const SCROLL_BATCH = 6;
const MIN_LOADING_MS = 400;
const SEARCH_TIMEOUT_MS = 8000;
const IMAGE_PRELOAD_TIMEOUT_MS = 2000;
const SEARCH_ANIMATION_STAGGER_MS = 50;
const TOP_BUYS_LIMIT = 100;

interface SetWithForecast {
  set: SealedSetData;
  forecast: Forecast;
}

interface SearchUnavailableCardData {
  id: string;
  name: string;
  productType: string;
  releaseYear: number | null;
  imageUrl: string | null;
  tcgplayerUrl?: string | null;
}

interface TopBuyApiOpportunity {
  set: SealedSetData;
  forecast: Forecast;
}

interface TrendSnapshot {
  score: number;
  current: number;
  average: number;
  direction: "rising" | "stable" | "declining";
}

type ImagePreloadStatus = "loaded" | "timeout" | "error";

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

function parseReleaseYear(releaseDate: string | null): number | null {
  if (!releaseDate) return null;
  const yearFromSlice = parseInt(releaseDate.substring(0, 4), 10);
  if (!Number.isNaN(yearFromSlice)) return yearFromSlice;

  const parsed = new Date(releaseDate).getFullYear();
  return Number.isNaN(parsed) ? null : parsed;
}

function applyTrendToSet(
  set: SealedSetData,
  trend: TrendSnapshot
): SealedSetData {
  const newPopularity =
    set.curated === false
      ? trend.score
      : Math.round(set.factors.popularity * 0.6 + trend.score * 0.4);

  return {
    ...set,
    factors: { ...set.factors, popularity: newPopularity },
    trendData: {
      current: trend.current,
      average: trend.average,
      direction: trend.direction,
    },
  };
}

async function requestForecasts(
  sets: SealedSetData[],
  signal?: AbortSignal,
  lookupSource?: "search"
): Promise<SetWithForecast[]> {
  if (sets.length === 0) {
    return [];
  }

  const res = await fetch("/api/sealed/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sets, lookupSource }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Forecast request failed with HTTP ${res.status}`);
  }

  const data = (await res.json()) as { results?: SetWithForecast[] };
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchTrendSnapshots(
  sets: SealedSetData[],
  signal?: AbortSignal
): Promise<Map<string, TrendSnapshot>> {
  const uniqueSets = [...new Map(sets.map((set) => [set.id, set])).values()];
  const settled = await Promise.allSettled(
    uniqueSets.map(async (set) => {
      const res = await fetch(
        `/api/trends?keyword=${encodeURIComponent(buildTrendKeyword(set.name))}`,
        { signal }
      );
      if (!res.ok) {
        return null;
      }

      const { trend } = await res.json();
      if (!trend || typeof trend.popularityScore !== "number") {
        return null;
      }

      return {
        id: set.id,
        trend: {
          score: trend.popularityScore,
          current: trend.current,
          average: trend.average,
          direction: trend.trendDirection as TrendSnapshot["direction"],
        },
      };
    })
  );

  const trendMap = new Map<string, TrendSnapshot>();
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      trendMap.set(result.value.id, result.value.trend);
    }
  }

  return trendMap;
}

async function preloadImage(url: string): Promise<ImagePreloadStatus> {
  return new Promise((resolve) => {
    const image = new window.Image();
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve("timeout");
    }, IMAGE_PRELOAD_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
    };

    image.onload = () => {
      cleanup();
      resolve("loaded");
    };

    image.onerror = () => {
      cleanup();
      resolve("error");
    };

    image.src = url;
  });
}

async function preloadImages(urls: string[]): Promise<Map<string, ImagePreloadStatus>> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  const settled = await Promise.allSettled(
    uniqueUrls.map(async (url) => ({
      url,
      status: await preloadImage(url),
    }))
  );

  const statuses = new Map<string, ImagePreloadStatus>();
  for (const result of settled) {
    if (result.status === "fulfilled") {
      statuses.set(result.value.url, result.value.status);
    }
  }

  return statuses;
}

function SearchUnavailableCard({
  card,
}: {
  card: SearchUnavailableCardData;
}) {
  const { tcgplayerUrl, isLoading: isLoadingTcgplayerUrl } = useSealedTcgplayerUrl({
    name: card.name,
    productType: card.productType,
    initialUrl: card.tcgplayerUrl,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
      <div className="relative h-[200px] flex-shrink-0 overflow-hidden bg-[#101827]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#334155_0%,#0f172a_72%)]" />
        {card.imageUrl && (
          <>
            <img
              key={card.imageUrl}
              src={card.imageUrl}
              alt={card.name}
              className="absolute inset-0 h-full w-full object-cover grayscale opacity-30 transition-opacity duration-300"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.style.opacity = "0";
              }}
            />
            <div className="absolute inset-0 bg-slate-950/55" />
          </>
        )}

        <div className="absolute left-4 top-4 rounded-full border border-slate-500/50 bg-slate-700/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-100">
          Data unavailable
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300/75">
            {card.productType}
            {card.releaseYear && (
              <>
                <span className="mx-2 text-slate-400/40">|</span>
                {card.releaseYear}
              </>
            )}
          </p>
          <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-tight text-white">
            {card.name}
          </h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-relaxed text-slate-300">
            Pricing or image data could not be loaded in time for this product.
            Try the search again to retry the live lookup.
          </div>

          {tcgplayerUrl ? (
            <a
              href={tcgplayerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--poke-yellow))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--poke-blue))] transition hover:brightness-105"
            >
              Buy on TCGPlayer
              <span aria-hidden="true">↗</span>
            </a>
          ) : isLoadingTcgplayerUrl ? (
            <p className="text-center text-[11px] text-slate-400/80">
              Finding TCGPlayer listing…
            </p>
          ) : null}
        </div>

        <div className="mt-auto pt-5 text-xs text-slate-400/80">
          Rendered as a fixed-height fallback card to keep the results grid stable.
        </div>
      </div>

      <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4 text-xs font-medium uppercase tracking-[0.14em] text-slate-300/70">
        Search result fallback
      </div>
    </div>
  );
}

export function ForecastDashboard() {
  const [sortBy, setSortBy] = useState<SortField>("roi");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<FilterSignal>("All");
  const [search, setSearch] = useState("");
  const [apiQuery, setApiQuery] = useState("");
  const [apiResults, setApiResults] = useState<SetWithForecast[]>([]);
  const [searchCuratedResults, setSearchCuratedResults] = useState<SetWithForecast[]>([]);
  const [searchUnavailableCards, setSearchUnavailableCards] = useState<
    SearchUnavailableCardData[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showCurated, setShowCurated] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showingTopBuys, setShowingTopBuys] = useState(false);
  const [topBuyResults, setTopBuyResults] = useState<SetWithForecast[]>([]);
  const [isLoadingTopBuys, setIsLoadingTopBuys] = useState(false);
  const [topBuysLoaded, setTopBuysLoaded] = useState(false);
  const [topBuysError, setTopBuysError] = useState<string | null>(null);
  const [curatedForecasts, setCuratedForecasts] = useState<SetWithForecast[]>([]);
  const [isLoadingCuratedForecasts, setIsLoadingCuratedForecasts] = useState(true);

  // Search: accumulates results, only rendered once complete
  const [searchComplete, setSearchComplete] = useState(false);

  // Progressive scroll: how many cards to show for curated/top-buys
  const [visibleCount, setVisibleCount] = useState(SCROLL_BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const resetVisibleCards = useCallback(() => {
    setVisibleCount(SCROLL_BATCH);
  }, []);

  const exitSearchMode = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setApiQuery("");
    setApiResults([]);
    setSearchCuratedResults([]);
    setSearchUnavailableCards([]);
    setSearchError(null);
    setSearchComplete(false);
    setIsSearching(false);
    setHasInteracted(showingTopBuys || filter !== "All");
  }, [filter, showingTopBuys]);

  const loadTopBuys = useCallback(async () => {
    if (isLoadingTopBuys) return;

    setIsLoadingTopBuys(true);
    setTopBuysError(null);

    try {
      const res = await fetch(`/api/sealed/top-buys?limit=${TOP_BUYS_LIMIT}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const opportunities = Array.isArray(data.opportunities)
        ? (data.opportunities as TopBuyApiOpportunity[])
        : [];

      const baseResults = opportunities.flatMap((opportunity) =>
        opportunity.set && opportunity.forecast
          ? [{ set: opportunity.set, forecast: opportunity.forecast }]
          : []
      );

      if (baseResults.length === 0) {
        setTopBuyResults([]);
        setTopBuysLoaded(true);
        return;
      }

      const opportunitySets = baseResults.map((result) => result.set);

      try {
        const trendMap = await fetchTrendSnapshots(opportunitySets);
        const trendedSets = opportunitySets.map((set) => {
          const trend = trendMap.get(set.id);
          return trend ? applyTrendToSet(set, trend) : set;
        });

        const refreshedResults = await requestForecasts(trendedSets);
        const rerankedBuys = refreshedResults
          .filter((result) => result.forecast.signal === "Buy")
          .sort((a, b) => b.forecast.compositeScore - a.forecast.compositeScore)
          .slice(0, opportunities.length);

        if (rerankedBuys.length > 0) {
          setTopBuyResults(rerankedBuys);
        } else {
          setTopBuyResults(
            baseResults.map((result, index) => ({
              ...result,
              set: trendedSets[index] ?? result.set,
            }))
          );
        }
      } catch {
        setTopBuyResults(baseResults);
      }

      setTopBuysLoaded(true);
    } catch {
      setTopBuyResults([]);
      setTopBuysError("Failed to load top buy opportunities.");
      setTopBuysLoaded(true);
    } finally {
      setIsLoadingTopBuys(false);
    }
  }, [isLoadingTopBuys]);

  // Live search — pricing, trends, and image preload all complete before a single render
  const searchApi = useCallback(async (query: string) => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      abortRef.current?.abort();
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setSearchComplete(false);
    setApiResults([]);
    setSearchCuratedResults([]);
    setSearchUnavailableCards([]);

    const startTime = Date.now();
    let didTimeout = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const ensureMinLoading = async () => {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
      }
    };

    const norm = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[''`]/g, "")
        .replace(/&/g, "and")
        .toLowerCase()
        .trim();

    const VARIANT_WORDS = ["costco", "walmart", "target", "pokemon center", "display"];

    try {
      const payload = await Promise.race([
        (async () => {
          const searchRes = await fetch(
            `/api/sealed/search?q=${encodeURIComponent(trimmedQuery)}`,
            { signal: controller.signal }
          );
          if (!searchRes.ok) throw new Error("Search failed");

          const { products } = (await searchRes.json()) as {
            products: SealedSearchResult[];
          };

          if (!products || products.length === 0) {
            return {
              liveResults: [] as SetWithForecast[],
              curatedResults: [] as SetWithForecast[],
              unavailableCards: [] as SearchUnavailableCardData[],
            };
          }

          const pricingSettled = await Promise.allSettled(
            products.map(async (product) => {
              const res = await fetch(
                `/api/sealed/pricing?id=${product.pokedataId}`,
                { signal: controller.signal }
              );
              if (!res.ok) {
                throw new Error(`Pricing failed for ${product.pokedataId}`);
              }

              const { pricing } = (await res.json()) as { pricing: SealedPricing };
              if (!pricing) {
                throw new Error(`Missing pricing for ${product.pokedataId}`);
              }

              if (!pricing.imageUrl && product.imageUrl) {
                pricing.imageUrl = product.imageUrl;
              }

              return { product, pricing };
            })
          );

          if (controller.signal.aborted) {
            throw new DOMException("Search aborted", "AbortError");
          }

          const liveSets: SealedSetData[] = [];
          const unavailableCards: SearchUnavailableCardData[] = [];
          const seenPokedataIds = new Set<string>();
          const liveSetIds = new Set<string>();
          const usedCuratedIds = new Set<string>();

          for (const [index, settled] of pricingSettled.entries()) {
            const product = products[index];

            if (settled.status !== "fulfilled") {
              unavailableCards.push({
                id: `unavailable-${product.pokedataId}`,
                name: product.name,
                productType: inferProductType(product.name),
                releaseYear: parseReleaseYear(product.releaseDate),
                imageUrl: product.imageUrl ?? null,
              });
              continue;
            }

            const { pricing } = settled.value;
            if (seenPokedataIds.has(pricing.pokedataId)) continue;
            seenPokedataIds.add(pricing.pokedataId);

            const pricingProductType = inferProductType(pricing.name);
            const pricingNorm = norm(pricing.name);
            const isVariant = VARIANT_WORDS.some((variant) => pricingNorm.includes(variant));

            const curatedMatch = !isVariant
              ? SEALED_SETS.find(
                  (set) =>
                    !usedCuratedIds.has(set.id) &&
                    set.productType === pricingProductType &&
                    pricingNorm.includes(norm(set.name))
                )
              : undefined;

            const nextSet = curatedMatch
              ? (() => {
                  usedCuratedIds.add(curatedMatch.id);
                  return {
                    ...curatedMatch,
                    currentPrice: pricing.bestPrice ?? curatedMatch.currentPrice,
                    pokedataId: pricing.pokedataId,
                    imageUrl: pricing.imageUrl ?? curatedMatch.imageUrl,
                  };
                })()
              : buildDynamicSetData(pricing);

            liveSets.push(nextSet);
            liveSetIds.add(nextSet.id);
          }

          const curatedResults = SEALED_SETS.filter(
            (set) =>
              !liveSetIds.has(set.id) &&
              (
                set.name.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
                set.chaseCards.some((card) => card.toLowerCase().includes(trimmedQuery.toLowerCase())) ||
                set.productType.toLowerCase().includes(trimmedQuery.toLowerCase())
              )
          );

          const combinedSets = [...liveSets, ...curatedResults];
          const trendMap = await fetchTrendSnapshots(combinedSets, controller.signal);

          if (controller.signal.aborted) {
            throw new DOMException("Search aborted", "AbortError");
          }

          const trendedSets = combinedSets.map((set) => {
            const trend = trendMap.get(set.id);
            return trend ? applyTrendToSet(set, trend) : set;
          });

          const imageStatuses = await preloadImages([
            ...trendedSets.map((set) => set.imageUrl ?? ""),
            ...unavailableCards.map((card) => card.imageUrl ?? ""),
          ]);

          const withReadyImages = trendedSets.map((set) => ({
            ...set,
            imageUrl:
              set.imageUrl && imageStatuses.get(set.imageUrl) !== "error"
                ? set.imageUrl
                : undefined,
          }));
          const forecastedResults = await requestForecasts(
            withReadyImages,
            controller.signal,
            "search"
          );

          const withFallbackImages = unavailableCards.map((card) => ({
            ...card,
            imageUrl:
              card.imageUrl && imageStatuses.get(card.imageUrl) !== "error"
                ? card.imageUrl
                : null,
          }));

          const liveIds = new Set(liveSets.map((set) => set.id));

          return {
            liveResults: forecastedResults.filter((result) => liveIds.has(result.set.id)),
            curatedResults: forecastedResults.filter((result) => !liveIds.has(result.set.id)),
            unavailableCards: withFallbackImages,
          };
        })(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            didTimeout = true;
            controller.abort();
            reject(new Error("Search timed out"));
          }, SEARCH_TIMEOUT_MS);
        }),
      ]);

      await ensureMinLoading();
      if (abortRef.current !== controller) return;

      setApiResults(payload.liveResults);
      setSearchCuratedResults(payload.curatedResults);
      setSearchUnavailableCards(payload.unavailableCards);
      setSearchComplete(true);
      setIsSearching(false);
    } catch (err) {
      await ensureMinLoading();
      if (abortRef.current !== controller) return;

      if (didTimeout) {
        setSearchError("Search timed out. Try again.");
        setApiResults([]);
        setSearchCuratedResults([]);
        setSearchUnavailableCards([]);
        setSearchComplete(true);
        setIsSearching(false);
        return;
      }

      if ((err as Error).name === "AbortError") {
        return;
      }

      setSearchError("Search failed. Try again.");
      setApiResults([]);
      setSearchCuratedResults([]);
      setSearchUnavailableCards([]);
      setSearchComplete(true);
      setIsSearching(false);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCuratedForecasts() {
      setIsLoadingCuratedForecasts(true);

      try {
        const trendMap = await fetchTrendSnapshots(SEALED_SETS, controller.signal);
        if (controller.signal.aborted) return;

        const trendedSets = SEALED_SETS.map((set) => {
          const trend = trendMap.get(set.id);
          return trend ? applyTrendToSet(set, trend) : set;
        });

        const results = await requestForecasts(trendedSets, controller.signal);
        if (!controller.signal.aborted) {
          setCuratedForecasts(results);
        }
      } catch {
        if (!controller.signal.aborted) {
          setCuratedForecasts([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCuratedForecasts(false);
        }
      }
    }

    void loadCuratedForecasts();

    return () => {
      controller.abort();
    };
  }, []);

  // Debounced search trigger
  const handleSearchChange = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setSearch(value);
      if (trimmed.length > 0) {
        setHasInteracted(true);
        setShowingTopBuys(false);
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (trimmed.length >= 2) {
        debounceRef.current = setTimeout(() => {
          setApiQuery(trimmed);
          searchApi(trimmed);
        }, 500);
      } else {
        abortRef.current?.abort();
        setSearchError(null);
        setIsSearching(false);
        if (trimmed.length === 0) {
          exitSearchMode();
        }
      }
    },
    [exitSearchMode, searchApi]
  );

  const clearSearchInput = useCallback(() => {
    setSearch("");
    exitSearchMode();
    searchInputRef.current?.focus();
  }, [exitSearchMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Combine curated + API results
  const allSets = useMemo(() => {
    if (showingTopBuys) {
      return topBuyResults;
    }

    if (!hasInteracted) {
      return [];
    }

    const hasApiSearch = apiQuery.length >= 2;

    if (hasApiSearch) {
      const merged = new Map<string, SetWithForecast>();

      if (showCurated) {
        for (const result of searchCuratedResults) {
          merged.set(result.set.id, result);
        }
      }

      for (const result of apiResults) {
        merged.set(result.set.id, result);
      }

      return [...merged.values()];
    }

    return curatedForecasts;
  }, [curatedForecasts, apiResults, apiQuery, showCurated, searchCuratedResults, hasInteracted, showingTopBuys, topBuyResults]);

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
          cmp =
            (new Date().getFullYear() - a.set.releaseYear) -
            (new Date().getFullYear() - b.set.releaseYear);
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

  const searchDisplayCards = useMemo(
    () => [
      ...filtered.map((result) => ({
        kind: "ready" as const,
        id: result.set.id,
        result,
      })),
      ...searchUnavailableCards.map((card) => ({
        kind: "unavailable" as const,
        id: card.id,
        card,
      })),
    ],
    [filtered, searchUnavailableCards]
  );

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
    resetVisibleCards();
    if (sortBy === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  const handleShowTopBuys = useCallback(() => {
    resetVisibleCards();
    setShowingTopBuys(true);
    setHasInteracted(true);
    setSortBy("score");
    setSortDir("desc");

    if (!topBuysLoaded || topBuysError) {
      void loadTopBuys();
    }
  }, [loadTopBuys, resetVisibleCards, topBuysError, topBuysLoaded]);

  const totalSets = apiQuery.length >= 2
    ? filtered.length
    : SEALED_SETS.length;

  const renderedResultCount = isSearchMode ? searchDisplayCards.length : visibleFiltered.length;
  const isLoadingCuratedMode =
    hasInteracted &&
    !showingTopBuys &&
    !isSearchMode &&
    isLoadingCuratedForecasts;

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
            className="w-full h-10 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 pr-20 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          />
          {search.trim().length > 0 && (
            <button
              type="button"
              onClick={clearSearchInput}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              ✕
            </button>
          )}
          {isSearching && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2">
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
                resetVisibleCards();
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
            ["score", "Model Score"],
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
            onClick={() => {
              resetVisibleCards();
              setShowCurated((v) => !v);
            }}
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

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
        <span className="font-medium text-[hsl(var(--foreground))]">Signal legend:</span>
        <span className="rounded-full bg-green-500/10 px-2 py-1 text-green-400">
          BUY = S&amp;P +10% over 5yr
        </span>
        <span
          className="rounded-full bg-yellow-500/10 px-2 py-1 text-yellow-400"
          title="HOLD means it may grow, but not meaningfully better than just putting your money in the S&P 500."
        >
          HOLD = roughly S&amp;P, neutral
        </span>
        <span className="rounded-full bg-red-500/10 px-2 py-1 text-red-400">
          SELL = below S&amp;P
        </span>
      </div>

      {/* Results count */}
      {hasInteracted && !isSearching && !isLoadingCuratedMode && !(showingTopBuys && isLoadingTopBuys) && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Showing {renderedResultCount}{isCuratedMode && filtered.length > visibleFiltered.length ? ` of ${filtered.length}` : ""} {showingTopBuys ? "top buy opportunities" : apiQuery.length >= 2 ? "results" : `of ${totalSets} sets`}
            {apiQuery.length >= 2 && apiResults.length > 0 && (
              <span className="ml-1">
                ({apiResults.length} from PokeData)
              </span>
            )}
          </p>
          {showingTopBuys && (
            <button
              type="button"
              onClick={() => {
                resetVisibleCards();
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
                  handleShowTopBuys();
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500/15 text-green-400 text-sm font-medium hover:bg-green-500/25 border border-green-500/30 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Show Top Buys ({TOP_BUYS_LIMIT})
              </button>
            </div>

            <p className="text-[11px] text-[hsl(var(--muted-foreground))]/60 mt-6">
              Powered by live PokeData pricing &amp; XGBoost forecasting
            </p>
          </div>
        </div>
      )}

      {showingTopBuys && isLoadingTopBuys && !topBuysLoaded && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))] animate-pulse">
              Loading top buy opportunities…
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonForecastCard key={i} />
            ))}
          </div>
        </div>
      )}

      {isLoadingCuratedMode && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))] animate-pulse">
              Building ML forecasts…
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 items-stretch md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonForecastCard key={i} />
            ))}
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
      {isSearchMode && searchComplete && searchDisplayCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
          {searchDisplayCards.map((item, index) => (
            <div
              key={item.id}
              className="search-card-enter"
              style={{ animationDelay: `${index * SEARCH_ANIMATION_STAGGER_MS}ms` }}
            >
              {item.kind === "ready" ? (
                <SetForecastCard set={item.result.set} forecast={item.result.forecast} />
              ) : (
                <SearchUnavailableCard card={item.card} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Curated / Top Buys — progressive scroll loading */}
      {isCuratedMode && !isSearchMode && visibleFiltered.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
            {visibleFiltered.map(({ set, forecast }) => (
              <div
                key={set.id}
                className="animate-fade-in-up"
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
      {hasInteracted && !isSearching && !searchError && searchDisplayCards.length === 0 && searchComplete && isSearchMode && (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <p className="text-lg font-semibold mb-1">No sealed products found</p>
          <p className="text-sm">
            Try a different search term — e.g. &quot;Celebrations&quot;, &quot;Shining Fates&quot;, &quot;Booster Box&quot;
          </p>
        </div>
      )}

      {/* No results (curated mode, filters active) */}
      {hasInteracted &&
        !isSearching &&
        !topBuysError &&
        !(showingTopBuys && isLoadingTopBuys) &&
        !isLoadingCuratedMode &&
        filtered.length === 0 &&
        !isSearchMode && (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <p className="text-lg font-semibold mb-1">
            {showingTopBuys
              ? "No Buy opportunities found at this time"
              : "No sets match your filters"}
          </p>
          <p className="text-sm">
            {showingTopBuys
              ? "Check back as prices update."
              : "Try adjusting your search or filter criteria."}
          </p>
        </div>
      )}

      {showingTopBuys && topBuysError && !isLoadingTopBuys && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-3">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm text-red-400 font-medium mb-1">
            {topBuysError}
          </p>
          <button
            type="button"
            onClick={() => {
              setTopBuysLoaded(false);
              void loadTopBuys();
            }}
            className="mt-3 text-xs text-[hsl(var(--poke-yellow))] hover:underline"
          >
            Retry Top Buys
          </button>
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
          <h4 className="flex items-center gap-2 font-bold text-sm text-[hsl(var(--foreground))]">
            <BarChart3
              className="h-4 w-4 text-[hsl(var(--poke-yellow))]"
              aria-hidden="true"
            />
            Methodology
          </h4>
          <p>
            <strong className="text-[hsl(var(--foreground))]">XGBoost models</strong> forecast
            1-year, 3-year, and 5-year sealed prices from live price, chase-card
            strength, print run, set age, trajectories, collector demand, product type,
            era, and market-cycle inputs. All prices are live from PokeData.io.
          </p>
          <p>
            <strong className="text-[hsl(var(--foreground))]">Live Google Trends</strong> data
            is fetched for curated sets and search results, then blended into the
            popularity inputs before the model runs. The Factor Breakdown panel now shows
            model influence by feature instead of hand-tuned weights.
          </p>
          <p>
            <strong className="text-[hsl(var(--foreground))]">Dynamic search results</strong> use
            the same ML models, but some inputs are estimated when a product is missing
            curated chase-card or history data. Look for the
            <span className="inline-block mx-1 rounded-full bg-orange-500/20 text-orange-400 px-1.5 py-0.5 text-[9px] font-semibold">
              Estimated
            </span>
            badge on those cards.
          </p>
          <p>
            <strong className="text-[hsl(var(--foreground))]">Brand-new standard-print sets</strong>{" "}
            with less than 12 months of history have their launch-week hype signals damped
            and are forced to Low confidence. Their 6mo / 24mo trajectory inputs stay
            neutral until real history exists, so the model does not hallucinate 1000%+
            upside from synthetic launch data.
          </p>
          <p>
            Buy / Hold / Sell is derived from projected 5-year ROI versus an S&amp;P 500
            benchmark of 10.5% annualized. Confidence comes from prediction spread across
            the tree ensemble. All projections are estimates — not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
