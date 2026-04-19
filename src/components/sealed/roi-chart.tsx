"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ProjectionPoint } from "@/lib/types/sealed";

interface RoiChartProps {
  data: ProjectionPoint[];
  setName: string;
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
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: ${entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export function RoiChart({ data, setName }: RoiChartProps) {
  return (
    <div className="w-full h-52">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 25%, 18%)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(215, 20%, 60%)" }}
            axisLine={{ stroke: "hsl(215, 25%, 18%)" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(215, 20%, 60%)" }}
            axisLine={{ stroke: "hsl(215, 25%, 18%)" }}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            iconType="plainline"
          />
          <Line
            type="monotone"
            dataKey="setValue"
            name={setName}
            stroke="#FFCB05"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="sp500"
            name="S&P 500"
            stroke="#6B7280"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
