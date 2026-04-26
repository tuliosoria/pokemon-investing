import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SEALED_SETS } from "@/lib/data/sealed-sets";
import { loadSealedSetBySlug } from "@/lib/server/load-sealed-set";
import { decodeSealedSlug, encodeSealedSlug } from "@/lib/domain/sealed-slug";
import { computeForecast } from "@/lib/domain/sealed-forecast-ml";
import { deriveRecommendation } from "@/lib/domain/recommendation";
import { buildDescription } from "@/lib/domain/sealed-description";
import { buildProjectionSeries } from "@/lib/domain/projection-series";
import { getSealedPriceHistory } from "@/lib/server/sealed-history";
import { ForecastChart } from "@/components/sealed/forecast-chart";
import { ModelDetails } from "@/components/sealed/model-details";
import { deriveDisplayConfidence } from "@/lib/domain/confidence-display";
import { buildRatingExplanation } from "@/lib/domain/rating-explanation";
import { buildForecastQuality } from "@/lib/domain/forecast-quality";
import { buildScenarios, type Scenario } from "@/lib/domain/scenarios";
import { findComparables, describeComparable } from "@/lib/domain/comparables";
import type { Confidence, Recommendation, SealedSetData } from "@/lib/types/sealed";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return SEALED_SETS.map((s) => ({ slug: encodeSealedSlug(s.id) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSealedSlug(rawSlug);
  const set = await loadSealedSetBySlug(slug);
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

const gradeStyle: Record<"Low" | "Medium" | "High", string> = {
  High: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Low: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const confidenceStyle: Record<Confidence, string> = gradeStyle;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${usd.format(Math.abs(Math.round(value)))}`;
}

function formatSignedCurrency(value: number): string {
  if (value === 0) return usd.format(0);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${usd.format(Math.abs(Math.round(value)))}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

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

function Badge({
  level,
  children,
}: {
  level: "Low" | "Medium" | "High";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${gradeStyle[level]}`}
    >
      {children}
    </span>
  );
}

function trendTagFor(score: number): { label: string; className: string } {
  if (score >= 65) return { label: "↑ Strong", className: "text-emerald-400" };
  if (score <= 40) return { label: "↓ Weak", className: "text-rose-400" };
  return { label: "→ Stable", className: "text-amber-300" };
}

function ComparableCard({
  target,
  comp,
}: {
  target: SealedSetData;
  comp: SealedSetData;
}) {
  const compForecast = computeForecast(comp);
  const tag = trendTagFor(compForecast.compositeScore);
  const ageYears = new Date().getFullYear() - comp.releaseYear;
  return (
    <Link
      href={`/sealed-forecast/${encodeSealedSlug(comp.id)}`}
      className="group flex flex-col gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]/40 p-3 transition hover:border-[hsl(var(--poke-yellow))]/60"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-[hsl(var(--muted))]">
        {comp.imageUrl ? (
          <Image
            src={comp.imageUrl}
            alt={comp.name}
            fill
            className="object-contain p-2"
            sizes="200px"
          />
        ) : null}
      </div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight group-hover:text-[hsl(var(--poke-yellow))]">
          {comp.name}
        </p>
        <span className={`shrink-0 text-xs font-semibold ${tag.className}`}>
          {tag.label}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
        <span>{formatCurrency(comp.currentPrice)}</span>
        <span>
          {ageYears} year{ageYears === 1 ? "" : "s"} old
        </span>
      </div>
      <p className="text-[11px] leading-snug text-[hsl(var(--muted-foreground))]">
        {describeComparable(target, comp)}
      </p>
    </Link>
  );
}

function ScenarioCard({
  scenario,
  tone,
}: {
  scenario: Scenario;
  tone: "bear" | "base" | "bull";
}) {
  const toneClass =
    tone === "bull"
      ? "border-emerald-500/30"
      : tone === "bear"
        ? "border-rose-500/30"
        : "border-[hsl(var(--border))]";
  const labelClass =
    tone === "bull"
      ? "text-emerald-400"
      : tone === "bear"
        ? "text-rose-400"
        : "text-sky-400";
  return (
    <div className={`rounded-lg border ${toneClass} bg-[hsl(var(--background))]/40 p-4`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${labelClass}`}>
        {scenario.name} case
      </p>
      <p className="mt-2 text-xl font-semibold">
        {formatCurrency(scenario.projectedValue)}
      </p>
      <p
        className={`text-xs ${scenario.roiPercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}
      >
        {formatSignedPercent(scenario.roiPercent)} vs current
      </p>
      <p className="mt-2 text-[11px] leading-snug text-[hsl(var(--muted-foreground))]">
        {scenario.description}
      </p>
    </div>
  );
}

export default async function SealedProductDetailPage({ params }: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = decodeSealedSlug(rawSlug);
  const set = await loadSealedSetBySlug(slug);
  if (!set) notFound();

  const forecast = computeForecast(set);
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
  const reprintRisk: "Low" | "Moderate" | "High" =
    set.printRunLabel === "Limited"
      ? "Low"
      : set.printRunLabel === "Overprinted"
        ? "High"
        : "Moderate";

  const comparables = findComparables(set, SEALED_SETS);

  const displayConfidence = deriveDisplayConfidence({
    rawConfidence: forecast.confidence,
    historyPoints: history.length,
    comparables,
    forecast,
  });

  const recommendation = deriveRecommendation({
    signal: forecast.signal,
    confidence: displayConfidence.confidence,
    roiPercent: forecast.roiPercent,
    releaseYear: set.releaseYear,
  });

  const rating = buildRatingExplanation({ recommendation, forecast, set });
  const quality = buildForecastQuality({
    history,
    set,
    forecast,
    comparables,
    reprintRisk,
  });
  const scenarios = buildScenarios({
    currentPrice: set.currentPrice,
    projectedValue: forecast.projectedValue,
    spreadPercent: forecast.predictionSpreadPercent,
  });

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
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidenceStyle[displayConfidence.confidence]}`}
                title={displayConfidence.explanation}
              >
                {displayConfidence.confidence} confidence
              </span>
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {set.productType} · {set.releaseYear} · {ageYears} year
              {ageYears === 1 ? "" : "s"} old
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Current" value={formatCurrency(set.currentPrice)} />
              <Stat
                label="5y Projection"
                value={formatCurrency(forecast.projectedValue)}
              />
              <Stat
                label="ROI"
                value={formatSignedPercent(forecast.roiPercent)}
                accent={forecast.roiPercent}
              />
              <Stat
                label="Gain"
                value={formatSignedCurrency(forecast.dollarGain)}
                accent={forecast.dollarGain}
              />
            </div>

            <p className="text-[11px] leading-snug text-[hsl(var(--muted-foreground))]">
              Estimated returns assume successful resale near market value.
              Actual returns may be lower after fees, taxes, shipping, and
              liquidity constraints.
            </p>

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

        <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">
              Why this rating? — {recommendation}
            </h2>
            <span className="text-[11px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Analyst view
            </span>
          </div>
          <p className="mb-3 text-sm text-[hsl(var(--foreground))]">
            {rating.headline}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[hsl(var(--foreground))]">
            {rating.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">
            Confidence: <strong>{displayConfidence.confidence}</strong> —{" "}
            {displayConfidence.explanation}
          </p>
        </section>

        <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
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
            predictionSpreadPercent={forecast.predictionSpreadPercent}
          />
        </section>

        <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-3 text-base font-semibold">Scenario analysis</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <ScenarioCard scenario={scenarios[0]} tone="bear" />
            <ScenarioCard scenario={scenarios[1]} tone="base" />
            <ScenarioCard scenario={scenarios[2]} tone="bull" />
          </div>
          <p className="mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">
            Bear/Bull bands derived from the model&apos;s prediction spread of
            ±{forecast.predictionSpreadPercent.toFixed(1)}% around the 5-year
            base case.
          </p>
        </section>

        <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Forecast quality</h2>
            <span className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
              Overall <Badge level={quality.overall}>{quality.overall}</Badge>
            </span>
          </div>
          <ul className="divide-y divide-[hsl(var(--border))]">
            {quality.rows.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    {row.detail}
                  </p>
                </div>
                <Badge level={row.grade}>{row.grade}</Badge>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-base font-semibold">About this product</h2>
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

        <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-3 text-base font-semibold">Comparable products</h2>
          {comparables.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No close comparables in catalog yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {comparables.map((comp) => (
                <ComparableCard key={comp.id} target={set} comp={comp} />
              ))}
            </div>
          )}
        </section>

        <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-base font-semibold">Risk factors</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Reprint risk: {reprintRisk}</li>
            <li>Liquidity tier: {set.factors.liquidityTier ?? "normal"}</li>
            <li>
              Set age: {ageYears} year{ageYears === 1 ? "" : "s"}
              {ageYears < 2 ? " (younger sets are more volatile)" : ""}
            </li>
            <li>
              Prediction spread: ±{forecast.predictionSpreadPercent.toFixed(1)}%
              (wider = lower confidence)
            </li>
            {forecast.estimatedFactors > 2 && (
              <li>
                {forecast.estimatedFactors} model inputs were heuristic
                estimates rather than measured values.
              </li>
            )}
          </ul>
        </section>

        <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="mb-2 text-base font-semibold">
            What could make this wrong?
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              Unexpected reprints or re-releases (current reprint posture:{" "}
              {reprintRisk}).
            </li>
            <li>
              Lower-than-expected collector demand if community engagement
              fades.
            </li>
            <li>
              Liquidity issues at exit (current tier:{" "}
              {set.factors.liquidityTier ?? "normal"}) — thin order books can
              force discounted sales.
            </li>
            <li>
              A broader macro downturn in the collectibles market dragging
              comparable sealed prices lower.
            </li>
            <li>
              Model uncertainty: ±{forecast.predictionSpreadPercent.toFixed(1)}%
              spread around the base case suggests material outcome
              variability.
            </li>
            {history.length < 3 && (
              <li>
                Small sample: only {history.length} measured price point
                {history.length === 1 ? "" : "s"} — true volatility may be
                higher than modeled.
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
