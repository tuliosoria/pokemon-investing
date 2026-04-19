"use client";

import { useState } from "react";
import type { FactorContribution } from "@/lib/types/sealed";

function barColor(score: number): string {
  if (score >= 75) return "bg-green-500";
  if (score >= 50) return "bg-yellow-500";
  if (score >= 30) return "bg-orange-500";
  return "bg-red-500";
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
    <div className="border-t border-[hsl(var(--border))]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
      >
        <span>Factor Breakdown</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[hsl(var(--foreground))]">
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
        <div className="px-4 pb-4 space-y-2.5 animate-fade-in">
          {contributions.map((f) => (
            <div key={f.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[hsl(var(--muted-foreground))]">
                  {f.name}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-60">
                    wt: {f.weightLabel}
                  </span>
                  <span className="font-mono font-semibold w-7 text-right">
                    {f.score}
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[hsl(var(--muted))]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor(f.score)}`}
                  style={{ width: `${f.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
