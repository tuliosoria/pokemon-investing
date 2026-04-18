"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { sealedSchema, type SealedFormValues } from "@/lib/schemas/sealed";
import {
  calculateSealedRoi,
  type SealedResult,
} from "@/lib/domain/sealed";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResultDisplay, formatMetricValue } from "./result-display";
import { SealedProductSearch } from "./sealed-product-search";
import { useState } from "react";
import type { SealedProduct } from "@/lib/data/sealed-products";

export function SealedCalculator() {
  const [result, setResult] = useState<SealedResult | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SealedFormValues>({
    resolver: zodResolver(sealedSchema),
    defaultValues: {
      acquisitionPrice: undefined,
      currentMarketPrice: undefined,
      annualGrowthPct: 15,
      holdPeriodMonths: 12,
      marketplaceFeePct: 13.25,
      storageCost: 0,
      shippingCost: 10,
      taxAdjustment: 0,
    },
  });

  const handleProductSelect = (product: SealedProduct) => {
    setValue("acquisitionPrice", product.msrp);
    setValue("currentMarketPrice", product.estimatedMarket);
    setResult(null);
  };

  const onSubmit = (data: SealedFormValues) => {
    setResult(calculateSealedRoi(data));
  };

  return (
    <div className="space-y-6">
      <SealedProductSearch onProductSelect={handleProductSelect} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Product Values
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Acquisition Price ($)"
              type="number"
              step="0.01"
              error={errors.acquisitionPrice?.message}
              {...register("acquisitionPrice")}
            />
            <Input
              label="Current Market Price ($)"
              type="number"
              step="0.01"
              error={errors.currentMarketPrice?.message}
              {...register("currentMarketPrice")}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Growth Assumptions
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Annual Growth %"
              type="number"
              step="0.1"
              hint="Historical sealed avg: 10-20%"
              error={errors.annualGrowthPct?.message}
              {...register("annualGrowthPct")}
            />
            <Input
              label="Hold Period (months)"
              type="number"
              step="1"
              error={errors.holdPeriodMonths?.message}
              {...register("holdPeriodMonths")}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Exit Costs
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Marketplace Fee %"
              type="number"
              step="0.01"
              hint="eBay: 13.25%"
              error={errors.marketplaceFeePct?.message}
              {...register("marketplaceFeePct")}
            />
            <Input
              label="Annual Storage ($)"
              type="number"
              step="0.01"
              hint="Optional"
              error={errors.storageCost?.message}
              {...register("storageCost")}
            />
            <Input
              label="Shipping ($)"
              type="number"
              step="0.01"
              error={errors.shippingCost?.message}
              {...register("shippingCost")}
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
          Calculate Sealed ROI
        </Button>
      </form>

      {result && (
        <ResultDisplay
          recommendation={result.recommendation}
          metrics={[
            {
              label: "Net Exit Value",
              value: formatMetricValue(result.netExitValue, "currency"),
              highlight: true,
            },
            {
              label: "Annualized Return",
              value: formatMetricValue(result.annualizedReturnPct, "percent"),
              highlight: true,
            },
            {
              label: "Total ROI",
              value: formatMetricValue(result.roiPct, "percent"),
            },
            {
              label: "Projected Value",
              value: formatMetricValue(result.projectedValue, "currency"),
            },
            {
              label: "Holding Costs",
              value: formatMetricValue(result.totalHoldingCost, "currency"),
            },
            {
              label: "Gross Exit Value",
              value: formatMetricValue(result.grossExitValue, "currency"),
            },
          ]}
        />
      )}
    </div>
  );
}
