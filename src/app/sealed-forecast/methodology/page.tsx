import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Database,
  FlaskConical,
  Layers3,
  type LucideIcon,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Methodology — PokeFuture Sealed Forecast",
  description:
    "How PokeFuture forecasts sealed Pokemon product values — the signals, the model, and the data sources behind every projection.",
};

type IconCardProps = {
  icon: LucideIcon;
  title: string;
  copy: string;
  accentClassName?: string;
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
      {children}
    </p>
  );
}

function HeroBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent";
}) {
  const toneClasses =
    tone === "accent"
      ? "border-[hsl(var(--poke-yellow))]/35 bg-[hsl(var(--poke-yellow))]/12 text-[hsl(var(--poke-yellow))]"
      : "border-[hsl(var(--border))] bg-[hsl(var(--background))]/70 text-[hsl(var(--foreground))]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${toneClasses}`}
    >
      {children}
    </span>
  );
}

function QuickStep({ icon: Icon, title, copy }: IconCardProps) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/55 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--poke-blue))]/12 text-[hsl(var(--poke-blue))]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        {copy}
      </p>
    </div>
  );
}

function SignalCard({
  icon: Icon,
  title,
  copy,
  accentClassName = "bg-[hsl(var(--poke-yellow))]/10 text-[hsl(var(--poke-yellow))]",
}: IconCardProps) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/45 p-4">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${accentClassName}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
        {copy}
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold leading-tight text-white">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/65">{sublabel}</p>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--background))]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-8 h-72 w-72 rounded-full bg-[hsl(var(--poke-blue))]/10 blur-3xl" />
        <div className="absolute right-[-5rem] top-28 h-80 w-80 rounded-full bg-[hsl(var(--poke-yellow))]/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      </div>

      <main className="relative container mx-auto max-w-5xl px-4 py-10 md:py-14">
        <Link
          href="/sealed-forecast"
          className="mb-5 inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          <ArrowRight className="h-3.5 w-3.5 rotate-180" />
          Back to sealed forecast
        </Link>

        <section className="overflow-hidden rounded-[32px] border border-[hsl(var(--border))] bg-[linear-gradient(135deg,rgba(17,24,39,0.9),rgba(17,24,39,0.72),rgba(36,56,94,0.88))] shadow-[0_30px_120px_-40px_rgba(0,0,0,0.7)]">
          <div className="grid gap-8 px-6 py-7 md:px-8 md:py-9 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <div className="flex flex-wrap gap-2">
                <HeroBadge>
                  <Sparkles className="h-3.5 w-3.5" />
                  Methodology
                </HeroBadge>
                <HeroBadge tone="accent">
                  <FlaskConical className="h-3.5 w-3.5" />
                  Machine learning + market signals
                </HeroBadge>
              </div>

              <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight text-white md:text-5xl">
                How PokeFuture builds a sealed forecast
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/72 md:text-base">
                Each forecast combines historical pricing, comparable sealed
                products, demand signals, and machine-learning projections to
                produce a directional view of risk and upside. The framework
                is designed to support investment judgment, not to imply
                precision the underlying data cannot support.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/sealed-forecast"
                  className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--poke-yellow))] px-4 py-2 text-sm font-semibold text-[hsl(var(--poke-blue))] transition-transform hover:-translate-y-0.5"
                >
                  Open sealed forecast
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="inline-flex items-center rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-white/70">
                  Forecasts are estimates, not guarantees.
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-sm">
              <SectionLabel>At a glance</SectionLabel>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    Approach
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    Machine-learning forecasts
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">
                    Independent projections across 1-year, 3-year, and 5-year
                    horizons.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    Data sources
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    PriceCharting, TCGplayer, community signals
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">
                    Multi-provider pricing combined with demand and engagement
                    signals.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/88 p-6 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.5)] md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <SectionLabel>Process</SectionLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                How a forecast is built
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              Every product moves through the same five stages before a
              projection is published.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <QuickStep
              icon={BarChart3}
              title="1. Historical pricing"
              copy="The forecast is anchored to observed sealed price movement over time."
            />
            <QuickStep
              icon={Layers3}
              title="2. Comparable products"
              copy="The product is benchmarked against peers from a similar era and supply profile."
            />
            <QuickStep
              icon={TrendingUp}
              title="3. Demand signals"
              copy="Search activity, community engagement, and broader market momentum are factored in."
            />
            <QuickStep
              icon={BrainCircuit}
              title="4. Model projection"
              copy="Trained models project plausible price and return paths across each horizon."
            />
            <QuickStep
              icon={ShieldAlert}
              title="5. Downside review"
              copy="Bear scenarios are widened where reprint risk or limited data warrant additional caution."
            />
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/88 p-6 md:p-8">
            <SectionLabel>Inputs</SectionLabel>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              What the model evaluates
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              Forecasts draw on four families of inputs: price action, supply
              context, demand proxies, and peer-group behavior.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <SignalCard
                icon={BarChart3}
                title="Historical pricing"
                copy="Trajectories, momentum, volatility, drawdowns, and the density of available price history."
              />
              <SignalCard
                icon={Layers3}
                title="Comparable products"
                copy="Peer products from similar eras, product types, and print-run environments."
                accentClassName="bg-emerald-500/12 text-emerald-400"
              />
              <SignalCard
                icon={Search}
                title="Demand signals"
                copy="Search interest, community engagement, and other indicators of collector activity."
                accentClassName="bg-sky-500/12 text-sky-400"
              />
              <SignalCard
                icon={Database}
                title="Market context"
                copy="Provider agreement, liquidity proxies, and explicit flags for any missing data."
                accentClassName="bg-violet-500/12 text-violet-400"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-amber-500/25 bg-[linear-gradient(180deg,rgba(120,53,15,0.20),rgba(120,53,15,0.08))] p-6 md:p-8">
            <SectionLabel>Limitations</SectionLabel>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-amber-100">
              Where forecasts are less reliable
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-50/80">
              The framework is most useful for ranking opportunities and
              framing scenarios. It is least reliable when the underlying
              market signal is weak.
            </p>

            <div className="mt-6 space-y-3">
              {[
                "Recently released products with limited price history.",
                "Sets with sparse comparables or atypical supply behavior.",
                "Products exposed to elevated reprint risk.",
                "Thin-liquidity products where realized exit prices may diverge from quoted prices.",
              ].map((item) => (
                <div
                  key={item}
                  className="flex gap-3 rounded-2xl border border-amber-400/15 bg-black/10 p-4"
                >
                  <div className="mt-0.5 rounded-full bg-amber-300/20 p-1 text-amber-200">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <p className="text-sm leading-relaxed text-amber-50/88">
                    {item}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-amber-400/15 bg-black/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/70">
                Intended use
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-50/85">
                Forecasts are intended as one input within a broader research
                process — used to compare products, evaluate upside, and
                stress-test downside before sizing a position.
              </p>
            </div>
          </section>
        </div>

        <section className="mt-8 overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,16,32,0.95),rgba(18,28,45,0.92),rgba(31,52,94,0.88))] p-6 shadow-[0_30px_120px_-40px_rgba(0,0,0,0.8)] md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <SectionLabel>Data sources</SectionLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                What powers the forecasts
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-white/68">
              Forecasts are trained on a multi-source dataset that combines
              market pricing with collector demand signals.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Pricing"
              value="PriceCharting"
              sublabel="Sealed product price history across multiple conditions"
            />
            <StatTile
              label="Marketplace"
              value="TCGplayer"
              sublabel="Live market pricing and listing activity"
            />
            <StatTile
              label="Demand"
              value="Community signals"
              sublabel="Search interest, Reddit, and forum engagement"
            />
            <StatTile
              label="Catalog"
              value="Set metadata"
              sublabel="Era, product type, print-run profile, and release date"
            />
          </div>
        </section>

        <section className="mt-8 flex flex-col gap-5 rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <SectionLabel>Get started</SectionLabel>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Explore sealed product forecasts
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              Open the forecast view to compare products, review downside
              scenarios, and evaluate projected outcomes across the catalog.
            </p>
          </div>

          <Link
            href="/sealed-forecast"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[hsl(var(--poke-blue))] px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Open sealed forecast
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}
