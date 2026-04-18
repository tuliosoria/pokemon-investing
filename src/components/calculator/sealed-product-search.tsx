"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  searchSealedProducts,
  PRODUCT_TYPES,
  type SealedProduct,
  type ProductType,
} from "@/lib/data/sealed-products";

interface SealedProductSearchProps {
  onProductSelect: (product: SealedProduct) => void;
}

export function SealedProductSearch({
  onProductSelect,
}: SealedProductSearchProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProductType | undefined>();
  const [results, setResults] = useState<SealedProduct[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SealedProduct | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(
    (q: string, type?: ProductType) => {
      const matches = searchSealedProducts(q, type);
      setResults(matches.slice(0, 12));
      setIsOpen(matches.length > 0 && (q.length > 0 || type !== undefined));
    },
    []
  );

  useEffect(() => {
    doSearch(query, typeFilter);
  }, [query, typeFilter, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (product: SealedProduct) => {
    setSelectedProduct(product);
    setQuery(product.name);
    setIsOpen(false);
    onProductSelect(product);
  };

  const fmtUsd = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    });

  const appreciation = (p: SealedProduct) => {
    const pct = ((p.estimatedMarket - p.msrp) / p.msrp) * 100;
    return pct;
  };

  return (
    <div ref={containerRef} className="space-y-3">
      <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
        Search Sealed Products
      </label>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTypeFilter(undefined)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            typeFilter === undefined
              ? "bg-[var(--poke-red)] text-white"
              : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
          }`}
        >
          All
        </button>
        {PRODUCT_TYPES.filter((t) =>
          searchSealedProducts("", t).length > 0
        ).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeFilter(type === typeFilter ? undefined : type)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              typeFilter === type
                ? "bg-[var(--poke-red)] text-white"
                : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedProduct(null);
        }}
        onFocus={() => {
          if (query.length > 0 || typeFilter) doSearch(query, typeFilter);
        }}
        placeholder="e.g. Evolving Skies, 151, Celebrations..."
        className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:ring-2 focus:ring-[var(--poke-red)]"
      />

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-lg">
          {results.map((product) => {
            const pct = appreciation(product);
            const isUp = pct > 0;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelect(product)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--accent))]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                    {product.name}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {product.set} · {product.releaseYear} ·{" "}
                    <span className="font-medium">{product.type}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {fmtUsd(product.estimatedMarket)}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    MSRP {fmtUsd(product.msrp)}
                    <span
                      className={`ml-1 font-medium ${isUp ? "text-green-600" : "text-red-500"}`}
                    >
                      {isUp ? "▲" : "▼"}
                      {Math.abs(pct).toFixed(0)}%
                    </span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected product summary */}
      {selectedProduct && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--accent))]/50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                {selectedProduct.name}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {selectedProduct.set} · {selectedProduct.releaseYear}
              </p>
            </div>
            <div className="text-right text-xs">
              <p>
                MSRP:{" "}
                <span className="font-medium">
                  {fmtUsd(selectedProduct.msrp)}
                </span>
              </p>
              <p>
                Market:{" "}
                <span className="font-semibold text-[var(--poke-red)]">
                  {fmtUsd(selectedProduct.estimatedMarket)}
                </span>
              </p>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
            ⚠️ Estimates are approximate — verify current prices before investing.
          </p>
        </div>
      )}
    </div>
  );
}
