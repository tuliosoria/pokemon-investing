import Link from "next/link";
import Image from "next/image";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Forecast, Recommendation, SealedSetData } from "@/lib/types/sealed";
import { deriveRecommendation } from "@/lib/domain/recommendation";
import { deriveDisplayConfidence } from "@/lib/domain/confidence-display";

interface ProductForecastCardProps {
  set: SealedSetData;
  forecast: Forecast;
}

function trendIcon(roi: number) {
  if (roi > 5) return <TrendingUp className="h-4 w-4" aria-hidden />;
  if (roi < -5) return <TrendingDown className="h-4 w-4" aria-hidden />;
  return <Minus className="h-4 w-4" aria-hidden />;
}

function trendColor(roi: number) {
  if (roi > 5) return "text-emerald-400";
  if (roi < -5) return "text-rose-400";
  return "text-zinc-400";
}

const recommendationStyle: Record<Recommendation, string> = {
  Buy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Hold: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  Watch: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Avoid: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export function ProductForecastCard({ set, forecast }: ProductForecastCardProps) {
  const displayConfidence = deriveDisplayConfidence({ forecast, set }).confidence;
  const recommendation = deriveRecommendation({
    signal: forecast.signal,
    confidence: displayConfidence,
    roiPercent: forecast.roiPercent,
    releaseYear: set.releaseYear,
  });

  const dollarGain = forecast.dollarGain;
  const roi = forecast.roiPercent;
  const community = set.factors.communityScore;
  const colorClass = trendColor(roi);

  return (
    <Link
      href={`/sealed-forecast/${set.id}`}
      aria-label={`View forecast for ${set.name}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-all hover:border-[hsl(var(--poke-yellow))]/60 hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[hsl(var(--muted))]">
        {set.imageUrl ? (
          <Image
            src={set.imageUrl}
            alt={set.name}
            fill
            className="object-contain p-4 transition-transform group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">
            No image
          </div>
        )}
        <span
          className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${recommendationStyle[recommendation]}`}
        >
          {recommendation}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="text-sm font-semibold leading-tight line-clamp-2">
            {set.name}
          </h3>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            {set.productType} · {set.releaseYear}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              Now
            </p>
            <p className="font-semibold">
              ${set.currentPrice.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              5y Projected
            </p>
            <p className="font-semibold">
              ${forecast.projectedValue.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              ROI
            </p>
            <p className={`flex items-center gap-1 font-semibold ${colorClass}`}>
              {trendIcon(roi)}
              {roi >= 0 ? "+" : ""}
              {roi.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              Gain
            </p>
            <p className={`font-semibold ${colorClass}`}>
              {dollarGain >= 0 ? "+" : ""}${dollarGain.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
          <span>
            Confidence:{" "}
            <span className="font-medium text-[hsl(var(--foreground))]">
              {displayConfidence}
            </span>
          </span>
          {typeof community === "number" && <span>Community {community}/100</span>}
        </div>

        <span className="mt-1 inline-flex items-center justify-center rounded-md border border-[hsl(var(--poke-yellow))]/40 bg-[hsl(var(--poke-yellow))]/10 px-2 py-1 text-[11px] font-semibold text-[hsl(var(--poke-yellow))] transition-colors group-hover:bg-[hsl(var(--poke-yellow))]/20">
          View Forecast →
        </span>
      </div>
    </Link>
  );
}
