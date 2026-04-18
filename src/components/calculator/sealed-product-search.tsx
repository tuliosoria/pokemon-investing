"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  searchSealedProducts,
  PRODUCT_TYPES,
  type SealedProduct,
  type ProductType,
} from "@/lib/data/sealed-products";
import type { EbayListing } from "@/lib/api/ebay";

export interface SealedProductSelection {
  product: SealedProduct;
  /** Live eBay median price if available, otherwise static estimate */
  marketPrice: number;
  source: "ebay" | "static";
  ebayListings?: EbayListing[];
}

interface SealedProductSearchProps {
  onProductSelect: (selection: SealedProductSelection) => void;
}

export function SealedProductSearch({
  onProductSelect,
}: SealedProductSearchProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProductType | undefined>();
  const [results, setResults] = useState<SealedProduct[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<SealedProductSelection | null>(null);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [ebayListings, setEbayListings] = useState<EbayListing[]>([]);
  const [ebayPriceData, setEbayPriceData] = useState<{
    median: number | null;
    low: number | null;
    high: number | null;
    total: number;
  } | null>(null);
  const [priceSource, setPriceSource] = useState<"ebay" | "static">("static");
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Static local search for autocomplete
  const doLocalSearch = useCallback((q: string, type?: ProductType) => {
    const matches = searchSealedProducts(q, type);
    setResults(matches.slice(0, 12));
    setIsOpen(matches.length > 0 && (q.length > 0 || type !== undefined));
  }, []);

  useEffect(() => {
    doLocalSearch(query, typeFilter);
  }, [query, typeFilter, doLocalSearch]);

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

  // Fetch eBay prices when a product is selected
  const fetchEbayPrice = useCallback(async (product: SealedProduct) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setEbayLoading(true);
    setEbayListings([]);
    setEbayPriceData(null);
    setPriceSource("static");

    try {
      const searchQuery = `${product.name}`;
      const res = await fetch(
        `/api/sealed/search?q=${encodeURIComponent(searchQuery)}`,
        { signal: controller.signal }
      );

      if (!res.ok) throw new Error("API error");
      const data = await res.json();

      if (data.source === "ebay" && data.ebay) {
        setEbayListings(data.ebay.listings || []);
        setEbayPriceData({
          median: data.ebay.medianPrice,
          low: data.ebay.lowPrice,
          high: data.ebay.highPrice,
          total: data.ebay.totalResults,
        });
        setPriceSource("ebay");

        // Use eBay median as market price if available
        if (data.ebay.medianPrice) {
          const selection: SealedProductSelection = {
            product,
            marketPrice: data.ebay.medianPrice,
            source: "ebay",
            ebayListings: data.ebay.listings,
          };
          setSelected(selection);
          onProductSelect(selection);
          setEbayLoading(false);
          return;
        }
      }
    } catch {
      // eBay not configured or failed — fall back to static
    }

    // Fallback: use static estimate
    const selection: SealedProductSelection = {
      product,
      marketPrice: product.estimatedMarket,
      source: "static",
    };
    setSelected(selection);
    onProductSelect(selection);
    setEbayLoading(false);
  }, [onProductSelect]);

  const handleSelect = (product: SealedProduct) => {
    setQuery(product.name);
    setIsOpen(false);
    fetchEbayPrice(product);
  };

  const fmtUsd = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    });

  const appreciation = (p: SealedProduct) =>
    ((p.estimatedMarket - p.msrp) / p.msrp) * 100;

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
            onClick={() =>
              setTypeFilter(type === typeFilter ? undefined : type)
            }
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
          setSelected(null);
          setEbayPriceData(null);
          setEbayListings([]);
        }}
        onFocus={() => {
          if (query.length > 0 || typeFilter) doLocalSearch(query, typeFilter);
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

      {/* Loading state */}
      {ebayLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--accent))]/50 p-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--poke-red)] border-t-transparent" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Fetching live eBay prices...
          </p>
        </div>
      )}

      {/* Selected product summary */}
      {selected && !ebayLoading && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--accent))]/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                {selected.product.name}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {selected.product.set} · {selected.product.releaseYear}
              </p>
            </div>
            <div className="text-right text-xs">
              <p>
                MSRP:{" "}
                <span className="font-medium">
                  {fmtUsd(selected.product.msrp)}
                </span>
              </p>
              <p>
                Market:{" "}
                <span className="font-semibold text-[var(--poke-red)]">
                  {fmtUsd(selected.marketPrice)}
                </span>
              </p>
            </div>
          </div>

          {/* eBay price range details */}
          {priceSource === "ebay" && ebayPriceData && (
            <div className="rounded-md bg-[hsl(var(--background))] p-2 text-xs">
              <div className="flex items-center gap-1 mb-1">
                <span className="font-semibold text-[var(--poke-blue)]">
                  📊 Live eBay Data
                </span>
                <span className="text-[hsl(var(--muted-foreground))]">
                  ({ebayPriceData.total} listings)
                </span>
              </div>
              <div className="flex gap-3 text-[hsl(var(--muted-foreground))]">
                {ebayPriceData.low && (
                  <span>
                    Low:{" "}
                    <span className="font-medium text-[hsl(var(--foreground))]">
                      {fmtUsd(ebayPriceData.low)}
                    </span>
                  </span>
                )}
                {ebayPriceData.median && (
                  <span>
                    Median:{" "}
                    <span className="font-semibold text-[hsl(var(--foreground))]">
                      {fmtUsd(ebayPriceData.median)}
                    </span>
                  </span>
                )}
                {ebayPriceData.high && (
                  <span>
                    High:{" "}
                    <span className="font-medium text-[hsl(var(--foreground))]">
                      {fmtUsd(ebayPriceData.high)}
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Top eBay listings */}
          {ebayListings.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Current eBay Listings:
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {ebayListings.slice(0, 5).map((listing, i) => (
                  <a
                    key={i}
                    href={listing.itemUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-[hsl(var(--accent))] transition-colors"
                  >
                    <span className="truncate flex-1 mr-2 text-[hsl(var(--foreground))]">
                      {listing.title}
                    </span>
                    <span className="font-semibold shrink-0 text-[var(--poke-red)]">
                      {fmtUsd(listing.price)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {priceSource === "ebay"
              ? "💡 Prices from live eBay Buy It Now listings (New condition)."
              : "⚠️ Static estimate — connect eBay API for live prices. See setup guide below."}
          </p>
        </div>
      )}

      {/* eBay setup hint when not configured */}
      {selected && priceSource === "static" && !ebayLoading && (
        <details className="rounded-lg border border-dashed border-[hsl(var(--border))] p-3 text-xs text-[hsl(var(--muted-foreground))]">
          <summary className="cursor-pointer font-medium">
            🔑 Enable live eBay pricing
          </summary>
          <ol className="mt-2 space-y-1 list-decimal list-inside">
            <li>
              Create a free{" "}
              <a
                href="https://developer.ebay.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[var(--poke-blue)]"
              >
                eBay Developer account
              </a>
            </li>
            <li>Create a Production application → get App ID &amp; Cert ID</li>
            <li>
              Set environment variables:
              <code className="block mt-1 rounded bg-[hsl(var(--muted))] p-1 font-mono">
                EBAY_CLIENT_ID=your_app_id
                <br />
                EBAY_CLIENT_SECRET=your_cert_id
              </code>
            </li>
            <li>Restart the app — live eBay prices will appear automatically</li>
          </ol>
        </details>
      )}
    </div>
  );
}
