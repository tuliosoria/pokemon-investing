import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import { getDynamo, getTableName } from "@/lib/db/dynamo";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { buildPokeDataProductImageUrl } from "@/lib/domain/sealed-image";

const POKEDATA_BASE = "https://www.pokedata.io/v0";
const CACHE_TTL = 30 * 60; // 30 minutes in seconds

interface SealedPricing {
  pokedataId: string;
  name: string;
  releaseDate: string | null;
  imageUrl: string | null;
  tcgplayerPrice: number | null;
  ebayPrice: number | null;
  pokedataPrice: number | null;
  bestPrice: number | null;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Product ID required" }, { status: 400 });
  }

  // Check cache (L1 memory + L2 DynamoDB)
  const cached = await cacheGet<SealedPricing>("sealed-pricing", id);
  if (cached) {
    return NextResponse.json({
      pricing: {
        ...cached,
        imageUrl: cached.imageUrl ?? buildPokeDataProductImageUrl(cached.name),
      },
    });
  }

  const apiKey = process.env.POKEDATA_API_KEY;
  if (!apiKey) {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const pricing = data.pricing ?? {};

    const tcg = pricing["TCGPlayer"]?.value ?? null;
    const ebay = pricing["eBay Sealed"]?.value ?? null;
    const poke = pricing["Pokedata Sealed"]?.value ?? null;

    // Best price: prefer TCGPlayer if available and non-zero, then PokeData, then eBay
    const bestPrice =
      tcg && tcg > 0 ? tcg : poke && poke > 0 ? poke : ebay && ebay > 0 ? ebay : null;

    // Look up product image from DynamoDB META record
    let imageUrl: string | null = null;
    try {
      const dynamo = getDynamo();
      if (dynamo) {
        const table = getTableName();
        const metaRes = await dynamo.send(
          new GetCommand({
            TableName: table,
            Key: { pk: `PRODUCT#${id}`, sk: "META" },
            ProjectionExpression: "imgUrl",
          })
        );
        imageUrl = metaRes.Item?.imgUrl ?? null;
      }
    } catch {
      // Image lookup is best-effort
    }

    const result: SealedPricing = {
      pokedataId: String(data.id ?? id),
      name: data.name ?? "",
      releaseDate: data.release_date ?? null,
      imageUrl:
        imageUrl ??
        data.img_url ??
        buildPokeDataProductImageUrl(data.name ?? null),
      tcgplayerPrice: tcg,
      ebayPrice: ebay,
      pokedataPrice: poke,
      bestPrice: bestPrice ? Math.round(bestPrice * 100) / 100 : null,
    };

    // Cache result (L1 + L2)
    await cachePut("sealed-pricing", id, result, CACHE_TTL);

    return NextResponse.json({ pricing: result });
  } catch (err) {
    console.error("Sealed pricing error:", err);
    return NextResponse.json(
      { error: "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}
