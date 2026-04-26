import "server-only";
import {
  getLatestStoredSealedPriceSnapshot,
  getStoredSealedProductMeta,
} from "@/lib/db/sealed-pricing";
import {
  getLocalSealedCatalogEntry,
  isLocalSealedProductId,
} from "@/lib/db/sealed-search";
import {
  findSyncedPriceChartingEntry,
  getSyncedPriceChartingEntryById,
  getSyncedPriceChartingEntryBySetId,
} from "@/lib/domain/pricecharting-catalog";
import { buildDynamicSetData } from "@/lib/domain/sealed-estimate";
import { getSealedSetById } from "@/lib/data/sealed-sets";
import type { SealedPricing, SealedSetData } from "@/lib/types/sealed";

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

/**
 * Resolve a `/sealed-forecast/[slug]` slug to a SealedSetData.
 *
 * Supports three slug shapes:
 *   - `<curated-id>` (e.g. `evolving-skies`) — looked up in SEALED_SETS
 *   - `dynamic-local-sealed:<setId>` — built from the bundled local
 *     catalog (top-buys + offline products) plus PriceCharting sync data
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

  // 1) Local bundled catalog (top-buys, offline data) — works without DB
  if (isLocalSealedProductId(pokedataId)) {
    const local = getLocalSealedCatalogEntry(pokedataId);
    if (local) {
      const synced =
        getSyncedPriceChartingEntryBySetId(local.catalogId) ??
        (local.priceChartingId
          ? getSyncedPriceChartingEntryById(local.priceChartingId)
          : null) ??
        findSyncedPriceChartingEntry({
          name: local.name,
          productType: local.productType,
          releaseDate: local.releaseDate,
        });
      const bestPrice =
        roundPrice(synced?.newPrice ?? synced?.manualOnlyPrice ?? null) ??
        roundPrice(local.currentPrice);
      const pricing: SealedPricing = {
        pokedataId: local.pokedataId,
        name: local.name,
        releaseDate: local.releaseDate,
        imageUrl: local.imageUrl ?? null,
        priceChartingId: synced?.priceChartingId ?? local.priceChartingId,
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
      return buildDynamicSetData(pricing);
    }
  }

  // 2) DynamoDB-stored product (live PokeData / PriceCharting snapshots)
  const [meta, snapshot] = await Promise.all([
    getStoredSealedProductMeta(pokedataId),
    getLatestStoredSealedPriceSnapshot(pokedataId),
  ]);

  if (!meta && !snapshot) return null;

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

