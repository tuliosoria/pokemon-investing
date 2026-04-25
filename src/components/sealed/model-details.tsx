import type { Forecast, SealedSetData } from "@/lib/types/sealed";

interface ModelDetailsProps {
  set: SealedSetData;
  forecast: Forecast;
  modelVersion: string;
  lastUpdated: string;
  historicalDataPoints: number;
}

const KEY_DRIVERS = [
  "Historical price trend",
  "Volatility / prediction spread",
  "Age since release",
  "Print run / supply tier",
  "Community demand (Reddit + Google Trends + market activity)",
  "Chase-card expected value",
  "Set singles secondary value",
  "Comparable sealed products",
];

export function ModelDetails({
  set,
  forecast,
  modelVersion,
  lastUpdated,
  historicalDataPoints,
}: ModelDetailsProps) {
  const rows: [string, string][] = [
    ["Model version", modelVersion],
    ["Last updated", lastUpdated],
    ["Historical data source", "PriceCharting (sealed) + community signals"],
    ["Historical data points", String(historicalDataPoints)],
    ["Forecast horizon", "5 years"],
    ["Confidence", forecast.confidence],
    [
      "Heuristic factors",
      `${forecast.estimatedFactors} of model inputs were heuristic`,
    ],
    ["Prediction spread", `±${forecast.predictionSpreadPercent.toFixed(1)}%`],
    ["Set", set.name],
    ["Product type", set.productType],
    ["Release year", String(set.releaseYear)],
  ];

  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <h2 className="mb-3 text-lg font-semibold">Model Details</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between gap-4 border-b border-[hsl(var(--border))]/40 py-1"
          >
            <dt className="text-[hsl(var(--muted-foreground))]">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <p className="mb-1 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
          Key drivers
        </p>
        <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {KEY_DRIVERS.map((d) => (
            <li key={d} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--poke-yellow))]" />
              {d}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
        Forecasts are estimates, not financial advice. Pokémon sealed product
        prices are speculative and can be affected by reprints, market cycles,
        liquidity, and collector demand.
      </p>
    </section>
  );
}
