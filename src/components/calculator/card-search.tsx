"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { CardSearchResult, GradeData } from "@/lib/types/card";
import { getBestPrice } from "@/lib/types/card";

interface CardSearchProps {
  onCardSelect: (card: CardSearchResult, rawPrice: number, variant: string, gradeData?: GradeData | null) => void;
}

export function CardSearch({ onCardSelect }: CardSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGrades, setIsLoadingGrades] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardSearchResult | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [gradeData, setGradeData] = useState<GradeData | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Search failed");
      const body = await res.json();
      setResults(body.cards ?? []);
      setIsOpen(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setResults([]);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(query), 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSelect(card: CardSearchResult) {
    const best = getBestPrice(card.prices);
    setSelectedCard(card);
    setQuery("");
    setIsOpen(false);
    setResults([]);
    setGradeData(null);

    if (best) {
      setSelectedVariant(best.variant);
      onCardSelect(card, best.price, best.variant, null);
    } else {
      setSelectedVariant("");
      onCardSelect(card, 0, "", null);
    }

    // Fetch real grade data from PokeData in background
    setIsLoadingGrades(true);
    try {
      const params = new URLSearchParams({ name: card.name, set: card.set });
      if (card.number) params.set("number", card.number);
      const res = await fetch(`/api/cards/grade-data?${params}`);
      if (res.ok) {
        const body = await res.json();
        if (body.gradeData) {
          setGradeData(body.gradeData);
          onCardSelect(card, best?.price ?? 0, best?.variant ?? "", body.gradeData);
        }
      }
    } catch {
      // Grade data is optional — fallback to estimates
    } finally {
      setIsLoadingGrades(false);
    }
  }

  function handleVariantChange(variant: string) {
    if (!selectedCard) return;
    const priceData = selectedCard.prices[variant];
    if (!priceData) return;

    setSelectedVariant(variant);
    const price =
      priceData.market ??
      priceData.mid ??
      (priceData.low != null && priceData.high != null
        ? (priceData.low + priceData.high) / 2
        : 0);
    onCardSelect(selectedCard, price, variant, gradeData);
  }

  function clearCard() {
    setSelectedCard(null);
    setSelectedVariant("");
    setGradeData(null);
    setQuery("");
  }

  const formatVariant = (v: string) => v;

  const availableVariants = selectedCard
    ? Object.keys(selectedCard.prices)
    : [];

  return (
    <div className="space-y-3">
      {/* Selected card display */}
      {selectedCard && (
        <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
          {selectedCard.imageSmall && (
            <img
              src={selectedCard.imageSmall}
              alt={selectedCard.name}
              className="w-16 rounded shadow-sm"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{selectedCard.name}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {selectedCard.set} · #{selectedCard.number}
              {selectedCard.rarity && ` · ${selectedCard.rarity}`}
            </p>
            {availableVariants.length > 1 && (
              <select
                value={selectedVariant}
                onChange={(e) => handleVariantChange(e.target.value)}
                className="mt-1 text-xs bg-[hsl(var(--background))] border border-[hsl(var(--input))] rounded px-2 py-1"
              >
                {availableVariants.map((v) => (
                  <option key={v} value={v}>
                    {formatVariant(v)}
                  </option>
                ))}
              </select>
            )}
            {selectedCard.tcgplayerUrl && (
              <a
                href={selectedCard.tcgplayerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline mt-1 block"
              >
                View on TCGPlayer →
              </a>
            )}
            {isLoadingGrades && (
              <p className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
                Loading PSA grade data…
              </p>
            )}
            {gradeData && !isLoadingGrades && (
              <p className="text-xs text-green-500 mt-1">
                ✓ PSA prices loaded ({gradeData.set})
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={clearCard}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] text-lg leading-none"
            aria-label="Clear card"
          >
            ×
          </button>
        </div>
      )}

      {/* Search input */}
      {!selectedCard && (
        <div ref={dropdownRef} className="relative">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a card by name (e.g. Charizard)..."
              autoComplete="off"
              className="flex h-10 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
            />
            {isLoading && (
              <div className="absolute right-3 top-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--muted-foreground))] border-t-transparent" />
              </div>
            )}
          </div>

          {isOpen && results.length > 0 && (
            <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-lg">
              {results.map((card) => {
                const best = getBestPrice(card.prices);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSelect(card)}
                    className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-[hsl(var(--muted))] transition-colors"
                  >
                    {card.imageSmall && (
                      <img
                        src={card.imageSmall}
                        alt=""
                        className="w-8 h-11 object-contain rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{card.name}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                        {card.set} · #{card.number}
                        {card.rarity && ` · ${card.rarity}`}
                      </p>
                    </div>
                    {best && (
                      <span className="text-sm font-mono text-green-400 whitespace-nowrap">
                        ${best.price.toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {isOpen && results.length === 0 && !isLoading && query.length >= 2 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-lg p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
              No cards found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
