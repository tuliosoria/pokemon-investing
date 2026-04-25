"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { PriceHistoryPoint } from "@/lib/server/sealed-history";

export interface ForecastSeriesPoint {
  date: string;
  history?: number;
  projection?: number;
}

interface ForecastChartProps {
  history: PriceHistoryPoint[];
  projection: { date: string; value: number }[];
  todayIso: string;
}

function buildSeries(
  history: PriceHistoryPoint[],
  projection: { date: string; value: number }[],
): ForecastSeriesPoint[] {
  const map = new Map<string, ForecastSeriesPoint>();
  for (const h of history) {
    map.set(h.date, { date: h.date, history: h.price });
  }
  for (const p of projection) {
    const existing = map.get(p.date) ?? { date: p.date };
    map.set(p.date, { ...existing, projection: p.value });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: ${Math.round(entry.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export function ForecastChart({ history, projection, todayIso }: ForecastChartProps) {
  const data = buildSeries(history, projection);
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 25%, 18%)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "hsl(215, 20%, 60%)" }}
            axisLine={{ stroke: "hsl(215, 25%, 18%)" }}
            minTickGap={32}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(215, 20%, 60%)" }}
            axisLine={{ stroke: "hsl(215, 25%, 18%)" }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
            }
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="plainline" />
          <ReferenceLine
            x={todayIso}
            stroke="#9CA3AF"
            strokeDasharray="2 2"
            label={{ value: "Today", fontSize: 10, fill: "#9CA3AF", position: "insideTopRight" }}
          />
          <Line
            type="monotone"
            dataKey="history"
            name="Historical"
            stroke="#6B7280"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="projection"
            name="Projected"
            stroke="#FFCB05"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
