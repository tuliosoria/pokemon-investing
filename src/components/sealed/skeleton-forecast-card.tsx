"use client";

/**
 * Skeleton card that matches the exact dimensions of SetForecastCard.
 * Uses shimmer/pulse animation in dark-theme-friendly colors.
 */
export function SkeletonForecastCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[hsl(var(--card))]">
      <div className="relative h-[200px] flex-shrink-0 overflow-hidden bg-[hsl(var(--muted))]">
        <div className="absolute inset-0 skeleton-shimmer" />
        <div className="absolute top-4 left-4">
          <div className="h-8 w-20 rounded-full bg-white/10" />
        </div>
        <div className="absolute top-4 right-4">
          <div className="h-6 w-16 rounded-full bg-white/10" />
        </div>
        <div className="absolute bottom-5 left-5 w-[70%] space-y-2">
          <div className="h-3 w-24 rounded bg-white/10" />
          <div className="h-5 w-full rounded bg-white/15" />
          <div className="h-5 w-3/4 rounded bg-white/10" />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="h-2.5 w-14 rounded bg-[hsl(var(--muted))]" />
              <div className="h-8 w-20 rounded bg-[hsl(var(--muted))] skeleton-shimmer" />
            </div>
            <div className="space-y-2 text-right">
              <div className="ml-auto h-2.5 w-16 rounded bg-[hsl(var(--muted))]" />
              <div className="ml-auto h-10 w-28 rounded bg-[hsl(var(--muted))] skeleton-shimmer" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-[hsl(var(--muted))] skeleton-shimmer" />
            <div className="h-5 w-24 rounded-full bg-[hsl(var(--muted))]" />
          </div>

          <div className="h-3 w-4/5 rounded bg-[hsl(var(--muted))]" />

          <div className="h-5 w-32 rounded-full bg-[hsl(var(--muted))]" />

          <div className="flex flex-wrap gap-2">
            <div className="h-7 w-24 rounded-md bg-[hsl(var(--muted))]" />
            <div className="h-7 w-28 rounded-md bg-[hsl(var(--muted))]" />
            <div className="h-7 w-20 rounded-md bg-[hsl(var(--muted))]" />
          </div>

          <div className="flex gap-2">
            <div className="h-5 w-24 rounded-full bg-[hsl(var(--muted))]" />
            <div className="h-5 w-16 rounded bg-[hsl(var(--muted))]" />
          </div>
        </div>

        <div className="mt-auto pt-5">
          <div className="h-10 w-full rounded-lg border border-white/10 bg-[hsl(var(--muted))]" />
        </div>
      </div>

      <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="h-3 w-28 rounded bg-[hsl(var(--muted))]" />
          <div className="h-7 w-24 rounded-full bg-[hsl(var(--muted))] skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}
