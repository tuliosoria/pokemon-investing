import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SEALED_SETS, getSealedSetById } from "@/lib/data/sealed-sets";
import { computeForecast } from "@/lib/domain/sealed-forecast-ml";
import { deriveRecommendation } from "@/lib/domain/recommendation";
import { buildDescription } from "@/lib/domain/sealed-description";
import { buildProjectionSeries } from "@/lib/domain/projection-series";
import { getSealedPriceHistory } from "@/lib/server/sealed-history";
import { ForecastChart } from "@/components/sealed/forecast-chart";
import { ModelDetails } from "@/components/sealed/model-details";
import type { Recommendation } from "@/lib/types/sealed";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return SEALED_SETS.map((s) => ({ slug: s.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const set = getSealedSetById(slug);
  if (!set) return { title: "Product not found — PokeFuture" };
  return {
    title: `${set.name} — Sealed Forecast — PokeFuture`,
    description: `5-year ML forecast, ROI, and recommendation for ${set.name} ${set.productType}.`,
  };
}

const recommendationStyle: Record<Recommendation, string> = {
  Buy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Hold: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  Watch: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Avoid: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: number;
}) {
  const color =
    accent === undefined
      ? ""
      : accent > 0
        ? "text-emerald-400"
        : accent < 0
          ? "text-rose-400"
          : "text-zinc-400";
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]/40 p-2">
      <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
        {label}
      </p>
      <p className={`text-base font-semibold ${color}`}>{value}</p>
    </div>
  );
}

export default async function SealedProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const set = getSealedSetById(slug);
  if (!set) notFound();

  const forecast = computeForecast(set);
  const recommendation = deriveRecommendation({
    signal: forecast.signal,
    confidence: forecast.confidence,
    roiPercent: forecast.roiPercent,
    releaseYear: set.releaseYear,
  });
  const description = buildDescription(set);
  const todayIso = new Date().toISOString().slice(0, 10);
  const projection = buildProjectionSeries({
    currentPrice: set.currentPrice,
    annualRate: forecast.annualRate,
    todayIso,
  }).map((p) => ({ date: p.date, value: p.value }));
  const history = set.pokedataId
    ? await getSealedPriceHistory(set.pokedataId, 24)
    : [];

  const ageYears = new Date().getFullYear() - set.releaseYear;
  const reprintRisk =
    set.printRunLabel === "Limited"
      ? "Low"
      : set.printRunLabel === "Overprinted"
        ? "High"
        : "Moderate";

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/sealed-forecast"
          className="mb-4 inline-block text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          ← All forecasts
        </Link>

        <header className="mb-6 grid gap-6 md:grid-cols-[260px_1fr]">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            {set.imageUrl ? (
              <Image
                src={set.imageUrl}
                alt={set.name}
                fill
                className="object-contain p-4"
                sizes="260px"
                priority
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold md:text-3xl">{set.name}</h1>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${recommendationStyle[recommendation]}`}
              >
                {recommendation}
              </span>
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {set.productType} · {set.releaseYear} · Confidence:{" "}
              {forecast.confidence}
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Current"
                value={`$${set.currentPrice.toLocaleString()}`}
              />
              <Stat
                label="5y Projection"
                value={`$${forecast.projectedValue.toLocaleString()}`}
              />
              <Stat
                label="ROI"
                value={`${forecast.roiPercent >= 0 ? "+" : ""}${forecast.roiPercent.toFixed(1)}%`}
                accent={forecast.roiPercent}
              />
              <Stat
                label="Gain"
                value={`${forecast.dollarGain >= 0 ? "+" : ""}$${forecast.dollarGain.toLocaleString()}`}
                accent={forecast.dollarGain}
              />
            </div>

            {set.tcgplayerUrl && (
              <a
                href={set.tcgplayerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs hover:border-[hsl(var(--poke-yellow))]/60"
              >
                Buy on TCGplayer ↗
              </a>
            )}
          </div>
        </header>

        <section className="mb-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-3 text-lg font-semibold">
            Price history & 5-year projection
          </h2>
          {history.length < 3 && (
            <p className="mb-2 inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
              Limited history available — chart shows projection-heavy view.
            </p>
          )}
          <ForecastChart
            history={history}
            projection={projection}
            todayIso={todayIso}
          />
        </section>

        <section className="mb-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-lg font-semibold">About this product</h2>
          <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]">
            {description.text}
          </p>
          {set.chaseCards?.length ? (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
                Key chase cards
              </p>
              <ul className="flex flex-wrap gap-2 text-xs">
                {set.chaseCards.map((c) => (
                  <li
                    key={c}
                    className="rounded-full border border-[hsl(var(--border))] px-2 py-0.5"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="mb-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-lg font-semibold">Risk factors</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Reprint risk: {reprintRisk}</li>
            <li>Liquidity tier: {set.factors.liquidityTier ?? "normal"}</li>
            <li>
              Set age: {ageYears} year{ageYears === 1 ? "" : "s"}
              {ageYears < 2
                ? " (younger sets are more volatile)"
                : ""}
            </li>
            <li>
              Prediction spread: ±{forecast.predictionSpreadPercent.toFixed(1)}%
              (wider = lower confidence)
            </li>
            {forecast.estimatedFactors > 2 && (
              <li>
                {forecast.estimatedFactors} model inputs were heuristic estimates
                rather than measured values.
              </li>
            )}
          </ul>
        </section>

        <ModelDetails
          set={set}
          forecast={forecast}
          modelVersion="sealed-forecast v1"
          lastUpdated={new Date().toISOString().slice(0, 10)}
          historicalDataPoints={history.length}
        />
      </div>
    </div>
  );
}
