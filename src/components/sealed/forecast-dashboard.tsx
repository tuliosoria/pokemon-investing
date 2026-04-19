"use client";

import { useState, useMemo } from "react";
import { SEALED_SETS } from "@/lib/data/sealed-sets";
import { computeForecast } from "@/lib/domain/sealed-forecast";
import type { SortField, FilterSignal } from "@/lib/types/sealed";
import { SetForecastCard } from "./set-forecast-card";

export function ForecastDashboard() {
  const [sortBy, setSortBy] = useState<SortField>("roi");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<FilterSignal>("All");
  const [search, setSearch] = useState("");

  const setsWithForecasts = useMemo(
    () => SEALED_SETS.map((set) => ({ set, forecast: computeForecast(set) })),
    []
  );

  const filtered = useMemo(() => {
    let result = setsWithForecasts;

    // Signal filter
    if (filter !== "All") {
      result = result.filter((r) => r.forecast.signal === filter);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.set.name.toLowerCase().includes(q) ||
          r.set.chaseCards.some((c) => c.toLowerCase().includes(q)) ||
          r.set.productType.toLowerCase().includes(q)
      );
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
  }, [setsWithForecasts, filter, search, sortBy, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sets or chase cards..."
          className="flex-1 h-10 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        />

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
      </div>

      {/* Results count */}
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Showing {filtered.length} of {SEALED_SETS.length} sets
      </p>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map(({ set, forecast }) => (
          <SetForecastCard key={set.id} set={set} forecast={forecast} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <p className="text-lg font-semibold mb-1">No sets match your filters</p>
          <p className="text-sm">Try adjusting your search or filter criteria.</p>
        </div>
      )}

      {/* Methodology note */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-xs text-[hsl(var(--muted-foreground))] space-y-2">
        <h4 className="font-bold text-sm text-[hsl(var(--foreground))]">
          📊 Methodology
        </h4>
        <p>
          Each set is scored across 8 weighted factors (market value, chase cards,
          supply scarcity, set age, price trajectory, popularity, market cycle, and
          collector demand ratio). Factor weights range from Low–Med (1.5×) to High
          (3.0×). The composite score maps to a projected annual appreciation rate and
          determines the Buy / Hold / Sell signal.
        </p>
        <p>
          S&amp;P 500 comparison uses a historical average annualized return of 10.5%.
          All projections are estimates based on current market conditions and
          historical patterns — not financial advice.
        </p>
      </div>
    </div>
  );
}
