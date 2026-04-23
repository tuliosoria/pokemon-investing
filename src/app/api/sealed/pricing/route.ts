import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import {
  getLocalSealedCatalogEntry,
  isLocalSealedProductId,
} from "@/lib/db/sealed-search";
import {
  getLatestStoredSealedPriceSnapshot,
  getStoredSealedProductMeta,
  storeSealedPriceSnapshot,
} from "@/lib/db/sealed-pricing";
import {
  findSyncedPriceChartingEntry,
  getSyncedPriceChartingEntryById,
} from "@/lib/domain/pricecharting-catalog";
import { pickProductImageUrl } from "@/lib/domain/sealed-image";
import type { SealedPricing } from "@/lib/types/sealed";
import {
  fetchPriceChartingProductById,
  getPriceChartingManualOnlyPrice,
  getPriceChartingSalesVolume,
  getPriceChartingSealedPrice,
  hasPriceChartingToken,
  searchPriceChartingProduct,
} from "@/lib/server/pricecharting";

const CACHE_TTL = 30 * 60; // 30 minutes in seconds
const RECENT_SNAPSHOT_MAX_AGE_HOURS = 36;

function isRecentSnapshot(snapshotDate: string | null | undefined): boolean {
  if (!snapshotDate) {
    return false;
  }

  const parsed = new Date(snapshotDate);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const ageMs = Date.now() - parsed.getTime();
  return ageMs >= 0 && ageMs <= RECENT_SNAPSHOT_MAX_AGE_HOURS * 60 * 60 * 1000;
}

