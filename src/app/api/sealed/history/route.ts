import { NextRequest, NextResponse } from "next/server";
import {
  getStoredSealedProductMeta,
  listStoredSealedPriceSnapshots,
} from "@/lib/db/sealed-pricing";
import { resolveSealedProductImageAsset } from "@/lib/domain/sealed-image";

function clampLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 90;
  }
  return Math.min(parsed, 365);
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Product ID required" }, { status: 400 });
  }

  const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
  const [meta, snapshots] = await Promise.all([
    getStoredSealedProductMeta(id),
    listStoredSealedPriceSnapshots(id, {
      limit,
      ascending: true,
    }),
  ]);
  const imageAsset = resolveSealedProductImageAsset({
    setId: meta?.catalogId ?? null,
    pokedataId: id,
    name: meta?.catalogDisplayName ?? meta?.name ?? null,
    ownedImagePath: meta?.ownedImagePath ?? null,
    fallbackCandidates: [meta?.imgUrl],
    mirrorSourceUrl: meta?.imageMirrorSourceUrl ?? meta?.imgUrl,
    mirrorSourceProvider: meta?.imageMirrorSourceProvider ?? null,
    mirroredAt: meta?.imageMirroredAt ?? null,
  });

  return NextResponse.json({
    product: {
      pokedataId: id,
      name: meta?.name ?? null,
      releaseDate: meta?.releaseDate ?? null,
      imageUrl: imageAsset.selectedUrl,
      imageAsset,
      priceChartingId: meta?.priceChartingId ?? null,
    },
    history: snapshots.map((snapshot) => ({
      snapshotDate: snapshot.snapshotDate ?? null,
      updatedAt: snapshot.updatedAt ?? null,
      primaryProvider: snapshot.primaryProvider ?? null,
      bestPrice: snapshot.bestPrice ?? null,
      priceChartingPrice: snapshot.priceChartingPrice ?? null,
      tcgplayerPrice: snapshot.tcgplayerPrice ?? null,
      ebayPrice: snapshot.ebayPrice ?? null,
      pokedataPrice: snapshot.pokedataPrice ?? null,
    })),
  });
}
