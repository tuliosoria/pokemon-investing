import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import {
  getCardGradeData,
  getCardMeta,
  putCardGradeData,
  setPokedataId,
  shouldRefreshPrices,
  type CardGradeData,
  type CardMeta,
} from "@/lib/db/card-cache";
import {
  fetchPriceChartingProductById,
  getPriceChartingCardGradedPrices,
  getPriceChartingLoosePrice,
  hasPriceChartingToken,
  searchPriceChartingProducts,
  type PriceChartingProductResponse,
  type PriceChartingProductSummary,
} from "@/lib/server/pricecharting";

const POKEDATA_BASE = "https://www.pokedata.io/v0";
const CACHE_TTL = 30 * 60; // 30 minutes — for legacy name-based cache
const PRIMARY_PSA_GRADE_KEYS = ["PSA 10.0", "PSA 9.0", "PSA 8.0"] as const;

export interface GradeDataResponse {
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

interface PokeDataSearchCard {
  id?: string | number;
  name?: string;
  set_name?: string;
  language?: string;
  num?: string | number;
  release_date?: string;
}

interface PokeDataPopulationResponse {
  population?: Record<string, { count?: number }>;
}

interface PopulationLayer {
  pokedataId: string | null;
  name: string;
  set: string;
  population: Record<string, number>;
  psa10Probability: number | null;
}

function calculatePsa10Probability(
  population: Record<string, number>
): number | null {
  const psaGrades: { grade: number; count: number }[] = [];
  for (const [key, count] of Object.entries(population)) {
    if (key.startsWith("PSA ") && count > 0) {
      const grade = Number.parseFloat(key.replace("PSA ", ""));
      if (!Number.isNaN(grade)) {
        psaGrades.push({ grade, count });
      }
    }
  }

  if (psaGrades.length === 0) return null;

  const total = psaGrades.reduce((sum, grade) => sum + grade.count, 0);
  if (total < 10) return null;

  const psa10Count =
    psaGrades.find((grade) => grade.grade === 10)?.count ?? 0;

  return Math.round((psa10Count / total) * 100);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCardNumber(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed) return "";

  return trimmed
    .replace(/^#/, "")
    .replace(/^0+/, "")
    .split("/")[0]
    .trim();
}

function extractPopulation(
  payload: PokeDataPopulationResponse | null | undefined
): Record<string, number> {
  const population: Record<string, number> = {};

  for (const [key, value] of Object.entries(payload?.population ?? {})) {
    const count = value?.count;
    if (typeof count === "number" && count > 0) {
      population[key] = count;
    }
  }

  return population;
}

function hasUsableGradedPrices(
  data:
    | Pick<GradeDataResponse, "gradedPrices">
    | Pick<CardGradeData, "gradedPrices">
    | null
    | undefined
): boolean {
  return PRIMARY_PSA_GRADE_KEYS.some(
    (grade) => (data?.gradedPrices?.[grade] ?? 0) > 0
  );
}

function hasAnyUsefulGradeData(data: GradeDataResponse): boolean {
  return (
    hasUsableGradedPrices(data) ||
    Object.keys(data.population).length > 0 ||
    data.psa10Probability !== null ||
    data.rawPrice !== null ||
    data.tcgplayerPrice !== null ||
    data.ebayRawPrice !== null
  );
}

function buildCachedGradeResponse(
  cachedGrade: CardGradeData,
  fallbackName: string,
  fallbackSet: string
): GradeDataResponse {
  return {
    pokedataId: cachedGrade.pokedataId,
    name: fallbackName,
    set: fallbackSet,
    rawPrice: cachedGrade.rawPrice,
    tcgplayerPrice: cachedGrade.tcgplayerPrice,
    ebayRawPrice: cachedGrade.ebayRawPrice,
    gradedPrices: cachedGrade.gradedPrices,
    population: cachedGrade.population,
    psa10Probability: cachedGrade.psa10Probability,
  };
}

function buildPriceChartingQueries(input: {
  name: string;
  set?: string | null;
  number?: string | null;
}): string[] {
  const normalizedNumber = normalizeCardNumber(input.number);
  const queries = [
    [input.name, input.set ?? "", normalizedNumber ? `#${normalizedNumber}` : ""]
      .filter(Boolean)
      .join(" "),
    [input.name, normalizedNumber ? `#${normalizedNumber}` : ""]
      .filter(Boolean)
      .join(" "),
    [input.name, input.set ?? ""].filter(Boolean).join(" "),
    input.name,
  ];

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

function scorePriceChartingCandidate(
  candidate: PriceChartingProductSummary,
  input: { name: string; set?: string | null; number?: string | null }
): number {
  const productName = normalizeText(candidate["product-name"]);
  const consoleName = normalizeText(candidate["console-name"]);
  const haystack = [productName, consoleName].filter(Boolean).join(" ");

  if (!haystack) return Number.NEGATIVE_INFINITY;

  const name = normalizeText(input.name);
  const set = normalizeText(input.set);
  const number = normalizeCardNumber(input.number);

  let score = 0;

  if (name) {
    if (productName === name) {
      score += 60;
    } else if (haystack.includes(name)) {
      score += 45;
    } else {
      for (const token of name.split(" ").filter((part) => part.length > 2)) {
        if (haystack.includes(token)) {
          score += 8;
        }
      }
    }
  }

  if (set) {
    if (haystack.includes(set)) {
      score += 25;
    } else {
      for (const token of set.split(" ").filter((part) => part.length > 2)) {
        if (haystack.includes(token)) {
          score += 4;
        }
      }
    }
  }

  if (number) {
    if (haystack.includes(` ${number} `) || haystack.endsWith(` ${number}`)) {
      score += 20;
    } else if (haystack.includes(number)) {
      score += 12;
    }
  }

  if (haystack.includes("pokemon")) {
    score += 5;
  }

  return score;
}

async function resolvePriceChartingCardProduct(input: {
  name: string;
  set?: string | null;
  number?: string | null;
  priceChartingId?: string | null;
}): Promise<PriceChartingProductResponse | null> {
  if (!hasPriceChartingToken()) {
    return null;
  }

  try {
    if (input.priceChartingId) {
      return fetchPriceChartingProductById(input.priceChartingId);
    }

    let bestCandidate: PriceChartingProductSummary | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const query of buildPriceChartingQueries(input).slice(0, 2)) {
      const candidates = await searchPriceChartingProducts(query);
      for (const candidate of candidates) {
        const score = scorePriceChartingCandidate(candidate, input);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      if (bestScore >= 70) {
        break;
      }
    }

    if (!bestCandidate?.id || bestScore < 20) {
      return null;
    }

    return fetchPriceChartingProductById(String(bestCandidate.id));
  } catch (error) {
    console.warn("PriceCharting graded card lookup failed:", error);
    return null;
  }
}

async function searchPokeDataCard(input: {
  apiKey: string;
  name: string;
  set?: string | null;
  number?: string | null;
}): Promise<PokeDataSearchCard | null> {
  const searchUrl = new URL(`${POKEDATA_BASE}/search`);
  searchUrl.searchParams.set("query", input.name);
  searchUrl.searchParams.set("asset_type", "CARD");

  const response = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${input.apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`PokeData search failed with HTTP ${response.status}`);
  }

  const cards = (await response.json()) as PokeDataSearchCard[];
  if (!Array.isArray(cards) || cards.length === 0) {
    return null;
  }

  const nameLower = input.name.toLowerCase();
  const setLower = input.set?.toLowerCase() ?? "";
  const numberNorm = normalizeCardNumber(input.number);

  let bestMatch: PokeDataSearchCard | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const card of cards) {
    if (card.name?.toLowerCase() !== nameLower) continue;
    if (card.language && card.language !== "ENGLISH") continue;

    let score = 0;
    const cardSet = (card.set_name ?? "").toLowerCase();

    if (setLower && cardSet === setLower) score += 10;
    else if (setLower && cardSet.includes(setLower)) score += 5;
    else if (setLower && setLower.includes(cardSet)) score += 5;

    const cardNumber = normalizeCardNumber(String(card.num ?? ""));
    if (numberNorm && cardNumber === numberNorm) {
      score += 8;
    }

    if (card.release_date) {
      const year = Number.parseInt(card.release_date.slice(0, 4), 10);
      if (Number.isFinite(year) && year >= 2020) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = card;
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  return (
    cards.find(
      (card) =>
        card.name?.toLowerCase() === nameLower &&
        (!card.language || card.language === "ENGLISH")
    ) ?? cards[0] ?? null
  );
}

async function loadPopulationLayer(input: {
  apiKey: string | null;
  name: string;
  set?: string | null;
  number?: string | null;
  tcgId?: string | null;
  pokedataId?: string | null;
  cachedGrade: CardGradeData | null;
  meta: CardMeta | null;
}): Promise<PopulationLayer> {
  let resolvedPokedataId =
    input.pokedataId ||
    input.meta?.pokedataId ||
    input.cachedGrade?.pokedataId ||
    null;
  let resolvedName = input.name;
  let resolvedSet = input.set ?? input.meta?.set ?? "";
  let population = input.cachedGrade?.population ?? {};
  let psa10Probability =
    input.cachedGrade?.psa10Probability ?? calculatePsa10Probability(population);

  if (!input.apiKey) {
    return {
      pokedataId: resolvedPokedataId,
      name: resolvedName,
      set: resolvedSet,
      population,
      psa10Probability,
    };
  }

  try {
    let bestMatch: PokeDataSearchCard | null = resolvedPokedataId
      ? {
          id: resolvedPokedataId,
          name: resolvedName,
          set_name: resolvedSet,
        }
      : null;

    if (!bestMatch) {
      bestMatch = await searchPokeDataCard({
        apiKey: input.apiKey,
        name: input.name,
        set: input.set,
        number: input.number,
      });
    }

    if (!bestMatch?.id) {
      return {
        pokedataId: resolvedPokedataId,
        name: resolvedName,
        set: resolvedSet,
        population,
        psa10Probability,
      };
    }

    resolvedPokedataId = String(bestMatch.id);
    resolvedName = bestMatch.name ?? resolvedName;
    resolvedSet = bestMatch.set_name ?? resolvedSet;

    if (input.tcgId) {
      setPokedataId(input.tcgId, resolvedPokedataId).catch(() => {});
    }

    const populationResponse = await fetch(
      `${POKEDATA_BASE}/population?id=${resolvedPokedataId}&asset_type=CARD`,
      {
        headers: { Authorization: `Bearer ${input.apiKey}` },
      }
    );

    if (populationResponse.ok) {
      const populationPayload =
        (await populationResponse.json()) as PokeDataPopulationResponse;
      const livePopulation = extractPopulation(populationPayload);
      if (
        Object.keys(livePopulation).length > 0 ||
        Object.keys(population).length === 0
      ) {
        population = livePopulation;
        psa10Probability = calculatePsa10Probability(population);
      }
    }
  } catch (error) {
    console.warn("PokeData population lookup failed:", error);
  }

  return {
    pokedataId: resolvedPokedataId,
    name: resolvedName,
    set: resolvedSet,
    population,
    psa10Probability,
  };
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const set = request.nextUrl.searchParams.get("set")?.trim();
  const number = request.nextUrl.searchParams.get("number")?.trim();
  const tcgId = request.nextUrl.searchParams.get("tcgId")?.trim();
  const pokedataId = request.nextUrl.searchParams.get("pokedataId")?.trim();
  const priceChartingId =
    request.nextUrl.searchParams.get("priceChartingId")?.trim();

  if (!name) {
    return NextResponse.json(
      { error: "Card name required" },
      { status: 400 }
    );
  }

  const cachedGrade = tcgId ? await getCardGradeData(tcgId) : null;
  const priceChartingConfigured = hasPriceChartingToken();

  if (
    cachedGrade &&
    !shouldRefreshPrices(cachedGrade.lastGradeFetched) &&
    (hasUsableGradedPrices(cachedGrade) || !priceChartingConfigured)
  ) {
    return NextResponse.json({
      gradeData: buildCachedGradeResponse(cachedGrade, name, set ?? ""),
      cached: true,
    });
  }

  const cacheKey = `${name}|${set ?? ""}|${number ?? ""}`.toLowerCase();
  const cached = await cacheGet<GradeDataResponse>("grade-data", cacheKey);
  if (
    cached &&
    (hasUsableGradedPrices(cached) || !priceChartingConfigured)
  ) {
    return NextResponse.json({ gradeData: cached });
  }

  try {
    const apiKey = process.env.POKEDATA_API_KEY?.trim() || null;
    const meta = tcgId ? await getCardMeta(tcgId) : null;

    const [priceChartingProduct, populationLayer] = await Promise.all([
      resolvePriceChartingCardProduct({
        name,
        set,
        number,
        priceChartingId,
      }),
      loadPopulationLayer({
        apiKey,
        name,
        set,
        number,
        tcgId,
        pokedataId,
        cachedGrade,
        meta,
      }),
    ]);

    const liveGradedPrices = getPriceChartingCardGradedPrices(
      priceChartingProduct
    );
    const gradedPrices =
      Object.keys(liveGradedPrices).length > 0
        ? liveGradedPrices
        : cachedGrade?.gradedPrices ?? cached?.gradedPrices ?? {};

    const gradeData: GradeDataResponse = {
      pokedataId:
        populationLayer.pokedataId ??
        cachedGrade?.pokedataId ??
        cached?.pokedataId ??
        "",
      name: populationLayer.name,
      set: populationLayer.set,
      rawPrice:
        getPriceChartingLoosePrice(priceChartingProduct) ??
        cachedGrade?.rawPrice ??
        cached?.rawPrice ??
        null,
      tcgplayerPrice:
        cachedGrade?.tcgplayerPrice ?? cached?.tcgplayerPrice ?? null,
      ebayRawPrice:
        cachedGrade?.ebayRawPrice ?? cached?.ebayRawPrice ?? null,
      gradedPrices,
      population: populationLayer.population,
      psa10Probability: populationLayer.psa10Probability,
    };

    if (!hasAnyUsefulGradeData(gradeData)) {
      return NextResponse.json({ gradeData: null });
    }

    if (tcgId) {
      const now = new Date().toISOString();
      const gradeCache: CardGradeData = {
        pokedataId: gradeData.pokedataId,
        rawPrice: gradeData.rawPrice,
        tcgplayerPrice: gradeData.tcgplayerPrice,
        ebayRawPrice: gradeData.ebayRawPrice,
        gradedPrices: gradeData.gradedPrices,
        population: gradeData.population,
        psa10Probability: gradeData.psa10Probability,
        lastGradeFetched: now,
      };
      putCardGradeData(tcgId, gradeCache).catch(() => {});
    }

    await cachePut("grade-data", cacheKey, gradeData, CACHE_TTL);

    return NextResponse.json({ gradeData });
  } catch (error) {
    console.error("Grade data error:", error);
    return NextResponse.json(
      { error: "Failed to fetch grade data" },
      { status: 500 }
    );
  }
}
