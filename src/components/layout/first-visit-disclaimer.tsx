"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

const STORAGE_KEY = "pokealpha:disclaimer-acknowledged:v1";

export function FirstVisitDisclaimer() {
  // Start hidden so the dialog never flashes for returning visitors and the
  // server-rendered HTML stays stable (avoids a hydration mismatch).
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const acknowledged = window.localStorage.getItem(STORAGE_KEY);
      if (!acknowledged) setOpen(true);
    } catch {
      // Private browsing / blocked storage: show once per page load. The
      // user can still dismiss it; we just can't remember the choice.
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const handleAcknowledge = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // Storage blocked — just close for this session.
    }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-visit-disclaimer-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] shadow-2xl">
        <div className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
          <div className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-yellow-500/20 text-yellow-400">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2
              id="first-visit-disclaimer-title"
              className="text-base font-semibold text-[hsl(var(--foreground))]"
            >
              Heads up before you start
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Please read this once.
            </p>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-[hsl(var(--foreground))]/90">
          <p>
            <strong>PokeAlpha is not a financial advisor.</strong> Nothing here
            is investment advice, a recommendation to buy or sell, or a
            guarantee of any kind.
          </p>
          <p>
            All forecasts come from <strong>statistical models that can and do
            make mistakes</strong>. Pokémon prices are volatile and can be
            affected by reprints, market sentiment shifts, fakes, and many
            other factors the model doesn&apos;t see.
          </p>
          <p>
            <strong>Use at your own risk.</strong> Always do your own research
            and never invest more than you can afford to lose.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={handleAcknowledge}
            className="rounded-md bg-[hsl(var(--poke-yellow))] px-4 py-2 text-sm font-semibold text-[hsl(var(--poke-blue))] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
