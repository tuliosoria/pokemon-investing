"use client";

import Link from "next/link";
import type { SealedSetData, Forecast } from "@/lib/types/sealed";
import { SignalBadge } from "./signal-badge";
import { useSealedTcgplayerUrl } from "./use-sealed-tcgplayer-url";
import { encodeSealedSlug } from "@/lib/domain/sealed-slug";

function PlaceholderArtwork() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="h-20 w-20 text-[hsl(var(--poke-yellow))] opacity-40"
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
  const isForecastBlocked = forecast.status !== "ready";
  const outperforms = forecast.roiPercent > forecast.spRoi;
  const matchesBenchmark = forecast.roiPercent === forecast.spRoi;
  const { tcgplayerUrl, isLoading: isLoadingTcgplayerUrl } = useSealedTcgplayerUrl({
    name: set.name,
    productType: set.productType,
    initialUrl: set.tcgplayerUrl,
  });

  const communityScore =
    typeof set.factors?.communityScore === "number"
      ? Math.round(set.factors.communityScore)
      : null;
  const redditScore =
    typeof set.factors?.redditScore === "number"
      ? Math.round(set.factors.redditScore)
      : null;
  const marketActivityScore =
    typeof set.factors?.marketActivityScore === "number"
      ? Math.round(set.factors.marketActivityScore)
      : null;
  const googleTrendsScore =
    typeof set.factors?.googleTrendsScore === "number"
      ? Math.round(set.factors.googleTrendsScore)
      : null;
  const forumScore =
    typeof set.factors?.forumScore === "number"
      ? Math.round(set.factors.forumScore)
      : null;
  // Build a compact "Reddit X · Market Y · Trends Z" line that omits any
  // signal that's missing rather than printing "Reddit —". We drop forum
  // from the card line because it's a placeholder neutral 50 today and
  // would just be noise.
  const subSignalParts: string[] = [];
  if (redditScore != null) subSignalParts.push(`Reddit ${redditScore}`);
  if (marketActivityScore != null) subSignalParts.push(`Market ${marketActivityScore}`);
  if (googleTrendsScore != null) subSignalParts.push(`Trends ${googleTrendsScore}`);
  const subSignalLine = subSignalParts.join(" · ");
  const communityLabel =
    communityScore == null
      ? null
      : communityScore >= 70
        ? { text: "🔥 Strong Engagement", tone: "bg-green-500/20 text-green-400" }
        : communityScore >= 50
          ? { text: "📣 Healthy Interest", tone: "bg-emerald-500/20 text-emerald-300" }
          : communityScore >= 30
            ? { text: "💬 Moderate Interest", tone: "bg-amber-500/20 text-amber-300" }
            : { text: "🤫 Quiet Signal", tone: "bg-gray-500/20 text-gray-300" };
  const spDelta = Math.abs(forecast.roiPercent - forecast.spRoi);
  const blockedBadgeLabel =
    forecast.status === "too_new"
      ? "Too New"
      : forecast.status === "insufficient_data"
        ? "Insufficient Data"
        : null;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[hsl(var(--card))] hover-lift shadow-[0_18px_50px_rgba(0,0,0,0.24)] transition-colors hover:border-[hsl(var(--poke-yellow))]/40">
      <Link
        href={`/sealed-forecast/${encodeSealedSlug(set.id)}`}
        aria-label={`View forecast details for ${set.name}`}
        className="absolute inset-0 z-[1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--poke-yellow))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--card))]"
      >
        <span className="sr-only">View details</span>
      </Link>
      <div className="relative h-[200px] flex-shrink-0 overflow-hidden bg-white">
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "radial-gradient(circle at top, #f8fafc 0%, #ffffff 72%)" }}
        >
          <PlaceholderArtwork />
        </div>
        {set.imageUrl && (
          <img
            key={set.imageUrl}
            src={set.imageUrl}
            alt={set.name}
            className="absolute inset-0 h-full w-full object-contain p-3 transition-opacity duration-300"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.style.opacity = "0";
            }}
          />
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, rgba(10,15,30,0) 0%, rgba(10,15,30,0.85) 75%, rgba(10,15,30,0.95) 100%)" }}
        />

        <div className="absolute left-4 top-4 z-10">
          {isForecastBlocked && blockedBadgeLabel ? (
            <span className="inline-flex min-w-[5rem] items-center justify-center rounded-full border border-slate-400/40 bg-slate-900/80 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.2)]">
              {blockedBadgeLabel}
            </span>
          ) : (
            <SignalBadge signal={forecast.signal} />
          )}
        </div>

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
                {isForecastBlocked ? "Forecast" : "5-Year Value"}
              </p>
              {!isForecastBlocked && forecast.projectedValue > 0 ? (
                <p className="mt-1 text-3xl font-black font-mono leading-none text-[hsl(var(--poke-yellow))]">
                  ${forecast.projectedValue.toLocaleString()}
                </p>
              ) : (
                <p className="mt-1 text-right text-sm font-medium leading-snug text-[hsl(var(--muted-foreground))]">
                  {forecast.statusMessage ?? "—"}
                </p>
              )}
            </div>
          </div>

          {isForecastBlocked ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
              <p className="text-sm font-semibold text-amber-200">
                {forecast.statusMessage}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
                {forecast.status === "too_new"
                  ? "This product is under 12 months old, so the model waits for real market history before projecting upside."
                  : "More than three key inputs are missing or estimated, so the forecast is suppressed instead of showing a misleading projection."}
              </p>
            </div>
          ) : (
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
            </div>
          )}

          {!isForecastBlocked && (
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
          )}

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                Community Score
              </p>
              {communityScore != null && (
                <span className="text-[11px] font-semibold text-[hsl(var(--foreground))]">
                  {communityScore}/100
                </span>
              )}
            </div>
            {communityLabel ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${communityLabel.tone}`}
                >
                  {communityLabel.text}
                </span>
                <span className="text-[hsl(var(--muted-foreground))]">
                  {subSignalLine || `Forums ${forumScore ?? "—"}`}
                </span>
              </div>
            ) : (
              <p
                className="text-[11px] text-[hsl(var(--muted-foreground))]"
                title="Community signal unavailable for this set"
              >
                <span className="italic">N/A</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Top cards in set
            </p>
            {set.chaseCards.length > 0 ? (
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
            ) : (
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Top card data unavailable for this product.
              </p>
            )}
          </div>

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

        <div className="mt-auto space-y-3 pt-5">
          {tcgplayerUrl ? (
            <a
              href={tcgplayerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--poke-yellow))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--poke-blue))] transition hover:brightness-105"
            >
              Buy on TCGPlayer
              <span aria-hidden="true">↗</span>
            </a>
          ) : isLoadingTcgplayerUrl ? (
            <p className="text-center text-[11px] text-[hsl(var(--muted-foreground))]">
              Finding TCGPlayer listing…
            </p>
          ) : null}
        </div>
      </div>

    </div>
  );
}
