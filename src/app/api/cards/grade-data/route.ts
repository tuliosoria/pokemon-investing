import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";

const POKEDATA_BASE = "https://www.pokedata.io/v0";
const CACHE_TTL = 30 * 60; // 30 minutes in seconds

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
  const number = request.nextUrl.searchParams.get("number")?.trim();

  if (!name) {
    return NextResponse.json(
      { error: "Card name required" },
      { status: 400 }
    );
  }

  const cacheKey = `${name}|${set ?? ""}|${number ?? ""}`.toLowerCase();

  // Check cache (L1 memory + L2 DynamoDB)
  const cached = await cacheGet<PokeDataGradeData>("grade-data", cacheKey);
  if (cached) {
    return NextResponse.json({ gradeData: cached });
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

    // Normalize card number for comparison (strip leading zeros, slashes)
    const normalizeNum = (n: string) =>
      n.replace(/^0+/, "").split("/")[0].trim().toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameLower = name.toLowerCase();
    const setLower = set?.toLowerCase() ?? "";
    const numNorm = number ? normalizeNum(number) : "";

    // Scoring: find best match by name + set + number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bestMatch: any = null;
    let bestScore = -1;

    for (const card of cards) {
      if (card.name?.toLowerCase() !== nameLower) continue;
      // Only consider English cards
      if (card.language && card.language !== "ENGLISH") continue;

      let score = 0;

      // Exact set match
      const cardSet = (card.set_name ?? "").toLowerCase();
      if (setLower && cardSet === setLower) {
        score += 10;
      } else if (setLower && cardSet.includes(setLower)) {
        score += 5;
      } else if (setLower && setLower.includes(cardSet)) {
        score += 5;
      }

      // Number match (most reliable for reprints/prize packs)
      if (numNorm && card.num) {
        const cardNum = normalizeNum(String(card.num));
        if (cardNum === numNorm) score += 8;
      }

      // Prefer cards with more recent release dates (more likely to have pricing data)
      if (card.release_date) {
        const year = parseInt(card.release_date.substring(0, 4));
        if (year >= 2020) score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = card;
      }
    }

    // Fallback to first exact-name English card
    if (!bestMatch) {
      bestMatch = cards.find(
        (c) =>
          c.name?.toLowerCase() === nameLower &&
          (!c.language || c.language === "ENGLISH")
      ) ?? cards[0];
    }

    const cardId = bestMatch.id;

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
      name: bestMatch.name,
      set: bestMatch.set_name ?? "",
      rawPrice: gradedPrices["Pokedata Raw"] ?? gradedPrices["TCGPlayer"] ?? null,
      tcgplayerPrice: gradedPrices["TCGPlayer"] ?? null,
      ebayRawPrice: gradedPrices["eBay Raw"] ?? null,
      gradedPrices,
      population,
      psa10Probability: calculatePsa10Probability(population),
    };

    // Cache result (L1 + L2)
    await cachePut("grade-data", cacheKey, gradeData, CACHE_TTL);

    return NextResponse.json({ gradeData });
  } catch (err) {
    console.error("Grade data error:", err);
    return NextResponse.json(
      { error: "Failed to fetch grade data" },
      { status: 500 }
    );
  }
}
