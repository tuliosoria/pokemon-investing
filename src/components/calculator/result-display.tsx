import { RECOMMENDATION_CONFIG, type RecommendationBand } from "@/lib/domain/fees";
import { formatCurrency, formatPercent } from "@/lib/utils";

interface ResultDisplayProps {
  recommendation: RecommendationBand;
  metrics: { label: string; value: string; highlight?: boolean }[];
}

export function ResultDisplay({ recommendation, metrics }: ResultDisplayProps) {
  const config = RECOMMENDATION_CONFIG[recommendation];

  return (
    <div className="space-y-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{config.emoji}</span>
        <div>
          <h3 className={`text-xl font-bold ${config.color}`}>
            {config.label}
          </h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {config.description}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className={`rounded-lg p-3 ${
              m.highlight
                ? "bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.3)]"
                : "bg-[hsl(var(--muted))]"
            }`}
          >
            <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
              {m.label}
            </p>
            <p className="text-lg font-semibold mt-0.5">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function formatMetricValue(value: number, type: "currency" | "percent"): string {
  return type === "currency" ? formatCurrency(value) : formatPercent(value);
}
