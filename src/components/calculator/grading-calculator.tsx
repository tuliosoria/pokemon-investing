"use client";

import { useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gradeEvSchema, type GradeEvFormValues } from "@/lib/schemas/grading";
import {
  calculateGradeExpectedValue,
  type GradeEvResult,
} from "@/lib/domain/grading";
import { estimateGradedValues } from "@/lib/domain/price-estimates";
import { bandToVerdict, VERDICT_CONFIG } from "@/lib/domain/fees";
import { formatCurrency } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  ChevronDown,
  Info,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardSearch } from "./card-search";
import { ConditionWizard } from "./condition-wizard";
import { useState, useRef, useEffect, useCallback } from "react";
import type { CardSearchResult, GradeData } from "@/lib/types/card";

interface UserGradeStats {
  cardId: string;
  count: number;
  psa10: { mean: number; std: number };
  psa9: { mean: number; std: number };
  psa8: { mean: number; std: number };
  lastSubmittedAt: string | null;
}

const DEFAULT_FORM_VALUES: DefaultValues<GradeEvFormValues> = {
  rawCardValue: undefined,
  gradingCost: 20,
  psa10Value: undefined,
  psa9Value: undefined,
  psa8Value: 0,
  probabilityPsa10: 0,
  probabilityPsa9: 0,
  probabilityPsa8: 0,
  marketplaceFeePct: 13.25,
  shippingCost: 5,
  insuranceCost: 0,
  taxAdjustment: 0,
};

const PSA_PROBABILITY_TOOLTIP =
  "Estimate the odds your specific copy hits each grade. Population data doesn't matter if your card has scratches, whitening, or off-centering — PSA grades the worst sub-grade. Use the condition wizard above for a starting point.";

