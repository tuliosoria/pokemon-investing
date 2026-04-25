import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cachePut } from "@/lib/db/cache";
import {
  getCardGradeData,
  getCardMeta,
  putCardGradeData,
  shouldRefreshPrices,
  type CardGradeData,
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
  /** Population reports are no longer fetched at runtime — see USER_GRADES. */
  population: Record<string, number>;
  /** Auto-derived PSA 10 probability is deprecated; users supply via the
   *  condition wizard. Always null in fresh responses. */
  psa10Probability: number | null;
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
    population: {},
    psa10Probability: null,
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
    if (productName === name) score += 60;
    else if (haystack.includes(name)) score += 45;
    else {
      for (const token of name.split(" ").filter((part) => part.length > 2)) {
        if (haystack.includes(token)) score += 8;
      }
    }
  }
  if (set) {
    if (haystack.includes(set)) score += 25;
    else {
      for (const token of set.split(" ").filter((part) => part.length > 2)) {
        if (haystack.includes(token)) score += 4;
      }
    }
  }
  if (number) {
    if (haystack.includes(` ${number} `) || haystack.endsWith(` ${number}`))
      score += 20;
    else if (haystack.includes(number)) score += 12;
  }
  if (haystack.includes("pokemon")) score += 5;
  return score;
}

async function resolvePriceChartingCardProduct(input: {
  name: string;
  set?: string | null;
  number?: string | null;
  priceChartingId?: string | null;
}): Promise<PriceChartingProductResponse | null> {
  if (!hasPriceChartingToken()) return null;

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
      if (bestScore >= 70) break;
    }

    if (!bestCandidate?.id || bestScore < 20) return null;
    return fetchPriceChartingProductById(String(bestCandidate.id));
  } catch (error) {
    console.warn("PriceCharting graded card lookup failed:", error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const name = sp.get("name")?.trim();
  const set = sp.get("set")?.trim() || null;
  const number = sp.get("number")?.trim() || null;
  const tcgId = sp.get("tcgId")?.trim() || null;
  const pokedataId = sp.get("pokedataId")?.trim() || null;
  const priceChartingId = sp.get("priceChartingId")?.trim() || null;

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const priceChartingConfigured = hasPriceChartingToken();

  const cachedGrade = tcgId ? await getCardGradeData(tcgId) : null;
  const meta = tcgId ? await getCardMeta(tcgId) : null;

  // Fast path: serve cached grade data if it has live PSA prices and
  // PriceCharting isn't due for a refresh.
  if (
    cachedGrade &&
    hasUsableGradedPrices(cachedGrade) &&
    !shouldRefreshPrices(cachedGrade.lastGradeFetched)
  ) {
    return NextResponse.json({
      gradeData: buildCachedGradeResponse(
        cachedGrade,
        name,
        meta?.set ?? set ?? ""
      ),
    });
  }

  const cacheKey = `${name}|${set ?? ""}|${number ?? ""}`.toLowerCase();
  const cached = await cacheGet<GradeDataResponse>("grade-data", cacheKey);
  if (cached && (hasUsableGradedPrices(cached) || !priceChartingConfigured)) {
    return NextResponse.json({ gradeData: cached });
  }

  try {
    const priceChartingProduct = await resolvePriceChartingCardProduct({
      name,
      set,
      number,
      priceChartingId,
    });

    const liveGradedPrices = getPriceChartingCardGradedPrices(
      priceChartingProduct
    );
    const gradedPrices =
      Object.keys(liveGradedPrices).length > 0
        ? liveGradedPrices
        : cachedGrade?.gradedPrices ?? cached?.gradedPrices ?? {};

    const gradeData: GradeDataResponse = {
      pokedataId:
        pokedataId ?? meta?.pokedataId ?? cachedGrade?.pokedataId ?? "",
      name,
      set: meta?.set ?? set ?? "",
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
      population: {},
      psa10Probability: null,
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
        population: cachedGrade?.population ?? {},
        psa10Probability: cachedGrade?.psa10Probability ?? null,
        lastGradeFetched: now,
      };
      putCardGradeData(tcgId, gradeCache).catch(() => {});
    }

    await cachePut("grade-data", cacheKey, gradeData, CACHE_TTL);
    return NextResponse.json({ gradeData });
  } catch (error) {
    console.error("grade-data error:", error);
    if (cached) {
      return NextResponse.json({ gradeData: cached });
    }
    return NextResponse.json({ gradeData: null });
  }
}
