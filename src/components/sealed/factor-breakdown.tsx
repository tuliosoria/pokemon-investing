"use client";

import { useState } from "react";
import type { FactorContribution } from "@/lib/types/sealed";

function barColor(direction: FactorContribution["direction"]): string {
  switch (direction) {
    case "Positive":
      return "bg-green-500";
    case "Negative":
      return "bg-red-500";
    case "Neutral":
      return "bg-slate-400";
  }
}

export function FactorBreakdown({
  contributions,
  compositeScore,
}: {
  contributions: FactorContribution[];
  compositeScore: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
      >
        <span>Model Drivers</span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-[hsl(var(--foreground))]">
            Score: {compositeScore}/100
          </span>
          <svg
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="animate-fade-in space-y-2.5 px-5 pb-5 pt-1">
          {contributions.map((f) => (
            <div key={f.key}>
              <div className="mb-1 flex items-start justify-between gap-3 text-xs">
                <div>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    {f.name}
                  </span>
                  <div className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]/75">
                    {f.valueLabel}
                  </div>
                </div>
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      f.direction === "Positive"
                        ? "bg-green-500/15 text-green-400"
                        : f.direction === "Negative"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-slate-500/15 text-slate-300"
                    }`}
                  >
                    {f.direction}
                  </span>
                  <span className="w-14 text-right font-mono font-semibold">
                    {f.influence.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[hsl(var(--muted))]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor(f.direction)}`}
                  style={{ width: `${Math.max(f.influence, 2)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
