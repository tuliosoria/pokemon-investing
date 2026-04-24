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
  type StoredSealedProductMeta,
} from "@/lib/db/sealed-pricing";
import {
  findSyncedPriceChartingEntry,
  getSyncedPriceChartingEntryById,
  getSyncedPriceChartingEntryBySetId,
} from "@/lib/domain/pricecharting-catalog";
import { resolveSealedProductImageAsset } from "@/lib/domain/sealed-image";
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

function buildSealedImageAsset(input: {
  pokedataId: string;
  setId?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  imageAsset?: SealedPricing["imageAsset"];
  meta?: StoredSealedProductMeta | null;
}): NonNullable<SealedPricing["imageAsset"]> {
  return resolveSealedProductImageAsset({
    setId: input.setId,
    pokedataId: input.pokedataId,
    name: input.name,
    ownedImagePath:
      input.imageAsset?.owned?.path ?? input.meta?.ownedImagePath ?? null,
    fallbackCandidates: [
      input.imageAsset?.fallback?.url,
      input.imageUrl,
      input.meta?.imgUrl,
    ],
    mirrorSourceUrl:
      input.imageAsset?.mirrorSource?.url ??
      input.meta?.imageMirrorSourceUrl ??
      input.meta?.imgUrl,
    mirrorSourceProvider:
      input.imageAsset?.mirrorSource?.provider ??
      input.meta?.imageMirrorSourceProvider ??
      null,
    mirroredAt:
      input.imageAsset?.mirrorSource?.mirroredAt ??
      input.meta?.imageMirroredAt ??
      null,
  });
}

function withResolvedSealedImage(
  pricing: SealedPricing,
  meta: StoredSealedProductMeta | null = null,
  options?: {
    setId?: string | null;
  }
): SealedPricing {
  const imageAsset = buildSealedImageAsset({
    pokedataId: pricing.pokedataId,
    setId: options?.setId,
    name: pricing.name,
    imageUrl: pricing.imageUrl,
    imageAsset: pricing.imageAsset,
    meta,
  });

  return {
    ...pricing,
    imageUrl: imageAsset.selectedUrl,
    imageAsset,
  };
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

  const name = meta?.catalogDisplayName ?? meta?.name ?? requestedName ?? "";
  const imageAsset = buildSealedImageAsset({
    pokedataId: id,
    setId: meta?.catalogId ?? null,
    name,
    imageUrl: meta?.imgUrl ?? null,
    meta,
  });

  return {
    pokedataId: id,
    name,
    releaseDate: meta?.releaseDate ?? null,
    imageUrl: imageAsset.selectedUrl,
    imageAsset,
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
  imageAsset: NonNullable<SealedPricing["imageAsset"]>,
  syncedEntry: ReturnType<typeof getSyncedPriceChartingEntryById>,
  storedSnapshot: Awaited<ReturnType<typeof getLatestStoredSealedPriceSnapshot>>
): SealedPricing | null {
  const syncedPrice = roundPrice(
    syncedEntry?.newPrice ?? syncedEntry?.manualOnlyPrice ?? null
  );
  if (!syncedEntry || !syncedPrice) {
    return null;
  }

  return {
    pokedataId: id,
    name: requestedName ?? syncedEntry.name,
    releaseDate: requestedReleaseDate ?? syncedEntry.releaseDate,
    imageUrl: imageAsset.selectedUrl,
    imageAsset,
    priceChartingId: syncedEntry.priceChartingId,
    priceChartingProductName: syncedEntry.productName,
    priceChartingConsoleName: syncedEntry.consoleName,
    priceChartingPrice: syncedPrice,
    tcgplayerPrice: roundPrice(storedSnapshot?.tcgplayerPrice),
    ebayPrice: roundPrice(storedSnapshot?.ebayPrice),
    pokedataPrice: roundPrice(storedSnapshot?.pokedataPrice),
    bestPrice: syncedPrice,
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
    const cachedMeta = cached.imageAsset?.owned
      ? null
      : await getStoredSealedProductMeta(id);
    return NextResponse.json({
      pricing: withResolvedSealedImage(cached, cachedMeta),
    });
  }

  const localCatalogEntry = isLocalSealedProductId(id)
    ? getLocalSealedCatalogEntry(id)
    : null;
  if (localCatalogEntry) {
    const syncedEntry =
      getSyncedPriceChartingEntryBySetId(localCatalogEntry.catalogId) ??
      getSyncedPriceChartingEntryById(requestedPriceChartingId) ??
      findSyncedPriceChartingEntry({
        name: localCatalogEntry.name,
        releaseDate: localCatalogEntry.releaseDate,
      });
    const priceChartingPrice = roundPrice(
      syncedEntry?.newPrice ?? syncedEntry?.manualOnlyPrice ?? null
    );
    const localPrice = roundPrice(localCatalogEntry.currentPrice);
    const imageAsset = buildSealedImageAsset({
      pokedataId: localCatalogEntry.pokedataId,
      setId: localCatalogEntry.catalogId,
      name: requestedName ?? localCatalogEntry.name,
      imageUrl: localCatalogEntry.imageUrl,
    });
    const pricing: SealedPricing = {
      pokedataId: localCatalogEntry.pokedataId,
      name: requestedName ?? localCatalogEntry.name,
      releaseDate: requestedReleaseDate ?? localCatalogEntry.releaseDate,
      imageUrl: imageAsset.selectedUrl,
      imageAsset,
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

  const imageAsset = buildSealedImageAsset({
    pokedataId: id,
    setId: meta?.catalogId ?? null,
    name: requestedName ?? meta?.catalogDisplayName ?? meta?.name ?? "",
    imageUrl: meta?.imgUrl ?? null,
    meta,
  });

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
    imageAsset,
    syncedEntry,
    latestSnapshot
  );

  if (syncedPricing) {
    await storeSealedPriceSnapshot({
      pokedataId: id,
      name: syncedPricing.name,
      releaseDate: syncedPricing.releaseDate,
      imageUrl: syncedPricing.imageUrl,
      ownedImagePath: syncedPricing.imageAsset?.owned?.path ?? null,
      imageMirrorSourceUrl:
        syncedPricing.imageAsset?.mirrorSource?.url ??
        syncedPricing.imageAsset?.fallback?.url ??
        null,
      imageMirrorSourceProvider:
        syncedPricing.imageAsset?.mirrorSource?.provider ??
        syncedPricing.imageAsset?.fallback?.provider ??
        null,
      imageMirroredAt: syncedPricing.imageAsset?.mirrorSource?.mirroredAt ?? null,
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
          imageUrl: imageAsset.selectedUrl,
          imageAsset,
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
          ownedImagePath: liveOfficialPricing.imageAsset?.owned?.path ?? null,
          imageMirrorSourceUrl:
            liveOfficialPricing.imageAsset?.mirrorSource?.url ??
            liveOfficialPricing.imageAsset?.fallback?.url ??
            null,
          imageMirrorSourceProvider:
            liveOfficialPricing.imageAsset?.mirrorSource?.provider ??
            liveOfficialPricing.imageAsset?.fallback?.provider ??
            null,
          imageMirroredAt:
            liveOfficialPricing.imageAsset?.mirrorSource?.mirroredAt ?? null,
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
