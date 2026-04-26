import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Methodology — PokeFuture Sealed Forecast",
  description:
    "How PokeFuture forecasts sealed Pokémon product values: the signals we use, how confidence is rated, and when forecasts are less reliable.",
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
}: {
  title: string;
  bullets: string[];
  intro?: string;
}) {
  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
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

function ConfidenceRow({
  level,
  tone,
  description,
}: {
  level: "High" | "Medium" | "Low";
  tone: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-[hsl(var(--border))] py-3 first:border-t-0 first:pt-0">
      <span
        className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
      >
        {level}
      </span>
      <p className="text-sm leading-snug">{description}</p>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/sealed-forecast"
          className="mb-4 inline-block text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          ← Back to sealed forecast
        </Link>

        <header className="mb-8">
          <SectionLabel>Methodology</SectionLabel>
          <h1 className="mt-1 text-3xl font-bold leading-tight md:text-4xl">
            How sealed forecasts work
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            A clear, plain-English guide to what we measure, how we project,
            and when to be cautious. No financial advice — these are
            decision-support estimates.
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
            title="A. What we analyze"
            bullets={[
              "Historical sealed prices over time.",
              "Product age — how long since release.",
              "Comparable products — same era, type, and supply profile.",
              "Demand signals — search trends, community engagement, market activity.",
            ]}
          />

          <Card
            title="B. How forecasts are generated"
            bullets={[
              "We identify a peer group of comparable sealed products.",
              "We analyze growth patterns across that peer group and the product itself.",
              "We project the trend forward across a 5-year horizon.",
              "We adjust for uncertainty — wider ranges when signals disagree.",
            ]}
          />

          <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <h2 className="text-lg font-semibold">C. How confidence works</h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Every forecast carries a confidence rating so you know how much
              weight to give it.
            </p>
            <div className="mt-3">
              <ConfidenceRow
                level="High"
                tone="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                description="Strong historical data plus strong comparable products and consistent demand signals."
              />
              <ConfidenceRow
                level="Medium"
                tone="bg-amber-500/15 text-amber-300 border-amber-500/30"
                description="Partial data — enough for a directional read, but not enough to defend a precise figure."
              />
              <ConfidenceRow
                level="Low"
                tone="bg-rose-500/15 text-rose-400 border-rose-500/30"
                description="Limited data, very early-stage product, or signals that conflict with each other."
              />
            </div>
          </section>

          <Card
            title="D. When forecasts are less reliable"
            bullets={[
              "Brand-new products with little price history.",
              "Sets where comparable products are sparse or unusual.",
              "Products with high reprint risk that could reset supply.",
              "Sets with low market activity and thin liquidity.",
            ]}
          />

          <Card
            title="E. What can affect results"
            bullets={[
              "Reprints or re-releases that change supply.",
              "Shifts in collector demand or community interest.",
              "Broader market cycles in the collectibles space.",
              "Liquidity at the time you sell — thin order books can force discounts.",
            ]}
          />

          <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <h2 className="text-lg font-semibold">A quick example</h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Two products, very different reliability:
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Older product (5+ years)
                </p>
                <p className="mt-2 text-sm leading-snug">
                  Years of price history and many comparable releases — the
                  forecast is more reliable.
                </p>
              </div>
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">
                  New product (under 1 year)
                </p>
                <p className="mt-2 text-sm leading-snug">
                  Limited history and few peer datapoints — the forecast is
                  more speculative and uncertainty is wider.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
            <h2 className="text-lg font-semibold text-amber-200">
              When not to rely heavily on forecasts
            </h2>
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
