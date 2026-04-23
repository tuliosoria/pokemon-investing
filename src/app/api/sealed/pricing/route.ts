import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import {
  getLatestStoredSealedPriceSnapshot,
  getStoredSealedProductMeta,
  storeSealedPriceSnapshot,
} from "@/lib/db/sealed-pricing";
import { buildPokeDataProductImageUrl } from "@/lib/domain/sealed-image";
import {
  findSyncedPriceChartingEntry,
  getSyncedPriceChartingEntryById,
} from "@/lib/domain/pricecharting-catalog";
import type { SealedPricing } from "@/lib/types/sealed";
import {
  fetchPriceChartingProductById,
  getPriceChartingManualOnlyPrice,
  getPriceChartingSalesVolume,
  getPriceChartingSealedPrice,
  hasPriceChartingToken,
  searchPriceChartingProduct,
} from "@/lib/server/pricecharting";

const POKEDATA_BASE = "https://www.pokedata.io/v0";
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

function bestPokeDataPrice(pricing: Record<string, { value?: number }>): number | null {
  const tcg = pricing["TCGPlayer"]?.value ?? null;
  const ebay = pricing["eBay Sealed"]?.value ?? null;
  const poke = pricing["Pokedata Sealed"]?.value ?? null;

  if (typeof tcg === "number" && tcg > 0) return roundPrice(tcg);
  if (typeof poke === "number" && poke > 0) return roundPrice(poke);
  if (typeof ebay === "number" && ebay > 0) return roundPrice(ebay);
  return null;
}

function buildStoredSnapshotPricing(
  id: string,
  requestedName: string | null,
  meta: Awaited<ReturnType<typeof getStoredSealedProductMeta>>,
  snapshot: Awaited<ReturnType<typeof getLatestStoredSealedPriceSnapshot>>
): SealedPricing | null {
  if (!snapshot || !isRecentSnapshot(snapshot.snapshotDate ?? snapshot.updatedAt)) {
    return null;
  }

  const imageUrl =
    meta?.imgUrl ??
    buildPokeDataProductImageUrl(meta?.name ?? requestedName ?? null);

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
    bestPrice: roundPrice(snapshot.bestPrice),
    primaryProvider:
      snapshot.primaryProvider ??
      (snapshot.priceChartingPrice ? "pricecharting" : "pokedata"),
    snapshotDate: snapshot.snapshotDate ?? snapshot.updatedAt ?? null,
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
    return NextResponse.json({
      pricing: {
        ...cached,
        imageUrl: cached.imageUrl ?? buildPokeDataProductImageUrl(cached.name),
      },
    });
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
  if (storedPricing?.primaryProvider === "pricecharting") {
    await cachePut("sealed-pricing", id, storedPricing, CACHE_TTL);
    return NextResponse.json({ pricing: storedPricing });
  }

  const imageUrl =
    meta?.imgUrl ??
    buildPokeDataProductImageUrl(meta?.name ?? requestedName ?? null);

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

  const apiKey = process.env.POKEDATA_API_KEY;
  if (!apiKey) {
    if (storedPricing) {
      await cachePut("sealed-pricing", id, storedPricing, CACHE_TTL);
      return NextResponse.json({ pricing: storedPricing });
    }

    return NextResponse.json({ error: "API not configured" }, { status: 503 });
  }

  try {
    const url = new URL(`${POKEDATA_BASE}/pricing`);
    url.searchParams.set("id", id);
    url.searchParams.set("asset_type", "PRODUCT");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "PokeData pricing failed" },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      id?: string | number;
      name?: string;
      release_date?: string | null;
      img_url?: string | null;
      pricing?: Record<string, { value?: number }>;
    };
    const pricing: Record<string, { value?: number }> = data.pricing ?? {};
    const tcg = roundPrice(pricing["TCGPlayer"]?.value ?? null);
    const ebay = roundPrice(pricing["eBay Sealed"]?.value ?? null);
    const poke = roundPrice(pricing["Pokedata Sealed"]?.value ?? null);
    const bestPrice = bestPokeDataPrice(pricing);

    const result: SealedPricing = {
      pokedataId: String(data.id ?? id),
      name: data.name ?? requestedName ?? meta?.name ?? "",
      releaseDate: data.release_date ?? requestedReleaseDate ?? meta?.releaseDate ?? null,
      imageUrl:
        imageUrl ??
        data.img_url ??
        buildPokeDataProductImageUrl(data.name ?? requestedName ?? null),
      priceChartingId: meta?.priceChartingId ?? requestedPriceChartingId ?? undefined,
      priceChartingProductName: meta?.priceChartingProductName ?? null,
      priceChartingConsoleName: meta?.priceChartingConsoleName ?? null,
      priceChartingPrice: roundPrice(latestSnapshot?.priceChartingPrice),
      tcgplayerPrice: tcg,
      ebayPrice: ebay,
      pokedataPrice: poke,
      bestPrice,
      primaryProvider: "pokedata",
      snapshotDate: new Date().toISOString().slice(0, 10),
    };

    await storeSealedPriceSnapshot({
      pokedataId: result.pokedataId,
      name: result.name,
      releaseDate: result.releaseDate,
      imageUrl: result.imageUrl,
      snapshotDate: result.snapshotDate ?? new Date().toISOString().slice(0, 10),
      tcgplayerPrice: result.tcgplayerPrice,
      ebayPrice: result.ebayPrice,
      pokedataPrice: result.pokedataPrice,
      priceChartingPrice: result.priceChartingPrice,
      bestPrice: result.bestPrice,
      primaryProvider: "pokedata",
      priceChartingId: result.priceChartingId ?? null,
      priceChartingProductName: result.priceChartingProductName ?? null,
      priceChartingConsoleName: result.priceChartingConsoleName ?? null,
      priceChartingReleaseDate: meta?.priceChartingReleaseDate ?? null,
    });

    await cachePut("sealed-pricing", id, result, CACHE_TTL);

    return NextResponse.json({ pricing: result });
  } catch (err) {
    console.error("Sealed pricing error:", err);

    if (storedPricing) {
      return NextResponse.json({ pricing: storedPricing });
    }

    return NextResponse.json(
      { error: "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}
