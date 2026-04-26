import type { Forecast, SealedSetData } from "@/lib/types/sealed";
import type { KeyDriver } from "@/lib/domain/key-drivers";

interface ModelDetailsProps {
  set: SealedSetData;
  forecast: Forecast;
  lastUpdated: string;
  historicalDataPoints: number;
  keyDrivers: KeyDriver[];
}

const ARROW: Record<KeyDriver["impact"], string> = {
  positive: "↑",
  negative: "↓",
  neutral: "→",
};

const ARROW_COLOR: Record<KeyDriver["impact"], string> = {
  positive: "text-emerald-400",
  negative: "text-rose-400",
  neutral: "text-zinc-400",
};

export function ModelDetails({
  set,
  forecast,
  lastUpdated,
  historicalDataPoints,
  keyDrivers,
}: ModelDetailsProps) {
  const rows: [string, string][] = [
    ["Last updated", lastUpdated],
    ["Historical data source", "PriceCharting (sealed) + community signals"],
    ["Historical data points", String(historicalDataPoints)],
    ["Forecast horizon", "5 years"],
    ["Confidence", forecast.confidence],
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
            <dd className="text-right font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
          Key drivers
        </p>
        <ul className="flex flex-col gap-3">
          {keyDrivers.map((d) => (
            <li key={d.label} className="flex items-start gap-3">
              <span
                className={`mt-0.5 shrink-0 text-base font-bold ${ARROW_COLOR[d.impact]}`}
                aria-hidden
              >
                {ARROW[d.impact]}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{d.label}</p>
                <p className="text-xs leading-snug text-[hsl(var(--muted-foreground))]">
                  {d.explanation}
                </p>
              </div>
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
