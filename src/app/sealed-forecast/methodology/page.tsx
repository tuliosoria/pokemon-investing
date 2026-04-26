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
import trainingSummary from "@/lib/data/sealed-ml/training-summary.json";

export const metadata: Metadata = {
  title: "Methodology — PokeFuture Sealed Forecast",
  description:
    "How PokeFuture forecasts sealed Pokemon product values — the signals, the model, and the training data behind every projection.",
};

type TrainingSummary = {
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

function NerdCard({
  title,
  bullets,
}: {
  title: string;
  bullets: string[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[hsl(var(--background))]/40 p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/75">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--poke-yellow))]" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MethodologyPage() {
  const summary = trainingSummary as TrainingSummary;
  const m1 = summary.models["1yr"];
  const m3 = summary.models["3yr"];
  const m5 = summary.models["5yr"];

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
                  Live ML + market signals
                </HeroBadge>
              </div>

              <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight text-white md:text-5xl">
                How PokeFuture builds a sealed forecast
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/72 md:text-base">
                The short version: we blend price history, comparable sealed
                products, demand signals, and ML projections into a directional
                view of risk and upside. It is built for judgment, not false
                precision.
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
                    Model family
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    XGBoost regressors
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white/65">
                    Separate models for 1-year, 3-year, and 5-year horizons.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                      Validation
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {m1.crossValidation.folds}-fold time-series CV
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                      Dataset
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {summary.rows.toLocaleString()} training rows
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/88 p-6 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.5)] md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <SectionLabel>How this works (30 seconds)</SectionLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Five fast steps, no jargon
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              If you only spend half a minute here, this is the part to read.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <QuickStep
              icon={BarChart3}
              title="1. Read the history"
              copy="We anchor the forecast to real sealed price movement over time."
            />
            <QuickStep
              icon={Layers3}
              title="2. Find comparables"
              copy="We compare the product with similar boxes from the same era and supply profile."
            />
            <QuickStep
              icon={TrendingUp}
              title="3. Measure demand"
              copy="We incorporate search activity, community interest, and broader market momentum."
            />
            <QuickStep
              icon={BrainCircuit}
              title="4. Project forward"
              copy="The ML model estimates where price and return patterns can plausibly go next."
            />
            <QuickStep
              icon={ShieldAlert}
              title="5. Stress test it"
              copy="We widen downside scenarios when reprints or thin data make the setup shakier."
            />
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/88 p-6 md:p-8">
            <SectionLabel>Signals</SectionLabel>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              What the model actually looks at
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              We do not just extrapolate a line. Forecasts blend price action,
              supply context, demand proxies, and peer behavior.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <SignalCard
                icon={BarChart3}
                title="Historical pricing"
                copy="Trajectories, momentum, volatility, drawdowns, and how dense the price history actually is."
              />
              <SignalCard
                icon={Layers3}
                title="Comparable products"
                copy="Peer boxes from similar eras, product types, and print-run environments."
                accentClassName="bg-emerald-500/12 text-emerald-400"
              />
              <SignalCard
                icon={Search}
                title="Demand signals"
                copy="Search interest, Reddit activity, forum chatter, and other community heat proxies."
                accentClassName="bg-sky-500/12 text-sky-400"
              />
              <SignalCard
                icon={Database}
                title="Market context"
                copy="Provider agreement, liquidity proxies, and missing-data flags that affect trust."
                accentClassName="bg-violet-500/12 text-violet-400"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-amber-500/25 bg-[linear-gradient(180deg,rgba(120,53,15,0.20),rgba(120,53,15,0.08))] p-6 md:p-8">
            <SectionLabel>Caution</SectionLabel>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-amber-100">
              When forecasts get shaky
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-amber-50/80">
              The page is most useful for ranking setups and framing scenarios.
              It is least reliable when the market itself is still foggy.
            </p>

            <div className="mt-6 space-y-3">
              {[
                "Very new products with limited price history.",
                "Sets with sparse comparables or odd supply behavior.",
                "High reprint risk that can abruptly change sealed supply.",
                "Thin liquidity, where exit prices can gap below quoted prices.",
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
                Best use
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-50/85">
                Use the forecast as an investment framework: compare products,
                pressure-test upside, and sanity-check downside before you size
                conviction.
              </p>
            </div>
          </section>
        </div>

        <section className="mt-8 overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,16,32,0.95),rgba(18,28,45,0.92),rgba(31,52,94,0.88))] p-6 shadow-[0_30px_120px_-40px_rgba(0,0,0,0.8)] md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <SectionLabel>Under the hood</SectionLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                The nerd-facts section
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-white/68">
              If you want the model, dataset, and validation details, this is
              the real plumbing behind the page.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Model"
              value="XGBoost"
              sublabel="Gradient-boosted decision trees"
            />
            <StatTile
              label="Horizons"
              value="1y · 3y · 5y"
              sublabel="Separate regressors plus a stacked 5-year setup"
            />
            <StatTile
              label="Training rows"
              value={summary.rows.toLocaleString()}
              sublabel={`${summary.panelRows.toLocaleString()} panel rows in the monthly history panel`}
            />
            <StatTile
              label="Feature set"
              value="35 signals"
              sublabel="Price history, demand, comparables, provider agreement"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <NerdCard
              title="Model stack"
              bullets={[
                `1-year model: ${m1.trainingRows} rows, ${m1.treeCount} trees, MAPE ${m1.crossValidation.mape.toFixed(1)}%.`,
                `3-year model: ${m3.trainingRows} rows, ${m3.treeCount} trees, MAPE ${m3.crossValidation.mape.toFixed(1)}%.`,
                `5-year model: ${m5.trainingRows} rows, ${m5.treeCount} trees, MAPE ${m5.crossValidation.mape.toFixed(1)}%.`,
              ]}
            />
            <NerdCard
              title="Validation + tuning"
              bullets={[
                `${m1.crossValidation.folds}-fold time-series cross-validation prevents lookahead leakage.`,
                `1-year tuning landed at max_depth ${m1.bestHyperparameters.max_depth} and learning_rate ${m1.bestHyperparameters.learning_rate.toFixed(2)}.`,
                `3-year tuning landed at max_depth ${m3.bestHyperparameters.max_depth} and learning_rate ${m3.bestHyperparameters.learning_rate.toFixed(2)}.`,
                `5-year tuning landed at max_depth ${m5.bestHyperparameters.max_depth} and learning_rate ${m5.bestHyperparameters.learning_rate.toFixed(2)}.`,
              ]}
            />
            <NerdCard
              title="Guardrails"
              bullets={[
                "Targets are trained on forward log-returns instead of raw prices.",
                "Missing-data and provider-context flags are explicit model inputs, not hidden assumptions.",
                "Bear scenarios apply an asymmetric reprint-shock haircut, so downside can be meaningfully worse for reprint-prone products.",
              ]}
            />
          </div>
        </section>

        <section className="mt-8 flex flex-col gap-5 rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <SectionLabel>Use the tool</SectionLabel>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Ready to compare sealed products?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              Open the forecast view to sort setups, inspect downside cases, and
              compare projected outcomes across products.
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
