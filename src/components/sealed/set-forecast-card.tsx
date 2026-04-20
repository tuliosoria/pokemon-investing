"use client";

import { useState } from "react";
import type { SealedSetData, Forecast } from "@/lib/types/sealed";
import { getProjectionData } from "@/lib/domain/sealed-forecast";
import { SignalBadge, ConfidenceBadge } from "./signal-badge";
import { RoiChart } from "./roi-chart";
import { FactorBreakdown } from "./factor-breakdown";

interface SetForecastCardProps {
  set: SealedSetData;
  forecast: Forecast;
}

export function SetForecastCard({ set, forecast }: SetForecastCardProps) {
  const [showChart, setShowChart] = useState(false);
  const projectionData = getProjectionData(set, forecast);
  const outperforms = forecast.roiPercent > forecast.spRoi;
  const isEstimated = forecast.estimatedFactors > 0;

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden hover-lift flex flex-col">
      {/* Header — dark semi-transparent overlay, image contained inside */}
      <div className="relative h-28 overflow-hidden flex-shrink-0">
        {/* Gradient background */}
        <div className="absolute inset-0" style={{ background: set.gradient }} />
        <div className="absolute inset-0 bg-black/40" />

        {/* Product image — contained, consistent placement */}
        {set.imageUrl && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 h-24 w-24 flex items-center justify-center">
            <img
              src={set.imageUrl}
              alt={set.name}
              className="max-h-full max-w-full object-contain drop-shadow-lg"
            />
          </div>
        )}

        {/* Text overlay */}
        <div className="relative z-10 h-full flex flex-col justify-end p-4">
          <div className={set.imageUrl ? "pr-28" : ""}>
            <h3 className="text-white font-bold text-sm leading-tight drop-shadow line-clamp-2">
              {set.name}
            </h3>
            <p className="text-white/70 text-[10px] mt-0.5">
              {set.productType} · {set.releaseYear}
              {set.curated && (
                <span className="ml-1.5 text-yellow-300/80" title="Curated analysis">★</span>
              )}
            </p>
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            {isEstimated && (
              <span className="rounded-full bg-orange-500/30 border border-orange-500/50 text-orange-300 px-2 py-0.5 text-[9px] font-semibold">
                Est.
              </span>
            )}
            <SignalBadge signal={forecast.signal} />
          </div>
        </div>
      </div>

      {/* Body — flex-grow so cards stretch to equal height */}
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* Price row */}
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Current</p>
            {set.currentPrice > 0 ? (
              <p className="text-lg font-bold font-mono">
                ${set.currentPrice.toLocaleString()}
              </p>
            ) : (
              <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                Price Unavailable
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">5yr Target</p>
            {forecast.projectedValue > 0 ? (
              <p className="text-lg font-bold font-mono text-[hsl(var(--poke-yellow))]">
                ${forecast.projectedValue.toLocaleString()}
              </p>
            ) : (
              <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                —
              </p>
            )}
          </div>
        </div>

        {/* ROI + Confidence */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-bold font-mono ${
                forecast.roiPercent >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {forecast.roiPercent >= 0 ? "+" : ""}
              {forecast.roiPercent}% ROI
            </span>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
              (${forecast.dollarGain >= 0 ? "+" : ""}
              {forecast.dollarGain.toLocaleString()})
            </span>
          </div>
          <ConfidenceBadge confidence={forecast.confidence} />
        </div>

        {/* S&P comparison label */}
        <p
          className={`text-[11px] font-medium ${
            outperforms ? "text-green-400" : "text-red-400"
          }`}
        >
          {outperforms ? "▲" : "▼"} Projected to{" "}
          {outperforms ? "outperform" : "underperform"} S&P 500 by{" "}
          {Math.abs(forecast.roiPercent - forecast.spRoi)}% over 5 years
        </p>

        {/* Google Trends indicator */}
        {set.trendData && (
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                set.trendData.direction === "rising"
                  ? "bg-green-500/20 text-green-400"
                  : set.trendData.direction === "declining"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-gray-500/20 text-gray-400"
              }`}
            >
              {set.trendData.direction === "rising"
                ? "📈 Trending Up"
                : set.trendData.direction === "declining"
                  ? "📉 Trending Down"
                  : "➡️ Stable Interest"}
            </span>
            <span className="text-[hsl(var(--muted-foreground))]">
              Google Trends: {set.trendData.current}/100
            </span>
          </div>
        )}

        {/* Chase cards */}
        {set.chaseCards.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {set.chaseCards.map((card) => (
              <span
                key={card}
                className="inline-block rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]"
              >
                {card}
              </span>
            ))}
          </div>
        )}

        {/* Supply + notes */}
        <div className="flex items-center gap-2 text-[10px]">
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              set.printRunLabel === "Limited"
                ? "bg-red-500/20 text-red-400"
                : set.printRunLabel === "Overprinted"
                  ? "bg-gray-500/20 text-gray-400"
                  : "bg-blue-500/20 text-blue-400"
            }`}
          >
            {set.printRunLabel} Print
          </span>
          <span className="text-[hsl(var(--muted-foreground))]">
            {new Date().getFullYear() - set.releaseYear}yr old
          </span>
        </div>

        {/* Spacer to push chart button to bottom */}
        <div className="flex-1" />

        {/* Chart toggle — always pinned at bottom */}
        <button
          type="button"
          onClick={() => setShowChart(!showChart)}
          className="w-full text-center text-xs font-medium text-[hsl(var(--poke-yellow))] hover:underline py-1"
        >
          {showChart ? "Hide" : "Show"} $1,000 Investment Chart
        </button>

        {showChart && (
          <div className="animate-fade-in">
            <RoiChart data={projectionData} setName={set.name} />
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] text-center mt-1">
              Projected growth of $1,000 invested today over 5 years
            </p>
          </div>
        )}
      </div>

      {/* Factor breakdown */}
      <FactorBreakdown
        contributions={forecast.factorContributions}
        compositeScore={forecast.compositeScore}
      />
    </div>
  );
}
