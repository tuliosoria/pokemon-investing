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
          <h1 className="text-3xl md:text-4xl font-extrabold mb-2">
            <span className="text-[hsl(var(--poke-red))]">Sealed</span>{" "}
            <span className="text-[hsl(var(--poke-yellow))]">Set Forecasting</span>
            <span className="ml-2 align-middle inline-block text-[10px] font-semibold bg-[hsl(var(--poke-yellow))] text-[hsl(var(--poke-blue))] rounded-full px-2.5 py-0.5 relative -top-1">
              Beta
            </span>
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] max-w-2xl">
            Weighted scoring model for Pokémon TCG sealed products. See projected 5-year
            returns, compare against the S&amp;P 500, and explore the factors behind
            every Buy / Hold / Sell signal.
          </p>
        </div>

        <ForecastDashboard />
      </div>
    </div>
  );
}
