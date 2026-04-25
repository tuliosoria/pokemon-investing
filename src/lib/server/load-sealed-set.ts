import "server-only";
import {
  getLatestStoredSealedPriceSnapshot,
  getStoredSealedProductMeta,
} from "@/lib/db/sealed-pricing";
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

/**
 * Resolve a `/sealed-forecast/[slug]` slug to a SealedSetData.
 *
 * Supports two slug shapes:
 *   - `<curated-id>` (e.g. `evolving-skies`) — looked up in SEALED_SETS
 *   - `dynamic-<pokedataId>` — built on demand from DynamoDB pricing snapshots
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
