"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

/**
 * PSA-style condition self-assessment.
 *
 * Walks the user through PSA's four sub-grade pillars (Centering,
 * Corners, Edges, Surface) and proposes PSA 10/9/8 probabilities. The
 * mapping is intentionally conservative — PSA 10 demands all four
 * sub-grades at 9.5+ and even then only ~70% of submissions clear.
 */

export interface ConditionAssessment {
  centering: number;
  corners: number;
  edges: number;
  surface: number;
}

interface ConditionWizardProps {
  onApply: (probabilities: {
    psa10: number;
    psa9: number;
    psa8: number;
  }) => void;
}

const PILLARS: {
  key: keyof ConditionAssessment;
  label: string;
  hint: string;
  scale: { value: number; label: string }[];
}[] = [
  {
    key: "centering",
    label: "Centering",
    hint: "Front/back border alignment. PSA 10 needs ~55/45 or better front and ~75/25 or better back.",
    scale: [
      { value: 5, label: "Near perfect (50/50)" },
      { value: 4, label: "Slight off (55/45)" },
      { value: 3, label: "Noticeable (60/40)" },
      { value: 2, label: "Heavy off (65/35+)" },
      { value: 1, label: "Severe / mis-cut" },
    ],
  },
  {
    key: "corners",
    label: "Corners",
    hint: "All four corners under loupe. Any whitening, fraying, or dings drops the grade.",
    scale: [
      { value: 5, label: "Sharp, no whitening" },
      { value: 4, label: "1 corner with light wear" },
      { value: 3, label: "Multiple soft corners" },
      { value: 2, label: "Visible whitening" },
      { value: 1, label: "Dings / chipping" },
    ],
  },
  {
    key: "edges",
    label: "Edges",
    hint: "Run a finger along all four edges. Any nicks, chipping, or layering issues count.",
    scale: [
      { value: 5, label: "Smooth, factory clean" },
      { value: 4, label: "Faint roughness" },
      { value: 3, label: "Light edge wear" },
      { value: 2, label: "Notable nicks" },
      { value: 1, label: "Heavy chipping" },
    ],
  },
  {
    key: "surface",
    label: "Surface",
    hint: "Tilt under bright light: scratches, print lines, holo scratches, indentations, stains.",
    scale: [
      { value: 5, label: "Pristine under light" },
      { value: 4, label: "Minor print lines only" },
      { value: 3, label: "Light holo scratches" },
      { value: 2, label: "Visible scratches" },
      { value: 1, label: "Stains / dents / creases" },
    ],
  },
];

const DEFAULT_ASSESSMENT: ConditionAssessment = {
  centering: 4,
  corners: 4,
  edges: 4,
  surface: 4,
};

/**
 * Map sub-grade scores (1–5) to PSA 10/9/8 probability suggestion.
 * Heuristic, not a guarantee — PSA's actual formula isn't public.
 *
 *   - All 5s (avg 5)   → ~70% PSA 10 / 25% PSA 9 / 4% PSA 8
 *   - All 4s (avg 4)   → ~25% PSA 10 / 50% PSA 9 / 18% PSA 8
 *   - All 3s (avg 3)   → ~5%  PSA 10 / 35% PSA 9 / 35% PSA 8
 *   - Min sub-grade caps PSA 10 ceiling (any ≤2 → 0% PSA 10).
 */
function suggestProbabilities(a: ConditionAssessment) {
  const min = Math.min(a.centering, a.corners, a.edges, a.surface);
  const avg = (a.centering + a.corners + a.edges + a.surface) / 4;

  let psa10 = 0;
  if (min >= 3) {
    psa10 = Math.round(Math.max(0, Math.min(70, (avg - 3) * 35)));
  }
  if (min <= 2) psa10 = 0;
  if (min <= 1) {
    return { psa10: 0, psa9: 0, psa8: avg >= 2 ? 30 : 10 };
  }

  let psa9 = 0;
  if (avg >= 4.5) psa9 = 25;
  else if (avg >= 3.5) psa9 = 50;
  else if (avg >= 2.5) psa9 = 35;
  else psa9 = 15;

  let psa8 = 0;
  if (avg >= 4.5) psa8 = 4;
  else if (avg >= 3.5) psa8 = 18;
  else if (avg >= 2.5) psa8 = 35;
  else psa8 = 30;

  // Make sure totals don't exceed 100
  const total = psa10 + psa9 + psa8;
  if (total > 100) {
    const scale = 100 / total;
    psa10 = Math.round(psa10 * scale);
    psa9 = Math.round(psa9 * scale);
    psa8 = Math.round(psa8 * scale);
  }
  return { psa10, psa9, psa8 };
}

export function ConditionWizard({ onApply }: ConditionWizardProps) {
  const [open, setOpen] = useState(false);
  const [assessment, setAssessment] =
    useState<ConditionAssessment>(DEFAULT_ASSESSMENT);

  const suggested = suggestProbabilities(assessment);

  const update = (key: keyof ConditionAssessment, value: number) => {
    setAssessment((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-[hsl(var(--poke-yellow))]" />
          Estimate PSA grade probability from card condition
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-[hsl(var(--border))] px-4 pb-4 pt-3 animate-fade-in">
          <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
            Inspect the card under bright light. Score each pillar
            honestly — population data doesn&rsquo;t matter if your
            specific copy has scratches, whitening, or off-centering.
            PSA grades the worst sub-grade.
          </p>

          {PILLARS.map((pillar) => (
            <div key={pillar.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--foreground))]">
                  {pillar.label}
                </label>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  {assessment[pillar.key]}/5
                </span>
              </div>
              <select
                value={assessment[pillar.key]}
                onChange={(e) =>
                  update(pillar.key, Number.parseInt(e.target.value, 10))
                }
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              >
                {pillar.scale.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value} — {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-snug">
                {pillar.hint}
              </p>
            </div>
          ))}

          <div className="rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Suggested probability
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-[hsl(var(--poke-yellow))]">
                  {suggested.psa10}%
                </p>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  PSA 10
                </p>
              </div>
              <div>
                <p className="text-lg font-bold">{suggested.psa9}%</p>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  PSA 9
                </p>
              </div>
              <div>
                <p className="text-lg font-bold">{suggested.psa8}%</p>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  PSA 8
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onApply(suggested)}
              className="w-full rounded-md bg-[hsl(var(--poke-red))] px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Use these probabilities
            </button>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-snug">
              Heuristic only. PSA&rsquo;s exact formula isn&rsquo;t
              public, but it weighs the worst sub-grade heavily.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
