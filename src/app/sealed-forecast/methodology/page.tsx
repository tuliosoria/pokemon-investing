import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ShieldAlert, Sigma, TrendingUp } from "lucide-react";

const VARIABLES = [
  {
    name: "Current price",
    source:
      "Synced official PriceCharting sealed price when available, with PokeData / TCGPlayer / eBay fallback for gaps.",
    purpose: "Anchors every projection and ROI calculation to the current market.",
  },
  {
    name: "Most expensive card price",
    source: "Highest-value chase card known for the set.",
    purpose: "Captures how much desirable single-card value sits inside the product.",
  },
  {
    name: "Chase card count",
    source: "Number of standout cards tracked for the set.",
    purpose: "Measures how broad the chase profile is instead of relying on one single hit.",
  },
  {
    name: "Chase card index score",
    source: "Composite score for chase-card quality and desirability.",
    purpose: "Summarizes the strength of the hit list in one feature the model can rank.",
  },
  {
    name: "Set age",
    source: "Years since release.",
    purpose: "Separates brand-new sets from mature products and gives context for price behavior.",
  },
  {
    name: "Google Trends score",
    source: "Live interest data blended into popularity for curated and search results when available.",
    purpose: "Adds a real-time demand signal instead of relying only on static metadata.",
  },
  {
    name: "6-month and 24-month price trajectories",
    source: "Observed sealed-price movement over short and medium horizons when real history exists.",
    purpose: "Shows whether demand has been flat, cooling, or compounding over time.",
  },
  {
    name: "Collector demand ratio",
    source: "Ratio-style proxy for collector demand relative to product price.",
    purpose: "Helps the model differentiate hype from durable demand.",
  },
  {
    name: "Market cycle score",
    source: "High-level cycle context for the broader sealed market.",
    purpose: "Keeps the model aware of whether the market backdrop is hot, neutral, or weak.",
  },
  {
    name: "Popularity score",
    source: "Set-level popularity input, optionally updated with Google Trends.",
    purpose: "Captures brand strength, nostalgia, and current attention.",
  },
  {
    name: "Print run type",
    source: "Encoded category for limited, standard, or overprinted supply profiles.",
    purpose: "Lets the model distinguish scarcity-driven products from broad-print releases.",
  },
  {
    name: "Product type and era",
    source: "Encoded categories such as Booster Box, ETB, UPC, modern, EX/DS, or Base/Neo.",
    purpose: "Gives the model structural context for how different product classes behave.",
  },
];

const CONCEPTS = [
  {
    title: "Gradient-boosted trees",
    description:
      "The forecast uses XGBoost regression models. Instead of one big formula, XGBoost builds many small decision trees. Each new tree focuses on the mistakes left by the previous trees, which makes it good at capturing non-linear market behavior.",
  },
  {
    title: "Forward log-return targets",
    description:
      "Training happens on the natural log of forward return relative to the current snapshot price, then predictions are converted back into dollars. This reduces scale bias between cheap modern products and ultra-expensive vintage boxes while still preserving multiplicative growth patterns.",
  },
  {
    title: "Time-aware validation",
    description:
      "The training pipeline uses blocked time-series validation instead of shuffled folds, so older snapshots train the model and newer snapshots test it. If error is too large relative to the average target price, the retrainer flags the model for manual review instead of publishing it.",
  },
  {
    title: "Feature importance and factor breakdowns",
    description:
      "Global feature importance shows which variables matter most across the full training set. Local factor contributions on each card show which inputs pushed a specific forecast up or down.",
  },
  {
    title: "Prediction spread and confidence",
    description:
      "Confidence is not a gut-feel label. It comes from the spread across horizon predictions and guardrails. Wider spread means lower confidence; capped or suppressed forecasts are forced to Low confidence.",
  },
  {
    title: "Benchmark-relative signals",
    description:
      "Buy / Hold / Sell is derived from projected 5-year ROI relative to an S&P 500 benchmark. A product only earns a Buy when the forecasted return materially beats the benchmark after guardrails are applied.",
  },
];

export const metadata: Metadata = {
  title: "Sealed Forecast Methodology — PokeAlpha",
  description:
    "Learn how PokeAlpha calculates sealed Pokémon forecast scores, model inputs, guardrails, and statistical concepts.",
};

