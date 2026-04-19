"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";

interface BuyOpportunity {
  id: string;
  name: string;
  productType: string;
  releaseYear: number;
  currentPrice: number;
  imageUrl: string | null;
  compositeScore: number;
  signal: string;
  confidence: string;
  roiPercent: number;
  projectedValue: number;
  dollarGain: number;
  chaseCards: string[];
  printRunLabel: string;
  notes: string;
}

export function TopBuyOpportunities() {
  const [opportunities, setOpportunities] = useState<BuyOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTopBuys() {
      try {
        const res = await fetch("/api/sealed/top-buys?limit=6");
        if (!res.ok) return;
        const data = await res.json();
        setOpportunities(data.opportunities ?? []);
      } catch {
        // Best-effort
      } finally {
        setIsLoading(false);
      }
    }
    fetchTopBuys();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 rounded-full border-3 border-[hsl(var(--poke-yellow))] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (opportunities.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {opportunities.map((opp, i) => (
        <Link
          key={opp.id}
          href="/sealed-forecast"
          className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden hover-lift transition-all"
        >
          {/* Rank + image header */}
          <div className="relative h-28 bg-gradient-to-br from-green-900/40 to-green-700/20 flex items-center px-4 overflow-hidden">
            {/* Rank badge */}
            <div className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center shadow">
              {i + 1}
            </div>

            {/* Product image */}
            {opp.imageUrl ? (
              <div className="absolute right-2 bottom-0 h-28 flex items-end">
                <img
                  src={opp.imageUrl}
                  alt={opp.name}
                  className="h-24 w-auto object-contain drop-shadow-lg group-hover:scale-105 transition-transform"
                />
              </div>
            ) : (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10">
                <TrendingUp className="w-16 h-16 text-green-400" />
              </div>
            )}

            {/* Text */}
            <div className="relative z-10 max-w-[60%]">
              <h4 className="text-white font-bold text-sm leading-tight drop-shadow">
                {opp.name}
              </h4>
              <p className="text-white/60 text-[10px] mt-0.5">
                {opp.productType} · {opp.releaseYear}
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-2">
            {/* Price + ROI */}
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono">
                ${opp.currentPrice.toLocaleString()}
              </span>
              <span className="text-sm font-bold font-mono text-green-400">
                +{opp.roiPercent}% ROI
              </span>
            </div>

            {/* Score bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${opp.compositeScore}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-green-400">
                {opp.compositeScore}/100
              </span>
            </div>

            {/* Target + confidence */}
            <div className="flex items-center justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
              <span>
                5yr target:{" "}
                <span className="text-[hsl(var(--poke-yellow))] font-semibold">
                  ${opp.projectedValue.toLocaleString()}
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${
                opp.confidence === "High"
                  ? "bg-blue-500/20 text-blue-400"
                  : opp.confidence === "Medium"
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-gray-500/20 text-gray-400"
              }`}>
                {opp.confidence}
              </span>
            </div>

            {/* Chase cards */}
            {opp.chaseCards.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {opp.chaseCards.slice(0, 3).map((card) => (
                  <span
                    key={card}
                    className="inline-block rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))]"
                  >
                    {card}
                  </span>
                ))}
                {opp.chaseCards.length > 3 && (
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] py-0.5">
                    +{opp.chaseCards.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
