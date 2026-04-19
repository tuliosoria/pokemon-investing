import { NextRequest, NextResponse } from "next/server";

const POKEDATA_BASE = "https://www.pokedata.io/v0";

export interface PokeDataGradeData {
  pokedataId: string;
  name: string;
  set: string;
  rawPrice: number | null;
  tcgplayerPrice: number | null;
  ebayRawPrice: number | null;
  gradedPrices: Record<string, number>;
  population: Record<string, number>;
  psa10Probability: number | null;
}

// Cache grade data for 30 min (pricing changes slowly)
const cache = new Map<string, { data: PokeDataGradeData; expires: number }>();
const MAX_CACHE = 100;
const CACHE_TTL = 30 * 60 * 1000;

function cleanCache() {
  const now = Date.now();
  for (const [key, val] of cache) {
    if (val.expires < now) cache.delete(key);
  }
  if (cache.size > MAX_CACHE) {
    const oldest = [...cache.entries()].sort(
      (a, b) => a[1].expires - b[1].expires
    );
    for (let i = 0; i < oldest.length - MAX_CACHE; i++) {
      cache.delete(oldest[i][0]);
    }
  }
}

function calculatePsa10Probability(
  population: Record<string, number>
): number | null {
  // Only use PSA grades for probability
  const psaGrades: { grade: number; count: number }[] = [];
  for (const [key, count] of Object.entries(population)) {
    if (key.startsWith("PSA ") && count > 0) {
      const grade = parseFloat(key.replace("PSA ", ""));
      if (!isNaN(grade)) psaGrades.push({ grade, count });
    }
  }

  if (psaGrades.length === 0) return null;

  const total = psaGrades.reduce((sum, g) => sum + g.count, 0);
  if (total < 10) return null; // Not enough data

  const psa10Count =
    psaGrades.find((g) => g.grade === 10)?.count ?? 0;

  return Math.round((psa10Count / total) * 100);
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const set = request.nextUrl.searchParams.get("set")?.trim();

  if (!name) {
    return NextResponse.json(
      { error: "Card name required" },
      { status: 400 }
    );
  }

  const cacheKey = `${name}|${set ?? ""}`.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ gradeData: cached.data });
  }

  const apiKey = process.env.POKEDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Grade data not configured" },
      { status: 503 }
    );
  }

  try {
    // Search for the card on PokeData
    const searchUrl = new URL(`${POKEDATA_BASE}/search`);
    searchUrl.searchParams.set("query", name);
    searchUrl.searchParams.set("asset_type", "CARD");

    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!searchRes.ok) {
      console.error(`PokeData search error: ${searchRes.status}`);
      return NextResponse.json(
        { error: "Failed to search PokeData" },
        { status: 502 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cards: any[] = await searchRes.json();

    if (!cards || cards.length === 0) {
      return NextResponse.json({ gradeData: null });
    }

    // Find best match — prefer exact name + set match
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let match: any = cards[0];
    if (set) {
      const setLower = set.toLowerCase();
      const exactMatch = cards.find(
        (c) =>
          c.name?.toLowerCase() === name.toLowerCase() &&
          c.set_name?.toLowerCase() === setLower
      );
      if (exactMatch) match = exactMatch;
    }

    const cardId = match.id;

    // Fetch pricing and population in parallel
    const [pricingRes, populationRes] = await Promise.all([
      fetch(`${POKEDATA_BASE}/pricing?id=${cardId}&asset_type=CARD`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      fetch(`${POKEDATA_BASE}/population?id=${cardId}&asset_type=CARD`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pricingData: any = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let populationData: any = {};

    if (pricingRes.ok) {
      pricingData = await pricingRes.json();
    }
    if (populationRes.ok) {
      populationData = await populationRes.json();
    }

    // Extract graded prices (PSA grades)
    const gradedPrices: Record<string, number> = {};
    const pricing = pricingData.pricing ?? {};
    for (const [key, val] of Object.entries(pricing)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = val as any;
      if (v.value > 0) {
        gradedPrices[key] = v.value;
      }
    }

    // Extract population counts
    const population: Record<string, number> = {};
    const pop = populationData.population ?? {};
    for (const [key, val] of Object.entries(pop)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = val as any;
      if (v.count > 0) {
        population[key] = v.count;
      }
    }

    const gradeData: PokeDataGradeData = {
      pokedataId: String(cardId),
      name: match.name,
      set: match.set_name ?? "",
      rawPrice: gradedPrices["Pokedata Raw"] ?? gradedPrices["TCGPlayer"] ?? null,
      tcgplayerPrice: gradedPrices["TCGPlayer"] ?? null,
      ebayRawPrice: gradedPrices["eBay Raw"] ?? null,
      gradedPrices,
      population,
      psa10Probability: calculatePsa10Probability(population),
    };

    // Cache result
    cleanCache();
    cache.set(cacheKey, { data: gradeData, expires: Date.now() + CACHE_TTL });

    return NextResponse.json({ gradeData });
  } catch (err) {
    console.error("Grade data error:", err);
    return NextResponse.json(
      { error: "Failed to fetch grade data" },
      { status: 500 }
    );
  }
}
