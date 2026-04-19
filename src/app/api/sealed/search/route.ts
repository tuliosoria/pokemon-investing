import { NextRequest, NextResponse } from "next/server";

const POKEDATA_BASE = "https://www.pokedata.io/v0";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  const apiKey = process.env.POKEDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API not configured" },
      { status: 503 }
    );
  }

  try {
    const url = new URL(`${POKEDATA_BASE}/search`);
    url.searchParams.set("query", q);
    url.searchParams.set("asset_type", "PRODUCT");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "PokeData search failed" },
        { status: 502 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products: any[] = await res.json();

    // Filter to English products only
    const english = products.filter(
      (p) => !p.language || p.language === "ENGLISH"
    );

    return NextResponse.json({
      products: english.slice(0, 30).map((p) => ({
        pokedataId: String(p.id),
        name: p.name,
        releaseDate: p.release_date ?? null,
      })),
    });
  } catch (err) {
    console.error("Sealed search error:", err);
    return NextResponse.json(
      { error: "Failed to search sealed products" },
      { status: 500 }
    );
  }
}
