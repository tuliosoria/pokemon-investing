import type { SealedSetData } from "@/lib/types/sealed";

export interface KeyDriver {
  label: string;
  value: string;
  score: number;
  direction: "up" | "down";
  indicator: string;
}

// Extended to cover runtime fields that may be present beyond the base type
type FactorsExtended = SealedSetData["factors"] & {
  singlesDepthScore?: number | null;
  evDemandScore?: number | null;
  chaseCardIndexScore?: number | null;
  chaseCardCount?: number | null;
};

interface DriverConfig {
  key: keyof FactorsExtended;
  label: string;
  isRatio?: boolean;
}

const DRIVER_CONFIGS: DriverConfig[] = [
  { key: "chaseEvRatio", label: "Chase EV Ratio", isRatio: true },
  { key: "evDemandScore", label: "EV Demand Score" },
  { key: "singlesDepthScore", label: "Singles Depth" },
  { key: "chaseCardIndexScore", label: "Chase Card Index" },
  { key: "communityScore", label: "Community Score" },
  { key: "chaseCardIndex", label: "Chase Card Index" },
  { key: "demandRatio", label: "Demand Ratio", isRatio: true },
  { key: "popularity", label: "Popularity" },
  { key: "liquidityTier", label: "Liquidity Tier" },
];

function computeScore(key: keyof FactorsExtended, value: unknown): number {
  if (key === "liquidityTier") {
    return value === "high" ? 85 : value === "normal" ? 50 : value === "low" ? 20 : 0;
  }
  if (key === "chaseEvRatio" || key === "demandRatio") {
    return typeof value === "number" ? Math.min(value * 50, 100) : 0;
  }
  return typeof value === "number" ? Math.min(Math.max(value, 0), 100) : 0;
}

function formatDriverValue(key: keyof FactorsExtended, value: unknown): string {
  if (key === "liquidityTier") {
    const s = String(value);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (key === "chaseEvRatio" || key === "demandRatio") {
    return typeof value === "number" ? `${value.toFixed(2)}x` : "—";
  }
  return typeof value === "number" ? value.toFixed(0) : "—";
}

export function pickKeyDrivers(factors: SealedSetData["factors"]): KeyDriver[] {
  const extended = factors as FactorsExtended;

  const candidates = DRIVER_CONFIGS.flatMap(({ key, label }) => {
    const value = extended[key];
    if (value == null) return [];
    const score = computeScore(key, value);
    const direction: "up" | "down" = score >= 50 ? "up" : "down";
    return [
      {
        label,
        value: formatDriverValue(key, value),
        score,
        direction,
        indicator: direction === "up" ? "↑ Boosts forecast" : "↓ Drags forecast",
      },
    ];
  });

  // Deduplicate by label (e.g. chaseCardIndex and chaseCardIndexScore share a label)
  const seen = new Set<string>();
  const unique = candidates.filter(({ label }) => {
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });

  // Pick 3 most impactful (furthest from neutral 50)
  return unique
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
    .slice(0, 3);
}