function roundPrice(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function resolveStoredSnapshotBestPrice(
  snapshot: Awaited<ReturnType<typeof getLatestStoredSealedPriceSnapshot>>
): number | null {
  if (!snapshot) {
    return null;
  }

  return (
    roundPrice(snapshot.bestPrice) ??
    roundPrice(snapshot.priceChartingPrice) ??
    roundPrice(snapshot.pokedataPrice) ??
    roundPrice(snapshot.tcgplayerPrice) ??
    roundPrice(snapshot.ebayPrice)
  );
}

function buildStoredSnapshotPricing(
  id: string,
  requestedName: string | null,
  meta: Awaited<ReturnType<typeof getStoredSealedProductMeta>>,
  snapshot: Awaited<ReturnType<typeof getLatestStoredSealedPriceSnapshot>>,
  options?: {
    requireRecent?: boolean;
  }
): SealedPricing | null {
  if (!snapshot) {
    return null;
  }

  const requireRecent = options?.requireRecent ?? true;
  const snapshotDate = snapshot.snapshotDate ?? snapshot.updatedAt ?? null;
  if (requireRecent && !isRecentSnapshot(snapshotDate)) {
    return null;
  }

  const bestPrice = resolveStoredSnapshotBestPrice(snapshot);
  if (bestPrice === null) {
    return null;
  }

  const imageUrl = pickProductImageUrl(meta?.imgUrl);

  return {
    pokedataId: id,
    name: meta?.name ?? requestedName ?? "",
    releaseDate: meta?.releaseDate ?? null,
    imageUrl,
    priceChartingId: meta?.priceChartingId ?? undefined,
    priceChartingProductName: meta?.priceChartingProductName ?? null,
    priceChartingConsoleName: meta?.priceChartingConsoleName ?? null,
    priceChartingPrice: roundPrice(snapshot.priceChartingPrice),
    tcgplayerPrice: roundPrice(snapshot.tcgplayerPrice),
    ebayPrice: roundPrice(snapshot.ebayPrice),
    pokedataPrice: roundPrice(snapshot.pokedataPrice),
    bestPrice,
    primaryProvider:
      snapshot.primaryProvider ??
      (snapshot.priceChartingPrice ? "pricecharting" : "pokedata"),
    snapshotDate,
  };
}

function buildSyncedPriceChartingPricing(
  id: string,
  requestedName: string | null,
  requestedReleaseDate: string | null,
  imageUrl: string | null,
  syncedEntry: ReturnType<typeof getSyncedPriceChartingEntryById>,
  storedSnapshot: Awaited<ReturnType<typeof getLatestStoredSealedPriceSnapshot>>
): SealedPricing | null {
  if (!syncedEntry || !syncedEntry.newPrice) {
    return null;
  }

  return {
    pokedataId: id,
    name: requestedName ?? syncedEntry.name,
    releaseDate: requestedReleaseDate ?? syncedEntry.releaseDate,
    imageUrl,
    priceChartingId: syncedEntry.priceChartingId,
    priceChartingProductName: syncedEntry.productName,
    priceChartingConsoleName: syncedEntry.consoleName,
    priceChartingPrice: roundPrice(syncedEntry.newPrice),
    tcgplayerPrice: roundPrice(storedSnapshot?.tcgplayerPrice),
    ebayPrice: roundPrice(storedSnapshot?.ebayPrice),
    pokedataPrice: roundPrice(storedSnapshot?.pokedataPrice),
    bestPrice: roundPrice(syncedEntry.newPrice),
    primaryProvider: "pricecharting",
    snapshotDate: syncedEntry.capturedAt.slice(0, 10),
    salesVolume: syncedEntry.salesVolume,
    manualOnlyPrice: syncedEntry.manualOnlyPrice,
  };
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  const requestedName = request.nextUrl.searchParams.get("name")?.trim() ?? null;
  const requestedReleaseDate =
    request.nextUrl.searchParams.get("releaseDate")?.trim() ?? null;
  const requestedPriceChartingId =
    request.nextUrl.searchParams.get("priceChartingId")?.trim() ?? null;
  const allowLiveOfficial =
    request.nextUrl.searchParams.get("allowLiveOfficial") === "1";

  if (!id) {
    return NextResponse.json({ error: "Product ID required" }, { status: 400 });
  }

  const cached = await cacheGet<SealedPricing>("sealed-pricing", id);
  if (cached) {
    const cachedMeta = cached.imageUrl ? null : await getStoredSealedProductMeta(id);
    return NextResponse.json({
      pricing: {
        ...cached,
        imageUrl: pickProductImageUrl(
          cached.imageUrl,
          cachedMeta?.imgUrl
        ),
      },
    });
  }

  const localCatalogEntry = isLocalSealedProductId(id)
    ? getLocalSealedCatalogEntry(id)
    : null;
  if (localCatalogEntry) {
    const syncedEntry =
      getSyncedPriceChartingEntryById(requestedPriceChartingId) ??
      findSyncedPriceChartingEntry({
        name: localCatalogEntry.name,
        releaseDate: localCatalogEntry.releaseDate,
      });
    const priceChartingPrice = roundPrice(syncedEntry?.newPrice ?? null);
    const localPrice = roundPrice(localCatalogEntry.currentPrice);
    const pricing: SealedPricing = {
      pokedataId: localCatalogEntry.pokedataId,
      name: requestedName ?? localCatalogEntry.name,
      releaseDate: requestedReleaseDate ?? localCatalogEntry.releaseDate,
      imageUrl: pickProductImageUrl(localCatalogEntry.imageUrl),
      priceChartingId:
        syncedEntry?.priceChartingId ?? localCatalogEntry.priceChartingId,
      priceChartingProductName: syncedEntry?.productName ?? null,
      priceChartingConsoleName: syncedEntry?.consoleName ?? null,
      priceChartingPrice,
      tcgplayerPrice: null,
      ebayPrice: null,
      pokedataPrice: localPrice,
      bestPrice: priceChartingPrice ?? localPrice,
      primaryProvider: priceChartingPrice ? "pricecharting" : "pokedata",
      snapshotDate: null,
      salesVolume: syncedEntry?.salesVolume ?? null,
      manualOnlyPrice: syncedEntry?.manualOnlyPrice ?? null,
    };

    await cachePut("sealed-pricing", id, pricing, CACHE_TTL);
    return NextResponse.json({ pricing });
  }

  const [meta, latestSnapshot] = await Promise.all([
    getStoredSealedProductMeta(id),
    getLatestStoredSealedPriceSnapshot(id),
  ]);

  const storedPricing = buildStoredSnapshotPricing(
    id,
    requestedName,
    meta,
    latestSnapshot
  );
  const fallbackStoredPricing =
    storedPricing ??
    buildStoredSnapshotPricing(id, requestedName, meta, latestSnapshot, {
      requireRecent: false,
    });

  if (storedPricing) {
    await cachePut("sealed-pricing", id, storedPricing, CACHE_TTL);
    return NextResponse.json({ pricing: storedPricing });
  }

  const imageUrl = pickProductImageUrl(meta?.imgUrl);

  const syncedEntry =
    getSyncedPriceChartingEntryById(requestedPriceChartingId) ??
    (requestedName
      ? findSyncedPriceChartingEntry({
          name: requestedName,
          releaseDate: requestedReleaseDate,
        })
      : null);

  const syncedPricing = buildSyncedPriceChartingPricing(
    id,
    requestedName,
    requestedReleaseDate,
    imageUrl,
    syncedEntry,
    latestSnapshot
  );

  if (syncedPricing) {
    await storeSealedPriceSnapshot({
      pokedataId: id,
      name: syncedPricing.name,
      releaseDate: syncedPricing.releaseDate,
      imageUrl: syncedPricing.imageUrl,
      snapshotDate: syncedPricing.snapshotDate ?? new Date().toISOString().slice(0, 10),
      tcgplayerPrice: syncedPricing.tcgplayerPrice,
      ebayPrice: syncedPricing.ebayPrice,
      pokedataPrice: syncedPricing.pokedataPrice,
      priceChartingPrice: syncedPricing.priceChartingPrice,
      bestPrice: syncedPricing.bestPrice,
      primaryProvider: "pricecharting",
      priceChartingId: syncedPricing.priceChartingId ?? null,
      priceChartingProductName: syncedPricing.priceChartingProductName ?? null,
      priceChartingConsoleName: syncedPricing.priceChartingConsoleName ?? null,
      priceChartingReleaseDate: syncedPricing.releaseDate,
    });
    await cachePut("sealed-pricing", id, syncedPricing, CACHE_TTL);
    return NextResponse.json({ pricing: syncedPricing });
  }

  if (
    allowLiveOfficial &&
    hasPriceChartingToken() &&
    (requestedPriceChartingId || requestedName)
  ) {
    try {
      const officialProduct = requestedPriceChartingId
        ? await fetchPriceChartingProductById(requestedPriceChartingId)
        : await searchPriceChartingProduct(requestedName ?? "");
      const officialPrice = getPriceChartingSealedPrice(officialProduct);

      if (officialProduct?.id && officialPrice) {
        const snapshotDate = new Date().toISOString().slice(0, 10);
        const liveOfficialPricing: SealedPricing = {
          pokedataId: id,
          name:
            requestedName ??
            officialProduct["product-name"] ??
            meta?.name ??
            "",
          releaseDate:
            requestedReleaseDate ??
            officialProduct["release-date"] ??
            meta?.releaseDate ??
            null,
          imageUrl,
          priceChartingId: officialProduct.id,
          priceChartingProductName: officialProduct["product-name"] ?? null,
          priceChartingConsoleName: officialProduct["console-name"] ?? null,
          priceChartingPrice: officialPrice,
          tcgplayerPrice: roundPrice(latestSnapshot?.tcgplayerPrice),
          ebayPrice: roundPrice(latestSnapshot?.ebayPrice),
          pokedataPrice: roundPrice(latestSnapshot?.pokedataPrice),
          bestPrice: officialPrice,
          primaryProvider: "pricecharting",
          snapshotDate,
          salesVolume: getPriceChartingSalesVolume(officialProduct),
          manualOnlyPrice: getPriceChartingManualOnlyPrice(officialProduct),
        };

        await storeSealedPriceSnapshot({
          pokedataId: id,
          name: liveOfficialPricing.name,
          releaseDate: liveOfficialPricing.releaseDate,
          imageUrl: liveOfficialPricing.imageUrl,
          snapshotDate,
          tcgplayerPrice: liveOfficialPricing.tcgplayerPrice,
          ebayPrice: liveOfficialPricing.ebayPrice,
          pokedataPrice: liveOfficialPricing.pokedataPrice,
          priceChartingPrice: officialPrice,
          bestPrice: officialPrice,
          primaryProvider: "pricecharting",
          priceChartingId: officialProduct.id,
          priceChartingProductName: officialProduct["product-name"] ?? null,
          priceChartingConsoleName: officialProduct["console-name"] ?? null,
          priceChartingReleaseDate: officialProduct["release-date"] ?? null,
        });

        await cachePut("sealed-pricing", id, liveOfficialPricing, CACHE_TTL);
        return NextResponse.json({
          pricing: {
            ...liveOfficialPricing,
            manualOnlyPrice: getPriceChartingManualOnlyPrice(officialProduct),
            salesVolume: getPriceChartingSalesVolume(officialProduct),
          },
        });
      }
    } catch (error) {
      console.warn("PriceCharting live sealed pricing lookup failed:", error);
    }
  }

  if (fallbackStoredPricing) {
    await cachePut("sealed-pricing", id, fallbackStoredPricing, CACHE_TTL);
    return NextResponse.json({ pricing: fallbackStoredPricing });
  }

  return NextResponse.json({ error: "Pricing unavailable" }, { status: 503 });
}
