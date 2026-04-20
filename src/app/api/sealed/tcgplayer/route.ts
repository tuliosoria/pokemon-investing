import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import {
  buildSealedTcgplayerCacheKey,
  resolveSealedTcgplayerProductUrl,
} from "@/lib/domain/sealed-tcgplayer";

const CACHE_TTL = 7 * 24 * 60 * 60;

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const productType = request.nextUrl.searchParams.get("productType")?.trim() ?? "";

  if (!name) {
    return NextResponse.json(
      { error: "Product name required" },
      { status: 400 }
    );
  }

  const cacheKey = buildSealedTcgplayerCacheKey(name, productType);
  const cached = await cacheGet<{ tcgplayerUrl: string | null }>(
    "sealed-tcgplayer",
    cacheKey
  );

  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const tcgplayerUrl = await resolveSealedTcgplayerProductUrl(name, productType);
    const payload = { tcgplayerUrl };

    await cachePut("sealed-tcgplayer", cacheKey, payload, CACHE_TTL);

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Sealed TCGPlayer resolution error:", err);
    return NextResponse.json(
      { error: "Failed to resolve TCGPlayer product" },
      { status: 500 }
    );
  }
}
