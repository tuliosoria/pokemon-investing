import type { ProductType } from "@/lib/types/sealed";

const TCGPLAYER_SEARCH_API_URL = "https://mp-search-api.tcgplayer.com/v1/search/request";

const PRODUCT_TYPE_QUERY_LABELS: Partial<Record<ProductType, string>> = {
  "Booster Box": "Booster Box",
  "ETB": "Elite Trainer Box",
  "Booster Bundle": "Booster Bundle",
  "UPC": "Ultra Premium Collection",
  "Booster Pack": "Booster Pack",
  "Collection Box": "Collection Box",
  "Special Collection": "Collection",
  "Tin": "Tin",
  "Case": "Case",
};

const TERM_ALIASES: Record<string, string[]> = {
  etb: ["etb", "elite trainer box"],
  upc: ["upc", "ultra premium collection"],
};

const VARIANT_PENALTIES: Array<{ term: string; penalty: number }> = [
  { term: "code card", penalty: 240 },
  { term: "pokemon center", penalty: 120 },
  { term: "exclusive", penalty: 80 },
  { term: "costco", penalty: 80 },
  { term: "walmart", penalty: 80 },
  { term: "target", penalty: 80 },
];

interface TcgplayerSearchProduct {
  productId?: number;
  productLineName?: string;
  productLineUrlName?: string;
  productName?: string;
  productUrlName?: string;
  setName?: string;
  setUrlName?: string;
}

interface TcgplayerSearchResponse {
  results?: Array<{
    results?: TcgplayerSearchProduct[];
  }>;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value: string | null | undefined): string {
  if (!value) return "";
  return normalize(value).replace(/\s+/g, "-");
}

function expandTerms(value: string): string[] {
  const normalized = normalize(value);
  if (!normalized) return [];

  const terms = new Set<string>();

  for (const token of normalized.split(" ")) {
    if (!token) continue;
    terms.add(token);

    for (const alias of TERM_ALIASES[token] ?? []) {
      terms.add(alias);
      for (const aliasToken of alias.split(" ")) {
        if (aliasToken) terms.add(aliasToken);
      }
    }
  }

  if (normalized.includes("elite trainer box")) {
    terms.add("elite trainer box");
    terms.add("etb");
  }

  if (normalized.includes("ultra premium collection")) {
    terms.add("ultra premium collection");
    terms.add("upc");
  }

  return [...terms];
}

export function buildSealedTcgplayerLookupQuery(name: string, productType?: string): string {
  const descriptor = productType
    ? PRODUCT_TYPE_QUERY_LABELS[productType as ProductType] ?? productType
    : "";

  if (!descriptor) return name;
  if (normalize(name).includes(normalize(descriptor))) return name;

  return `${name} ${descriptor}`;
}

export function buildSealedTcgplayerCacheKey(name: string, productType?: string): string {
  return normalize(buildSealedTcgplayerLookupQuery(name, productType));
}

export function buildSealedTcgplayerProductUrl(product: TcgplayerSearchProduct): string | null {
  if (!product.productId) return null;

  const slugParts = [
    slugify(product.productLineUrlName || product.productLineName),
    slugify(product.setUrlName || product.setName),
    slugify(product.productUrlName || product.productName),
  ].filter(Boolean);

  return slugParts.length > 0
    ? `https://www.tcgplayer.com/product/${product.productId}/${slugParts.join("-")}`
    : `https://www.tcgplayer.com/product/${product.productId}`;
}

function isJapaneseTcgplayerCandidate(product: TcgplayerSearchProduct): boolean {
  const haystacks = [
    product.productLineName,
    product.productLineUrlName,
    product.productName,
    product.productUrlName,
    product.setName,
    product.setUrlName,
  ]
    .map((value) => normalize(value ?? ""))
    .filter(Boolean);

  for (const value of haystacks) {
    if (value.includes("japan") || value.includes("japanese")) {
      return true;
    }
    if (value.includes(" jp ") || value.endsWith(" jp")) {
      return true;
    }
  }
  return false;
}

function scoreSearchResult(
  product: TcgplayerSearchProduct,
  name: string,
  productType?: string
): number {
  const candidateName = normalize(product.productName ?? product.productUrlName ?? "");
  if (!candidateName) return Number.NEGATIVE_INFINITY;

  if (isJapaneseTcgplayerCandidate(product)) {
    return Number.NEGATIVE_INFINITY;
  }

  const query = buildSealedTcgplayerLookupQuery(name, productType);
  const normalizedName = normalize(name);
  const normalizedQuery = normalize(query);
  const normalizedProductType = productType
    ? normalize(PRODUCT_TYPE_QUERY_LABELS[productType as ProductType] ?? productType)
    : "";

  let score = 0;

  if (normalize(product.productLineName ?? product.productLineUrlName ?? "") === "pokemon") {
    score += 80;
  }

  if (candidateName === normalizedQuery) score += 500;
  if (candidateName === normalizedName) score += 460;
  if (candidateName.includes(normalizedQuery)) score += 260;
  if (candidateName.includes(normalizedName)) score += 220;

  const terms = new Set([...expandTerms(query), ...expandTerms(name)]);
  for (const term of terms) {
    if (!term) continue;
    if (candidateName.includes(term)) {
      score += term.includes(" ") ? 45 : term.length >= 4 ? 25 : 10;
    }
  }

  if (normalizedProductType) {
    if (candidateName.includes(normalizedProductType)) {
      score += 90;
    } else if (productType !== "Unknown") {
      score -= 60;
    }
  }

  for (const { term, penalty } of VARIANT_PENALTIES) {
    if (
      candidateName.includes(term) &&
      !normalizedQuery.includes(term) &&
      !normalizedName.includes(term)
    ) {
      score -= penalty;
    }
  }

  if (candidateName.includes("single")) score -= 140;
  if (candidateName.includes("lot")) score -= 50;
  if (candidateName.includes("case") && normalizedProductType && normalizedProductType !== "case") {
    score -= 90;
  }

  return score;
}

export async function resolveSealedTcgplayerProductUrl(
  name: string,
  productType?: string
): Promise<string | null> {
  const url = new URL(TCGPLAYER_SEARCH_API_URL);
  url.searchParams.set("q", buildSealedTcgplayerLookupQuery(name, productType));

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: 0, size: 12 }),
  });

  if (!res.ok) {
    throw new Error(`TCGPlayer search failed with ${res.status}`);
  }

  const payload = (await res.json()) as TcgplayerSearchResponse;
  const results = payload.results?.[0]?.results ?? [];

  const best = results
    .map((product) => ({
      product,
      score: scoreSearchResult(product, name, productType),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.product;

  return best ? buildSealedTcgplayerProductUrl(best) : null;
}
