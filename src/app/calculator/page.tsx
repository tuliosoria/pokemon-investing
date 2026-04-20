import { GradingCalculator } from "@/components/calculator/grading-calculator";
import { GradingOpportunities } from "@/components/calculator/grading-opportunities";

export default function CalculatorPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Calculator — narrow column */}
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <div className="mb-6 animate-fade-in-up">
          <h1 className="text-2xl md:text-3xl font-bold mb-1">
            Should I grade this card?
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Search a card, set your numbers, get a clear answer.
          </p>
        </div>

        <GradingCalculator />
      </div>

      {/* Grading Opportunities — wider section */}
      <div className="border-t border-[hsl(var(--border))]">
        <div className="container mx-auto px-4 py-10 max-w-3xl">
          <GradingOpportunities />
        </div>
      </div>
    </div>
  );
}
