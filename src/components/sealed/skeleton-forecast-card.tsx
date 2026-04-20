"use client";

/**
 * Skeleton card that matches the exact dimensions of SetForecastCard.
 * Uses shimmer/pulse animation in dark-theme-friendly colors.
 */
export function SkeletonForecastCard() {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden flex flex-col">
      {/* Header gradient area — matches h-28 */}
      <div className="relative h-28 overflow-hidden flex-shrink-0 bg-[hsl(var(--muted))]">
        <div className="absolute inset-0 skeleton-shimmer" />
        {/* Fake badge top-right */}
        <div className="absolute top-3 right-3">
          <div className="h-5 w-12 rounded-full bg-white/5" />
        </div>
        {/* Fake title bottom-left */}
        <div className="absolute bottom-3 left-4 space-y-1.5 w-[60%]">
          <div className="h-4 rounded bg-white/10 w-full" />
          <div className="h-2.5 rounded bg-white/5 w-2/3" />
        </div>
        {/* Fake image placeholder */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 h-20 w-20 rounded-lg bg-white/5" />
      </div>

      {/* Body — matches real card body structure */}
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* Price row */}
        <div className="flex items-baseline justify-between">
          <div className="space-y-1.5">
            <div className="h-2.5 w-12 rounded bg-[hsl(var(--muted))]" />
            <div className="h-6 w-16 rounded bg-[hsl(var(--muted))] skeleton-shimmer" />
          </div>
          <div className="space-y-1.5 text-right">
            <div className="h-2.5 w-14 rounded bg-[hsl(var(--muted))] ml-auto" />
            <div className="h-6 w-16 rounded bg-[hsl(var(--muted))] skeleton-shimmer ml-auto" />
          </div>
        </div>

        {/* ROI row */}
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 rounded bg-[hsl(var(--muted))] skeleton-shimmer" />
          <div className="h-5 w-16 rounded-full bg-[hsl(var(--muted))]" />
        </div>

        {/* S&P comparison */}
        <div className="h-3 w-3/4 rounded bg-[hsl(var(--muted))]" />

        {/* Chase card tags */}
        <div className="flex flex-wrap gap-1">
          <div className="h-5 w-20 rounded-full bg-[hsl(var(--muted))]" />
          <div className="h-5 w-16 rounded-full bg-[hsl(var(--muted))]" />
          <div className="h-5 w-24 rounded-full bg-[hsl(var(--muted))]" />
        </div>

        {/* Supply line */}
        <div className="flex gap-2">
          <div className="h-4 w-20 rounded-full bg-[hsl(var(--muted))]" />
          <div className="h-4 w-14 rounded bg-[hsl(var(--muted))]" />
        </div>

        <div className="flex-1" />

        {/* Chart button */}
        <div className="h-4 w-48 rounded bg-[hsl(var(--muted))] mx-auto" />
      </div>

      {/* Factor breakdown area */}
      <div className="border-t border-[hsl(var(--border))] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 rounded bg-[hsl(var(--muted))]" />
          <div className="h-5 w-16 rounded-full bg-[hsl(var(--muted))] skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}
