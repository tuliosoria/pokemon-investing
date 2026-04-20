"use client";

import { useState } from "react";
import type { SealedSetData, Forecast } from "@/lib/types/sealed";
import { getProjectionData } from "@/lib/domain/sealed-forecast";
import { SignalBadge, ConfidenceBadge } from "./signal-badge";
import { RoiChart } from "./roi-chart";
import { FactorBreakdown } from "./factor-breakdown";

const CARD_HEADER_OVERLAY =
  "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(10,15,30,0.92) 100%)";

function PlaceholderArtwork() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="h-20 w-20 text-[hsl(var(--poke-yellow))]"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.3" />
      <path d="M14 60a46 46 0 0 1 92 0" fill="currentColor" opacity="0.12" />
      <path d="M14 60a46 46 0 0 0 92 0" fill="currentColor" opacity="0.05" />
      <line x1="14" y1="60" x2="106" y2="60" stroke="currentColor" strokeWidth="4" opacity="0.35" />
      <circle cx="60" cy="60" r="12" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.5" />
      <circle cx="60" cy="60" r="5" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

interface SetForecastCardProps {
  set: SealedSetData;
  forecast: Forecast;
}

export function SetForecastCard({ set, forecast }: SetForecastCardProps) {
  const [showChart, setShowChart] = useState(false);
  const projectionData = getProjectionData(set, forecast);
  const outperforms = forecast.roiPercent > forecast.spRoi;
  const matchesBenchmark = forecast.roiPercent === forecast.spRoi;
  const isEstimated = forecast.estimatedFactors > 0;

  const trendScore = set.trendData?.current ?? 0;
  const hasTrendScore = trendScore > 0;
  const spDelta = Math.abs(forecast.roiPercent - forecast.spRoi);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[hsl(var(--card))] hover-lift shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
      <div className="relative h-[200px] flex-shrink-0 overflow-hidden bg-[#0b1220]">
        {set.imageUrl ? (
          <>
            <img
              src={set.imageUrl}
              alt={set.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/10" />
          </>
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "radial-gradient(circle at top, #1e2a3a 0%, #0b1220 72%)" }}
          >
            <PlaceholderArtwork />
          </div>
        )}
        <div className="absolute inset-0" style={{ background: CARD_HEADER_OVERLAY }} />

        <div className="absolute left-4 top-4 z-10">
          <SignalBadge signal={forecast.signal} />
        </div>

        {isEstimated && (
          <span className="absolute right-4 top-4 z-10 rounded-full border border-orange-400/50 bg-orange-500/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-200">
            Estimated
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 z-10 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
            {set.productType}
            <span className="mx-2 text-white/35">|</span>
            {set.releaseYear}
          </p>
          <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-tight text-white drop-shadow-sm">
            {set.name}
          </h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                Current
              </p>
              {set.currentPrice > 0 ? (
                <p className="mt-1 text-2xl font-bold font-mono text-[hsl(var(--foreground))]">
                  ${set.currentPrice.toLocaleString()}
                </p>
              ) : (
                <p className="mt-1 text-sm font-medium text-[hsl(var(--muted-foreground))]">
                  Price Unavailable
                </p>
              )}
            </div>
            <div className="min-w-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                Projected
              </p>
              {forecast.projectedValue > 0 ? (
                <p className="mt-1 text-3xl font-black font-mono leading-none text-[hsl(var(--poke-yellow))]">
                  ${forecast.projectedValue.toLocaleString()}
                </p>
              ) : (
                <p className="mt-1 text-sm font-medium text-[hsl(var(--muted-foreground))]">
                  —
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                className={`text-base font-bold font-mono ${
                  forecast.roiPercent >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {forecast.roiPercent >= 0 ? "+" : ""}
                {forecast.roiPercent}% ROI
              </span>
              <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                ${forecast.dollarGain >= 0 ? "+" : ""}
                {forecast.dollarGain.toLocaleString()}
              </span>
            </div>
            <div>
              <ConfidenceBadge confidence={forecast.confidence} />
            </div>
          </div>

          <p
            className={`text-[11px] font-medium leading-relaxed ${
              outperforms ? "text-green-400" : matchesBenchmark ? "text-yellow-400" : "text-red-400"
            }`}
          >
            {outperforms ? "▲" : matchesBenchmark ? "~" : "▼"} Projected to{" "}
            {outperforms ? "outperform" : matchesBenchmark ? "match" : "underperform"} S&P 500
            {!matchesBenchmark && (
              <>
                {" "}by {spDelta}% over 5 years
              </>
            )}
            {matchesBenchmark && " over 5 years"}
          </p>

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
              {hasTrendScore ? (
                <span className="text-[hsl(var(--muted-foreground))]">
                  Google Trends: {trendScore}/100
                </span>
              ) : (
                <span
                  className="text-gray-300"
                  title="Trend data unavailable for this set"
                >
                  Google Trends: <span className="italic">N/A</span>
                </span>
              )}
            </div>
          )}

          {set.chaseCards.length > 0 && (
            <div className="flex max-h-[64px] flex-wrap gap-2 overflow-hidden">
              {set.chaseCards.map((card) => (
                <span
                  key={card}
                  className="inline-flex items-center rounded-md border border-[#FFCB05]/20 border-l-[3px] border-l-[#FFCB05] bg-[rgba(255,203,5,0.1)] px-2.5 py-1 text-[10px] font-medium text-[#FFE58A]"
                >
                  {card}
                </span>
              ))}
            </div>
          )}

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
        </div>

        <div className="mt-auto pt-5">
          <button
            type="button"
            onClick={() => setShowChart(!showChart)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgba(255,203,5,0.4)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[hsl(var(--poke-yellow))] transition hover:border-[hsl(var(--poke-yellow))] hover:bg-[rgba(255,203,5,0.1)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 16l5-5 4 4 7-7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 8v5h-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showChart ? "Hide" : "Show"} $1,000 Investment Chart
          </button>

          {showChart && (
            <div className="mt-3 animate-fade-in">
              <RoiChart data={projectionData} setName={set.name} />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] text-center mt-1">
                Projected growth of $1,000 invested today over 5 years
              </p>
            </div>
          )}
        </div>
      </div>

      <FactorBreakdown
        contributions={forecast.factorContributions}
        compositeScore={forecast.compositeScore}
      />
    </div>
  );
}