export default function SealedForecastMethodologyPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 space-y-4">
          <Link
            href="/sealed-forecast"
            className="inline-flex items-center text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
          >
            ← Back to sealed forecast
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex rounded-full bg-[hsl(var(--poke-yellow))] px-2.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--poke-blue))]">
              Beta methodology
            </span>
            <span className="inline-flex rounded-full border border-[hsl(var(--border))] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
              ML forecast
            </span>
          </div>
          <h1 className="text-3xl font-extrabold md:text-4xl">
            <span className="text-[hsl(var(--poke-red))]">How the sealed forecast</span>{" "}
            <span className="text-[hsl(var(--poke-yellow))]">is calculated</span>
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))] md:text-base">
            PokeAlpha forecasts 1-year, 3-year, and 5-year sealed prices with
            gradient-boosted tree models trained on historical sealed-product snapshots.
            The system blends live market pricing, set metadata, demand signals, and
            market context, then applies guardrails so sparse or brand-new products do
            not show misleading upside.
          </p>
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <div className="mb-3 inline-flex rounded-xl bg-[hsl(var(--poke-blue))/0.12] p-2 text-[hsl(var(--poke-blue))]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold">Three forecast horizons</h2>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              Separate models estimate 1-year, 3-year, and 5-year prices. The 5-year
              horizon drives the Buy / Hold / Sell signal because it best matches sealed
              investing timeframes.
            </p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <div className="mb-3 inline-flex rounded-xl bg-[hsl(var(--poke-yellow))/0.12] p-2 text-[hsl(var(--poke-yellow))]">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold">Live inputs</h2>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              Current pricing prefers synced official PriceCharting snapshots, then
              falls back to live sealed-market sources where official coverage is
              missing. Google Trends is blended into popularity when available, and
              search results can still be scored with estimated metadata if enough
              signal exists.
            </p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <div className="mb-3 inline-flex rounded-xl bg-[hsl(var(--poke-red))/0.12] p-2 text-[hsl(var(--poke-red))]">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold">Hard guardrails</h2>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              Products under 12 months old are blocked as too new, sparse products are
              suppressed as insufficient data, and 5-year ROI is capped at 300% to stop
              obvious extrapolation failures.
            </p>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <h2 className="text-2xl font-bold">Model flow</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                1. Gather data
              </p>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                Pull synced official or fallback market price, release date, product
                type, search metadata, and trend data.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                2. Build features
              </p>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                Convert the product into numerical variables the models were trained on.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                3. Run ML models
              </p>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                Predict future sealed prices for each horizon, then measure spread and benchmark delta.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                4. Apply guardrails
              </p>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                Cap runaway outputs, suppress weak-data products, and cap scores by confidence.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <h2 className="text-2xl font-bold">Variables used by the model</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            The forecast is not driven by one number. It combines price, product structure,
            supply profile, demand signals, and market context. Some inputs are curated;
            others are estimated for search results when a full set profile is unavailable.
          </p>
          <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Variable</th>
                  <th className="px-4 py-3 font-semibold">What it represents</th>
                  <th className="px-4 py-3 font-semibold">Why it matters</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {VARIABLES.map((variable) => (
                  <tr key={variable.name} className="align-top">
                    <td className="px-4 py-3 font-semibold text-[hsl(var(--foreground))]">
                      {variable.name}
                    </td>
                    <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                      {variable.source}
                    </td>
                    <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                      {variable.purpose}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-xl bg-[hsl(var(--poke-yellow))/0.12] p-2 text-[hsl(var(--poke-yellow))]">
              <Sigma className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold">Statistical concepts behind the forecast</h2>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {CONCEPTS.map((concept) => (
              <div key={concept.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="text-base font-bold text-[hsl(var(--foreground))]">
                  {concept.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                  {concept.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <h2 className="text-2xl font-bold">Guardrails and failure prevention</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4">
              <h3 className="text-base font-bold text-amber-200">Too new to forecast</h3>
              <p className="mt-2 text-sm leading-relaxed text-amber-100/80">
                Products with less than 12 months of age are blocked because they do not have
                enough real trajectory data for a trustworthy forecast.
              </p>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4">
              <h3 className="text-base font-bold text-amber-200">Insufficient data</h3>
              <p className="mt-2 text-sm leading-relaxed text-amber-100/80">
                If more than three inputs are estimated or missing, the product is suppressed
                rather than shown with a false sense of precision.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-base font-bold">ROI cap and confidence cap</h3>
              <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                5-year ROI is capped at 300%. Any capped forecast is forced to Low confidence,
                and Low confidence cards cannot display elite composite scores.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-base font-bold">Retraining gates</h3>
              <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                The retrainer audits outliers, measures cross-validation error, and refuses to
                publish models that look too fragile or overfit.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <h2 className="text-2xl font-bold">How to read the forecast card</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-base font-bold">Projected value and ROI</h3>
              <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                Projected value is the model&apos;s 5-year price estimate after guardrails. ROI compares
                that projected value to the current live price.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-base font-bold">Buy / Hold / Sell</h3>
              <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                The signal reflects whether the 5-year ROI is expected to beat, roughly match,
                or trail the S&amp;P 500 benchmark after accounting for confidence and caps.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-base font-bold">Confidence</h3>
              <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                Confidence summarizes how stable the forecast looks. A narrow, coherent prediction
                path is stronger than one that depends on sparse or noisy inputs.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-base font-bold">Factor Breakdown</h3>
              <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                This panel explains which inputs mattered most for the current card. It is an
                interpretability layer, not a separate scoring formula.
              </p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            These forecasts are estimates, not guarantees or financial advice. They are best used
            as a decision-support tool alongside your own view of supply, demand, and collector behavior.
          </p>
          <div className="mt-5">
            <Link
              href="/sealed-forecast"
              className="inline-flex items-center rounded-lg bg-[hsl(var(--poke-blue))] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Open sealed forecast
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
