"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { flipSchema, type FlipFormValues } from "@/lib/schemas/flip";
import { calculateFlipNetProfit, type FlipResult } from "@/lib/domain/flip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResultDisplay, formatMetricValue } from "./result-display";
import { CardSearch } from "./card-search";
import { useState } from "react";
import type { CardSearchResult } from "@/lib/types/card";

export function FlipCalculator() {
  const [result, setResult] = useState<FlipResult | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FlipFormValues>({
    resolver: zodResolver(flipSchema),
    defaultValues: {
      buyPrice: undefined,
      sellPrice: undefined,
      marketplaceFeePct: 13.25,
      paymentFeePct: 0,
      shippingCost: 5,
      packingCost: 1,
      taxAdjustment: 0,
    },
  });

  const handleCardSelect = (_card: CardSearchResult, rawPrice: number) => {
    if (rawPrice <= 0) return;
    setValue("buyPrice", rawPrice);
    setValue("sellPrice", Math.round(rawPrice * 1.3 * 100) / 100);
    setResult(null);
  };

  const onSubmit = (data: FlipFormValues) => {
    setResult(calculateFlipNetProfit(data));
  };

  return (
    <div className="space-y-6">
      <CardSearch onCardSelect={handleCardSelect} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Buy / Sell
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Buy Price ($)"
              type="number"
              step="0.01"
              error={errors.buyPrice?.message}
              {...register("buyPrice")}
            />
            <Input
              label="Sell Price ($)"
              type="number"
              step="0.01"
              error={errors.sellPrice?.message}
              {...register("sellPrice")}
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
              label="Payment Fee %"
              type="number"
              step="0.01"
              hint="PayPal: 2.9%, Stripe: 2.9%"
              error={errors.paymentFeePct?.message}
              {...register("paymentFeePct")}
            />
            <Input
              label="Shipping ($)"
              type="number"
              step="0.01"
              error={errors.shippingCost?.message}
              {...register("shippingCost")}
            />
            <Input
              label="Packing ($)"
              type="number"
              step="0.01"
              error={errors.packingCost?.message}
              {...register("packingCost")}
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
          Calculate Flip ROI
        </Button>
      </form>

      {result && (
        <ResultDisplay
          recommendation={result.recommendation}
          metrics={[
            {
              label: "Net Profit",
              value: formatMetricValue(result.netProfit, "currency"),
              highlight: true,
            },
            {
              label: "ROI",
              value: formatMetricValue(result.roiPct, "percent"),
              highlight: true,
            },
            {
              label: "Gross Profit",
              value: formatMetricValue(result.grossProfit, "currency"),
            },
            {
              label: "Net Margin",
              value: formatMetricValue(result.netMarginPct, "percent"),
            },
            {
              label: "Total Fees",
              value: formatMetricValue(result.totalFees, "currency"),
            },
            {
              label: "Total Costs",
              value: formatMetricValue(result.totalCosts, "currency"),
            },
          ]}
        />
      )}
    </div>
  );
}
