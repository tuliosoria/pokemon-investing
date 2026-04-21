import Link from "next/link";
import { ForecastDashboard } from "@/components/sealed/forecast-dashboard";

export const metadata = {
  title: "Sealed Set Forecasting — PokeAlpha",
  description:
    "ML-powered forecasting for Pokémon TCG sealed products. Get Buy, Hold, or Sell signals with S&P 500 comparisons for booster boxes and ETBs.",
};

export default function SealedForecastPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8 animate-fade-in-up">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl md:text-4xl font-extrabold">
              <span className="text-[hsl(var(--poke-red))]">Sealed</span>{" "}
              <span className="text-[hsl(var(--poke-yellow))]">Set Forecasting</span>
            </h1>
            <span className="inline-block rounded-full bg-[hsl(var(--poke-yellow))] px-2.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--poke-blue))]">
              Beta
            </span>
            <Link
              href="/sealed-forecast/methodology"
              className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--poke-yellow))]/60 hover:text-[hsl(var(--poke-yellow))]"
            >
              Learn how it is calculated
            </Link>
          </div>
          <p className="text-[hsl(var(--muted-foreground))] max-w-2xl">
            Machine-learning forecasts for Pokémon TCG sealed products. See projected
            5-year returns, compare against the S&amp;P 500, and explore the factors
            behind every Buy / Hold / Sell signal.
          </p>
        </div>

        <ForecastDashboard />
      </div>
    </div>
  );
}
