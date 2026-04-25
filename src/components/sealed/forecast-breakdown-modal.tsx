"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { SealedSetData, Forecast } from "@/lib/types/sealed";
import { getConfidenceBg } from "@/lib/domain/sealed-forecast";
import { pickKeyDrivers } from "@/lib/domain/forecast-breakdown";

interface ForecastBreakdownModalProps {
  set: SealedSetData;
  forecast: Forecast;
  open: boolean;
  onClose: () => void;
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function LiquidityBadge({ tier }: { tier: "low" | "normal" | "high" | undefined }) {
  if (!tier) return <span className="text-[hsl(var(--muted-foreground))] text-xs">Not available</span>;
  const label = tier === "high" ? "High" : tier === "normal" ? "Medium" : "Low";
  const cls =
    tier === "high"
      ? "bg-green-500/20 text-green-400"
      : tier === "normal"
        ? "bg-yellow-500/20 text-yellow-400"
        : "bg-gray-500/20 text-gray-400";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function SubScoreBar({ label, value }: { label: string; value: number | null | undefined }) {
  const pct = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-[hsl(var(--poke-yellow))]/70"
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>
      <span className="w-10 text-right text-[11px] font-mono text-[hsl(var(--foreground))]">
        {value != null ? Math.round(value) : "—"}
      </span>
    </div>
  );
}

function communityLabel(score: number | null | undefined): string {
  if (score == null) return "No data";
  if (score >= 70) return "Strong community engagement";
  if (score >= 50) return "Healthy community interest";
  if (score >= 30) return "Moderate community interest";
  return "Quiet community signal";
}

export function ForecastBreakdownModal({ set, forecast, open, onClose }: ForecastBreakdownModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = `breakdown-heading-${set.id}`;
  const [nowMs] = useState(() => Date.now());

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    // Prevent body scroll while modal is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, handleKeyDown]);

  // Auto-focus modal on open
  useEffect(() => {
    if (open) {
      setTimeout(() => dialogRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const { factors } = set;
  const drivers = pickKeyDrivers(factors);

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[hsl(var(--card))] shadow-[0_24px_80px_rgba(0,0,0,0.5)] focus:outline-none"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close breakdown"
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[hsl(var(--muted-foreground))] hover:bg-white/20 hover:text-[hsl(var(--foreground))] transition-colors"
        >
          ✕
        </button>

        <div className="p-6 space-y-5">
          {/* ── Section a: Header ── */}
          <div>
            <div className="flex flex-wrap items-start gap-2 pr-8">
              <h2
                id={headingId}
                className="text-lg font-bold text-[hsl(var(--foreground))] leading-snug"
              >
                {set.name}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${getConfidenceBg(forecast.confidence)}`}
              >
                {forecast.confidence} confidence
              </span>
            </div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              {set.productType}
              <span className="mx-1.5 text-white/30">·</span>
              {set.releaseYear}
            </p>
            <p className="mt-2 text-2xl font-bold font-mono text-[hsl(var(--foreground))]">
              {set.currentPrice > 0 ? formatUsd(set.currentPrice) : "Price unavailable"}
            </p>
          </div>

          <div className="border-t border-white/10" />

          {/* ── Section b: Set singles value ── */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Set Singles Value
            </p>
            {factors.setSinglesValue != null ? (
              <>
                <p className="text-base font-semibold text-[hsl(var(--foreground))]">
                  This set has{" "}
                  <span className="text-[hsl(var(--poke-yellow))]">
                    {formatUsd(factors.setSinglesValue)}
                  </span>{" "}
                  in singles value
                </p>
                {factors.setSinglesValueRatio != null && (
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    (price represents {Math.round(factors.setSinglesValueRatio * 100)}% of total set value)
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Not available</p>
            )}
          </div>

          <div className="border-t border-white/10" />

          {/* ── Section c: Sales volume / liquidity ── */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Sales Volume
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[hsl(var(--foreground))]">Liquidity:</span>
              <LiquidityBadge tier={factors.liquidityTier} />
            </div>
          </div>

          <div className="border-t border-white/10" />

          {/* ── Section d: Community Score ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Community Score
            </p>
            {factors.communityScore != null ? (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-black font-mono text-[hsl(var(--poke-yellow))]">
                    {Math.round(factors.communityScore)}
                  </span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">/100</span>
                </div>
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                  {communityLabel(factors.communityScore)}
                </p>

                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <SubScoreBar label="Reddit" value={factors.redditScore} />
                  <SubScoreBar label="Market Activity" value={factors.marketActivityScore} />
                  <SubScoreBar label="Google Trends" value={factors.googleTrendsScore} />
                  <SubScoreBar label="Forums" value={factors.forumScore} />
                  <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]/70">
                    {(() => {
                      const present: string[] = [];
                      if (factors.redditScore != null) present.push("Reddit 30%");
                      if (factors.marketActivityScore != null) present.push("Market 30%");
                      if (factors.googleTrendsScore != null) present.push("Google Trends 25%");
                      if (factors.forumScore != null) present.push("Forums 15%");
                      const base = present.join(" · ");
                      const note =
                        factors.communityScoreSource === "market-only"
                          ? " (Reddit unavailable — weights renormalized)"
                          : factors.communityScoreSource === "blended"
                            ? " (Reddit + Market sales-volume blended)"
                            : "";
                      return base + note;
                    })()}
                  </p>
                  {factors.communityScoreUpdatedAt ? (
                    <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]/60">
                      {(() => {
                        const ts = new Date(factors.communityScoreUpdatedAt);
                        if (isNaN(ts.getTime())) return null;
                        const ageMs = nowMs - ts.getTime();
                        const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
                        const freshness =
                          days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
                        return `Signal refreshed ${freshness}`;
                      })()}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Not available</p>
            )}
          </div>

          <div className="border-t border-white/10" />

          {/* ── Section e: Top 3 key drivers ── */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Key Drivers
            </p>
            {drivers.length > 0 ? (
              <div className="space-y-2">
                {drivers.map((driver) => (
                  <div
                    key={driver.label}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{driver.label}</p>
                      <p
                        className={`text-[11px] font-medium ${
                          driver.direction === "up" ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {driver.indicator}
                      </p>
                    </div>
                    <span className="text-base font-mono font-bold text-[hsl(var(--foreground))]">
                      {driver.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No key drivers available</p>
            )}
          </div>

          <div className="border-t border-white/10" />

          {/* ── Section f: Footer disclaimer ── */}
          <p className="text-[10px] leading-relaxed text-[hsl(var(--muted-foreground))]/60">
            Forecasts are estimates based on PriceCharting data, community signals, and our XGBoost
            model. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalContent, document.body);
}
