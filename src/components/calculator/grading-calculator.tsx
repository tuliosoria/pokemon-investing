"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gradeEvSchema, type GradeEvFormValues } from "@/lib/schemas/grading";
import {
  calculateGradeExpectedValue,
  type GradeEvResult,
} from "@/lib/domain/grading";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResultDisplay, formatMetricValue } from "./result-display";
import { useState } from "react";

export function GradingCalculator() {
  const [result, setResult] = useState<GradeEvResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GradeEvFormValues>({
    resolver: zodResolver(gradeEvSchema),
    defaultValues: {
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
    },
  });

  const onSubmit = (data: GradeEvFormValues) => {
    const res = calculateGradeExpectedValue(data);
    setResult(res);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Card Values
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Raw Card Value ($)"
              type="number"
              step="0.01"
              error={errors.rawCardValue?.message}
              {...register("rawCardValue")}
            />
            <Input
              label="Grading Cost ($)"
              type="number"
              step="0.01"
              error={errors.gradingCost?.message}
              {...register("gradingCost")}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="PSA 10 Value ($)"
              type="number"
              step="0.01"
              error={errors.psa10Value?.message}
              {...register("psa10Value")}
            />
            <Input
              label="PSA 9 Value ($)"
              type="number"
              step="0.01"
              error={errors.psa9Value?.message}
              {...register("psa9Value")}
            />
            <Input
              label="PSA 8 Value ($)"
              type="number"
              step="0.01"
              hint="Optional"
              error={errors.psa8Value?.message}
              {...register("psa8Value")}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Grade Probabilities (%)
          </h4>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="PSA 10 %"
              type="number"
              step="1"
              error={errors.probabilityPsa10?.message}
              {...register("probabilityPsa10")}
            />
            <Input
              label="PSA 9 %"
              type="number"
              step="1"
              error={errors.probabilityPsa9?.message}
              {...register("probabilityPsa9")}
            />
            <Input
              label="PSA 8 %"
              type="number"
              step="1"
              error={errors.probabilityPsa8?.message}
              {...register("probabilityPsa8")}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Fees & Costs
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Marketplace Fee %"
              type="number"
              step="0.01"
              hint="eBay: 13.25%, TCGPlayer: 10.25%"
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
              label="Tax Adjustment ($)"
              type="number"
              step="0.01"
              hint="Optional"
              error={errors.taxAdjustment?.message}
              {...register("taxAdjustment")}
            />
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full">
          Calculate Expected Value
        </Button>
      </form>

      {result && (
        <>
          <ResultDisplay
            recommendation={result.recommendation}
            metrics={[
              {
                label: "Expected Profit",
                value: formatMetricValue(result.expectedProfit, "currency"),
                highlight: true,
              },
              {
                label: "Expected Value",
                value: formatMetricValue(result.expectedValue, "currency"),
              },
              {
                label: "Total Cost",
                value: formatMetricValue(result.totalCost, "currency"),
              },
              {
                label: "Break-even PSA10 %",
                value: `${result.breakEvenProbability.toFixed(1)}%`,
              },
            ]}
          />

          <div className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Scenario Breakdown
            </h4>
            <div className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[hsl(var(--muted))]">
                    <th className="text-left p-3">Grade</th>
                    <th className="text-right p-3">Prob.</th>
                    <th className="text-right p-3">Gross</th>
                    <th className="text-right p-3">Net</th>
                    <th className="text-right p-3">Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenarioBreakdown.map((s) => (
                    <tr
                      key={s.grade}
                      className="border-t border-[hsl(var(--border))]"
                    >
                      <td className="p-3 font-medium">{s.grade}</td>
                      <td className="p-3 text-right">{s.probability.toFixed(0)}%</td>
                      <td className="p-3 text-right">
                        {formatMetricValue(s.grossValue, "currency")}
                      </td>
                      <td
                        className={`p-3 text-right ${
                          s.netValue >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {formatMetricValue(s.netValue, "currency")}
                      </td>
                      <td
                        className={`p-3 text-right ${
                          s.weightedValue >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {formatMetricValue(s.weightedValue, "currency")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