export function GradingCalculator() {
  const [result, setResult] = useState<GradeEvResult | null>(null);
  const [isEstimated, setIsEstimated] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [stats, setStats] = useState<UserGradeStats | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<GradeEvFormValues>({
    resolver: zodResolver(gradeEvSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const userPsa10 = watch("probabilityPsa10");
  const userPsa9 = watch("probabilityPsa9");

  const fetchStats = useCallback(async (cardId: string) => {
    try {
      const res = await fetch(
        `/api/cards/grade-submissions?cardId=${encodeURIComponent(cardId)}`
      );
      if (!res.ok) return;
      const body = await res.json();
      setStats(body.stats ?? null);
    } catch {
      // soft fail — density warning is optional
    }
  }, []);

  const handleCardSelect = (card: CardSearchResult, rawPrice: number) => {
    setSelectedCardId(card.id);
    setStats(null);
    if (card.id) fetchStats(card.id);

    if (rawPrice > 0) {
      setValue("rawCardValue", rawPrice);
      const est = estimateGradedValues(rawPrice);
      setValue("psa10Value", est.psa10);
      setValue("psa9Value", est.psa9);
      setValue("psa8Value", est.psa8);
      setIsEstimated(true);
    }
    setResult(null);
  };

  const handleGradeDataLoaded = (gradeData: GradeData) => {
    // Only update PSA price values from PriceCharting comps — never
    // touch raw price and never auto-fill probabilities (those are now
    // user-supplied via the condition wizard).
    const psa10 = gradeData.gradedPrices["PSA 10.0"] ?? 0;
    const psa9 = gradeData.gradedPrices["PSA 9.0"] ?? 0;
    const psa8 = gradeData.gradedPrices["PSA 8.0"] ?? 0;

    if (psa10 > 0) setValue("psa10Value", Math.round(psa10 * 100) / 100);
    if (psa9 > 0) setValue("psa9Value", Math.round(psa9 * 100) / 100);
    if (psa8 > 0) setValue("psa8Value", Math.round(psa8 * 100) / 100);

    setIsEstimated(false);
    setResult(null);
  };

  const handleCardClear = () => {
    reset(DEFAULT_FORM_VALUES);
    setIsEstimated(false);
    setResult(null);
    setSelectedCardId(null);
    setStats(null);
  };

  const applyWizardSuggestion = (p: {
    psa10: number;
    psa9: number;
    psa8: number;
  }) => {
    setValue("probabilityPsa10", p.psa10);
    setValue("probabilityPsa9", p.psa9);
    setValue("probabilityPsa8", p.psa8);
  };

  const onSubmit = (data: GradeEvFormValues) => {
    const estimated = estimateGradedValues(data.rawCardValue);
    const res = calculateGradeExpectedValue({
      ...data,
      psa8Value: data.psa8Value > 0 ? data.psa8Value : estimated.psa8,
    });
    setResult(res);

    // Fire-and-forget: record this estimate to crowd-density store.
    if (selectedCardId) {
      fetch("/api/cards/grade-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selectedCardId,
          psa10Pct: data.probabilityPsa10,
          psa9Pct: data.probabilityPsa9,
          psa8Pct: data.probabilityPsa8,
        }),
      })
        .then(async (r) => {
          if (!r.ok) return;
          const body = await r.json();
          if (body.stats) setStats(body.stats);
        })
        .catch(() => {});
    }
  };

  // Scroll to result on mobile
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  const densityWarning = buildDensityWarning(stats, userPsa10, userPsa9);

  return (
    <div className="space-y-5">
      {/* Card search */}
      <CardSearch
        onCardSelect={handleCardSelect}
        onGradeDataLoaded={handleGradeDataLoaded}
        onClearCard={handleCardClear}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Price inputs */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Prices
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Raw price ($)"
              type="number"
              step="0.01"
              error={errors.rawCardValue?.message}
              {...register("rawCardValue")}
            />
            <Input
              label="Grading cost ($)"
              type="number"
              step="0.01"
              error={errors.gradingCost?.message}
              {...register("gradingCost")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="PSA 10 value ($)"
              type="number"
              step="0.01"
              error={errors.psa10Value?.message}
              hint={isEstimated ? "Estimated" : undefined}
              {...register("psa10Value")}
            />
            <Input
              label="PSA 9 value ($)"
              type="number"
              step="0.01"
              error={errors.psa9Value?.message}
              hint={isEstimated ? "Estimated" : undefined}
              {...register("psa9Value")}
            />
          </div>
          {isEstimated && (
            <p className="text-xs text-yellow-500 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Graded values are estimates. Replace with real comps for accuracy.
            </p>
          )}
        </div>

        {/* Condition wizard — collapsed by default */}
        <ConditionWizard onApply={applyWizardSuggestion} />

        {/* Probabilities */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Grade probability (%) — your call
            </h4>
            <span
              title={PSA_PROBABILITY_TOOLTIP}
              className="cursor-help text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
          {errors.probabilityPsa10?.message ===
            "Total grade probabilities cannot exceed 100%" && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Total probabilities cannot exceed 100%
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="PSA 10 %"
              type="number"
              step="1"
              title={PSA_PROBABILITY_TOOLTIP}
              error={
                errors.probabilityPsa10?.message !==
                "Total grade probabilities cannot exceed 100%"
                  ? errors.probabilityPsa10?.message
                  : undefined
              }
              {...register("probabilityPsa10")}
            />
            <Input
              label="PSA 9 %"
              type="number"
              step="1"
              error={errors.probabilityPsa9?.message}
              {...register("probabilityPsa9")}
            />
          </div>
          {densityWarning && <DensityNotice {...densityWarning} />}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
          Advanced settings
        </button>

        {showAdvanced && (
          <div className="space-y-3 animate-fade-in">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="PSA 8 value ($)"
                type="number"
                step="0.01"
                hint={isEstimated ? "Estimated" : "Optional"}
                error={errors.psa8Value?.message}
                {...register("psa8Value")}
              />
              <Input
                label="PSA 8 %"
                type="number"
                step="1"
                error={errors.probabilityPsa8?.message}
                {...register("probabilityPsa8")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Marketplace fee %"
                type="number"
                step="0.01"
                hint="eBay: 13.25%"
                error={errors.marketplaceFeePct?.message}
                {...register("marketplaceFeePct")}
              />
              <Input
                label="Shipping ($)"
                type="number"
                step="0.01"
                error={errors.shippingCost?.message}
                {...register("shippingCost")}
              />
              <Input
                label="Insurance ($)"
                type="number"
                step="0.01"
                hint="Optional"
                error={errors.insuranceCost?.message}
                {...register("insuranceCost")}
              />
              <Input
                label="Tax adjustment ($)"
                type="number"
                step="0.01"
                hint="Optional"
                error={errors.taxAdjustment?.message}
                {...register("taxAdjustment")}
              />
            </div>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full text-base py-6">
          Should I Grade?
        </Button>
      </form>

      {/* Result — verdict panel */}
      {result && <GradeDecision result={result} ref={resultRef} />}
    </div>
  );
}

/* ─── Crowd-density helpers ────────────────────────────── */

interface DensityNotice {
  tone: "info" | "warning";
  count: number;
  message: string;
}

function buildDensityWarning(
  stats: UserGradeStats | null,
  userPsa10: number | undefined,
  userPsa9: number | undefined
): DensityNotice | null {
  if (!stats || stats.count === 0) return null;

  if (stats.count < 5) {
    return {
      tone: "info",
      count: stats.count,
      message: `Limited community data (${stats.count} estimate${stats.count === 1 ? "" : "s"} so far). Your input helps calibrate future warnings.`,
    };
  }

  const checks: { label: string; user: number; mean: number; std: number }[] =
    [];
  if (typeof userPsa10 === "number" && userPsa10 > 0) {
    checks.push({
      label: "PSA 10",
      user: userPsa10,
      mean: stats.psa10.mean,
      std: stats.psa10.std,
    });
  }
  if (typeof userPsa9 === "number" && userPsa9 > 0) {
    checks.push({
      label: "PSA 9",
      user: userPsa9,
      mean: stats.psa9.mean,
      std: stats.psa9.std,
    });
  }

  for (const c of checks) {
    const diff = c.user - c.mean;
    const absDiff = Math.abs(diff);
    const triggered =
      absDiff >= 15 || (c.std > 1 && absDiff >= c.std * 1.5);
    if (triggered) {
      const direction = diff > 0 ? "above" : "below";
      return {
        tone: "warning",
        count: stats.count,
        message: `Your ${c.label} estimate (${Math.round(c.user)}%) is ${direction} the community average of ${Math.round(c.mean)}% across ${stats.count} estimates. Re-check the condition wizard if you haven't.`,
      };
    }
  }

  return {
    tone: "info",
    count: stats.count,
    message: `In line with the community: ${stats.count} estimates, avg PSA 10 ${Math.round(stats.psa10.mean)}% / PSA 9 ${Math.round(stats.psa9.mean)}%.`,
  };
}

function DensityNotice({ tone, message }: DensityNotice) {
  const isWarning = tone === "warning";
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
        isWarning
          ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
          : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--muted-foreground))]"
      }`}
    >
      {isWarning ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      ) : (
        <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      )}
      <span className="leading-snug">{message}</span>
    </div>
  );
}

/* ─── Decision output ──────────────────────────────────── */

import { forwardRef } from "react";

const GradeDecision = forwardRef<HTMLDivElement, { result: GradeEvResult }>(
  function GradeDecision({ result }, ref) {
    const verdict = bandToVerdict(result.recommendation);
    const config = VERDICT_CONFIG[verdict];

    const VerdictIcon =
      verdict === "grade"
        ? CheckCircle
        : verdict === "dont_grade"
          ? XCircle
          : HelpCircle;

    return (
      <div ref={ref} className="space-y-4 animate-fade-in-up">
        {/* Main verdict */}
        <div
          className={`rounded-2xl ${config.bgColor} border border-current/10 p-6 text-center`}
        >
          <VerdictIcon
            className={`w-12 h-12 mx-auto mb-3 ${config.color}`}
          />
          <h2 className={`text-2xl font-bold ${config.color}`}>
            {config.label}
          </h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            {result.expectedProfit >= 0
              ? `Expected profit +${formatCurrency(result.expectedProfit)}`
              : `Expected loss ${formatCurrency(result.expectedProfit)}`}
          </p>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Expected profit"
            value={formatCurrency(result.expectedProfit)}
            positive={result.expectedProfit >= 0}
            highlight
          />
          <MetricCard
            label="ROI"
            value={`${result.roiPct >= 0 ? "+" : ""}${result.roiPct.toFixed(1)}%`}
            positive={result.roiPct >= 0}
            highlight
          />
          <MetricCard
            label="Total cost"
            value={formatCurrency(result.totalCost)}
          />
          <MetricCard
            label="Break-even PSA 10"
            value={`${result.breakEvenPsa10Pct.toFixed(1)}%`}
          />
        </div>

        {/* Explanation */}
        <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
          {result.expectedProfit >= 0
            ? `Positive EV of +${formatCurrency(result.expectedProfit)}. You need at least ${result.breakEvenPsa10Pct.toFixed(0)}% chance of PSA 10 to break even.`
            : `Negative EV of ${formatCurrency(result.expectedProfit)}. You would need at least ${result.breakEvenPsa10Pct.toFixed(0)}% chance of PSA 10 to break even.`}
        </p>

        {/* Scenario breakdown — mobile-friendly cards */}
        <details className="group">
          <summary className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] cursor-pointer hover:text-[hsl(var(--foreground))]">
            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
            Scenario breakdown
          </summary>
          <div className="mt-3 space-y-2">
            {result.scenarioBreakdown.map((s) => (
              <div
                key={s.grade}
                className="flex items-center justify-between rounded-lg bg-[hsl(var(--muted))] px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">{s.grade}</span>
                  <span className="text-[hsl(var(--muted-foreground))] ml-2">
                    {s.probability.toFixed(0)}%
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={
                      s.netValue >= 0 ? "text-green-500" : "text-red-500"
                    }
                  >
                    {formatCurrency(s.netValue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  }
);

function MetricCard({
  label,
  value,
  positive,
  highlight,
}: {
  label: string;
  value: string;
  positive?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${
        highlight
          ? "bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
          : "bg-[hsl(var(--muted))]"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        {label}
      </p>
      <p
        className={`text-xl font-bold mt-1 ${
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
