"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  GRADING_CANDIDATES,
  type GradingCandidate,
} from "@/lib/data/grading-cards";
import {
  computeGradingOpportunity,
  type GradingOpportunity,
} from "@/lib/domain/grading-opportunities";
import { bandToVerdict, VERDICT_CONFIG } from "@/lib/domain/fees";
import { formatCurrency } from "@/lib/utils";
import type { GradeData } from "@/lib/types/card";
import {
  TrendingUp,
  ArrowUpDown,
  Loader2,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  HelpCircle,
  ChevronDown,
  BarChart3,
} from "lucide-react";

const PSA_PROBABILITY_TOOLTIP =
  "Historical PSA 10 gem rate for this exact card based on source population data. It reflects all previously graded copies, not the odds for a fresh raw copy today.";

type SortField = "ev" | "roi" | "psa10Spread" | "rawPrice";
type FilterVerdict = "all" | "grade" | "maybe" | "dont_grade";

interface LoadingState {
  loaded: number;
  total: number;
  errors: string[];
}

function buildTcgplayerProductUrl(tcgplayerId: string): string {
  return `https://www.tcgplayer.com/product/${tcgplayerId}`;
}

/**
 * Build a {@link GradeData} object from a candidate's static baseline pricing.
 * Used so the page renders zero-config when the live PriceCharting
 * APIs are unavailable. Population data is intentionally left empty — the
 * downstream {@link computeGradingOpportunity} call only requires graded prices
 * and a raw price to produce a recommendation.
 */
function gradeDataFromBaseline(card: GradingCandidate): GradeData | null {
  if (!card.baselinePricing) return null;
  const { rawPrice, gradedPrices } = card.baselinePricing;
  return {
    pokedataId: card.pokedataId,
    name: card.name,
    set: card.set,
    rawPrice: rawPrice ?? null,
    tcgplayerPrice: rawPrice ?? null,
    ebayRawPrice: null,
    gradedPrices: { ...gradedPrices } as Record<string, number>,
    population: {},
    psa10Probability: null,
  };
}

/**
 * Merge live API grade data over a baseline snapshot. Live values win when
 * present and finite; baseline fills in gaps. This lets us serve a stable
 * baseline immediately while still benefiting from fresher live data when the
 * upstream providers are configured.
 */
function mergeGradeData(
  baseline: GradeData | null,
  live: GradeData | null
): GradeData | null {
  if (!baseline) return live;
  if (!live) return baseline;
  const pickNumber = (a: number | null, b: number | null) =>
    a !== null && Number.isFinite(a) && a > 0 ? a : b;
  return {
    ...baseline,
    ...live,
    rawPrice: pickNumber(live.rawPrice, baseline.rawPrice),
    tcgplayerPrice: pickNumber(live.tcgplayerPrice, baseline.tcgplayerPrice),
    ebayRawPrice: pickNumber(live.ebayRawPrice, baseline.ebayRawPrice),
    gradedPrices: { ...baseline.gradedPrices, ...live.gradedPrices },
    population:
      Object.keys(live.population || {}).length > 0
        ? live.population
        : baseline.population,
    psa10Probability: live.psa10Probability ?? baseline.psa10Probability,
  };
}

