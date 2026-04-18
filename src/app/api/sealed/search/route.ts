import { NextRequest, NextResponse } from "next/server";
import {
  searchEbaySealed,
  isEbayConfigured,
  type EbaySearchResult,
} from "@/lib/api/ebay";
import {
  searchSealedProducts,
  type SealedProduct,
  type ProductType,
} from "@/lib/data/sealed-products";

export interface SealedSearchResponse {
  source: "ebay" | "static";
  products: StaticMatch[];
  ebay?: EbaySearchResult;
}

interface StaticMatch extends SealedProduct {
  ebayMedianPrice?: number | null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const typeFilter = req.nextUrl.searchParams.get("type") as
    | ProductType
    | undefined;

  if (!q && !typeFilter) {
    return NextResponse.json(
      { error: "Query or type filter required" },
      { status: 400 }
    );
  }

  // Always get static product matches for autocomplete
  const staticMatches = searchSealedProducts(q, typeFilter || undefined);

  // If eBay is configured, fetch live prices for the query
  if (isEbayConfigured() && q.length >= 2) {
    try {
      const ebayResult = await searchEbaySealed(q);

      // Enrich static matches with eBay median price
      const enriched: StaticMatch[] = staticMatches.map((p) => ({
        ...p,
        ebayMedianPrice: ebayResult.medianPrice,
      }));

      return NextResponse.json({
        source: "ebay",
        products: enriched,
        ebay: ebayResult,
      } satisfies SealedSearchResponse);
    } catch (err) {
      console.error("eBay API error, falling back to static:", err);
    }
  }

  // Fallback: static database only
  return NextResponse.json({
    source: "static",
    products: staticMatches as StaticMatch[],
  } satisfies SealedSearchResponse);
}
