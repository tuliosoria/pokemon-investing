"use client";

import {
  ComposedChart,
  Line,
  Area,
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
  band?: [number, number];
}

interface ForecastChartProps {
  history: PriceHistoryPoint[];
  projection: { date: string; value: number }[];
  todayIso: string;
  predictionSpreadPercent?: number;
}

function buildSeries(
  history: PriceHistoryPoint[],
  projection: { date: string; value: number }[],
  spreadPercent: number,
): ForecastSeriesPoint[] {
  const map = new Map<string, ForecastSeriesPoint>();
  for (const h of history) {
    map.set(h.date, { date: h.date, history: h.price });
  }
  for (const p of projection) {
    const existing = map.get(p.date) ?? { date: p.date };
    const next: ForecastSeriesPoint = { ...existing, projection: p.value };
    if (spreadPercent > 0) {
      const fraction = Math.min(spreadPercent / 100, 0.5);
      const delta = p.value * fraction;
      const low = Math.max(0, p.value - delta);
      const high = p.value + delta;
      next.band = [low, high];
    }
    map.set(p.date, next);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function formatTickDate(date: string): string {
  return date.length >= 7 ? date.slice(0, 7) : date;
}

function CustomTooltip({
  active,
  payload,
  label,
  todayIso,
}: {
  active?: boolean;
  payload?: { value: number | number[]; name: string; color: string; dataKey: string }[];
  label?: string;
  todayIso: string;
}) {
  if (!active || !payload?.length) return null;
  const isTodayBoundary = label === todayIso;
  const headerLabel = isTodayBoundary ? "Today" : formatTickDate(label ?? "");
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{headerLabel}</p>
      {payload.map((entry) => {
        if (entry.dataKey === "band" && Array.isArray(entry.value)) {
          const [low, high] = entry.value;
          return (
            <p key={entry.name} style={{ color: entry.color }}>
              Range: ${Math.round(low).toLocaleString()} – ${Math.round(high).toLocaleString()}
            </p>
          );
        }
        if (typeof entry.value === "number") {
          return (
            <p key={entry.name} style={{ color: entry.color }}>
              {entry.name}: ${Math.round(entry.value).toLocaleString()}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}

export function ForecastChart({
  history,
  projection,
  todayIso,
  predictionSpreadPercent,
}: ForecastChartProps) {
  const spread = predictionSpreadPercent ?? 0;
  const data = buildSeries(history, projection, spread);
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
          <defs>
            <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFCB05" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#FFCB05" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 25%, 18%)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "hsl(215, 20%, 60%)" }}
            axisLine={{ stroke: "hsl(215, 25%, 18%)" }}
            minTickGap={32}
            tickFormatter={formatTickDate}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(215, 20%, 60%)" }}
            axisLine={{ stroke: "hsl(215, 25%, 18%)" }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
            }
          />
          <Tooltip content={<CustomTooltip todayIso={todayIso} />} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="plainline" />
          <ReferenceLine
            x={todayIso}
            stroke="#FFCB05"
            strokeDasharray="3 3"
            label={{
              value: "Forecast begins",
              fontSize: 10,
              fill: "#FFCB05",
              position: "insideTopRight",
            }}
          />
          {spread > 0 && (
            <Area
              type="monotone"
              dataKey="band"
              name="Confidence band"
              stroke="none"
              fill="url(#forecastBand)"
              connectNulls={false}
              isAnimationActive={false}
              activeDot={false}
              legendType="none"
            />
          )}
          <Line
            type="monotone"
            dataKey="history"
            name="Historical"
            stroke="#9CA3AF"
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
