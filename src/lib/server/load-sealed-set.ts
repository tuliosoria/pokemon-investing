import "server-only";
import {
  getLatestStoredSealedPriceSnapshot,
  getStoredSealedProductMeta,
} from "@/lib/db/sealed-pricing";
import {
  getLocalSealedCatalogEntry,
  isLocalSealedProductId,
  loadSealedSearchCatalog,
} from "@/lib/db/sealed-search";
import {
  findSyncedPriceChartingEntry,
  getSyncedPriceChartingEntryById,
  getSyncedPriceChartingEntryBySetId,
} from "@/lib/domain/pricecharting-catalog";
import { buildDynamicSetData } from "@/lib/domain/sealed-estimate";
import { getSealedSetById } from "@/lib/data/sealed-sets";
import type {
  SealedPricing,
  SealedSetData,
} from "@/lib/types/sealed";
import type { SealedSearchCatalogEntry } from "@/lib/db/sealed-search";

const DYNAMIC_PREFIX = "dynamic-";

function pickBestPrice(snapshot: Awaited<
  ReturnType<typeof getLatestStoredSealedPriceSnapshot>
>): number | null {
  if (!snapshot) return null;
  const candidates = [
    snapshot.bestPrice,
    snapshot.priceChartingPrice,
    snapshot.tcgplayerPrice,
    snapshot.ebayPrice,
    snapshot.pokedataPrice,
  ];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function roundPrice(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function pricingFromCatalogEntry(
  entry: SealedSearchCatalogEntry
): SealedPricing {
  const synced =
    getSyncedPriceChartingEntryBySetId(entry.catalogId) ??
    (entry.priceChartingId
      ? getSyncedPriceChartingEntryById(entry.priceChartingId)
      : null) ??
    findSyncedPriceChartingEntry({
      name: entry.name,
      productType: entry.productType,
      releaseDate: entry.releaseDate,
    });
  const bestPrice =
    roundPrice(synced?.newPrice ?? synced?.manualOnlyPrice ?? null) ??
    roundPrice(entry.currentPrice);
  return {
    pokedataId: entry.pokedataId,
    name: entry.name,
    releaseDate: entry.releaseDate,
    imageUrl: entry.imageUrl ?? null,
    priceChartingId: synced?.priceChartingId ?? entry.priceChartingId,
    priceChartingProductName: synced?.productName ?? null,
    priceChartingConsoleName: synced?.consoleName ?? null,
    priceChartingPrice: roundPrice(synced?.newPrice ?? null),
    tcgplayerPrice: null,
    ebayPrice: null,
    pokedataPrice: null,
    bestPrice,
    primaryProvider: synced ? "pricecharting" : "fallback",
    snapshotDate: null,
    salesVolume: synced?.salesVolume ?? null,
    manualOnlyPrice: synced?.manualOnlyPrice ?? null,
  };
}

/**
 * Resolve a `/sealed-forecast/[slug]` slug to a SealedSetData.
 *
 * Supports three slug shapes:
 *   - `<curated-id>` (e.g. `evolving-skies`) — looked up in SEALED_SETS
 *   - `dynamic-local-sealed:<setId>` — bundled local catalog (top-buys etc.)
 *     enriched with PriceCharting sync data; falls back to combined
 *     local+stored search catalog if the runtime map misses
 *   - `dynamic-<pokedataId>` — built on demand from DynamoDB pricing
 *     meta + latest snapshot via buildDynamicSetData()
 *
 * Returns `null` if the product cannot be resolved.
 */
export async function loadSealedSetBySlug(
  slug: string
): Promise<SealedSetData | null> {
  const curated = getSealedSetById(slug);
  if (curated) return curated;

  if (!slug.startsWith(DYNAMIC_PREFIX)) return null;
  const pokedataId = slug.slice(DYNAMIC_PREFIX.length);
  if (!pokedataId) return null;

  const isLocal = isLocalSealedProductId(pokedataId);
  console.log(
    `[loadSealedSetBySlug] slug=${slug} pokedataId=${pokedataId} isLocal=${isLocal}`
  );

  // 1) Local bundled catalog (top-buys, offline data) — works without DB
  if (isLocal) {
    const local = getLocalSealedCatalogEntry(pokedataId);
    if (local) {
      return buildDynamicSetData(pricingFromCatalogEntry(local));
    }
    // Fallback: search the combined local+stored catalog (covers entries
    // added to DynamoDB but not yet in the static module map).
    try {
      const fullCatalog = await loadSealedSearchCatalog();
      const match = fullCatalog.find((e) => e.pokedataId === pokedataId);
      if (match) {
        console.log(
          `[loadSealedSetBySlug] resolved via full catalog: ${match.name}`
        );
        return buildDynamicSetData(pricingFromCatalogEntry(match));
      }
    } catch (err) {
      console.error("[loadSealedSetBySlug] full catalog lookup failed", err);
    }
    console.warn(
      `[loadSealedSetBySlug] local-sealed slug not found in any catalog: ${pokedataId}`
    );
  }

  // 2) DynamoDB-stored product (live PokeData / PriceCharting snapshots)
  const [meta, snapshot] = await Promise.all([
    getStoredSealedProductMeta(pokedataId),
    getLatestStoredSealedPriceSnapshot(pokedataId),
  ]);

  if (!meta && !snapshot) {
    console.warn(
      `[loadSealedSetBySlug] no curated, local, or DynamoDB record for ${slug}`
    );
    return null;
  }

  const bestPrice = pickBestPrice(snapshot);

  const pricing: SealedPricing = {
    pokedataId,
    name: meta?.name ?? meta?.catalogDisplayName ?? "Sealed product",
    releaseDate: meta?.releaseDate ?? null,
    imageUrl: meta?.imgUrl ?? null,
    tcgplayerPrice: snapshot?.tcgplayerPrice ?? null,
    ebayPrice: snapshot?.ebayPrice ?? null,
    pokedataPrice: snapshot?.pokedataPrice ?? null,
    priceChartingPrice: snapshot?.priceChartingPrice ?? null,
    bestPrice,
    primaryProvider: snapshot?.primaryProvider ?? "fallback",
    snapshotDate: snapshot?.snapshotDate ?? null,
    priceChartingId: meta?.priceChartingId ?? undefined,
    priceChartingProductName: meta?.priceChartingProductName ?? null,
    priceChartingConsoleName: meta?.priceChartingConsoleName ?? null,
  };

  return buildDynamicSetData(pricing);
}