export function GradingOpportunities() {
  const [opportunities, setOpportunities] = useState<GradingOpportunity[]>([]);
  const [loading, setLoading] = useState<LoadingState>({
    loaded: 0,
    total: GRADING_CANDIDATES.length,
    errors: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>("ev");
  const [filterVerdict, setFilterVerdict] = useState<FilterVerdict>("all");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchGradeData = useCallback(async (card: GradingCandidate) => {
    const params = new URLSearchParams({
      name: card.name,
      set: card.set,
      number: card.number,
      pokedataId: card.pokedataId,
    });
    params.set("tcgId", card.tcgplayerId);

    const res = await fetch(`/api/cards/grade-data?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    return data.gradeData as GradeData | null;
  }, []);

  const loadAllOpportunities = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setOpportunities([]);
    setLoading({ loaded: 0, total: GRADING_CANDIDATES.length, errors: [] });

    // Process in batches of 3 to respect rate limits
    const BATCH_SIZE = 3;
    const results: GradingOpportunity[] = [];
    const errors: string[] = [];

    for (let i = 0; i < GRADING_CANDIDATES.length; i += BATCH_SIZE) {
      const batch = GRADING_CANDIDATES.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (card) => {
          const baseline = gradeDataFromBaseline(card);
          let live: GradeData | null = null;
          try {
            live = await fetchGradeData(card);
          } catch {
            // Live fetch failure → fall back to baseline silently. We still
            // surface a soft error below if neither source produced data.
            live = null;
          }
          const gradeData = mergeGradeData(baseline, live);
          if (!gradeData) return null;

          const rawPrice =
            gradeData.rawPrice ??
            gradeData.tcgplayerPrice ??
            gradeData.ebayRawPrice ??
            0;

          return computeGradingOpportunity(gradeData, rawPrice, {
            number: card.number,
            rarity: card.rarity,
            tcgplayerUrl: buildTcgplayerProductUrl(card.tcgplayerId),
          });
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === "fulfilled" && result.value) {
          // Keep every card with valid data — the verdict/filter UI is
          // responsible for hiding "don't grade" cards. Previously this
          // hard-filtered expectedProfit < 0, which meant the "Don't Grade"
          // filter could never show anything and most candidates silently
          // disappeared from the UI.
          results.push(result.value);
        } else if (result.status === "fulfilled" && !result.value) {
          // gradeData was null — the upstream provider had no data for this
          // card. Surface as a soft error so the user knows it was attempted.
          errors.push(`${batch[j].name}: no pricing/population data available`);
        } else if (result.status === "rejected") {
          errors.push(`${batch[j].name}: ${result.reason}`);
        }
      }

      setOpportunities([...results]);
      setLoading({
        loaded: Math.min(i + BATCH_SIZE, GRADING_CANDIDATES.length),
        total: GRADING_CANDIDATES.length,
        errors: [...errors],
      });

      // Small delay between batches
      if (i + BATCH_SIZE < GRADING_CANDIDATES.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setIsLoading(false);
  }, [fetchGradeData, isLoading]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      loadAllOpportunities();
    }
  }, [loadAllOpportunities]);

  // Sort & filter
  const sorted = [...opportunities]
    .filter((o) => {
      if (filterVerdict === "all") return true;
      return bandToVerdict(o.recommendation) === filterVerdict;
    })
    .sort((a, b) => {
      switch (sortField) {
        case "ev":
          return b.expectedProfit - a.expectedProfit;
        case "roi":
          return b.roi - a.roi;
        case "psa10Spread":
          return b.psa10Spread - a.psa10Spread;
        case "rawPrice":
          return a.rawPrice - b.rawPrice;
        default:
          return 0;
      }
    });

  const gradeCount = opportunities.filter(
    (o) => bandToVerdict(o.recommendation) === "grade"
  ).length;
  const maybeCount = opportunities.filter(
    (o) => bandToVerdict(o.recommendation) === "maybe"
  ).length;
  const dontCount = opportunities.filter(
    (o) => bandToVerdict(o.recommendation) === "dont_grade"
  ).length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-yellow-500" />
            Grading Opportunities
          </h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Cards where grading may be financially worthwhile, ranked by
            expected value.
          </p>
        </div>
      </div>

      {/* Loading progress */}
      {isLoading && (
        <div className="rounded-xl bg-[hsl(var(--muted))] p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              Loading card data… {loading.loaded}/{loading.total}
            </span>
          </div>
          <div className="w-full bg-[hsl(var(--border))] rounded-full h-1.5">
            <div
              className="bg-yellow-500 h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${(loading.loaded / loading.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Summary badges */}
      {opportunities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <SummaryBadge
            label="Grade"
            count={gradeCount}
            color="text-green-500"
            bgColor="bg-green-500/10"
            active={filterVerdict === "grade"}
            onClick={() =>
              setFilterVerdict(filterVerdict === "grade" ? "all" : "grade")
            }
          />
          <SummaryBadge
            label="Maybe"
            count={maybeCount}
            color="text-yellow-500"
            bgColor="bg-yellow-500/10"
            active={filterVerdict === "maybe"}
            onClick={() =>
              setFilterVerdict(filterVerdict === "maybe" ? "all" : "maybe")
            }
          />
          <SummaryBadge
            label="Don't Grade"
            count={dontCount}
            color="text-red-500"
            bgColor="bg-red-500/10"
            active={filterVerdict === "dont_grade"}
            onClick={() =>
              setFilterVerdict(
                filterVerdict === "dont_grade" ? "all" : "dont_grade"
              )
            }
          />

          {/* Sort control */}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="bg-transparent text-xs border-none focus:outline-none cursor-pointer"
            >
              <option value="ev">Expected Profit</option>
              <option value="roi">ROI %</option>
              <option value="psa10Spread">PSA 10 Spread</option>
              <option value="rawPrice">Price (low→high)</option>
            </select>
          </div>
        </div>
      )}

      {/* Opportunity cards */}
      <div className="space-y-3">
        {sorted.map((opp) => (
          <OpportunityCard
            key={opp.pokedataId}
            opportunity={opp}
            expanded={expandedCard === opp.pokedataId}
            onToggle={() =>
              setExpandedCard(
                expandedCard === opp.pokedataId ? null : opp.pokedataId
              )
            }
          />
        ))}
      </div>

      {/* Empty filtered state */}
      {!isLoading && opportunities.length > 0 && sorted.length === 0 && (
        <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
          <p className="text-sm">
            No cards match this filter.{" "}
            <button
              onClick={() => setFilterVerdict("all")}
              className="text-yellow-500 hover:underline"
            >
              Show all
            </button>
          </p>
        </div>
      )}

      {/* Empty load state — every card returned null or failed */}
      {!isLoading && opportunities.length === 0 && (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-6 text-center space-y-3">
          <AlertTriangle className="w-6 h-6 mx-auto text-yellow-500" />
          <div>
            <p className="text-sm font-medium">No grading data available</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {loading.errors.length > 0
                ? `All ${loading.total} candidate cards failed to return pricing data. PriceCharting may be unavailable, rate-limited, or the API token (PRICECHARTING_API_TOKEN) may not be configured.`
                : "Loading hasn't started or returned any results yet."}
            </p>
          </div>
          <button
            onClick={() => {
              fetchedRef.current = false;
              loadAllOpportunities();
            }}
            className="text-xs text-yellow-500 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Errors */}
      {loading.errors.length > 0 && (
        <details className="text-xs text-[hsl(var(--muted-foreground))]">
          <summary className="cursor-pointer hover:text-[hsl(var(--foreground))]">
            {loading.errors.length} card(s) failed to load
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {loading.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ─── Individual opportunity card ─────────────────────── */

function OpportunityCard({
  opportunity: opp,
  expanded,
  onToggle,
}: {
  opportunity: GradingOpportunity;
  expanded: boolean;
  onToggle: () => void;
}) {
  const verdict = bandToVerdict(opp.recommendation);
  const config = VERDICT_CONFIG[verdict];

  const VerdictIcon =
    verdict === "grade"
      ? CheckCircle
      : verdict === "dont_grade"
        ? XCircle
        : HelpCircle;

  return (
    <div
      className={`rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden transition-all duration-200 ${
        expanded ? "ring-1 ring-yellow-500/30" : ""
      }`}
    >
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-center gap-4 hover:bg-[hsl(var(--muted))]/50 transition-colors"
      >
        {/* Verdict icon */}
        <div className={`shrink-0 ${config.bgColor} rounded-lg p-2`}>
          <VerdictIcon className={`w-5 h-5 ${config.color}`} />
        </div>

        {/* Card info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{opp.name}</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}
            >
              {config.label}
            </span>
          </div>
          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            {opp.set} · #{opp.number} · {opp.rarity}
          </div>
        </div>

        {/* Key metrics */}
        <div className="hidden sm:flex items-center gap-4 shrink-0 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Raw
            </div>
            <div className="text-sm font-medium">
              {formatCurrency(opp.rawPrice)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              PSA 10
            </div>
            <div className="text-sm font-medium">
              {opp.psa10Price > 0 ? formatCurrency(opp.psa10Price) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              EV
            </div>
            <div
              className={`text-sm font-bold ${opp.expectedProfit >= 0 ? "text-green-500" : "text-red-500"}`}
            >
              {opp.expectedProfit >= 0 ? "+" : ""}
              {formatCurrency(opp.expectedProfit)}
            </div>
          </div>
        </div>

        {/* Mobile metrics */}
        <div className="sm:hidden shrink-0 text-right">
          <div
            className={`text-sm font-bold ${opp.expectedProfit >= 0 ? "text-green-500" : "text-red-500"}`}
          >
            {opp.expectedProfit >= 0 ? "+" : ""}
            {formatCurrency(opp.expectedProfit)}
          </div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {opp.roi >= 0 ? "+" : ""}
            {opp.roi.toFixed(1)}% ROI
          </div>
        </div>

        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-[hsl(var(--border))] animate-fade-in">
          {/* Price grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            <MetricCard
              label="Raw Price"
              value={formatCurrency(opp.rawPrice)}
            />
            <MetricCard
              label="PSA 10"
              value={opp.psa10Price > 0 ? formatCurrency(opp.psa10Price) : "—"}
            />
            <MetricCard
              label="PSA 9"
              value={opp.psa9Price > 0 ? formatCurrency(opp.psa9Price) : "—"}
            />
            <MetricCard
              label="Total Cost"
              value={formatCurrency(opp.totalCost)}
            />
          </div>

          {/* EV grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Expected Profit"
              value={`${opp.expectedProfit >= 0 ? "+" : ""}${formatCurrency(opp.expectedProfit)}`}
              positive={opp.expectedProfit >= 0}
              highlight
            />
            <MetricCard
              label="ROI"
              value={`${opp.roi >= 0 ? "+" : ""}${opp.roi.toFixed(1)}%`}
              positive={opp.roi >= 0}
              highlight
            />
            <MetricCard
              label="PSA 10 Spread"
              value={`${opp.psa10Spread >= 0 ? "+" : ""}${formatCurrency(opp.psa10Spread)}`}
              positive={opp.psa10Spread >= 0}
            />
            <MetricCard
              label="PSA 10 Chance"
              value={`${opp.psa10Probability}%`}
              labelTitle={PSA_PROBABILITY_TOOLTIP}
            />
          </div>

          {/* Confidence badge */}
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={opp.confidence} />
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {opp.populationTotal > 0
                ? `Based on ${opp.populationTotal.toLocaleString()} graded copies`
                : "Limited grading data available"}
            </span>
            {opp.tcgplayerUrl && (
              <a
                href={opp.tcgplayerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline"
              >
                View raw card on TCGPlayer →
              </a>
            )}
          </div>

          {/* Scenario breakdown */}
          {opp.scenarioBreakdown && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                <BarChart3 className="w-3.5 h-3.5" />
                Scenario Breakdown
              </div>
              <div className="space-y-1.5">
                {opp.scenarioBreakdown.map((s) => (
                  <div
                    key={s.grade}
                    className="flex items-center justify-between rounded-lg bg-[hsl(var(--muted))] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium w-16">{s.grade}</span>
                      <span className="text-[hsl(var(--muted-foreground))]">
                        {s.probability.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[hsl(var(--muted-foreground))]">
                        Gross: {formatCurrency(s.grossValue)}
                      </span>
                      <span
                        className={`font-medium ${
                          s.netValue >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        Net: {formatCurrency(s.netValue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────── */

function SummaryBadge({
  label,
  count,
  color,
  bgColor,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  bgColor: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        active
          ? `${bgColor} ${color} ring-1 ring-current/30`
          : `bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/80`
      }`}
    >
      {label}
      <span className="font-bold">{count}</span>
    </button>
  );
}

function MetricCard({
  label,
  value,
  labelTitle,
  positive,
  highlight,
}: {
  label: string;
  value: string;
  labelTitle?: string;
  positive?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        highlight
          ? "bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
          : "bg-[hsl(var(--muted))]"
      }`}
    >
      <p
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]"
        title={labelTitle}
      >
        <span>{label}</span>
        {labelTitle && <Info className="h-3 w-3 shrink-0" aria-hidden="true" />}
      </p>
      <p
        className={`text-sm font-bold mt-0.5 ${
          positive !== undefined
            ? positive
              ? "text-green-500"
              : "text-red-500"
            : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  const config = {
    high: {
      label: "High Confidence",
      color: "text-green-500",
      bg: "bg-green-500/10",
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    medium: {
      label: "Medium Confidence",
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    low: {
      label: "Low Confidence",
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      icon: <AlertTriangle className="w-3 h-3" />,
    },
  };

  const c = config[confidence];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color} ${c.bg}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}
