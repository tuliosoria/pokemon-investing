import type { Metadata } from "next";
import Link from "next/link";
import trainingSummary from "@/lib/data/sealed-ml/training-summary.json";

export const metadata: Metadata = {
  title: "Methodology — PokeFuture Sealed Forecast",
  description:
    "How PokeFuture forecasts sealed Pokémon product values — the signals, the model, and the training data behind every projection.",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
      {children}
    </p>
  );
}

function Card({
  title,
  bullets,
  intro,
  icon,
}: {
  title: string;
  bullets: string[];
  intro?: string;
  icon?: string;
}) {
  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-colors hover:border-[hsl(var(--poke-yellow))]/40">
      <div className="flex items-center gap-2">
        {icon && <span className="text-lg leading-none">{icon}</span>}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {intro && (
        <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          {intro}
        </p>
      )}
      <ul className="mt-3 space-y-2 text-sm leading-snug">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--poke-yellow))]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatTile({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold leading-tight">{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
          {sublabel}
        </p>
      )}
    </div>
  );
}

type TrainingSummary = {
  products: number;
  rows: number;
  panelRows: number;
  models: Record<
    string,
    {
      trainingRows: number;
      treeCount: number;
      crossValidation: { folds: number; mape: number };
      bestHyperparameters: { max_depth: number; learning_rate: number };
    }
  >;
};

export default function MethodologyPage() {
  const summary = trainingSummary as unknown as TrainingSummary;
  const m1 = summary.models["1yr"];
  const m3 = summary.models["3yr"];
  const m5 = summary.models["5yr"];
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/sealed-forecast"
          className="mb-4 inline-block text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          ← Back to sealed forecast
        </Link>

        <header className="mb-8 overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--poke-blue))]/15 via-[hsl(var(--card))] to-[hsl(var(--poke-yellow))]/10 p-6 md:p-8">
          <SectionLabel>Methodology</SectionLabel>
          <h1 className="mt-1 text-3xl font-bold leading-tight md:text-4xl">
            How sealed forecasts work
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            A clear, plain-English guide to what we measure and how we project.
            No financial advice — these are decision-support estimates.
          </p>
        </header>

        <section className="mb-6 rounded-xl border border-[hsl(var(--poke-yellow))]/40 bg-[hsl(var(--poke-yellow))]/5 p-5">
          <SectionLabel>How this works (30 seconds)</SectionLabel>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              "We analyze historical price trends for each sealed product.",
              "We compare it with similar sealed products of the same era and type.",
              "We layer in demand signals — search interest, community discussion, market activity.",
              "We generate a 5-year price projection.",
              "We adjust the confidence rating based on how much data is available.",
            ].map((b) => (
              <li key={b} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--poke-yellow))]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] italic text-[hsl(var(--muted-foreground))]">
            Forecasts are estimates, not guarantees.
          </p>
        </section>

        <div className="space-y-4">
          <Card
            icon="🔍"
            title="What we analyze"
            bullets={[
              "Historical sealed prices over time.",
              "Product age — how long since release.",
              "Comparable products — same era, type, and supply profile.",
              "Demand signals — search trends, community engagement, market activity.",
            ]}
          />

          <section className="rounded-2xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--poke-blue))]/10 p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">🧪</span>
                <h2 className="text-lg font-semibold">Under the hood</h2>
              </div>
              <span className="rounded-full border border-[hsl(var(--poke-yellow))]/40 bg-[hsl(var(--poke-yellow))]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--poke-yellow))]">
                Nerd facts
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              For the curious — what&apos;s actually running behind every
              forecast.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile
                label="Model"
                value="XGBoost"
                sublabel="Gradient-boosted trees"
              />
              <StatTile
                label="Horizons"
                value="1y · 3y · 5y"
                sublabel="Stacked meta-model"
              />
              <StatTile
                label="Training rows"
                value={summary.rows.toLocaleString()}
                sublabel={`${summary.panelRows.toLocaleString()} panel rows`}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile
                label="1y model"
                value={`${m1.trainingRows} rows`}
                sublabel={`${m1.treeCount} trees · MAPE ${m1.crossValidation.mape.toFixed(1)}%`}
              />
              <StatTile
                label="3y model"
                value={`${m3.trainingRows} rows`}
                sublabel={`${m3.treeCount} trees · MAPE ${m3.crossValidation.mape.toFixed(1)}%`}
              />
              <StatTile
                label="5y model"
                value={`${m5.trainingRows} rows`}
                sublabel={`${m5.treeCount} trees · MAPE ${m5.crossValidation.mape.toFixed(1)}%`}
              />
            </div>

            <ul className="mt-5 space-y-2 text-sm leading-snug">
              {[
                "XGBoost regressors trained per horizon (1y, 3y, 5y) on forward log-returns.",
                "5-fold time-series cross-validation prevents lookahead — newer data only ever validates against older data.",
                "35 candidate features per row, including price trajectories, momentum, volatility, drawdown, peer-set ratios, era encoding, and demand signals (Reddit + Trends + forum activity).",
                "5-year horizon uses a stacked meta-model that consumes out-of-fold predictions from the 1y and 3y models.",
                "Hyperparameters tuned per horizon (max_depth, learning_rate, regularization). Models that fail data-volume or stability gates are flagged for manual review instead of auto-deployed.",
                "Bear case applies an asymmetric reprint-shock haircut on top of the predicted spread — products with high reprint risk can break below today's price.",
              ].map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--poke-blue))]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">⚠️</span>
              <h2 className="text-lg font-semibold text-amber-200">
                When not to rely heavily on forecasts
              </h2>
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-snug text-amber-100/90">
              {[
                "Early-stage products without enough price history.",
                "Products with sparse or inconsistent data.",
                "Forecasts marked High uncertainty or Low confidence.",
                "Major upcoming reprints or supply changes you already know about.",
              ].map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] italic text-amber-200/80">
              Treat forecasts as one input alongside your own view of the
              product, the set, and the broader market.
            </p>
          </section>
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            Forecasts are estimates, not financial advice.
          </p>
          <Link
            href="/sealed-forecast"
            className="rounded-lg bg-[hsl(var(--poke-blue))] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Open sealed forecast
          </Link>
        </div>
      </div>
    </div>
  );
}
