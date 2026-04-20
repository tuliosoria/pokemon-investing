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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardSearch } from "./card-search";
import { useState, useRef, useEffect } from "react";
import type { CardSearchResult, GradeData } from "@/lib/types/card";

const DEFAULT_FORM_VALUES: DefaultValues<GradeEvFormValues> = {
  rawCardValue: undefined,
  gradingCost: 20,
  psa10Value: undefined,
  psa9Value: undefined,
  psa8Value: 0,
  probabilityPsa10: 20,
  probabilityPsa9: 50,
  probabilityPsa8: 25,
  marketplaceFeePct: 13.25,
  shippingCost: 5,
  insuranceCost: 0,
  taxAdjustment: 0,
};

const PSA_PROBABILITY_TOOLTIP =
  "Historical PSA 10 gem rate for this exact card based on source population data. It reflects all previously graded copies, not the odds for a fresh raw copy today.";

export function GradingCalculator() {
  const [result, setResult] = useState<GradeEvResult | null>(null);
  const [isEstimated, setIsEstimated] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<GradeEvFormValues>({
    resolver: zodResolver(gradeEvSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const handleCardSelect = (_card: CardSearchResult, rawPrice: number) => {
    if (rawPrice > 0) {
      setValue("rawCardValue", rawPrice);
      // Set heuristic estimates until PokeData loads
      const est = estimateGradedValues(rawPrice);
      setValue("psa10Value", est.psa10);
      setValue("psa9Value", est.psa9);
      setValue("psa8Value", est.psa8);
      setIsEstimated(true);
    }
    setResult(null);
  };

  const handleGradeDataLoaded = (gradeData: GradeData) => {
    // Only update PSA grading values — never touch raw price
    const psa10 = gradeData.gradedPrices["PSA 10.0"] ?? 0;
    const psa9 = gradeData.gradedPrices["PSA 9.0"] ?? 0;
    const psa8 = gradeData.gradedPrices["PSA 8.0"] ?? 0;

    if (psa10 > 0) setValue("psa10Value", Math.round(psa10 * 100) / 100);
    if (psa9 > 0) setValue("psa9Value", Math.round(psa9 * 100) / 100);
    if (psa8 > 0) setValue("psa8Value", Math.round(psa8 * 100) / 100);

    if (gradeData.psa10Probability !== null) {
      setValue("probabilityPsa10", gradeData.psa10Probability);
      const remaining = 100 - gradeData.psa10Probability;
      setValue("probabilityPsa9", Math.round(remaining * 0.5));
      setValue("probabilityPsa8", Math.round(remaining * 0.3));
    }

    setIsEstimated(false);
    setResult(null);
  };

  const handleCardClear = () => {
    reset(DEFAULT_FORM_VALUES);
    setIsEstimated(false);
    setResult(null);
  };

  const onSubmit = (data: GradeEvFormValues) => {
    const estimated = estimateGradedValues(data.rawCardValue);
    const res = calculateGradeExpectedValue({
      ...data,
      psa8Value: data.psa8Value > 0 ? data.psa8Value : estimated.psa8,
    });
    setResult(res);
  };

  // Scroll to result on mobile
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

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

        {/* Probabilities */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Grade probability (%)
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
